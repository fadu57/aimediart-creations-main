#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script d'inventaire i18n (FR) pour projet React/TSX, avec sauvegarde dans Supabase.

Objectif:
- Scanner récursivement `src/`
- Extraire un maximum de labels/titres/textes UI:
  - texte JSX visible: <h1>Texte</h1>, <button>...</button>, etc.
  - attributs texte: placeholder, title, aria-label, alt, label
  - chaînes dans toast/alert/confirm/prompt
- Générer une clé technique `i18n_key`
- Upsert dans `public.language` (colonne `french` + métadonnées)

Pré-requis:
- Python 3.10+
- Variables d'environnement:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY (recommandé pour write)
"""

from __future__ import annotations

import json
import os
import re
import sys
import html
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


# Extensions scannées côté frontend
SCAN_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js"}

# Dossiers à ignorer
IGNORED_DIR_NAMES = {
    "node_modules",
    "dist",
    "build",
    ".git",
    ".next",
    ".turbo",
    "coverage",
}

# Attributs souvent porteurs de texte traduisible
ATTR_NAMES = ("placeholder", "title", "aria-label", "alt", "label")

# Balises JSX à privilégier pour du texte visible utilisateur
UI_TEXT_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6", "button", "label", "a", "p", "span")


@dataclass
class TextItem:
    i18n_key: str
    french: str
    context: str
    text_type: str
    source_path: str
    source_component: str
    description: str
    status: str = "draft"
    is_active: bool = True
    interpolation_vars: list[str] | None = None


def sanitize_spaces(value: str) -> str:
    """Normalise les espaces et retire les bords."""
    decoded = html.unescape(value)
    normalized = re.sub(r"\s+", " ", decoded).strip()
    return normalized


def normalize_french_for_dedupe(value: str) -> str:
    """
    Normalise agressivement un texte pour déduplication globale.
    Objectif: éviter les doublons inutiles dans la table language.
    """
    v = sanitize_spaces(value).lower()
    v = v.replace("’", "'")
    v = re.sub(r"\s+", " ", v).strip()
    return v


def looks_like_user_facing_text(value: str) -> bool:
    """
    Filtre simple pour éviter les faux positifs:
    - ignore textes vides/courts
    - ignore formats purement techniques
    """
    v = sanitize_spaces(value)
    if not v:
        return False
    if len(v) < 2:
        return False
    if re.fullmatch(r"[#%_./:\\-]+", v):
        return False
    if re.fullmatch(r"[a-zA-Z0-9_.-]+", v) and "_" in v:
        return False
    if looks_like_code_snippet(v):
        return False
    return True


def looks_like_code_snippet(value: str) -> bool:
    """
    Détecte des fragments typiquement techniques (JS/TS/React/SQL),
    afin d'éviter les faux positifs dans la table de traduction.
    """
    v = value.strip()
    lower = v.lower()

    # Signaux forts de code
    code_tokens = (
        "const ",
        "let ",
        "var ",
        "function ",
        "=>",
        "usestate",
        "useeffect",
        "usememo",
        "usecallback",
        "useref",
        "return ",
        "import ",
        "export ",
        "from ",
        "null",
        "undefined",
        "</",
        "/>",
        "className=",
        "onclick",
        "onchange",
        "onkeydown",
        "set",
        "&&",
        "||",
        "??",
        ".map(",
        ".filter(",
        ".find(",
        "record<",
        "enum",
        "type ",
        "interface ",
        "base64,",
    )
    if any(tok in lower for tok in code_tokens):
        return True

    # Parenthèses + point-virgule + égal sont rarement du texte UI
    punct_score = sum(ch in v for ch in (";", "=", "{", "}", "[", "]"))
    if punct_score >= 2:
        return True

    # Trop de symboles par rapport aux lettres = probablement du code
    letters = len(re.findall(r"[a-zA-ZÀ-ÿ]", v))
    symbols = len(re.findall(r"[^a-zA-ZÀ-ÿ0-9\s.,!?;:'\"()/-]", v))
    if letters == 0 and symbols > 0:
        return True
    if letters > 0 and symbols / max(letters, 1) > 0.35:
        return True

    return False


def slugify(text: str, max_len: int = 48) -> str:
    """Crée un slug lisible et stable."""
    base = text.lower()
    base = base.replace("œ", "oe").replace("æ", "ae")
    base = re.sub(r"[^a-z0-9]+", "_", base)
    base = re.sub(r"_+", "_", base).strip("_")
    if not base:
        base = "text"
    return base[:max_len].rstrip("_") or "text"


def derive_context_and_component(rel_path: Path) -> tuple[str, str]:
    """
    Déduit un contexte fonctionnel:
    - context: dossier logique (pages/components)
    - source_component: nom de fichier sans extension
    """
    parts = rel_path.parts
    component = rel_path.stem
    if len(parts) >= 2:
        context = f"{parts[0]}/{parts[1]}" if parts[0] in {"pages", "components"} else parts[0]
    else:
        context = parts[0] if parts else "src"
    return context, component


def extract_interpolation_vars(value: str) -> list[str]:
    """
    Détecte des placeholders courants:
    - {name}
    - {{name}}
    - ${name}
    """
    matches = set()
    for pat in (r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}", r"\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}", r"\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}"):
        for m in re.findall(pat, value):
            matches.add(m)
    return sorted(matches)


def extract_from_file(content: str) -> list[tuple[str, str]]:
    """
    Retourne une liste de tuples (text_type, texte) trouvés dans le fichier.
    """
    found: list[tuple[str, str]] = []

    # 1) Texte JSX dans des balises UI ciblées
    for tag in UI_TEXT_TAGS:
        # <tag ...>Texte</tag>
        pattern = rf"<{tag}\b[^>]*>\s*([^<{{}}][^<{{}}]*)\s*</{tag}>"
        for m in re.finditer(pattern, content, flags=re.IGNORECASE):
            txt = sanitize_spaces(m.group(1))
            if looks_like_user_facing_text(txt):
                txt_type = "title" if tag.lower().startswith("h") else ("button" if tag.lower() == "button" else "label")
                found.append((txt_type, txt))

    # 2) Attributs de type placeholder/title/aria-label/alt/label
    for attr in ATTR_NAMES:
        # attr="..."
        pattern = rf'{attr}\s*=\s*"([^"]+)"'
        for m in re.finditer(pattern, content):
            txt = sanitize_spaces(m.group(1))
            if looks_like_user_facing_text(txt):
                txt_type = "placeholder" if attr == "placeholder" else "label"
                found.append((txt_type, txt))

        # attr='...'
        pattern_sq = rf"{attr}\s*=\s*'([^']+)'"
        for m in re.finditer(pattern_sq, content):
            txt = sanitize_spaces(m.group(1))
            if looks_like_user_facing_text(txt):
                txt_type = "placeholder" if attr == "placeholder" else "label"
                found.append((txt_type, txt))

    # 3) Chaînes dans fonctions UI courantes
    for fn_name, txt_type in (("toast", "toast"), ("alert", "message"), ("confirm", "message"), ("prompt", "message")):
        pattern = rf"{fn_name}\s*\(\s*([\"'])(.+?)\1"
        for m in re.finditer(pattern, content, flags=re.DOTALL):
            txt = sanitize_spaces(m.group(2))
            if looks_like_user_facing_text(txt):
                found.append((txt_type, txt))

    # Dédup locale brute (même type + même texte)
    unique = list(dict.fromkeys(found))
    return unique


def build_text_items(root: Path, src_dir: Path) -> list[TextItem]:
    """
    Construit la liste finale des éléments i18n.
    Déduplication globale par (texte, type, fichier).
    """
    items: list[TextItem] = []
    seen_keys: set[str] = set()
    seen_french_norm: set[str] = set()

    for file_path in src_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in SCAN_EXTENSIONS:
            continue
        if any(part in IGNORED_DIR_NAMES for part in file_path.parts):
            continue

        rel = file_path.relative_to(src_dir)
        context, component = derive_context_and_component(rel)
        source_path = str(rel).replace("\\", "/")

        try:
            raw = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Fichier non UTF-8: on ignore pour robustesse
            continue

        extracted = extract_from_file(raw)
        if not extracted:
            continue

        counters: dict[str, int] = {}
        for text_type, french in extracted:
            french_norm = normalize_french_for_dedupe(french)
            if not french_norm:
                continue
            # Déduplication globale par texte utilisateur normalisé
            if french_norm in seen_french_norm:
                continue
            seen_french_norm.add(french_norm)

            slug = slugify(french)
            base_key = f"{source_path.replace('/', '.').rsplit('.', 1)[0]}.{text_type}.{slug}"
            count = counters.get(base_key, 0) + 1
            counters[base_key] = count
            i18n_key = base_key if count == 1 else f"{base_key}_{count}"

            # Sécurité anti-collision globale
            while i18n_key in seen_keys:
                count += 1
                i18n_key = f"{base_key}_{count}"
            seen_keys.add(i18n_key)

            vars_found = extract_interpolation_vars(french)
            item = TextItem(
                i18n_key=i18n_key,
                french=french,
                context=context,
                text_type=text_type if text_type in {
                    "title",
                    "label",
                    "button",
                    "placeholder",
                    "tooltip",
                    "message",
                    "error",
                    "empty_state",
                    "toast",
                    "dialog",
                    "other",
                } else "other",
                source_path=source_path,
                source_component=component,
                description=f"Extrait automatiquement depuis {source_path}",
                interpolation_vars=vars_found if vars_found else None,
            )
            items.append(item)

    return items


def to_payload(item: TextItem) -> dict:
    """Transforme un TextItem en payload JSON compatible PostgREST."""
    payload = {
        "i18n_key": item.i18n_key,
        "french": item.french,
        "context": item.context,
        "text_type": item.text_type,
        "description": item.description,
        "status": item.status,
        "is_active": item.is_active,
        "source_path": item.source_path,
        "source_component": item.source_component,
    }
    if item.interpolation_vars:
        payload["interpolation_vars"] = item.interpolation_vars
    return payload


def chunked(seq: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def supabase_upsert_language(rows: list[dict], *, supabase_url: str, service_key: str, dry_run: bool) -> None:
    """
    Upsert dans public.language via REST PostgREST.
    Conflit géré sur i18n_key.
    """
    if dry_run:
        print(f"[DRY-RUN] {len(rows)} lignes prêtes pour upsert.")
        return

    base = supabase_url.rstrip("/")
    endpoint = f"{base}/rest/v1/language?on_conflict=i18n_key"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    total = len(rows)
    sent = 0
    for batch in chunked(rows, 250):
        data = json.dumps(batch, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                _ = resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Erreur HTTP Supabase ({e.code}) sur batch: {body}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Erreur réseau Supabase: {e}") from e
        sent += len(batch)
        print(f"[OK] Upsert batch: {sent}/{total}")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    src_dir = root / "src"
    if not src_dir.exists():
        print("Erreur: dossier src/ introuvable.", file=sys.stderr)
        return 1

    dry_run = "--dry-run" in sys.argv
    export_json = "--export-json" in sys.argv

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not dry_run and (not supabase_url or not service_key):
        print(
            "Erreur: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (ou utilisez --dry-run).",
            file=sys.stderr,
        )
        return 1

    print(f"Scan i18n en cours dans: {src_dir}")
    items = build_text_items(root, src_dir)
    print(f"Éléments extraits: {len(items)}")

    if not items:
        print("Aucun texte détecté.")
        return 0

    rows = [to_payload(i) for i in items]

    # Export local facultatif pour audit humain avant insertion
    if export_json:
        out = root / "scripts" / "i18n_scan_preview.json"
        out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Prévisualisation exportée: {out}")

    supabase_upsert_language(
        rows,
        supabase_url=supabase_url,
        service_key=service_key,
        dry_run=dry_run,
    )
    print("Terminé.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

