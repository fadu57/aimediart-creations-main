-- migration_16_soft_delete_artists.sql
-- Soft delete pour `public.artists` (archivage/restauration).

BEGIN;

ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS artist_deleted_at timestamptz;

-- (Optionnel) Index pour accélérer la page "corbeille"
CREATE INDEX IF NOT EXISTS artists_deleted_at_idx
ON public.artists (artist_deleted_at);

COMMIT;

