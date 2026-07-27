-- migration_61_artist_vivant.sql
-- Statut de vie de l'artiste (true = vivant, false = décédé).

BEGIN;

ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS artist_vivant boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.artists.artist_vivant IS
  'Statut de vie : true = vivant(e), false = décédé(e).';

COMMIT;
