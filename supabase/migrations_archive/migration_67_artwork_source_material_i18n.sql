-- Migration : matériau source multilingue par œuvre (analyse IA par langue UI)
-- Structure : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}

ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS artwork_source_material_i18n jsonb;

COMMENT ON COLUMN public.artworks.artwork_source_material_i18n IS
  'Matériau source multilingue (fiche IA). Structure : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}. '
  'Repli legacy : artwork_source_material (texte unique, souvent FR).';

-- Backfill : texte legacy → clé "fr" si i18n vide
UPDATE public.artworks
SET artwork_source_material_i18n = jsonb_build_object('fr', TRIM(artwork_source_material))
WHERE artwork_source_material IS NOT NULL
  AND TRIM(artwork_source_material) <> ''
  AND (
    artwork_source_material_i18n IS NULL
    OR artwork_source_material_i18n = '{}'::jsonb
  );
