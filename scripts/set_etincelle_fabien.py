#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Passe l'abonnement de Fabien Dupont au plan ETINCELLE (essai 1 mois)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("pip install supabase", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
TARGET_FIRST = "Fabien"
TARGET_LAST = "Dupont"
TRIAL_DAYS = 30


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


def find_user(client):
    rows = (
        client.from_("profiles")
        .select("id, first_name, last_name, username")
        .ilike("first_name", TARGET_FIRST)
        .ilike("last_name", TARGET_LAST)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"Aucun profil trouvé pour {TARGET_FIRST} {TARGET_LAST}")
    if len(rows) > 1:
        raise RuntimeError(f"Plusieurs profils trouvés : {rows}")
    return rows[0]


def get_etincelle_pricing(client) -> dict:
    rows = (
        client.from_("pricing")
        .select(
            "pricing_id, plan_code, pricing_plan, display_name, trial_duration_days, pricing_monthly_ttc_eur"
        )
        .eq("plan_code", "ETINCELLE")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError("Plan ETINCELLE introuvable dans pricing")
    return rows[0]


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def add_days_iso(iso: str, days: int) -> str:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt + timedelta(days=days)).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Appliquer la mise à jour")
    args = parser.parse_args()
    dry_run = not args.execute

    load_env()
    base_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        print("VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis", file=sys.stderr)
        return 1

    client = create_client(base_url, key)
    profile = find_user(client)
    user_id = profile["id"]
    print("Profil:", json.dumps(profile, ensure_ascii=False))

    agency_rows = (
        client.from_("agency_users")
        .select("agency_id, role_id")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    if not agency_rows:
        raise RuntimeError("Aucune agence liée via agency_users")
    agency_id = agency_rows[0]["agency_id"]
    agency = (
        client.from_("agencies")
        .select("id, name_agency")
        .eq("id", agency_id)
        .maybe_single()
        .execute()
        .data
    )
    print("Agence:", json.dumps(agency, ensure_ascii=False))

    pricing = get_etincelle_pricing(client)
    pricing_id = pricing["pricing_id"]
    trial_days = int(pricing.get("trial_duration_days") or TRI_DAYS)
    print("Pricing ETINCELLE:", json.dumps(pricing, ensure_ascii=False))

    subs = (
        client.from_("organisation_subscriptions")
        .select("*")
        .eq("organisation_id", agency_id)
        .in_("status", ["trial", "active", "standby"])
        .order("started_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    print("Abonnement actuel (organisation_subscriptions):", json.dumps(subs, ensure_ascii=False, default=str))

    started_at = subs[0]["started_at"] if subs else iso_now()
    trial_ends_at = add_days_iso(started_at, trial_days)

    payload = {
        "plan_code": "ETINCELLE",
        "pricing_id": pricing_id,
        "billing_cycle": "monthly",
        "status": "trial",
        "is_trial": True,
        "started_at": started_at,
        "trial_ends_at": trial_ends_at,
        "ends_at": trial_ends_at,
        "next_renewal_at": None,
        "standby_status": "inactive",
        "updated_at": iso_now(),
    }

    print("Mise à jour prévue:", json.dumps(payload, ensure_ascii=False, default=str))

    if dry_run:
        print("\n[DRY-RUN] Relancer avec --execute pour appliquer.")
        return 0

    if subs:
        sub_id = subs[0]["id"]
        client.from_("organisation_subscriptions").update(payload).eq("id", sub_id).execute()
        print(f"OK — organisation_subscriptions {sub_id} → ETINCELLE")
    else:
        insert_payload = {
            **payload,
            "organisation_id": agency_id,
            "pricing_snapshot": pricing,
            "created_at": iso_now(),
        }
        res = client.from_("organisation_subscriptions").insert(insert_payload).execute()
        print("OK — nouvel abonnement ETINCELLE créé:", res.data)

    # Legacy — garder cohérent si la table existe encore
    try:
        legacy = (
            client.from_("agency_subscriptions")
            .select("agency_id")
            .eq("agency_id", agency_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if legacy:
            client.from_("agency_subscriptions").update(
                {
                    "pricing_plan": pricing.get("pricing_plan") or "L'ETINCELLE",
                    "billing_cycle": "monthly",
                    "started_at": started_at,
                    "expires_at": trial_ends_at,
                    "is_active": True,
                }
            ).eq("agency_id", agency_id).eq("is_active", True).execute()
            print("OK — agency_subscriptions legacy synchronisé")
    except Exception as exc:  # noqa: BLE001
        print("Info — agency_subscriptions non mis à jour:", exc)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"Erreur: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
