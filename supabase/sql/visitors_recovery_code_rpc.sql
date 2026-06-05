-- ============================================================================
-- Visiteurs anonymes — code de liaison explicite (cross-navigateur / appareil)
--
-- Prérequis :
--   - visitors_anonymous_fingerprint_and_pseudo.sql
--   - visitors_avatar_url_and_confirm_rpc.sql
--   - visitors_get_profile_rpc.sql
--
-- Le visiteur reçoit un code à 8 caractères (affiché une fois ou régénéré).
-- Sur un autre navigateur, il saisit ce code pour rattacher son profil.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS recovery_code_hash text,
  ADD COLUMN IF NOT EXISTS recovery_code_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

COMMENT ON COLUMN public.visitors.recovery_code_hash IS 'SHA-256 hex du code de liaison normalisé (8 caractères). Non réversible.';
COMMENT ON COLUMN public.visitors.recovery_code_created_at IS 'Date de création ou dernière régénération du code de liaison.';
COMMENT ON COLUMN public.visitors.auth_user_id IS 'Compte auth.users (role visiteur) lié explicitement à ce profil anonyme.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_recovery_code_hash
  ON public.visitors (recovery_code_hash)
  WHERE recovery_code_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitors_auth_user_id
  ON public.visitors (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_visitor_recovery_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(trim(p_code), ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.hash_visitor_recovery_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(public.normalize_visitor_recovery_code(p_code), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._random_visitor_recovery_plain()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  plain text := '';
  i int;
  b bytea;
BEGIN
  b := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    plain := plain || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  END LOOP;
  RETURN plain;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_visitor_recovery_code(
  p_visitor_client_id text,
  p_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid text := nullif(trim(p_visitor_client_id), '');
  v_row public.visitors%ROWTYPE;
  plain text;
  code_hash text;
BEGIN
  IF cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_client_id');
  END IF;

  SELECT v.* INTO v_row
  FROM public.visitors v
  WHERE v.visitor_client_id = cid
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'visitor_not_found');
  END IF;

  IF nullif(trim(v_row.visitor_pseudo), '') IS NULL OR nullif(trim(v_row.avatar_url), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_incomplete');
  END IF;

  IF v_row.recovery_code_hash IS NOT NULL AND NOT coalesce(p_regenerate, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_set');
  END IF;

  plain := public._random_visitor_recovery_plain();
  code_hash := public.hash_visitor_recovery_code(plain);

  UPDATE public.visitors v
  SET
    recovery_code_hash = code_hash,
    recovery_code_created_at = now(),
    last_seen_at = now()
  WHERE v.id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'recovery_code', plain,
    'recovery_code_display', substr(plain, 1, 4) || '-' || substr(plain, 5, 4)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_visitor_profile_by_recovery_code(
  p_recovery_code text,
  p_visitor_client_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid text := nullif(trim(p_visitor_client_id), '');
  norm text := public.normalize_visitor_recovery_code(p_recovery_code);
  code_hash text;
  v_row public.visitors%ROWTYPE;
BEGIN
  IF cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_client_id');
  END IF;

  IF length(norm) <> 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;

  code_hash := public.hash_visitor_recovery_code(norm);

  SELECT v.* INTO v_row
  FROM public.visitors v
  WHERE v.recovery_code_hash = code_hash
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF nullif(trim(v_row.visitor_pseudo), '') IS NULL OR nullif(trim(v_row.avatar_url), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_incomplete');
  END IF;

  UPDATE public.visitors v
  SET
    visitor_client_id = cid,
    last_seen_at = now()
  WHERE v.id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'is_returning', true,
    'visitor_pseudo', v_row.visitor_pseudo,
    'avatar_url', v_row.avatar_url,
    'avatar_object_path', v_row.avatar_object_path,
    'selfie_url', v_row.selfie_url,
    'selfie_object_path', v_row.selfie_object_path
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_visitor_to_auth_user(
  p_visitor_client_id text,
  p_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid text := nullif(trim(p_visitor_client_id), '');
  updated int;
BEGIN
  IF cid IS NULL OR p_auth_user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.visitors v
  SET auth_user_id = p_auth_user_id, last_seen_at = now()
  WHERE v.visitor_client_id = cid;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
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
      AND p.proname IN (
        'generate_visitor_recovery_code',
        'link_visitor_profile_by_recovery_code',
        'link_visitor_to_auth_user'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$$;
