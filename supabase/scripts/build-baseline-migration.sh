#!/usr/bin/env bash
# AIM-173 — régénère supabase/migrations/20260101000000_baseline_schema.sql
# à partir de l'état courant du volume Docker local persistant (le plus
# proche organiquement de prod).
#
# N'écrase PAS le fichier de sortie directement : écrit dans un fichier
# .new à côté, pour permettre une relecture du diff avant de committer.
#
# Pourquoi pas un simple `pg_dump --schema=public,storage` : le rôle
# `postgres` utilisé pour rejouer les migrations n'a que USAGE (pas CREATE)
# sur le schéma `storage` — capturer la moindre fonction/type/trigger de ce
# schéma dans la baseline casse le rejeu à froid avec "permission denied for
# schema storage" (42501). Tous les objets structurels de `storage`
# (fonctions, types, triggers, tables buckets/objects) sont provisionnés par
# le conteneur storage-api lui-même au démarrage, identiques sur toute
# instance Supabase vierge — les inclure est à la fois redondant et
# destructeur. Seules les policies RLS sur storage.objects sont spécifiques
# au projet ; CREATE POLICY, contrairement à CREATE FUNCTION/TYPE, ne
# nécessite pas le privilège CREATE sur le schéma et fonctionne donc sous le
# rôle postgres. On les reconstruit séparément depuis pg_policies.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_FILE="$REPO_ROOT/supabase/migrations/20260101000000_baseline_schema.sql"
LOCAL_DB="${LOCAL_DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Dump du schéma public (supabase db dump)"
supabase db dump --local --schema=public -f "$WORKDIR/public.sql"

echo "==> Reconstruction des policies RLS sur storage.objects depuis pg_policies"
psql "$LOCAL_DB" -At -c "
select
  format(
    E'DROP POLICY IF EXISTS %I ON storage.objects;\nCREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s;\n',
    policyname,
    policyname,
    case when permissive = 'PERMISSIVE' then 'PERMISSIVE' else 'RESTRICTIVE' end,
    cmd,
    array_to_string(roles, ', '),
    case when qual is not null then format(E'\n  USING (%s)', qual) else '' end,
    case when with_check is not null then format(E'\n  WITH CHECK (%s)', with_check) else '' end
  )
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
" > "$WORKDIR/storage_policies_raw.sql"

cat > "$WORKDIR/storage_policies_appendix.sql" <<'HEADER'
--
-- RLS policies on storage.objects (schéma "storage", propriété
-- supabase_storage_admin — hors périmètre de --schema=public ci-dessus).
-- Générées depuis pg_policies sur l'instance source, pas via pg_dump :
-- storage.objects/buckets, leurs types, fonctions, triggers et séquences
-- sont provisionnés par le conteneur storage-api au démarrage (identique
-- sur toute instance Supabase, vierge ou non) — les inclure via pg_dump
-- provoque "permission denied for schema storage" (le rôle postgres n'a
-- pas CREATE sur ce schéma, seulement USAGE). Seules les policies sont
-- spécifiques à ce projet et doivent être rejouées.
--

HEADER
cat "$WORKDIR/storage_policies_raw.sql" >> "$WORKDIR/storage_policies_appendix.sql"

echo "==> Qualification explicite du search_path (public.<fonction>/<table>)"
# Le search_path pendant le rejeu de migration n'inclut pas "public" par
# défaut (contrairement à une session psql interactive normale), donc les
# noms non qualifiés capturés depuis pg_policies échouent à la résolution
# (42883). Ajouter ici tout nouveau nom de fonction/table public référencé
# par une policy storage.objects si `build && verify` (voir §5 du plan
# AIM-173) échoue avec "does not exist" sur ce nom.
PUBLIC_FUNCTIONS=(
  is_aimediart_admin
  rls_is_staff
  storage_photos_path_is_own
  audio_file_is_ready
  is_cost_admin
)
for fn in "${PUBLIC_FUNCTIONS[@]}"; do
  perl -i -pe "s/(?<!\.)\b${fn}\(/public.${fn}(/g" "$WORKDIR/storage_policies_appendix.sql"
done
perl -i -pe 's/(?<!\.)\bFROM users_legacy\b/FROM public.users_legacy/g' "$WORKDIR/storage_policies_appendix.sql"

echo "==> Assemblage"
cat "$WORKDIR/public.sql" "$WORKDIR/storage_policies_appendix.sql" > "$OUT_FILE.new"

echo ""
echo "Fichier généré : $OUT_FILE.new"
echo "Diff contre la baseline actuelle :"
diff -u "$OUT_FILE" "$OUT_FILE.new" || true
echo ""
echo "Relire le diff ci-dessus, puis :"
echo "  mv '$OUT_FILE.new' '$OUT_FILE'"
echo ""
echo "Vérification obligatoire avant commit (voir plan AIM-173 §5) : rejouer"
echo "cette baseline + les migrations timestamp sur un volume Docker JETABLE"
echo "(jamais le volume local en cours d'usage), puis :"
echo "  1. psql \"\$DB_URL\" -At -c \"select public.rls_is_global_admin();\"  # doit répondre"
echo "  2. npm run test:tenant-isolation  # doit sortir en code 0"
