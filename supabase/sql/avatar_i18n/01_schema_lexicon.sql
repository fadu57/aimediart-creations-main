-- ============================================================================
-- Phase 1 — Schéma lexique i18n avatars (non destructif)
-- Ne modifie pas image_path, id, ni les colonnes legacy de public.avatars.
-- À exécuter dans Supabase SQL Editor ou via migration versionnée.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Noms canoniques (source FR, ~50 lignes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avatar_noun_lexicon (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  noun_fr text NOT NULL,
  noun_fr_normalized text GENERATED ALWAYS AS (lower(trim(noun_fr))) STORED,
  gender_fr text NOT NULL DEFAULT 'M',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avatar_noun_lexicon_gender_fr_check
    CHECK (gender_fr IN ('M', 'F')),
  CONSTRAINT avatar_noun_lexicon_noun_fr_unique UNIQUE (noun_fr_normalized)
);

-- ---------------------------------------------------------------------------
-- Traductions + genre grammatical par langue (FR incluse pour cohérence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avatar_noun_translation (
  noun_id bigint NOT NULL REFERENCES public.avatar_noun_lexicon (id) ON DELETE CASCADE,
  lang text NOT NULL,
  noun_local text NOT NULL,
  gender text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avatar_noun_translation_lang_check
    CHECK (lang IN ('fr', 'en', 'de', 'es', 'it')),
  CONSTRAINT avatar_noun_translation_gender_check
    CHECK (gender IN ('M', 'F', 'N')),
  CONSTRAINT avatar_noun_translation_pkey PRIMARY KEY (noun_id, lang)
);

-- ---------------------------------------------------------------------------
-- Adjectifs (clé stable, indépendante de l’accord)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avatar_adjective_lexicon (
  adjective_key text PRIMARY KEY,
  adjective_en text NOT NULL,
  is_invariable boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Formes fléchies : (clé, langue, genre) → surface accordée
-- gender = 'X' : forme unique (invariable / épicène) pour toutes les langues cibles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avatar_adjective_form (
  adjective_key text NOT NULL REFERENCES public.avatar_adjective_lexicon (adjective_key) ON DELETE CASCADE,
  lang text NOT NULL,
  gender text NOT NULL,
  form text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avatar_adjective_form_lang_check
    CHECK (lang IN ('fr', 'en', 'de', 'es', 'it')),
  CONSTRAINT avatar_adjective_form_gender_check
    CHECK (gender IN ('M', 'F', 'N', 'X')),
  CONSTRAINT avatar_adjective_form_pkey PRIMARY KEY (adjective_key, lang, gender)
);

CREATE INDEX IF NOT EXISTS idx_avatar_noun_translation_lang
  ON public.avatar_noun_translation (lang);

CREATE INDEX IF NOT EXISTS idx_avatar_adjective_form_lookup
  ON public.avatar_adjective_form (adjective_key, lang);

-- Colonnes de liaison sur avatars (si pas déjà présentes)
ALTER TABLE public.avatars
  ADD COLUMN IF NOT EXISTS noun_id bigint NULL REFERENCES public.avatar_noun_lexicon (id),
  ADD COLUMN IF NOT EXISTS adjective_key text NULL REFERENCES public.avatar_adjective_lexicon (adjective_key);

CREATE INDEX IF NOT EXISTS idx_avatars_noun_id ON public.avatars (noun_id);
CREATE INDEX IF NOT EXISTS idx_avatars_adjective_key ON public.avatars (adjective_key);

-- Immutabilité fichier : adjective_en + noun_en restent la clé Storage (ne pas les supprimer)
COMMENT ON COLUMN public.avatars.adjective_en IS 'Token anglais figé pour image_path / Storage — ne pas renommer après génération.';
COMMENT ON COLUMN public.avatars.noun_en IS 'Token anglais figé pour image_path / Storage — ne pas renommer après génération.';
COMMENT ON COLUMN public.avatars.noun_id IS 'FK vers nom canonique FR (avatar_noun_lexicon).';
COMMENT ON COLUMN public.avatars.adjective_key IS 'Clé stable adjectif (avatar_adjective_lexicon).';

-- Colonnes grain-incorrect à déprécier (une ligne = une combinaison, pas une langue)
COMMENT ON COLUMN public.avatars.lang IS 'DEPRECATED: grain incorrect sur avatars — utiliser avatar_noun_translation.';
COMMENT ON COLUMN public.avatars.noun_local IS 'DEPRECATED: voir avatar_noun_translation.';
COMMENT ON COLUMN public.avatars.gender_local IS 'DEPRECATED: voir avatar_noun_translation.';
COMMENT ON COLUMN public.avatars.adjective_local IS 'DEPRECATED: voir avatar_adjective_form.';

COMMIT;
