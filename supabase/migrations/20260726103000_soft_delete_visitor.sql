-- RPC : corbeille visiteur (profiles.deleted_at + visitors.deleted_at)
-- Accès : admin global 1-3, ou admin org 4 (même agence pour cible profil role 7 ;
--         anonymes : admin org 4 autorisé).
-- Exécuter dans Supabase SQL Editor (prod + dev) ou via migration.

CREATE OR REPLACE FUNCTION public.soft_delete_visitor(
  p_id uuid,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_source text := lower(trim(coalesce(p_source, '')));
  v_now timestamptz := now();
  v_linked int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant requis';
  END IF;

  IF v_source NOT IN ('profiles', 'visitors') THEN
    RAISE EXCEPTION 'Source invalide (profiles|visitors)';
  END IF;

  IF v_caller = p_id AND v_source = 'profiles' THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous archiver vous-même';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3 THEN
    NULL;
  ELSIF COALESCE(v_caller_app_role, 0) = 4 THEN
    IF v_source = 'profiles' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.agency_users caller_au
        INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
        WHERE caller_au.user_id = v_caller
          AND caller_au.role_id = 4
          AND target_au.user_id = p_id
          AND target_au.role_id = 7
      ) THEN
        RAISE EXCEPTION 'Accès refusé';
      END IF;
    END IF;
    -- source visitors (anonyme) : admin org 4 autorisé (liste backoffice 1-4)
  ELSIF EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = v_caller
      AND au.role_id = 4
  ) THEN
    -- app_metadata sans role_id global mais agency_users role 4
    IF v_source = 'profiles' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.agency_users caller_au
        INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
        WHERE caller_au.user_id = v_caller
          AND caller_au.role_id = 4
          AND target_au.user_id = p_id
          AND target_au.role_id = 7
      ) THEN
        RAISE EXCEPTION 'Accès refusé';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_source = 'profiles' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_id) THEN
      RAISE EXCEPTION 'Utilisateur introuvable';
    END IF;

    UPDATE public.profiles
    SET deleted_at = v_now, updated_at = v_now
    WHERE id = p_id;

    IF NOT FOUND THEN
      INSERT INTO public.profiles (
        id,
        deleted_at,
        language,
        country_code,
        created_at,
        updated_at
      )
      VALUES (
        p_id,
        v_now,
        'fr',
        'FR',
        v_now,
        v_now
      );
    END IF;

    UPDATE public.visitors
    SET deleted_at = v_now
    WHERE auth_user_id = p_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'id', p_id,
      'source', 'profiles',
      'linked_visitors', v_linked,
      'deleted_at', v_now
    );
  END IF;

  -- source = visitors
  UPDATE public.visitors
  SET deleted_at = v_now
  WHERE id = p_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.visitors v WHERE v.id = p_id AND v.deleted_at IS NOT NULL) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'id', p_id,
        'source', 'visitors',
        'deleted_at', v_now,
        'already_deleted', true
      );
    END IF;
    RAISE EXCEPTION 'Visiteur anonyme introuvable';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'source', 'visitors',
    'deleted_at', v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_visitor(
  p_id uuid,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_source text := lower(trim(coalesce(p_source, '')));
  v_linked int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant requis';
  END IF;

  IF v_source NOT IN ('profiles', 'visitors') THEN
    RAISE EXCEPTION 'Source invalide (profiles|visitors)';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  -- Restauration : admins globaux 1-3 uniquement (aligné canRestore < 4 côté UI)
  IF NOT (COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_source = 'profiles' THEN
    UPDATE public.profiles
    SET deleted_at = null, updated_at = now()
    WHERE id = p_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil introuvable';
    END IF;

    UPDATE public.visitors
    SET deleted_at = null
    WHERE auth_user_id = p_id
      AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'id', p_id,
      'source', 'profiles',
      'linked_visitors', v_linked
    );
  END IF;

  UPDATE public.visitors
  SET deleted_at = null
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visiteur anonyme introuvable';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'source', 'visitors'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_visitor(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_visitor(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_visitor(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_visitor(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_visitor(uuid, text) IS
  'Archive un visiteur (profiles et/ou visitors.deleted_at). Accès : admin global 1-3, admin org 4.';

COMMENT ON FUNCTION public.restore_visitor(uuid, text) IS
  'Restaure un visiteur archivé (+ sessions visitors liées si profil). Accès : admin global 1-3.';
