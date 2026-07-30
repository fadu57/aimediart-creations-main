-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- migration_17_soft_delete_artworks.sql
-- Soft delete pour `public.artworks` (archivage/restauration).

BEGIN;

ALTER TABLE public.artworks
ADD COLUMN IF NOT EXISTS artwork_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS artworks_deleted_at_idx
ON public.artworks (artwork_deleted_at);

COMMIT;

