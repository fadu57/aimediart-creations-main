-- migration_09_artworks_fingerprint_jsonb.sql
-- Objectif:
-- 1) ajouter fingerprint unique et matière brute IA
-- 2) convertir artwork_description vers JSONB (8 styles de médiation)

BEGIN;

ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS artwork_fingerprint text,
  ADD COLUMN IF NOT EXISTS artwork_source_material text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'artworks'
      AND column_name = 'artwork_description'
      AND data_type <> 'jsonb'
  ) THEN
    ALTER TABLE public.artworks
      ALTER COLUMN artwork_description TYPE jsonb
      USING jsonb_build_object(
        'enfant', NULLIF(trim(COALESCE(artwork_description::text, '')), ''),
        'expert', NULL,
        'ado', NULL,
        'conteur', NULL,
        'rap', NULL,
        'poetique', NULL,
        'simple', NULL,
        'neutre', NULL
      );
  END IF;
END $$;

ALTER TABLE public.artworks
  ALTER COLUMN artwork_description SET DEFAULT jsonb_build_object(
    'enfant', NULL,
    'expert', NULL,
    'ado', NULL,
    'conteur', NULL,
    'rap', NULL,
    'poetique', NULL,
    'simple', NULL,
    'neutre', NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS artworks_artwork_fingerprint_uidx
  ON public.artworks (artwork_fingerprint)
  WHERE artwork_fingerprint IS NOT NULL;

COMMIT;

