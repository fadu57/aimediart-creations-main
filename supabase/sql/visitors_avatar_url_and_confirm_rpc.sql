-- ============================================================================
-- Visiteurs anonymes — avatar (URL + chemin Storage) + extension RPC pseudo
--
-- Prérequis : supabase/sql/visitors_anonymous_fingerprint_and_pseudo.sql
--
-- Couvre le clic « Continuer la visite » (VisitorWelcome) :
--   - visitor_pseudo     : ex. CanardTendre747
--   - avatar_url         : URL publique bucket avatars
--   - avatar_object_path : chemin Storage (ex. adorable_duck.png)
--   - fingerprints       : déjà gérés par register_anonymous_visitor
-- ============================================================================

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS visitor_pseudo text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_object_path text,
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS selfie_object_path text;

COMMENT ON COLUMN public.visitors.visitor_pseudo IS 'Pseudo affiché (pool avatars + 3 chiffres).';
COMMENT ON COLUMN public.visitors.avatar_url IS 'URL publique Supabase Storage (bucket avatars).';
COMMENT ON COLUMN public.visitors.avatar_object_path IS 'Chemin objet Storage relatif au bucket avatars.';
COMMENT ON COLUMN public.visitors.selfie_url IS 'URL publique selfie visiteur (bucket photos/visitors).';
COMMENT ON COLUMN public.visitors.selfie_object_path IS 'Chemin objet Storage relatif au selfie (ex. visitors/{uuid}.webp).';

CREATE INDEX IF NOT EXISTS idx_visitors_visitor_pseudo ON public.visitors USING btree (visitor_pseudo);

-- Remplace la version 2 args : pseudo + avatar optionnels.
CREATE OR REPLACE FUNCTION public.confirm_visitor_pseudo_from_client(
  p_visitor_client_id text,
  p_pseudo text,
  p_avatar_url text DEFAULT NULL,
  p_avatar_object_path text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL,
  p_selfie_object_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  ps text := nullif(trim(p_pseudo), '');
  cid text := nullif(trim(p_visitor_client_id), '');
  av_url text := nullif(trim(p_avatar_url), '');
  av_path text := nullif(trim(p_avatar_object_path), '');
  sf_url text := nullif(trim(p_selfie_url), '');
  sf_path text := nullif(trim(p_selfie_object_path), '');
BEGIN
  IF cid IS NULL OR ps IS NULL THEN
    RAISE EXCEPTION 'visitor_client_id et pseudo requis';
  END IF;

  IF length(ps) > 80 THEN
    RAISE EXCEPTION 'pseudo trop long (max 80)';
  END IF;

  UPDATE public.visitors v
  SET
    visitor_pseudo = substring(ps FROM 1 FOR 80),
    avatar_url = COALESCE(left(av_url, 2048), v.avatar_url),
    avatar_object_path = COALESCE(left(av_path, 512), v.avatar_object_path),
    selfie_url = COALESCE(left(sf_url, 2048), v.selfie_url),
    selfie_object_path = COALESCE(left(sf_path, 512), v.selfie_object_path),
    last_seen_at = now()
  WHERE v.visitor_client_id = cid
  RETURNING v.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'visiteur introuvable pour ce visitor_client_id';
  END IF;

  RETURN v_id;
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
    WHERE n.nspname = 'public'
      AND p.proname = 'confirm_visitor_pseudo_from_client'
      AND p.pronargs IN (2, 4, 6)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$$;
