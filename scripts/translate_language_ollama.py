#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Traduction locale des lignes `public.language` via Ollama (localhost).

But:
- Lire les lignes contenant `french`
- Compléter automatiquement les colonnes vides:
  - english, spanish, german, italian
- Ne rien envoyer vers un service externe (Ollama local uniquement)

Pré-requis:
- Ollama démarré localement (http://localhost:11434)
- Un modèle installé (ex: `ollama pull llama3.1`)
- Variables d'environnement:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - OLLAMA_MODEL (optionnel, défaut: llama3.1)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


LANG_COLUMNS = {
    "english": "English",
    "spanish": "Spanish",
    "german": "German",
    "italian": "Italian",
}


def http_json(method: str, url: str, *, headers: dict[str, str] | None = None, body: Any | None = None, timeout: int = 45) -> Any:
    payload = None
    req_headers = headers.copy() if headers else {}
    if body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=payload, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        if not raw:
            return None
        return json.loads(raw)


def fetch_language_rows(supabase_url: str, service_key: str) -> list[dict[str, Any]]:
    base = supabase_url.rstrip("/")
    query = urllib.parse.quote("id,i18n_key,french,english,spanish,german,italian")
    url = f"{base}/rest/v1/language?select={query}&french=not.is.null&order=id.asc&limit=5000"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    rows = http_json("GET", url, headers=headers, timeout=45)
    return rows if isinstance(rows, list) else []


def translate_with_ollama(text: str, target_language: str, model: str, ollama_url: str) -> str:
    prompt = (
        f"Translate the following UI text from French to {target_language}. "
        "Keep the original meaning and tone for app interface labels/messages. "
        "Do not add explanations. Return only the translated text.\n\n"
        f"French text: {text}"
    )
    body = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
        },
    }
    data = http_json("POST", f"{ollama_url.rstrip('/')}/api/generate", body=body, timeout=90)
    if not isinstance(data, dict):
        raise RuntimeError("Réponse Ollama invalide.")
    response = str(data.get("response", "")).strip()
    if not response:
        raise RuntimeError("Traduction vide renvoyée par Ollama.")
    # Nettoyage léger de wrappers éventuels
    response = response.strip().strip('"').strip("'").strip()
    # Certains modèles renvoient parfois "Italian text: ...", "English text: ..."
    response = re.sub(r"^[A-Za-zÀ-ÿ\s]+text:\s*", "", response, flags=re.IGNORECASE).strip()
    return response


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    base = supabase_url.rstrip("/")
    url = f"{base}/rest/v1/language?on_conflict=id"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "resolution=merge-duplicates,return=minimal",
        "Content-Type": "application/json",
    }
    http_json("POST", url, headers=headers, body=rows, timeout=60)


def main() -> int:
    parser = argparse.ArgumentParser(description="Traduire public.language via Ollama local.")
    parser.add_argument("--dry-run", action="store_true", help="N'écrit rien en base, simule uniquement.")
    parser.add_argument(
        "--sync-only",
        action="store_true",
        help="Ne fait aucune traduction Ollama. Affiche seulement le bilan des lignes restantes à traduire.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Nombre max de lignes à traiter (0 = toutes).")
    parser.add_argument("--id-min", type=int, default=0, help="Traiter uniquement les lignes avec id >= id-min.")
    parser.add_argument("--id-max", type=int, default=0, help="Traiter uniquement les lignes avec id <= id-max.")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434").strip()
    model = os.getenv("OLLAMA_MODEL", "llama3.1").strip()
    dry_run = args.dry_run

    if not supabase_url or not service_key:
        print("Erreur: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.")
        return 1

    print("Chargement des lignes language...")
    rows = fetch_language_rows(supabase_url, service_key)
    print(f"Lignes récupérées (brut): {len(rows)}")
    if not rows:
        print("Aucune ligne à traiter.")
        return 0

    if args.id_min > 0:
        rows = [r for r in rows if isinstance(r.get("id"), int) and r["id"] >= args.id_min]
    if args.id_max > 0:
        rows = [r for r in rows if isinstance(r.get("id"), int) and r["id"] <= args.id_max]
    if args.limit > 0:
        rows = rows[: args.limit]

    print(f"Lignes retenues (filtres): {len(rows)}")

    if args.sync_only:
        pending_rows = 0
        pending_cells = 0
        for row in rows:
            french = str(row.get("french") or "").strip()
            if not french:
                continue
            missing = 0
            for column in LANG_COLUMNS.keys():
                if not str(row.get(column) or "").strip():
                    missing += 1
            if missing > 0:
                pending_rows += 1
                pending_cells += missing
        print("[SYNC-ONLY] Aucun appel Ollama effectué.")
        print(f"[SYNC-ONLY] Lignes avec traductions manquantes: {pending_rows}")
        print(f"[SYNC-ONLY] Cellules de traduction manquantes: {pending_cells}")
        return 0

    updates: list[dict[str, Any]] = []
    translated_count = 0
    total_rows = len(rows)
    processed_rows = 0

    for row in rows:
        processed_rows += 1
        row_id = row.get("id")
        french = str(row.get("french") or "").strip()
        if not row_id or not french:
            continue

        patch: dict[str, Any] = {"id": row_id}
        changed = False

        for column, target_lang in LANG_COLUMNS.items():
            current = str(row.get(column) or "").strip()
            if current:
                continue
            try:
                translated = translate_with_ollama(french, target_lang, model, ollama_url)
                patch[column] = translated
                changed = True
                translated_count += 1
                print(f"[OK] {processed_rows}/{total_rows} id={row_id} {column}")
                time.sleep(0.05)
            except Exception as exc:
                print(f"[WARN] {processed_rows}/{total_rows} id={row_id} {column} non traduit: {exc}")

        if changed:
            updates.append(patch)

    print(f"Traductions générées: {translated_count}")
    print(f"Lignes à mettre à jour: {len(updates)}")

    if dry_run:
        print("[DRY-RUN] Aucune écriture en base.")
        return 0

    if updates:
        # Upsert par paquets
        for i in range(0, len(updates), 200):
            upsert_rows(supabase_url, service_key, updates[i : i + 200])
            print(f"[UPSERT] {min(i + 200, len(updates))}/{len(updates)}")

    print("Terminé.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

