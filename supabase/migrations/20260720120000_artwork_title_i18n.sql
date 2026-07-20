-- Titres d'œuvre multilingues (option traduction dans la fiche)
-- Structure : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}

ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS artwork_title_i18n jsonb;

ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS artwork_title_i18n_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.artworks.artwork_title_i18n IS
  'Titres multilingues. Structure : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}. '
  'Repli legacy : artwork_title.';

COMMENT ON COLUMN public.artworks.artwork_title_i18n_enabled IS
  'Si true, le titre est géré en i18n pour les langues de médiation sélectionnées.';

-- Backfill : titre legacy → clé fr si i18n vide
UPDATE public.artworks
SET artwork_title_i18n = jsonb_build_object('fr', TRIM(artwork_title))
WHERE artwork_title IS NOT NULL
  AND TRIM(artwork_title) <> ''
  AND (
    artwork_title_i18n IS NULL
    OR artwork_title_i18n = '{}'::jsonb
  );
