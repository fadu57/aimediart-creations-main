#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migration Storage : artist-photos / selfies / avatars → logos / photos

PRUDENT :
  - Copie les fichiers (ne supprime pas les originaux)
  - Mode dry-run par défaut
  - Nécessite SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (fichier .env à la racine)

Usage :
  python scripts/migrate_storage_logos_photos.py --dry-run
  python scripts/migrate_storage_logos_photos.py
  python scripts/migrate_storage_logos_photos.py --limit 5

Puis exécuter migration_39_storage_urls_logos_photos.sql dans Supabase SQL Editor.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    from supabase import create_client, Client
except ImportError:
    print("Installer : pip install supabase", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class CopyRule:
    """Règle source → destination pour un objet storage."""

    src_bucket: str
    src_prefix: str
    dst_bucket: str
    dst_prefix: str
    label: str


# Ordre de priorité : règles les plus spécifiques en premier
COPY_RULES: list[CopyRule] = [
    CopyRule("artist-photos", "agencies/logos/", "logos", "agencies/", "logo agence"),
    CopyRule("artist-photos", "expos/logos/", "logos", "expos/", "logo expo"),
    CopyRule("artist-photos", "artists/", "photos", "artists/", "artiste catalogue"),
    CopyRule("artist-photos", "artist/", "photos", "artists/", "artiste legacy artist/"),
    CopyRule("artist-photos", "users/photos/", "photos", "users/", "user legacy users/photos/"),
    CopyRule("artist-photos", "users/", "photos", "users/", "user backoffice"),
    CopyRule("selfies", "users/photos/", "photos", "users/", "user mal place dans selfies"),
    CopyRule("selfies", "selfies/", "photos", "visitors/", "selfie double prefixe"),
    CopyRule("selfies", "", "photos", "visitors/", "selfie racine"),
    CopyRule("avatars", "", "photos", "avatars/", "avatar visiteur anonyme"),
]


def load_env_file(env_path: Path) -> None:
    """Charge les variables KEY=VALUE depuis .env (sans écraser l'environnement existant)."""
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def basename_only(path: str) -> str:
    """Retourne le nom de fichier (dernier segment)."""
    return path.rstrip("/").split("/")[-1]


def map_destination(rule: CopyRule, src_name: str) -> str | None:
    """Calcule le chemin destination ou None si hors règle."""
    if rule.src_prefix:
        if not src_name.startswith(rule.src_prefix):
            return None
        rest = src_name[len(rule.src_prefix) :]
    else:
        # Racine du bucket : exclure les chemins avec sous-dossier sauf selfies/ traité ailleurs
        if "/" in src_name.rstrip("/") and rule.src_bucket == "selfies":
            return None
        rest = src_name

    if not rest or rest.endswith("/"):
        return None

    filename = basename_only(rest)
    if not re.search(r"\.(png|jpe?g|webp|gif)$", filename, re.I):
        return None

    return f"{rule.dst_prefix}{filename}"


def iter_source_objects(client: Client, bucket: str) -> Iterable[dict]:
    """Liste récursivement les objets d'un bucket (pagination Supabase)."""
    offset = 0
    page_size = 100
    while True:
        result = client.storage.from_(bucket).list("", {"limit": page_size, "offset": offset})
        if not result:
            break
        for item in result:
            name = item.get("name")
            if not name:
                continue
            # Dossiers : id null et pas de metadata size — lister le sous-dossier
            if item.get("id") is None and not item.get("metadata"):
                sub_prefix = f"{name}/"
                yield from iter_folder(client, bucket, sub_prefix)
            else:
                yield {"bucket": bucket, "name": name}
        if len(result) < page_size:
            break
        offset += page_size


def iter_folder(client: Client, bucket: str, prefix: str) -> Iterable[dict]:
    """Liste les fichiers sous un préfixe (un niveau ou récursif simple)."""
    offset = 0
    page_size = 100
    while True:
        result = client.storage.from_(bucket).list(prefix.rstrip("/"), {"limit": page_size, "offset": offset})
        if not result:
            break
        for item in result:
            name = item.get("name")
            if not name:
                continue
            full_path = f"{prefix}{name}"
            if item.get("id") is None and not item.get("metadata"):
                yield from iter_folder(client, bucket, f"{full_path}/")
            else:
                yield {"bucket": bucket, "name": full_path}
        if len(result) < page_size:
            break
        offset += page_size


def resolve_rule(obj: dict) -> tuple[CopyRule, str] | None:
    """Trouve la règle et le chemin destination pour un objet."""
    bucket = obj["bucket"]
    name = obj["name"]
    for rule in COPY_RULES:
        if rule.src_bucket != bucket:
            continue
        dst = map_destination(rule, name)
        if dst:
            return rule, dst
    return None


def copy_object(client: Client, src_bucket: str, src_path: str, dst_bucket: str, dst_path: str, dry_run: bool) -> bool:
    """Copie un objet via download + upload (service role)."""
    if dry_run:
        return True
    data = client.storage.from_(src_bucket).download(src_path)
    if not data:
        return False
    # upsert pour relancer sans erreur
    client.storage.from_(dst_bucket).upload(
        dst_path,
        data,
        {"upsert": "true", "content-type": "application/octet-stream"},
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Copie storage vers buckets logos/photos")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Simulation (défaut)")
    parser.add_argument("--execute", action="store_true", help="Exécuter réellement les copies")
    parser.add_argument("--limit", type=int, default=0, help="Limiter le nombre de copies (test)")
    args = parser.parse_args()
    dry_run = not args.execute

    load_env_file(ROOT / ".env")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.", file=sys.stderr)
        return 1

    client = create_client(url, key)

    seen_buckets = sorted({r.src_bucket for r in COPY_RULES})
    planned: list[tuple[dict, CopyRule, str]] = []

    for bucket in seen_buckets:
        print(f"Scan bucket '{bucket}'...")
        for obj in iter_folder(client, bucket, ""):
            resolved = resolve_rule(obj)
            if not resolved:
                print(f"  IGNORE : {obj['name']}")
                continue
            rule, dst_path = resolved
            planned.append((obj, rule, dst_path))

    print(f"\n{len(planned)} copie(s) planifiee(s)" + (" (DRY-RUN)" if dry_run else " (EXECUTION)"))

    ok = 0
    err = 0
    for i, (obj, rule, dst_path) in enumerate(planned):
        if args.limit and i >= args.limit:
            break
        src = obj["name"]
        print(f"  [{rule.label}] {obj['bucket']}/{src} -> {rule.dst_bucket}/{dst_path}")
        try:
            if copy_object(client, obj["bucket"], src, rule.dst_bucket, dst_path, dry_run):
                ok += 1
            else:
                err += 1
                print("    ERREUR telechargement")
        except Exception as exc:  # noqa: BLE001 — script migration
            err += 1
            print(f"    ERREUR : {exc}")

    print(f"\nTermine : {ok} OK, {err} erreur(s)")
    if dry_run:
        print("Relancer avec --execute pour copier réellement.")
        print("Puis exécuter migration_39_storage_urls_logos_photos.sql")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
