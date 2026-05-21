-- RPC : corbeille utilisateur (profiles.deleted_at)
-- Accès : admin global 1-3, ou admin org 4 (même agence, cible rôle 4-6).
-- Exécuter dans Supabase SQL Editor (prod + dev).

CREATE OR REPLACE FUNCTION public.soft_delete_team_member(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_target_app_role int;
  v_updated boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant utilisateur requis';
  END IF;

  IF v_caller = p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous archiver vous-même';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_target_app_role
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF COALESCE(v_target_app_role, 0) BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Suppression non autorisée pour cet utilisateur';
  END IF;

  IF COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3 THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM public.agency_users caller_au
    INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
    WHERE caller_au.user_id = v_caller
      AND caller_au.role_id = 4
      AND target_au.user_id = p_user_id
      AND target_au.role_id BETWEEN 4 AND 6
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.profiles
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_user_id;

  IF FOUND THEN
    v_updated := true;
  ELSE
    INSERT INTO public.profiles (
      id,
      deleted_at,
      language,
      country_code,
      created_at,
      updated_at
    )
    VALUES (
      p_user_id,
      now(),
      'fr',
      'FR',
      now(),
      now()
    );
    v_updated := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', v_updated,
    'user_id', p_user_id,
    'deleted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_team_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_team_member(uuid) IS
  'Archive un membre équipe (profiles.deleted_at). Accès : admin global 1-3, admin org 4 (même agence, cible 4-6).';
