-- migration_10_artworks_artist_fk.sql
-- Objectif: rétablir la relation explicite artworks -> artists pour PostgREST

BEGIN;

-- 1) Ajouter la colonne si absente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'artworks'
      AND column_name = 'artwork_artist_id'
  ) THEN
    ALTER TABLE public.artworks
      ADD COLUMN artwork_artist_id uuid;
  END IF;
END $$;

-- 2) Ajouter la contrainte FK si absente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'artworks_artwork_artist_id_fkey'
      AND conrelid = 'public.artworks'::regclass
  ) THEN
    ALTER TABLE public.artworks
      ADD CONSTRAINT artworks_artwork_artist_id_fkey
      FOREIGN KEY (artwork_artist_id)
      REFERENCES public.artists(artist_id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Index conseillé pour les jointures
CREATE INDEX IF NOT EXISTS artworks_artwork_artist_id_idx
  ON public.artworks(artwork_artist_id);

COMMIT;

