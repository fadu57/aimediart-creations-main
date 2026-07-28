-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- migration_61_artist_vivant.sql
-- Statut de vie de l'artiste (true = vivant, false = décédé).

BEGIN;

ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS artist_vivant boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.artists.artist_vivant IS
  'Statut de vie : true = vivant(e), false = décédé(e).';

COMMIT;
