-- Flag métier : associé(e) de l'entreprise (dépenses société en formation / CCA).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_company_associate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_company_associate IS
  'True si la personne est associé(e) de l''entreprise (ex. avances de frais avant immatriculation).';

CREATE INDEX IF NOT EXISTS profiles_is_company_associate_idx
  ON public.profiles (id)
  WHERE is_company_associate = true;
