-- ============================================================================
-- PARTIE 2 / 2 — RPC pseudo visiteur (table `pseudo_pool`)
--
-- Prérequis : avoir exécuté `visitors_anonymous_fingerprint_and_pseudo.sql` (partie 1).
--
-- Table `public.pseudo_pool` attendue :
--   - Colonne texte `type` : 'noun' | 'adjective'
--   - Colonne `label_fr` (obligatoire pour le fallback)
--   - Colonnes optionnelles : label_en, label_de, label_es, label_it
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pseudo_pool'
  ) THEN
    RAISE EXCEPTION
      'Table public.pseudo_pool absente. Créez-la (ou importez les données) avant ce script.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pseudo_pool' AND column_name = 'type'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pseudo_pool' AND column_name = 'label_fr'
  ) THEN
    RAISE EXCEPTION
      'pseudo_pool doit contenir les colonnes « type » et « label_fr » (voir en-tête du fichier).';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.pseudo_pool ADD COLUMN IF NOT EXISTS label_en text';
  EXECUTE 'ALTER TABLE public.pseudo_pool ADD COLUMN IF NOT EXISTS label_de text';
  EXECUTE 'ALTER TABLE public.pseudo_pool ADD COLUMN IF NOT EXISTS label_es text';
  EXECUTE 'ALTER TABLE public.pseudo_pool ADD COLUMN IF NOT EXISTS label_it text';
END
$$;

CREATE OR REPLACE FUNCTION public._pseudo_pool_pick_label(fr text, en text, de text, es text, it text, locale text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT NULLIF(trim(
  CASE lower(left(coalesce(locale, 'fr'), 2))
    WHEN 'fr' THEN coalesce(NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(de), ''), NULLIF(trim(es), ''), NULLIF(trim(it), ''))
    WHEN 'en' THEN coalesce(NULLIF(trim(en), ''), NULLIF(trim(fr), ''), NULLIF(trim(de), ''), NULLIF(trim(es), ''), NULLIF(trim(it), ''))
    WHEN 'de' THEN coalesce(NULLIF(trim(de), ''), NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(es), ''), NULLIF(trim(it), ''))
    WHEN 'es' THEN coalesce(NULLIF(trim(es), ''), NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(de), ''), NULLIF(trim(it), ''))
    WHEN 'it' THEN coalesce(NULLIF(trim(it), ''), NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(de), ''), NULLIF(trim(es), ''))
    ELSE coalesce(NULLIF(trim(fr), ''), NULLIF(trim(en), ''), '')
  END
), '');
$$;

CREATE OR REPLACE FUNCTION public.generate_visitor_pseudo(locale text DEFAULT 'fr')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  noun text;
  adj text;
  suffix text;
  loc text := left(coalesce(nullif(trim(locale), ''), 'fr'), 10);
BEGIN
  SELECT public._pseudo_pool_pick_label(pp.label_fr, pp.label_en, pp.label_de, pp.label_es, pp.label_it, loc)
    INTO noun
  FROM public.pseudo_pool pp
  WHERE lower(trim(pp.type::text)) = 'noun'
    AND (
      COALESCE(trim(pp.label_fr), '') <> ''
      OR NULLIF(trim(pp.label_en), '') IS NOT NULL
      OR NULLIF(trim(pp.label_de), '') IS NOT NULL
      OR NULLIF(trim(pp.label_es), '') IS NOT NULL
      OR NULLIF(trim(pp.label_it), '') IS NOT NULL
    )
  ORDER BY random()
  LIMIT 1;

  SELECT public._pseudo_pool_pick_label(pp.label_fr, pp.label_en, pp.label_de, pp.label_es, pp.label_it, loc)
    INTO adj
  FROM public.pseudo_pool pp
  WHERE lower(trim(pp.type::text)) = 'adjective'
    AND (
      COALESCE(trim(pp.label_fr), '') <> ''
      OR NULLIF(trim(pp.label_en), '') IS NOT NULL
      OR NULLIF(trim(pp.label_de), '') IS NOT NULL
      OR NULLIF(trim(pp.label_es), '') IS NOT NULL
      OR NULLIF(trim(pp.label_it), '') IS NOT NULL
    )
  ORDER BY random()
  LIMIT 1;

  IF noun IS NULL OR adj IS NULL THEN
    RAISE EXCEPTION 'pseudo_pool incomplet : besoin d''au moins une ligne ''noun'' et une ligne ''adjective'' avec labels pour la locale %.', loc;
  END IF;

  suffix := LPAD((floor(random() * 1000))::bigint::text, 3, '0');
  RETURN initcap(noun) || initcap(adj) || suffix;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_pseudo_pool_pick_label' AND p.pronargs = 6
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_visitor_pseudo' AND p.pronargs = 1
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$$;
