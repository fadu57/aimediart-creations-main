#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migration bucket audio-guides : MP3 → M4A (AAC dans conteneur MP4).

Pour chaque ligne audio_files avec storage_path se terminant par .mp3 :
  1. Télécharge le MP3
  2. Convertit en M4A via ffmpeg (audio/mp4)
  3. Upload le .m4a (même chemin logique, extension changée)
  4. Met à jour audio_files (storage_path, file_size_bytes)
  5. Supprime l'ancien .mp3

PRUDENT :
  - Mode dry-run par défaut (aucune écriture)
  - Nécessite ffmpeg (PATH, variable FFMPEG_PATH, ou installation WinGet Gyan.FFmpeg)
  - Nécessite SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (.env à la racine)

Usage :
  python scripts/convert_audio_guides_mp3_to_m4a.py
  python scripts/convert_audio_guides_mp3_to_m4a.py --limit 3
  python scripts/convert_audio_guides_mp3_to_m4a.py --execute
  python scripts/convert_audio_guides_mp3_to_m4a.py --execute --include-all-status
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from supabase import Client, create_client
except ImportError:
    print("Installer : pip install supabase", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]
BUCKET = "audio-guides"
CONTENT_TYPE_M4A = "audio/mp4"


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


def find_ffmpeg() -> str | None:
    """Cherche ffmpeg : PATH, FFMPEG_PATH, puis emplacements WinGet courants (Windows)."""
    env_path = os.environ.get("FFMPEG_PATH", "").strip()
    if env_path and Path(env_path).is_file():
        return env_path

    found = shutil.which("ffmpeg")
    if found:
        return found

    if sys.platform == "win32":
        local_app = os.environ.get("LOCALAPPDATA", "")
        if local_app:
            winget_root = Path(local_app) / "Microsoft" / "WinGet" / "Packages"
            if winget_root.is_dir():
                for candidate in winget_root.glob("Gyan.FFmpeg*/**/ffmpeg.exe"):
                    if candidate.is_file():
                        return str(candidate)

    return None


def require_ffmpeg() -> str:
    """Vérifie que ffmpeg est disponible ; retourne le chemin exécutable."""
    path = find_ffmpeg()
    if not path:
        print(
            "ffmpeg introuvable (PATH, FFMPEG_PATH ou winget install Gyan.FFmpeg).",
            file=sys.stderr,
        )
        sys.exit(1)
    return path


def mp3_to_m4a_path(storage_path: str) -> str:
    """Remplace l'extension .mp3 par .m4a."""
    if not storage_path.lower().endswith(".mp3"):
        raise ValueError(f"Chemin non MP3 : {storage_path}")
    return storage_path[:-4] + ".m4a"


def convert_mp3_bytes_to_m4a(
    ffmpeg_bin: str,
    mp3_bytes: bytes,
    bitrate: str,
) -> tuple[bytes, Path]:
    """
    Convertit des octets MP3 en M4A via ffmpeg dans un répertoire temporaire.
    Retourne (octets m4a, dossier temporaire à nettoyer par l'appelant).
    """
    tmp_dir = Path(tempfile.mkdtemp(prefix="audio_migrate_"))
    src = tmp_dir / "input.mp3"
    dst = tmp_dir / "output.m4a"
    src.write_bytes(mp3_bytes)

    cmd = [
        ffmpeg_bin,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(src),
        "-c:a",
        "aac",
        "-b:a",
        bitrate,
        "-movflags",
        "+faststart",
        str(dst),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffmpeg a échoué")

    return dst.read_bytes(), tmp_dir


def fetch_mp3_rows(client: Client, include_all_status: bool) -> list[dict]:
    """Liste les audio_files pointant vers un .mp3."""
    query = (
        client.table("audio_files")
        .select("id, storage_path, status, file_size_bytes")
        .like("storage_path", "%.mp3")
    )
    if not include_all_status:
        query = query.eq("status", "ready")
    result = query.execute()
    return list(result.data or [])


def mark_missing_source(client: Client, row_id: str, old_path: str) -> None:
    """Marque une ligne dont le MP3 source est absent — régénération via l'app."""
    new_path = mp3_to_m4a_path(old_path)
    client.table("audio_files").update({
        "storage_path": new_path,
        "status": "error",
        "error_message": "Fichier MP3 source absent du storage — relancer la génération",
        "file_size_bytes": None,
    }).eq("id", row_id).execute()


def is_storage_not_found(exc: Exception) -> bool:
    """Détecte une erreur Supabase Storage « objet introuvable »."""
    text = str(exc).lower()
    return "404" in text or "not_found" in text or "object not found" in text


def migrate_one(
    client: Client,
    ffmpeg_bin: str,
    row: dict,
    bitrate: str,
    dry_run: bool,
) -> None:
    """Migre un fichier MP3 vers M4A (ou simule en dry-run)."""
    row_id = row["id"]
    old_path = (row.get("storage_path") or "").strip()
    if not old_path.lower().endswith(".mp3"):
        print(f"  SKIP id={row_id} : chemin inattendu {old_path!r}")
        return

    new_path = mp3_to_m4a_path(old_path)
    print(f"  id={row_id} : {old_path} -> {new_path}")

    if dry_run:
        return

    try:
        mp3_bytes = client.storage.from_(BUCKET).download(old_path)
    except Exception as exc:  # noqa: BLE001 — script migration
        if is_storage_not_found(exc):
            mark_missing_source(client, row_id, old_path)
            print(f"    ABSENT : MP3 introuvable — ligne marquée error (régénérer via l'app)")
            return
        raise

    if not mp3_bytes:
        mark_missing_source(client, row_id, old_path)
        print(f"    ABSENT : téléchargement vide — ligne marquée error (régénérer via l'app)")
        return

    tmp_dir: Path | None = None
    try:
        m4a_bytes, tmp_dir = convert_mp3_bytes_to_m4a(ffmpeg_bin, mp3_bytes, bitrate)
        file_size = len(m4a_bytes)

        upload_res = client.storage.from_(BUCKET).upload(
            new_path,
            m4a_bytes,
            {"upsert": "true", "content-type": CONTENT_TYPE_M4A},
        )
        if hasattr(upload_res, "error") and upload_res.error:
            raise RuntimeError(f"upload M4A : {upload_res.error}")

        update_res = (
            client.table("audio_files")
            .update({"storage_path": new_path, "file_size_bytes": file_size})
            .eq("id", row_id)
            .execute()
        )
        if not update_res.data:
            raise RuntimeError("mise à jour audio_files sans ligne retournée")

        remove_res = client.storage.from_(BUCKET).remove([old_path])
        if hasattr(remove_res, "error") and remove_res.error:
            print(f"    AVERTISSEMENT : M4A OK mais suppression MP3 échouée : {remove_res.error}")
    finally:
        if tmp_dir and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Convertit audio-guides MP3 → M4A (AAC)")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Simulation (défaut)")
    parser.add_argument("--execute", action="store_true", help="Exécuter réellement la migration")
    parser.add_argument("--limit", type=int, default=0, help="Limiter le nombre de fichiers (test)")
    parser.add_argument(
        "--bitrate",
        default="64k",
        help="Débit AAC ffmpeg (défaut : 64k, adapté à la parole TTS)",
    )
    parser.add_argument(
        "--include-all-status",
        action="store_true",
        help="Inclure tous les statuts (pas seulement ready)",
    )
    args = parser.parse_args()
    dry_run = not args.execute

    load_env_file(ROOT / ".env")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.", file=sys.stderr)
        return 1

    ffmpeg_bin = require_ffmpeg() if not dry_run else ""
    client = create_client(url, key)

    rows = fetch_mp3_rows(client, args.include_all_status)
    if args.limit:
        rows = rows[: args.limit]

    mode = "DRY-RUN" if dry_run else "EXECUTION"
    print(f"{len(rows)} fichier(s) MP3 à migrer ({mode})")

    ok = 0
    err = 0
    for row in rows:
        try:
            migrate_one(client, ffmpeg_bin, row, args.bitrate, dry_run)
            ok += 1
        except Exception as exc:  # noqa: BLE001 — script migration
            err += 1
            print(f"    ERREUR id={row.get('id')} : {exc}")

    print(f"\nTerminé : {ok} OK, {err} erreur(s)")
    if dry_run:
        print("Relancer avec --execute pour migrer réellement.")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
