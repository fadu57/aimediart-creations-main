-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- migration_62_artist_death_date.sql
-- Date de décès (renseignée lorsque artist_vivant = false).

BEGIN;

ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS artist_death_date date NULL;

COMMENT ON COLUMN public.artists.artist_death_date IS
  'Date de décès de l''artiste (null si vivant ou date inconnue).';

COMMIT;
