-- RPC : corbeille visiteur (profiles.deleted_at + visitors.deleted_at)
-- Accès : admin global 1-3, ou admin org 4 (même agence pour cible profil role 7 ;
--         anonymes : admin org 4 autorisé).
-- Exécuter dans Supabase SQL Editor (prod + dev) ou via migration.
--
-- ⚠️ Ce script N’ARCHIVE PERSONNE : il installe seulement les fonctions.
--    Pour retirer un visiteur de la liste : icône corbeille dans /expos/visitors.
--
-- Vérification après exécution :
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('soft_delete_visitor','restore_visitor','list_backoffice_anonymous_visitors');
--   SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS actifs,
--          count(*) FILTER (WHERE deleted_at IS NOT NULL) AS archives
--   FROM public.visitors;

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
  v_fp text;
  v_dfp text;
  v_auth uuid;
  v_siblings int := 0;
  v_first text;
  v_last text;
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

    SELECT
      nullif(trim(p.first_name), ''),
      nullif(trim(p.last_name), '')
    INTO v_first, v_last
    FROM public.profiles p
    WHERE p.id = p_id;

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

    -- Autres comptes auth avec le même prénom+nom (doublons de test)
    IF v_first IS NOT NULL
       AND lower(v_first) NOT IN ('anonyme', 'anonymous') THEN
      UPDATE public.profiles p
      SET deleted_at = v_now, updated_at = v_now
      WHERE p.deleted_at IS NULL
        AND p.id <> p_id
        AND lower(trim(coalesce(p.first_name, ''))) = lower(v_first)
        AND lower(trim(coalesce(p.last_name, ''))) = lower(trim(coalesce(v_last, '')));
      GET DIAGNOSTICS v_siblings = ROW_COUNT;
    END IF;

    UPDATE public.visitors
    SET deleted_at = v_now
    WHERE deleted_at IS NULL
      AND (
        auth_user_id = p_id
        OR auth_user_id IN (
          SELECT p2.id FROM public.profiles p2
          WHERE p2.deleted_at IS NOT NULL
            AND p2.deleted_at = v_now
            AND (
              p2.id = p_id
              OR (
                v_first IS NOT NULL
                AND lower(trim(coalesce(p2.first_name, ''))) = lower(v_first)
                AND lower(trim(coalesce(p2.last_name, ''))) = lower(trim(coalesce(v_last, '')))
              )
            )
        )
      );
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'id', p_id,
      'source', 'profiles',
      'linked_visitors', v_linked,
      'sibling_profiles', v_siblings,
      'deleted_at', v_now
    );
  END IF;

  -- source = visitors
  SELECT v.fingerprint, v.device_fingerprint, v.auth_user_id
  INTO v_fp, v_dfp, v_auth
  FROM public.visitors v
  WHERE v.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visiteur anonyme introuvable';
  END IF;

  UPDATE public.visitors
  SET deleted_at = v_now
  WHERE id = p_id
    AND deleted_at IS NULL;

  -- Cascade : même empreinte / device / compte auth = même personne physique
  UPDATE public.visitors
  SET deleted_at = v_now
  WHERE deleted_at IS NULL
    AND id <> p_id
    AND (
      (v_auth IS NOT NULL AND auth_user_id = v_auth)
      OR (nullif(trim(v_fp), '') IS NOT NULL AND fingerprint = v_fp)
      OR (nullif(trim(v_dfp), '') IS NOT NULL AND device_fingerprint = v_dfp)
    );
  GET DIAGNOSTICS v_siblings = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'source', 'visitors',
    'deleted_at', v_now,
    'sibling_visitors', v_siblings
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

-- Liste backoffice des sessions anonymes actives (contourne visitors_deny_all).
DROP FUNCTION IF EXISTS public.list_backoffice_anonymous_visitors();
CREATE OR REPLACE FUNCTION public.list_backoffice_anonymous_visitors()
RETURNS TABLE (
  id uuid,
  visitor_pseudo text,
  last_seen_at timestamptz,
  auth_user_id uuid,
  fingerprint text,
  device_fingerprint text,
  avatar_url text,
  selfie_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF NOT (
    COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3
    OR COALESCE(v_caller_app_role, 0) = 4
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = v_caller AND au.role_id = 4
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.visitor_pseudo,
    v.last_seen_at,
    v.auth_user_id,
    v.fingerprint,
    v.device_fingerprint,
    v.avatar_url,
    v.selfie_url
  FROM public.visitors v
  WHERE v.deleted_at IS NULL
  ORDER BY v.last_seen_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_backoffice_anonymous_visitors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_backoffice_anonymous_visitors() TO authenticated;

COMMENT ON FUNCTION public.list_backoffice_anonymous_visitors() IS
  'Liste les sessions visitors actives (deleted_at IS NULL) pour le backoffice.';

-- Corbeille visiteurs : profils archivés (hors staff) + sessions anonymes archivées.
CREATE OR REPLACE FUNCTION public.list_backoffice_trashed_visitors()
RETURNS TABLE (
  id uuid,
  source text,
  first_name text,
  last_name text,
  pseudo text,
  deleted_at timestamptz,
  auth_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF NOT (
    COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3
    OR COALESCE(v_caller_app_role, 0) = 4
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = v_caller AND au.role_id = 4
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      p.id,
      'profiles'::text AS source,
      p.first_name,
      p.last_name,
      p.username AS pseudo,
      p.deleted_at,
      NULL::uuid AS auth_user_id
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    WHERE p.deleted_at IS NOT NULL
      -- Exclure admins globaux et staff métier (1-6)
      AND COALESCE(NULLIF(trim(au.raw_app_meta_data->>'role_id'), '')::int, 0) NOT BETWEEN 1 AND 3
      AND NOT EXISTS (
        SELECT 1
        FROM public.agency_users ag
        WHERE ag.user_id = p.id
          AND ag.role_id BETWEEN 1 AND 6
      )

    UNION ALL

    SELECT
      v.id,
      'visitors'::text AS source,
      NULL::text AS first_name,
      NULL::text AS last_name,
      v.visitor_pseudo AS pseudo,
      v.deleted_at,
      v.auth_user_id
    FROM public.visitors v
    WHERE v.deleted_at IS NOT NULL
  ) AS trash
  ORDER BY trash.deleted_at ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_backoffice_trashed_visitors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_backoffice_trashed_visitors() TO authenticated;

COMMENT ON FUNCTION public.list_backoffice_trashed_visitors() IS
  'Corbeille visiteurs : profiles archivés (hors staff) + visitors archivés.';

-- Selfies profils : visitors.selfie_url via auth_user_id OU empreinte appareil
-- (souvent le selfie est sur une session anonyme jamais liée à auth_user_id).
DROP FUNCTION IF EXISTS public.list_backoffice_profile_selfies();
CREATE OR REPLACE FUNCTION public.list_backoffice_profile_selfies()
RETURNS TABLE (
  profile_id uuid,
  selfie_url text,
  visitor_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF NOT (
    COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3
    OR COALESCE(v_caller_app_role, 0) = 4
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = v_caller AND au.role_id = 4
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  WITH cand AS (
    -- 1) Session déjà liée au profil
    SELECT
      v.auth_user_id AS profile_id,
      NULLIF(trim(v.selfie_url), '') AS selfie_url,
      v.id AS visitor_id,
      v.last_seen_at,
      1 AS prio
    FROM public.visitors v
    INNER JOIN public.profiles p ON p.id = v.auth_user_id AND p.deleted_at IS NULL
    WHERE v.auth_user_id IS NOT NULL
      AND NULLIF(trim(v.selfie_url), '') IS NOT NULL

    UNION ALL

    -- 2) Session anonyme : fingerprint / device_fingerprint = meta appareil du profil
    SELECT
      u.id AS profile_id,
      NULLIF(trim(v.selfie_url), '') AS selfie_url,
      v.id AS visitor_id,
      v.last_seen_at,
      2 AS prio
    FROM public.visitors v
    INNER JOIN auth.users u ON (
      NULLIF(trim(v.fingerprint), '') IS NOT NULL
      AND NULLIF(trim(v.fingerprint), '') = NULLIF(trim(u.raw_user_meta_data->>'device_fingerprint'), '')
    )
    INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
    WHERE NULLIF(trim(v.selfie_url), '') IS NOT NULL

    UNION ALL

    SELECT
      u.id AS profile_id,
      NULLIF(trim(v.selfie_url), '') AS selfie_url,
      v.id AS visitor_id,
      v.last_seen_at,
      2 AS prio
    FROM public.visitors v
    INNER JOIN auth.users u ON (
      NULLIF(trim(v.device_fingerprint), '') IS NOT NULL
      AND NULLIF(trim(v.device_fingerprint), '') = NULLIF(trim(u.raw_user_meta_data->>'device_fingerprint'), '')
    )
    INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
    WHERE NULLIF(trim(v.selfie_url), '') IS NOT NULL

    UNION ALL

    -- 3) Selfie uploadé sous l’UUID auth (chemin photos/visitors/{user_id}.*)
    --    stocké en meta user_photo_url (pas l’avatar pool /avatars/)
    SELECT
      u.id AS profile_id,
      NULLIF(trim(u.raw_user_meta_data->>'user_photo_url'), '') AS selfie_url,
      NULL::uuid AS visitor_id,
      u.last_sign_in_at AS last_seen_at,
      3 AS prio
    FROM auth.users u
    INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
    WHERE NULLIF(trim(u.raw_user_meta_data->>'user_photo_url'), '') IS NOT NULL
      AND (
        u.raw_user_meta_data->>'user_photo_url' ILIKE '%/photos/visitors/%'
        OR u.raw_user_meta_data->>'user_photo_url' ILIKE '%/selfies/%'
      )
  )
  SELECT DISTINCT ON (c.profile_id)
    c.profile_id,
    c.selfie_url,
    c.visitor_id
  FROM cand c
  WHERE c.selfie_url IS NOT NULL
  ORDER BY c.profile_id, c.prio ASC, c.last_seen_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_backoffice_profile_selfies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_backoffice_profile_selfies() TO authenticated;

COMMENT ON FUNCTION public.list_backoffice_profile_selfies() IS
  'Selfies visiteurs pour le backoffice : visitors.selfie_url (auth ou empreinte) + meta user_photo_url type selfie.';

NOTIFY pgrst, 'reload schema';
