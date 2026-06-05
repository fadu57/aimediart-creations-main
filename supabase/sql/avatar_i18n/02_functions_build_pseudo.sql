-- ============================================================================
-- Phase 2 — Fonctions de résolution + reconstruction des full_pseudo_*
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_avatar_token(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
SELECT lower(regexp_replace(trim(coalesce(input, '')), '\s+', '_', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.resolve_adjective_form(
  p_adjective_key text,
  p_lang text,
  p_gender text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_form text;
  v_gender text := upper(trim(coalesce(p_gender, '')));
BEGIN
  IF p_adjective_key IS NULL OR trim(p_adjective_key) = '' THEN
    RETURN NULL;
  END IF;

  SELECT af.form
    INTO v_form
  FROM public.avatar_adjective_form af
  WHERE af.adjective_key = p_adjective_key
    AND af.lang = p_lang
    AND af.gender = 'X'
  LIMIT 1;

  IF v_form IS NOT NULL THEN
    RETURN v_form;
  END IF;

  IF v_gender NOT IN ('M', 'F', 'N') THEN
    v_gender := 'M';
  END IF;

  SELECT af.form
    INTO v_form
  FROM public.avatar_adjective_form af
  WHERE af.adjective_key = p_adjective_key
    AND af.lang = p_lang
    AND af.gender = v_gender
  LIMIT 1;

  RETURN v_form;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_avatar_full_pseudo(
  p_adjective_key text,
  p_noun_id bigint,
  p_lang text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_adj text;
  v_noun text;
  v_gender text;
BEGIN
  IF p_noun_id IS NULL OR p_adjective_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nt.noun_local, nt.gender
    INTO v_noun, v_gender
  FROM public.avatar_noun_translation nt
  WHERE nt.noun_id = p_noun_id
    AND nt.lang = p_lang;

  IF v_noun IS NULL THEN
    RETURN NULL;
  END IF;

  v_adj := public.resolve_adjective_form(p_adjective_key, p_lang, v_gender);
  IF v_adj IS NULL OR trim(v_adj) = '' THEN
    RETURN NULL;
  END IF;

  -- FR/EN/ES/IT : Adjectif + Nom (ajuster si vous préférez EN "Adjective Noun" only in EN)
  IF p_lang = 'en' THEN
    RETURN trim(v_adj) || trim(v_noun);
  END IF;

  RETURN trim(v_adj) || trim(v_noun);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_avatar_pseudo_columns(p_avatar_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT a.id, a.adjective_key, a.noun_id
    INTO r
  FROM public.avatars a
  WHERE a.id = p_avatar_id;

  IF NOT FOUND OR r.adjective_key IS NULL OR r.noun_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.avatars a
  SET
    full_pseudo_fr = public.build_avatar_full_pseudo(r.adjective_key, r.noun_id, 'fr'),
    full_pseudo_en = public.build_avatar_full_pseudo(r.adjective_key, r.noun_id, 'en'),
    full_pseudo_de = public.build_avatar_full_pseudo(r.adjective_key, r.noun_id, 'de'),
    full_pseudo_es = public.build_avatar_full_pseudo(r.adjective_key, r.noun_id, 'es'),
    full_pseudo_it = public.build_avatar_full_pseudo(r.adjective_key, r.noun_id, 'it'),
    updated_at = now()
  WHERE a.id = p_avatar_id;
END;
$$;

COMMIT;
