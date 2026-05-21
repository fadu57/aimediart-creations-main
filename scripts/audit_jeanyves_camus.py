#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audit complet : Jean-Yves user (responsable org) vs Jean-Yves artiste catalogue.
Compare profils, auth, storage, agency_users, artists, URLs photo.
"""

from __future__ import annotations

import json
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

# IDs fournis par l'utilisateur (audit impératif)
USER_ORG_ID = "4f28cdac-5a34-4e32-ae35-2ba1d5f79a99"
ARTIST_ID = "015a3ef3-fb82-4391-90f5-df557a6bf073"
# Ancien ID investigué précédemment (Jean-Yves Camus)
USER_LEGACY_INVESTIGATION = "4e96dc9d-c3f7-40a7-8b2f-946197cc2d3a"


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


def head_url(url: str) -> dict:
    if not url:
        return {"status": None, "ok": False}
    try:
        r = httpx.head(url, timeout=25, follow_redirects=True)
        return {"status": r.status_code, "ok": r.status_code < 400, "type": r.headers.get("content-type")}
    except Exception as exc:
        return {"status": None, "ok": False, "error": str(exc)}


def path_uuid_from_avatar(url: str) -> str:
    if "/photos/users/" not in url:
        return ""
    return url.split("/photos/users/", 1)[1].split(".", 1)[0]


def auth_user(client_url: str, key: str, uid: str) -> dict | None:
    r = httpx.get(
        f"{client_url.rstrip('/')}/auth/v1/admin/users/{uid}",
        headers={"Authorization": f"Bearer {key}", "apikey": key},
        timeout=30,
    )
    if r.status_code != 200:
        return {"error": r.status_code, "body": r.text[:300]}
    u = r.json()
    meta = u.get("user_metadata") or {}
    app = u.get("app_metadata") or {}
    return {
        "id": u.get("id"),
        "email": u.get("email"),
        "created_at": u.get("created_at"),
        "app_metadata": app,
        "user_metadata_keys": sorted(meta.keys()),
        "user_metadata_photo": {
            k: meta.get(k)
            for k in ["avatar_url", "user_photo_url", "picture", "photo_url", "first_name", "last_name"]
        },
    }


def storage_probe(client: Client, bucket: str, path: str) -> dict:
    try:
        data = client.storage.from_(bucket).download(path)
        return {"exists": bool(data), "bytes": len(data) if data else 0}
    except Exception as exc:
        return {"exists": False, "error": str(exc)[:120]}


def audit_user_block(client: Client, base_url: str, key: str, uid: str, label: str) -> dict:
    block: dict = {"label": label, "user_id": uid}

    block["auth"] = auth_user(base_url, key, uid)

    profile = (
        client.from_("profiles")
        .select("*")
        .eq("id", uid)
        .maybe_single()
        .execute()
    )
    block["profile"] = profile.data if profile else None

    block["agency_users"] = (
        client.from_("agency_users").select("agency_id,role_id,created_at").eq("user_id", uid).execute().data
    )

    rpc = client.rpc("get_all_users_with_roles").execute()
    rpc_rows = [
        r
        for r in (rpc.data or [])
        if str(r.get("id") or r.get("user_id") or "").strip() == uid
    ]
    block["rpc_get_all_users_with_roles"] = rpc_rows[0] if rpc_rows else None

    avatar = (block.get("profile") or {}).get("avatar_url") or ""
    path_uuid = path_uuid_from_avatar(avatar)
    block["avatar_analysis"] = {
        "avatar_url": avatar,
        "path_uuid_in_url": path_uuid,
        "canonical_match": path_uuid.lower() == uid.lower() if path_uuid else None,
        "http": head_url(avatar),
    }

    exts = ["webp", "png", "jpg", "jpeg"]
    canonical_storage = {}
    for ext in exts:
        p = f"users/{uid}.{ext}"
        canonical_storage[p] = storage_probe(client, "photos", p)
    block["storage_canonical_users"] = canonical_storage

    if path_uuid and path_uuid.lower() != uid.lower():
        wrong_path = avatar.split("/photos/users/", 1)[1] if "/photos/users/" in avatar else ""
        if wrong_path:
            block["storage_wrong_path_in_db"] = storage_probe(client, "photos", wrong_path)

    return block


def audit_artist_block(client: Client, artist_id: str) -> dict:
    artist = (
        client.from_("artists")
        .select("*")
        .eq("artist_id", artist_id)
        .maybe_single()
        .execute()
    )
    row = artist.data if artist else None
    photo = (row or {}).get("artist_photo_url") or ""
    path = ""
    if "/photos/artists/" in photo:
        path = photo.split("/photos/artists/", 1)[1]

    block = {
        "artist_id": artist_id,
        "artist_row": row,
        "photo_analysis": {
            "artist_photo_url": photo,
            "http": head_url(photo),
            "storage_path": path,
            "storage": storage_probe(client, "photos", path) if path else None,
        },
    }

    block["artist_agency_links"] = (
        client.from_("artist_agency")
        .select("*")
        .eq("artist_id", artist_id)
        .execute()
        .data
        if _table_exists(client, "artist_agency")
        else "table_absent"
    )

    return block


def _table_exists(client: Client, name: str) -> bool:
    try:
        client.from_(name).select("*").limit(1).execute()
        return True
    except Exception:
        return False


def find_camus_profiles(client: Client) -> list:
    return (
        client.from_("profiles")
        .select("id,first_name,last_name,avatar_url")
        .ilike("last_name", "%Camus%")
        .execute()
        .data
        or []
    )


def find_camus_artists(client: Client) -> list:
    return (
        client.from_("artists")
        .select("artist_id,artist_firstname,artist_lastname,artist_photo_url,artist_email")
        .ilike("artist_lastname", "%Camus%")
        .execute()
        .data
        or []
    )


def cross_match(user_blocks: list[dict], artist_block: dict) -> dict:
    """Cherche des liens croisés UUID / noms / URLs."""
    artist = artist_block.get("artist_row") or {}
    artist_photo = artist.get("artist_photo_url") or ""
    artist_id = artist.get("artist_id") or ARTIST_ID

    links = []
    for ub in user_blocks:
        uid = ub["user_id"]
        avatar = (ub.get("profile") or {}).get("avatar_url") or ""
        path_uuid = path_uuid_from_avatar(avatar)

        if path_uuid == artist_id:
            links.append({"type": "user_avatar_points_to_artist_id", "user_id": uid, "avatar_url": avatar})
        if path_uuid and path_uuid not in (uid, artist_id):
            links.append({"type": "user_avatar_orphan_uuid", "user_id": uid, "orphan_uuid": path_uuid, "avatar_url": avatar})
        if avatar and artist_photo and avatar.split("?")[0] == artist_photo.split("?")[0]:
            links.append({"type": "same_photo_url", "user_id": uid, "url": avatar})

        fn = ((ub.get("profile") or {}).get("first_name") or "").strip().lower()
        ln = ((ub.get("profile") or {}).get("last_name") or "").strip().lower()
        afn = (artist.get("artist_firstname") or "").strip().lower()
        aln = (artist.get("artist_lastname") or "").strip().lower()
        if fn == afn and ln == aln:
            links.append({"type": "same_name_user_and_artist", "user_id": uid, "artist_id": artist_id})

    return {"cross_links": links, "distinct_user_ids_for_camus": [u["user_id"] for u in user_blocks]}


def main() -> int:
    load_env()
    base_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        print("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis", file=sys.stderr)
        return 1

    client = create_client(base_url, key)

    report = {
        "audit_at": "local",
        "ids_requested": {
            "user_org_responsable": USER_ORG_ID,
            "artist_catalogue": ARTIST_ID,
            "user_previously_investigated": USER_LEGACY_INVESTIGATION,
        },
        "all_profiles_lastname_camus": find_camus_profiles(client),
        "all_artists_lastname_camus": find_camus_artists(client),
    }

    user_blocks = [
        audit_user_block(client, base_url, key, USER_ORG_ID, "Jean-Yves responsable org (ID fourni)"),
        audit_user_block(client, base_url, key, USER_LEGACY_INVESTIGATION, "Jean-Yves Camus (ID investigation precedente)"),
    ]
    report["users"] = user_blocks
    report["artist"] = audit_artist_block(client, ARTIST_ID)
    report["cross_analysis"] = cross_match(user_blocks, report["artist"])

    # Synthèse lisible
    report["verdict"] = []
    org = user_blocks[0]
    legacy = user_blocks[1]
    if not org.get("profile"):
        report["verdict"].append("CRITIQUE: le user 4f28cdac (responsable org) N'A PAS de ligne profiles.")
    if not org.get("auth") or org["auth"].get("error"):
        report["verdict"].append("CRITIQUE: le user 4f28cdac n'existe pas dans auth.users ou erreur admin API.")
    if org.get("profile") and legacy.get("profile"):
        if org["user_id"] != legacy["user_id"]:
            report["verdict"].append(
                "DEUX comptes user distincts nommes Camus: 4f28cdac (org) vs 4e96dc9d (investigation). Confusion probable si l'app melange les sessions."
            )
    org_avatar = (org.get("profile") or {}).get("avatar_url")
    if org_avatar:
        pu = path_uuid_from_avatar(org_avatar)
        if pu and pu != USER_ORG_ID:
            report["verdict"].append(
                f"User org: avatar_url pointe vers UUID {pu} au lieu de {USER_ORG_ID} (legacy melange)."
            )
    elif org.get("profile"):
        report["verdict"].append("User org: profiles.avatar_url VIDE — pas de photo en base pour le dashboard.")

    artist_photo = (report["artist"].get("artist_row") or {}).get("artist_photo_url")
    if artist_photo:
        report["verdict"].append(
            "Artiste catalogue: photo separee dans artists.artist_photo_url (normal, table distincte)."
        )

    out_path = ROOT / "scripts" / "audit_jeanyves_camus_report.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")

    print("=" * 72)
    print("AUDIT Jean-Yves — user org vs artiste")
    print("=" * 72)
    print(json.dumps(report["verdict"], indent=2, ensure_ascii=False))
    print("\n--- Profils Camus en base ---")
    print(json.dumps(report["all_profiles_lastname_camus"], indent=2, ensure_ascii=False))
    print("\n--- Artistes Camus en base ---")
    print(json.dumps(report["all_artists_lastname_camus"], indent=2, ensure_ascii=False))
    print("\n--- User org 4f28cdac ---")
    print(json.dumps(org, indent=2, ensure_ascii=False, default=str))
    print("\n--- User legacy 4e96dc9d ---")
    print(json.dumps(legacy, indent=2, ensure_ascii=False, default=str))
    print("\n--- Artiste 015a3ef3 ---")
    print(json.dumps(report["artist"], indent=2, ensure_ascii=False, default=str))
    print("\n--- Liens croises ---")
    print(json.dumps(report["cross_analysis"], indent=2, ensure_ascii=False))
    print(f"\nRapport JSON: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
