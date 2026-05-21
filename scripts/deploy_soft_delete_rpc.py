#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Déploie soft_delete_team_member.sql via API REST Supabase (service role)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("pip install httpx", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "supabase" / "sql" / "soft_delete_team_member.sql"


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
    base_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not SQL_PATH.is_file():
        print(f"Fichier introuvable: {SQL_PATH}", file=sys.stderr)
        return 1

    sql = SQL_PATH.read_text(encoding="utf-8")
    print("=== Déploiement RPC soft_delete_team_member ===")

    if db_url:
        try:
            import psycopg2
        except ImportError:
            print("DATABASE_URL défini mais psycopg2 absent — pip install psycopg2-binary", file=sys.stderr)
            return 1
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.close()
        print("OK via DATABASE_URL")
        return 0

    if not base_url or not key:
        print("DATABASE_URL ou (SUPABASE_URL + SERVICE_ROLE_KEY) requis", file=sys.stderr)
        print("Sinon : copiez supabase/sql/soft_delete_team_member.sql dans le SQL Editor Supabase.")
        return 1

    # Fallback : pg-meta /query si disponible sur l'instance
    resp = httpx.post(
        f"{base_url.rstrip('/')}/pg/query",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/json",
        },
        json={"query": sql},
        timeout=60,
    )
    if resp.status_code < 300:
        print("OK via /pg/query")
        return 0

    print("Impossible de déployer automatiquement (status", resp.status_code, ")")
    print("Collez le contenu de supabase/sql/soft_delete_team_member.sql dans Supabase > SQL Editor.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
