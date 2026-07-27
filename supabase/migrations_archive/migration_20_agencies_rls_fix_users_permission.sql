-- migration_20_agencies_rls_fix_users_permission.sql
-- Erreur : « permission denied for table users » à la création / mise à jour d’agence.
--
-- Cause : les policies sur public.agencies font EXISTS (SELECT … FROM public.users …).
-- Avec la RLS (ou l’absence de GRANT) sur public.users, cette lecture échoue pour le rôle
-- « authenticated ».
--
-- Correction : fonctions SECURITY DEFINER (lecture users avec les droits du propriétaire
-- de la fonction), comme public.app_settings_is_staff() dans supabase/app_settings_staff_access.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fonctions (idempotentes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agencies_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 3)
  );
$$;

COMMENT ON FUNCTION public.agencies_is_global_admin() IS
  'RLS agencies : utilisateur connecté a role_id 1, 2 ou 3 (sans exposer users à la policy).';

CREATE OR REPLACE FUNCTION public.agencies_user_can_read_row(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (4, 5, 6)
      AND COALESCE(u.agency_id::text, '') <> ''
      AND u.agency_id::text = p_agency_id::text
  );
$$;

COMMENT ON FUNCTION public.agencies_user_can_read_row(uuid) IS
  'RLS agencies : staff 4–6 ne lit que la ligne dont l’id = users.agency_id.';

CREATE OR REPLACE FUNCTION public.agencies_user_can_update_own_agency_row(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id = 4
      AND COALESCE(u.agency_id::text, '') <> ''
      AND u.agency_id::text = p_agency_id::text
  );
$$;

COMMENT ON FUNCTION public.agencies_user_can_update_own_agency_row(uuid) IS
  'RLS agencies : admin agence (role_id 4) met à jour uniquement sa fiche agence.';

GRANT EXECUTE ON FUNCTION public.agencies_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agencies_user_can_read_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agencies_user_can_update_own_agency_row(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies : remplacer les sous-requêtes directes sur users
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "agencies_admin_all" ON public.agencies;
DROP POLICY IF EXISTS "agencies_agency_select" ON public.agencies;
DROP POLICY IF EXISTS "agencies_agency_update" ON public.agencies;

CREATE POLICY "agencies_admin_all"
ON public.agencies
FOR ALL
TO authenticated
USING (
  public.agencies_is_global_admin()
  OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
)
WITH CHECK (
  public.agencies_is_global_admin()
  OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
);

CREATE POLICY "agencies_agency_select"
ON public.agencies
FOR SELECT
TO authenticated
USING (public.agencies_user_can_read_row(public.agencies.id));

CREATE POLICY "agencies_agency_update"
ON public.agencies
FOR UPDATE
TO authenticated
USING (
  public.agencies_user_can_update_own_agency_row(public.agencies.id)
  OR (
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') = 'admin_agency'
    AND COALESCE(public.agencies.id::text, '') = COALESCE(
      NULLIF(TRIM(COALESCE(auth.jwt() -> 'user_metadata' ->> 'agency_id', '')), ''),
      NULLIF(TRIM(COALESCE(auth.jwt() -> 'app_metadata' ->> 'agency_id', '')), ''),
      ''
    )
  )
)
WITH CHECK (
  public.agencies_user_can_update_own_agency_row(public.agencies.id)
  OR (
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') = 'admin_agency'
    AND COALESCE(public.agencies.id::text, '') = COALESCE(
      NULLIF(TRIM(COALESCE(auth.jwt() -> 'user_metadata' ->> 'agency_id', '')), ''),
      NULLIF(TRIM(COALESCE(auth.jwt() -> 'app_metadata' ->> 'agency_id', '')), ''),
      ''
    )
  )
);

COMMIT;
