-- ============================================================================
-- Phase 3 — Backfill lexique depuis public.avatars (idempotent, prudent)
-- N’écrase pas les entrées lexique déjà validées manuellement.
-- ============================================================================

BEGIN;

-- 1) Noms FR canoniques (~50)
INSERT INTO public.avatar_noun_lexicon (noun_fr, gender_fr)
SELECT DISTINCT trim(a.noun_fr), coalesce(nullif(upper(trim(a."genre_FR")), ''), 'M')
FROM public.avatars a
WHERE a.noun_fr IS NOT NULL
  AND trim(a.noun_fr) <> ''
ON CONFLICT (noun_fr_normalized) DO NOTHING;

-- 2) Traduction FR depuis la table avatars (reprise des valeurs existantes)
INSERT INTO public.avatar_noun_translation (noun_id, lang, noun_local, gender)
SELECT
  n.id,
  'fr',
  coalesce(nullif(trim(a.noun_fr), ''), n.noun_fr),
  CASE
    WHEN upper(trim(coalesce(a."genre_FR", ''))) = 'F' THEN 'F'
    ELSE 'M'
  END
FROM public.avatar_noun_lexicon n
JOIN public.avatars a ON lower(trim(a.noun_fr)) = n.noun_fr_normalized
ON CONFLICT (noun_id, lang) DO NOTHING;

-- 3) Traduction EN (reprise noun_en + genre FR par défaut si pas de genre EN)
INSERT INTO public.avatar_noun_translation (noun_id, lang, noun_local, gender)
SELECT DISTINCT ON (n.id)
  n.id,
  'en',
  trim(a.noun_en),
  CASE WHEN upper(trim(coalesce(a."genre_FR", ''))) = 'F' THEN 'F' ELSE 'M' END
FROM public.avatar_noun_lexicon n
JOIN public.avatars a ON lower(trim(a.noun_fr)) = n.noun_fr_normalized
WHERE a.noun_en IS NOT NULL
  AND trim(a.noun_en) <> ''
ON CONFLICT (noun_id, lang) DO NOTHING;

-- Répéter DE / ES / IT quand colonnes legacy remplies (exemple DE)
INSERT INTO public.avatar_noun_translation (noun_id, lang, noun_local, gender)
SELECT DISTINCT ON (n.id)
  n.id,
  'de',
  trim(a.noun_de),
  CASE WHEN upper(trim(coalesce(a."genre_FR", ''))) = 'F' THEN 'F' ELSE 'M' END
FROM public.avatar_noun_lexicon n
JOIN public.avatars a ON lower(trim(a.noun_fr)) = n.noun_fr_normalized
WHERE a.noun_de IS NOT NULL
  AND trim(a.noun_de) <> ''
ON CONFLICT (noun_id, lang) DO UPDATE
SET noun_local = EXCLUDED.noun_local;

-- ES / IT : même pattern (décommenter ou dupliquer selon besoin)

-- 4) Adjectifs — clé = token anglais normalisé
INSERT INTO public.avatar_adjective_lexicon (adjective_key, adjective_en, is_invariable)
SELECT DISTINCT
  public.normalize_avatar_token(a.adjective_en),
  trim(a.adjective_en),
  false
FROM public.avatars a
WHERE a.adjective_en IS NOT NULL
  AND trim(a.adjective_en) <> ''
ON CONFLICT (adjective_key) DO NOTHING;

-- 5) Formes FR/EN initiales depuis legacy (à relire manuellement ensuite)
INSERT INTO public.avatar_adjective_form (adjective_key, lang, gender, form)
SELECT DISTINCT
  public.normalize_avatar_token(a.adjective_en),
  'fr',
  CASE WHEN upper(trim(coalesce(a."genre_FR", ''))) = 'F' THEN 'F' ELSE 'M' END,
  trim(a.adjective_fr)
FROM public.avatars a
WHERE a.adjective_fr IS NOT NULL
  AND trim(a.adjective_fr) <> ''
ON CONFLICT (adjective_key, lang, gender) DO NOTHING;

INSERT INTO public.avatar_adjective_form (adjective_key, lang, gender, form)
SELECT DISTINCT
  public.normalize_avatar_token(a.adjective_en),
  'en',
  'X',
  trim(a.adjective_en)
FROM public.avatars a
WHERE a.adjective_en IS NOT NULL
ON CONFLICT (adjective_key, lang, gender) DO NOTHING;

-- 6) Lier les combinaisons
UPDATE public.avatars a
SET noun_id = n.id
FROM public.avatar_noun_lexicon n
WHERE a.noun_id IS NULL
  AND a.noun_fr IS NOT NULL
  AND n.noun_fr_normalized = lower(trim(a.noun_fr));

UPDATE public.avatars a
SET adjective_key = public.normalize_avatar_token(a.adjective_en)
WHERE a.adjective_key IS NULL
  AND a.adjective_en IS NOT NULL;

COMMIT;
