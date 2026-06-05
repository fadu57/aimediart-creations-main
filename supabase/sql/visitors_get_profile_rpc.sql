-- ============================================================================
-- Visiteurs anonymes — reconnaissance visiteur de retour (profil pseudo + avatar)
--
-- Prérequis :
--   - visitors_anonymous_fingerprint_and_pseudo.sql
--   - visitors_avatar_url_and_confirm_rpc.sql (colonnes avatar_url / avatar_object_path)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_anonymous_visitor_profile(
  p_visitor_client_id text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.visitors%ROWTYPE;
  cid text := nullif(trim(p_visitor_client_id), '');
  fp text := nullif(trim(p_fingerprint), '');
BEGIN
  -- Reconnaissance : uniquement fingerprint FingerprintJS (p_fingerprint), puis UUID navigateur.
  -- user_agent / browser_name / device_type ne participent pas à cette recherche.
  IF fp IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.fingerprint = fp
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL AND cid IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.visitor_client_id = cid
    LIMIT 1;
  END IF;

  IF v_row.id IS NOT NULL AND cid IS NOT NULL
     AND nullif(trim(v_row.visitor_client_id), '') IS DISTINCT FROM cid THEN
    UPDATE public.visitors v
    SET visitor_client_id = cid, last_seen_at = now()
    WHERE v.id = v_row.id;
    v_row.visitor_client_id := cid;
  END IF;

  IF v_row.id IS NULL OR nullif(trim(v_row.visitor_pseudo), '') IS NULL THEN
    RETURN jsonb_build_object('is_returning', false);
  END IF;

  RETURN jsonb_build_object(
    'is_returning', true,
    'visitor_pseudo', v_row.visitor_pseudo,
    'avatar_url', v_row.avatar_url,
    'avatar_object_path', v_row.avatar_object_path,
    'selfie_url', v_row.selfie_url,
    'selfie_object_path', v_row.selfie_object_path
  );
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
      AND p.proname = 'get_anonymous_visitor_profile'
      AND p.pronargs = 2
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$$;
