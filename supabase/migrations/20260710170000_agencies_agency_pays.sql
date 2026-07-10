-- Pays de l'organisation (même sémantique que artists.artist_pays)
BEGIN;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS agency_pays text;

COMMENT ON COLUMN public.agencies.agency_pays IS
  'Pays de l''organisation (libellé, ex. France, Belgique, Autres). Même format que artists.artist_pays.';

UPDATE public.agencies
SET agency_pays = 'France'
WHERE agency_pays IS NULL
  AND deleted_at IS NULL;

COMMIT;
