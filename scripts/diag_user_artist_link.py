#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vérifie le lien user ↔ artiste pour un utilisateur donné."""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import httpx
    from supabase import create_client
except ImportError:
    print("pip install supabase httpx", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
UID = (sys.argv[1] if len(sys.argv) > 1 else "4e96dc9d-c3f7-40a7-8b2f-946197cc2d3a").strip()


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


def head_url(url: str) -> tuple[int, str]:
    try:
        r = httpx.head(url, timeout=20, follow_redirects=True)
        return r.status_code, r.headers.get("content-type", "")
    except Exception as exc:
        return -1, str(exc)


def main() -> int:
    load_env()
    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis", file=sys.stderr)
        return 1

    client = create_client(url, key)
    profile = (
        client.from_("profiles")
        .select("id,first_name,last_name,avatar_url")
        .eq("id", UID)
        .maybe_single()
        .execute()
    ).data or {}
    avatar_url = (profile.get("avatar_url") or "").strip()
    print("=== Profil user ===")
    print(profile)

    # UUID extrait du chemin photos/users/{uuid}.ext
    path_uuid = ""
    marker = "/photos/users/"
    if marker in avatar_url:
        tail = avatar_url.split(marker, 1)[1]
        path_uuid = tail.split(".", 1)[0].strip()

    print("\n=== UUID dans avatar_url (photos/users/) ===")
    print("path_uuid:", path_uuid or "(aucun)")
    print("user_id  :", UID)
    print("match    :", path_uuid == UID)

    if avatar_url:
        code, info = head_url(avatar_url)
        print("HTTP avatar_url:", code, info)

    # Artistes Camus / UUID path
    artists = (
        client.from_("artists")
        .select("artist_id,artist_firstname,artist_lastname,artist_photo_url,artist_email")
        .ilike("artist_lastname", "%Camus%")
        .execute()
    ).data or []
    print("\n=== Artistes « Camus » ===")
    for row in artists:
        print(row)

    if path_uuid:
        by_id = (
            client.from_("artists")
            .select("artist_id,artist_firstname,artist_lastname,artist_photo_url")
            .eq("artist_id", path_uuid)
            .maybe_single()
            .execute()
        ).data
        print("\n=== Artiste avec artist_id = UUID du chemin avatar ===")
        print(by_id)

    # Fichiers storage canoniques
    for path in [f"users/{UID}.webp", f"users/{UID}.png", f"users/{path_uuid}.png" if path_uuid else ""]:
        if not path:
            continue
        for bucket in ("photos", "artist-photos"):
            try:
                data = client.storage.from_(bucket).download(path)
                if data:
                    print(f"STORAGE_OK {bucket}/{path} ({len(data)} bytes)")
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
