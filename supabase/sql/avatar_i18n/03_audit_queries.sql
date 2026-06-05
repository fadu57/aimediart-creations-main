-- ============================================================================
-- Audits — à exécuter avant / après backfill
-- ============================================================================

-- A) Combinaisons sans lien lexique
SELECT COUNT(*) AS avatars_sans_noun_id
FROM public.avatars
WHERE noun_id IS NULL;

SELECT COUNT(*) AS avatars_sans_adjective_key
FROM public.avatars
WHERE adjective_key IS NULL;

-- B) noun_fr distincts non présents dans le lexique
SELECT DISTINCT trim(a.noun_fr) AS noun_fr_manquant
FROM public.avatars a
WHERE a.noun_fr IS NOT NULL
  AND trim(a.noun_fr) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.avatar_noun_lexicon n
    WHERE n.noun_fr_normalized = lower(trim(a.noun_fr))
  )
ORDER BY 1;

-- C) Traductions manquantes par langue
SELECT n.id, n.noun_fr, lang.code AS langue_manquante
FROM public.avatar_noun_lexicon n
CROSS JOIN (VALUES ('fr'), ('en'), ('de'), ('es'), ('it')) AS lang(code)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.avatar_noun_translation nt
  WHERE nt.noun_id = n.id
    AND nt.lang = lang.code
)
ORDER BY n.noun_fr, lang.code;

-- D) Adjectifs distincts non enregistrés dans le lexique
SELECT DISTINCT public.normalize_avatar_token(a.adjective_en) AS adjective_key_manquant
FROM public.avatars a
WHERE a.adjective_en IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.avatar_adjective_lexicon adj
    WHERE adj.adjective_key = public.normalize_avatar_token(a.adjective_en)
  )
ORDER BY 1;

-- E) Formes adjectivales impossibles à résoudre (par langue)
SELECT
  a.id,
  a.adjective_key,
  a.noun_id,
  lang.code AS lang,
  nt.gender,
  public.resolve_adjective_form(a.adjective_key, lang.code, nt.gender) AS adj_form,
  nt.noun_local
FROM public.avatars a
JOIN public.avatar_noun_translation nt ON nt.noun_id = a.noun_id
CROSS JOIN (VALUES ('fr'), ('en'), ('de'), ('es'), ('it')) AS lang(code)
WHERE nt.lang = lang.code
  AND a.adjective_key IS NOT NULL
  AND a.noun_id IS NOT NULL
  AND public.resolve_adjective_form(a.adjective_key, lang.code, nt.gender) IS NULL
LIMIT 200;

-- F) Incohérence legacy vs reconstruit (échantillon FR)
SELECT
  a.id,
  a.full_pseudo_fr AS legacy,
  public.build_avatar_full_pseudo(a.adjective_key, a.noun_id, 'fr') AS rebuilt,
  a.image_path
FROM public.avatars a
WHERE a.noun_id IS NOT NULL
  AND a.adjective_key IS NOT NULL
  AND a.full_pseudo_fr IS DISTINCT FROM public.build_avatar_full_pseudo(a.adjective_key, a.noun_id, 'fr')
LIMIT 100;

-- G) Fichiers Storage orphelins / combinaisons sans image (vue métier)
-- (à adapter selon votre convention image_path)
