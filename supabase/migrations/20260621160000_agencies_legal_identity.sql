-- Identité juridique des organisations (agencies)
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.agency_structure_category AS ENUM (
    'private_lucratif',
    'private_non_lucratif',
    'public_parapublic'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.agency_structure_type AS ENUM (
    'societe_commerciale',
    'entreprise_individuelle',
    'societe_civile',
    'profession_liberale',
    'association',
    'fondation',
    'fonds_dotation',
    'administration_etat',
    'collectivite_territoriale',
    'etablissement_public'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.agency_legal_rep_role AS ENUM (
    'gerant',
    'president',
    'president_dg',
    'president_ca',
    'directeur_general',
    'maire',
    'president_conseil_departemental',
    'president_conseil_regional',
    'dgs',
    'directeur'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS structure_category public.agency_structure_category,
  ADD COLUMN IF NOT EXISTS structure_type public.agency_structure_type,
  ADD COLUMN IF NOT EXISTS siret char(14),
  ADD COLUMN IF NOT EXISTS legal_rep_firstname text,
  ADD COLUMN IF NOT EXISTS legal_rep_lastname text,
  ADD COLUMN IF NOT EXISTS legal_rep_role public.agency_legal_rep_role;

ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_structure_type_category_chk;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_structure_type_category_chk
  CHECK (
    structure_category IS NULL
    OR structure_type IS NULL
    OR (
      structure_category = 'private_lucratif'::public.agency_structure_category
      AND structure_type IN (
        'societe_commerciale'::public.agency_structure_type,
        'entreprise_individuelle'::public.agency_structure_type,
        'societe_civile'::public.agency_structure_type,
        'profession_liberale'::public.agency_structure_type
      )
    )
    OR (
      structure_category = 'private_non_lucratif'::public.agency_structure_category
      AND structure_type IN (
        'association'::public.agency_structure_type,
        'fondation'::public.agency_structure_type,
        'fonds_dotation'::public.agency_structure_type
      )
    )
    OR (
      structure_category = 'public_parapublic'::public.agency_structure_category
      AND structure_type IN (
        'administration_etat'::public.agency_structure_type,
        'collectivite_territoriale'::public.agency_structure_type,
        'etablissement_public'::public.agency_structure_type
      )
    )
  );

ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_siret_format_chk;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_siret_format_chk
  CHECK (siret IS NULL OR siret ~ '^\d{14}$');

CREATE OR REPLACE FUNCTION public.agency_legal_rep_role_valid(
  p_structure_type public.agency_structure_type,
  p_role public.agency_legal_rep_role
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_structure_type IS NULL OR p_role IS NULL THEN true
    WHEN p_structure_type IN (
      'societe_commerciale'::public.agency_structure_type,
      'entreprise_individuelle'::public.agency_structure_type,
      'societe_civile'::public.agency_structure_type,
      'profession_liberale'::public.agency_structure_type
    ) THEN p_role IN (
      'gerant'::public.agency_legal_rep_role,
      'president'::public.agency_legal_rep_role,
      'president_dg'::public.agency_legal_rep_role,
      'president_ca'::public.agency_legal_rep_role,
      'directeur_general'::public.agency_legal_rep_role
    )
    WHEN p_structure_type = 'collectivite_territoriale'::public.agency_structure_type THEN p_role IN (
      'maire'::public.agency_legal_rep_role,
      'president_conseil_departemental'::public.agency_legal_rep_role,
      'president_conseil_regional'::public.agency_legal_rep_role,
      'dgs'::public.agency_legal_rep_role
    )
    WHEN p_structure_type IN (
      'association'::public.agency_structure_type,
      'fondation'::public.agency_structure_type,
      'fonds_dotation'::public.agency_structure_type,
      'administration_etat'::public.agency_structure_type,
      'etablissement_public'::public.agency_structure_type
    ) THEN p_role IN (
      'president'::public.agency_legal_rep_role,
      'directeur'::public.agency_legal_rep_role
    )
    ELSE false
  END;
$$;

ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_legal_rep_role_valid_chk;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_legal_rep_role_valid_chk
  CHECK (public.agency_legal_rep_role_valid(structure_type, legal_rep_role));

COMMENT ON COLUMN public.agencies.structure_category IS
  'Grande famille juridique : lucratif, non lucratif, public/parapublic.';
COMMENT ON COLUMN public.agencies.structure_type IS
  'Forme juridique détaillée (sous-type selon structure_category).';
COMMENT ON COLUMN public.agencies.siret IS
  'Numéro SIRET (14 chiffres, sans espaces). Affichage UI : XXX XXX XXX XXXXX.';
COMMENT ON COLUMN public.agencies.legal_rep_firstname IS
  'Prénom du responsable légal.';
COMMENT ON COLUMN public.agencies.legal_rep_lastname IS
  'Nom du responsable légal.';
COMMENT ON COLUMN public.agencies.legal_rep_role IS
  'Qualité du responsable légal (enum selon structure_type).';

COMMIT;
