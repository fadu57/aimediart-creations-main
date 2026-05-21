#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Répare le compte org Jean-Yves (4f28cdac) : crée profiles manquant + copie photo user.

Contexte audit : auth.users existe, agency_users OK, profiles ABSENT,
photo présente sur l'autre compte 4e96dc9d (même nom, même agence).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    import httpx
    from supabase import create_client, Client
except ImportError:
    print("pip install supabase httpx", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
USER_ORG_ID = "4f28cdac-5a34-4e32-ae35-2ba1d5f79a99"
USER_WITH_PHOTO_ID = "4e96dc9d-c3f7-40a7-8b2f-946197cc2d3a"


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


def auth_user(base_url: str, key: str, uid: str) -> dict:
    r = httpx.get(
        f"{base_url.rstrip('/')}/auth/v1/admin/users/{uid}",
        headers={"Authorization": f"Bearer {key}", "apikey": key},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def meta_str(meta: dict, *keys: str) -> str | None:
    for k in keys:
        v = meta.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def public_url(base_url: str, bucket: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    dry_run = not args.execute

    load_env()
    base_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        print("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis", file=sys.stderr)
        return 1

    client = create_client(base_url, key)

    existing = (
        client.from_("profiles")
        .select("id")
        .eq("id", USER_ORG_ID)
        .maybe_single()
        .execute()
    )
    has_profile = bool(existing.data if existing else None)
    print(f"profiles existant pour {USER_ORG_ID}: {has_profile}")

    auth = auth_user(base_url, key, USER_ORG_ID)
    meta = auth.get("user_metadata") or {}

    src_profile = (
        client.from_("profiles")
        .select("avatar_url,phone,zip_code,city,country_code,language")
        .eq("id", USER_WITH_PHOTO_ID)
        .maybe_single()
        .execute()
    )
    src = src_profile.data if src_profile else None
    src_avatar = (src or {}).get("avatar_url") or ""
    print(f"Photo source ({USER_WITH_PHOTO_ID}): {src_avatar}")

    dst_path = f"users/{USER_ORG_ID}.png"
    dst_url = public_url(base_url, "photos", dst_path)

    if src_avatar and "/photos/users/" in src_avatar:
        src_path = src_avatar.split("/photos/users/", 1)[1]
        storage_src = f"users/{src_path}" if not src_path.startswith("users/") else src_path
        print(f"Copie storage: photos/{storage_src} -> photos/{dst_path}")
        if not dry_run:
            data = client.storage.from_("photos").download(storage_src)
            if data:
                client.storage.from_("photos").upload(
                    dst_path,
                    data,
                    {"upsert": "true", "content-type": "application/octet-stream"},
                )
            else:
                print("ERREUR: fichier source introuvable", file=sys.stderr)
                return 1

    row = {
        "id": USER_ORG_ID,
        "first_name": meta_str(meta, "first_name", "prenom", "user_prenom") or "Jean-Yves",
        "last_name": meta_str(meta, "last_name", "nom") or "Camus",
        "username": meta_str(meta, "username"),
        "avatar_url": dst_url if src_avatar else None,
        "phone": (src or {}).get("phone"),
        "zip_code": (src or {}).get("zip_code"),
        "city": (src or {}).get("city"),
        "country_code": (src or {}).get("country_code") or "FR",
        "language": (src or {}).get("language") or "fr",
    }

    print("Row profiles a upsert:", row)
    if dry_run:
        print("DRY-RUN — relancer avec --execute")
        return 0

    if has_profile:
        upd = client.from_("profiles").update({k: v for k, v in row.items() if k != "id"}).eq("id", USER_ORG_ID).execute()
        print("UPDATE OK", bool(upd.data))
    else:
        ins = client.from_("profiles").insert(row).execute()
        print("INSERT OK", bool(ins.data))

    verify = (
        client.from_("profiles")
        .select("id,first_name,last_name,avatar_url")
        .eq("id", USER_ORG_ID)
        .maybe_single()
        .execute()
    )
    print("VERIFY:", verify.data if verify else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
