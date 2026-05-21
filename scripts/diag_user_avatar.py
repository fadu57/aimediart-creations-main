#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Diagnostic local : profil, RPC, metadata et storage pour un user."""

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


def main() -> int:
    load_env()
    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis", file=sys.stderr)
        return 1

    client = create_client(url, key)
    print(f"=== User {UID} ===")

    profile = (
        client.from_("profiles")
        .select("id,first_name,last_name,username,avatar_url,phone,birth_year")
        .eq("id", UID)
        .maybe_single()
        .execute()
    )
    print("PROFILE:", profile.data)

    agency = client.from_("agency_users").select("agency_id,role_id").eq("user_id", UID).execute()
    print("AGENCY_USERS:", agency.data)

    rpc = client.rpc("get_all_users_with_roles").execute()
    rows = [
        r
        for r in (rpc.data or [])
        if str(r.get("id") or r.get("user_id") or "").strip() == UID
    ]
    print("RPC_ROWS:", len(rows))
    if rows:
        keys = [
            "id",
            "user_id",
            "first_name",
            "last_name",
            "username",
            "avatar_url",
            "user_photo_url",
            "email",
            "agency_id",
            "role_id",
        ]
        print("RPC_ROW0:", {k: rows[0].get(k) for k in keys})

    resp = httpx.get(
        f"{url}/auth/v1/admin/users/{UID}",
        headers={"Authorization": f"Bearer {key}", "apikey": key},
        timeout=30,
    )
    if resp.status_code == 200:
        user = resp.json()
        meta = user.get("user_metadata") or {}
        print("AUTH_EMAIL:", user.get("email"))
        print(
            "META:",
            {
                k: meta.get(k)
                for k in [
                    "first_name",
                    "last_name",
                    "username",
                    "avatar_url",
                    "user_photo_url",
                    "picture",
                    "birth_month",
                    "birth_year",
                ]
            },
        )
    else:
        print("AUTH_ADMIN_ERR:", resp.status_code, resp.text[:200])

    candidates = [
        f"users/{UID}.webp",
        f"users/{UID}.png",
        f"users/{UID}.jpg",
        "users/feb224b0-687c-49d5-8b46-43b62e6330c4.png",
        "users/photos/feb224b0-687c-49d5-8b46-43b62e6330c4.png",
    ]
    for bucket in ("photos", "artist-photos", "selfies"):
        for path in candidates:
            try:
                data = client.storage.from_(bucket).download(path)
                size = len(data) if data else 0
                if size:
                    print(f"STORAGE_OK {bucket}/{path} ({size} bytes)")
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
