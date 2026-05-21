-- RPC : détails sensibles pour la fiche utilisateur (email auth.users + photo + naissance)
-- Exécuter dans Supabase SQL Editor (prod + dev).
-- Le client ne peut pas lire auth.users directement : cette fonction SECURITY DEFINER le fait
-- uniquement pour l'utilisateur lui-même, un admin global (role_id 1-3) ou un admin d'organisation (role 4).

CREATE OR REPLACE FUNCTION public.get_user_edit_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_email text;
  v_meta jsonb;
  v_avatar text;
  v_birth_year integer;
  v_birth_month text;
  v_first_name text;
  v_last_name text;
  v_username text;
  v_phone text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant utilisateur requis';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF v_caller <> p_user_id
     AND COALESCE(v_caller_app_role, 0) NOT BETWEEN 1 AND 3
     AND NOT EXISTS (
       SELECT 1
       FROM public.agency_users caller_au
       INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
       WHERE caller_au.user_id = v_caller
         AND target_au.user_id = p_user_id
         AND caller_au.role_id = 4
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  INTO v_email, v_meta
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  SELECT p.avatar_url, p.birth_year, p.first_name, p.last_name, p.username, p.phone
  INTO v_avatar, v_birth_year, v_first_name, v_last_name, v_username, v_phone
  FROM public.profiles p
  WHERE p.id = p_user_id;

  v_birth_month := NULLIF(trim(v_meta->>'birth_month'), '');

  RETURN jsonb_build_object(
    'email', v_email,
    'first_name', NULLIF(trim(v_first_name), ''),
    'last_name', NULLIF(trim(v_last_name), ''),
    'username', NULLIF(trim(v_username), ''),
    'phone', NULLIF(trim(v_phone), ''),
    'avatar_url', COALESCE(
      NULLIF(trim(v_avatar), ''),
      NULLIF(trim(v_meta->>'avatar_url'), ''),
      NULLIF(trim(v_meta->>'user_photo_url'), ''),
      NULLIF(trim(v_meta->>'picture'), ''),
      NULLIF(trim(v_meta->>'photo_url'), '')
    ),
    'birth_year', v_birth_year,
    'birth_month', v_birth_month
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_edit_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_edit_details(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_edit_details(uuid) IS
  'Email (auth.users) + avatar/naissance pour édition fiche utilisateur. Accès : soi-même, admin global 1-3, admin org 4 (même agence).';
