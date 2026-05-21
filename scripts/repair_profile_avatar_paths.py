#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Répare les profiles.avatar_url dont le chemin photos/users/{uuid} ne correspond pas à profiles.id.

Contexte : migration legacy artist-photos/users/{ancien_id}.png → photos/users/{ancien_id}.png
sans recopier le fichier sous l'UUID auth.users.

Usage :
  python scripts/repair_profile_avatar_paths.py --dry-run
  python scripts/repair_profile_avatar_paths.py --execute
  python scripts/repair_profile_avatar_paths.py --execute --user-id 4e96dc9d-c3f7-40a7-8b2f-946197cc2d3a
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("pip install supabase", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
USER_PHOTO_RE = re.compile(r"/photos/users/([0-9a-f-]{36})\.", re.I)


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def parse_storage_ref(url: str) -> tuple[str, str] | None:
    marker = "/object/public/"
    if marker not in url:
        return None
    rest = url.split(marker, 1)[1]
    slash = rest.find("/")
    if slash <= 0:
        return None
    bucket = rest[:slash]
    path = rest[slash + 1 :]
    return bucket, path


def public_url(base_url: str, bucket: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


def copy_storage(client: Client, src_bucket: str, src_path: str, dst_bucket: str, dst_path: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    data = client.storage.from_(src_bucket).download(src_path)
    if not data:
        return False
    client.storage.from_(dst_bucket).upload(
        dst_path,
        data,
        {"upsert": "true", "content-type": "application/octet-stream"},
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Répare les avatar_url user non canoniques")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--user-id", default="", help="Limiter à un utilisateur")
    args = parser.parse_args()
    dry_run = not args.execute

    load_env()
    base_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        print("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis", file=sys.stderr)
        return 1

    client = create_client(base_url, key)
    rows = (
        client.from_("profiles")
        .select("id,first_name,last_name,avatar_url")
        .not_.is_("avatar_url", "null")
        .execute()
        .data
        or []
    )

    target_uid = args.user_id.strip().lower()
    mismatches: list[dict] = []
    for row in rows:
        profile_id = str(row.get("id") or "").strip()
        avatar_url = str(row.get("avatar_url") or "").strip()
        if not profile_id or not avatar_url:
            continue
        if target_uid and profile_id.lower() != target_uid:
            continue
        match = USER_PHOTO_RE.search(avatar_url)
        if not match:
            continue
        path_uuid = match.group(1).lower()
        if path_uuid == profile_id.lower():
            continue
        mismatches.append(row)

    print(f"Mode: {'DRY-RUN' if dry_run else 'EXECUTE'}")
    print(f"Profils avec chemin photos/users/{{autre_uuid}} : {len(mismatches)}")

    ok = 0
    for row in mismatches:
        profile_id = str(row["id"])
        avatar_url = str(row["avatar_url"])
        name = f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
        ref = parse_storage_ref(avatar_url)
        if not ref:
            print(f"SKIP {profile_id} {name} : URL non parsée")
            continue
        src_bucket, src_path = ref
        ext = src_path.rsplit(".", 1)[-1].lower()
        dst_bucket = "photos"
        dst_path = f"users/{profile_id}.{ext}"
        dst_url = public_url(base_url, dst_bucket, dst_path)

        print(f"\n{profile_id} ({name})")
        print(f"  src: {src_bucket}/{src_path}")
        print(f"  dst: {dst_bucket}/{dst_path}")

        if not copy_storage(client, src_bucket, src_path, dst_bucket, dst_path, dry_run):
            print("  ERREUR copie storage")
            continue

        if dry_run:
            print(f"  -> avatar_url: {dst_url}")
            ok += 1
            continue

        upd = (
            client.from_("profiles")
            .update({"avatar_url": dst_url})
            .eq("id", profile_id)
            .execute()
        )
        if upd.data is None and getattr(upd, "error", None):
            print(f"  ERREUR update profiles: {upd.error}")
            continue
        print("  OK")
        ok += 1

    print(f"\nTerminé : {ok}/{len(mismatches)}")
    return 0 if ok == len(mismatches) else 1


if __name__ == "__main__":
    raise SystemExit(main())
