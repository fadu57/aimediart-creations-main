-- Colonnes adresse postale sur profiles (complément fiche utilisateur / géographie).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS adresse_postale text,
  ADD COLUMN IF NOT EXISTS compl_adresse text,
  ADD COLUMN IF NOT EXISTS country text;

COMMENT ON COLUMN public.profiles.adresse_postale IS 'Voie et numéro (ligne 1).';
COMMENT ON COLUMN public.profiles.compl_adresse IS 'Complément d''adresse (ligne 2).';
COMMENT ON COLUMN public.profiles.country IS 'Libellé pays (ex. France), aligné sur COUNTRY_OPTIONS.';
