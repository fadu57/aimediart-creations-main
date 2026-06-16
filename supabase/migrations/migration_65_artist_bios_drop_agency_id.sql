-- =============================================================================
-- migration_65_artist_bios_drop_agency_id.sql
-- Suppression de artist_bios.agency_id
--
-- Exécuter bloc par bloc dans Supabase → SQL Editor.
-- Pas de BEGIN/COMMIT global : valider le Bloc 1 avant d'enchaîner.
--
-- Prérequis audit live (2026-06) :
--   - 46 lignes, 1 doublon artiste bf108674-39ca-40e2-95f1-cb60de7e5584
--   - FK artist_bios_agency_id_fkey, index idx_artist_bios_agency,
--     idx_unique_artist_agency_bio, idx_unique_artist_common_bio (partiel)
-- =============================================================================


-- =============================================================================
-- Bloc 1 — Vérification préalable (SELECT uniquement, sans modification)
-- Liste les lignes qui SERONT SUPPRIMÉES lors de la fusion (rn > 1).
-- Règle de conservation (rn = 1) :
--   1) updated_at le plus récent
--   2) à égalité → bio_text la plus longue
--   3) à égalité → id le plus grand (ordre UUID DESC)
-- =============================================================================

WITH ranked AS (
  SELECT
    ab.id,
    ab.artist_id,
    ab.language,
    ab.agency_id,
    LENGTH(COALESCE(ab.bio_text, '')) AS bio_length,
    ab.updated_at,
    ab.created_at,
    LEFT(COALESCE(ab.bio_text, ''), 120) AS bio_preview,
    ROW_NUMBER() OVER (
      PARTITION BY ab.artist_id, ab.language
      ORDER BY
        ab.updated_at DESC NULLS LAST,
        LENGTH(COALESCE(ab.bio_text, '')) DESC,
        ab.id DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY ab.artist_id, ab.language) AS dup_count
  FROM public.artist_bios ab
)
SELECT
  id,
  artist_id,
  language,
  agency_id,
  bio_length,
  updated_at,
  created_at,
  bio_preview,
  rn,
  dup_count,
  'WILL_DELETE' AS action
FROM ranked
WHERE dup_count > 1
  AND rn > 1
ORDER BY artist_id, language, rn;

-- (Optionnel) Lignes CONSERVÉES pour le même artiste en doublon — contrôle croisé :
-- WITH ranked AS (
--   SELECT ab.*, ROW_NUMBER() OVER (
--     PARTITION BY ab.artist_id, ab.language
--     ORDER BY ab.updated_at DESC NULLS LAST,
--              LENGTH(COALESCE(ab.bio_text, '')) DESC,
--              ab.id DESC
--   ) AS rn, COUNT(*) OVER (PARTITION BY ab.artist_id, ab.language) AS dup_count
--   FROM public.artist_bios ab
-- )
-- SELECT id, artist_id, language, agency_id, updated_at, LEFT(bio_text, 120), rn, 'KEEP' AS action
-- FROM ranked WHERE dup_count > 1 AND rn = 1 ORDER BY artist_id, language;


-- =============================================================================
-- Bloc 2 — Fusion des doublons
-- Supprime les lignes en excès ; une seule ligne par (artist_id, language).
-- =============================================================================

WITH ranked AS (
  SELECT
    ab.id,
    ROW_NUMBER() OVER (
      PARTITION BY ab.artist_id, ab.language
      ORDER BY
        ab.updated_at DESC NULLS LAST,
        LENGTH(COALESCE(ab.bio_text, '')) DESC,
        ab.id DESC
    ) AS rn
  FROM public.artist_bios ab
)
DELETE FROM public.artist_bios AS target
USING ranked
WHERE target.id = ranked.id
  AND ranked.rn > 1;


-- =============================================================================
-- Bloc 3 — Suppression des éléments dépendant de agency_id
-- Ordre strict. Inclut idx_unique_artist_common_bio car son prédicat
-- WHERE agency_id IS NULL doit disparaître AVANT DROP COLUMN (Bloc 4).
-- =============================================================================

DROP INDEX IF EXISTS public.idx_unique_artist_agency_bio;

DROP INDEX IF EXISTS public.idx_artist_bios_agency;

ALTER TABLE public.artist_bios
  DROP CONSTRAINT IF EXISTS artist_bios_agency_id_fkey;

-- Index partiel legacy — référence agency_id dans le prédicat
DROP INDEX IF EXISTS public.idx_unique_artist_common_bio;


-- =============================================================================
-- Bloc 4 — Suppression de la colonne agency_id
-- =============================================================================

ALTER TABLE public.artist_bios
  DROP COLUMN IF EXISTS agency_id;


-- =============================================================================
-- Bloc 5 — Contrainte UNIQUE propre (artist_id, language)
-- Remplace idx_unique_artist_common_bio (partiel, supprimé au Bloc 3).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_artist_bio
  ON public.artist_bios (artist_id, language);


-- =============================================================================
-- Bloc 6 — Vérification post-migration (SELECT uniquement)
-- =============================================================================

-- 6.1 — agency_id ne doit plus exister
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'artist_bios'
ORDER BY ordinal_position;

-- 6.2 — contrainte / index UNIQUE (artist_id, language) en place
SELECT
  i.relname AS index_name,
  ix.indisunique AS is_unique,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_index ix ON ix.indrelid = t.oid
JOIN pg_class i ON i.oid = ix.indexrelid
WHERE n.nspname = 'public'
  AND t.relname = 'artist_bios'
  AND ix.indisunique = true
ORDER BY i.relname;

-- 6.3 — aucun doublon (artist_id, language)
SELECT
  artist_id,
  language,
  COUNT(*) AS row_count
FROM public.artist_bios
GROUP BY artist_id, language
HAVING COUNT(*) > 1
ORDER BY row_count DESC;
