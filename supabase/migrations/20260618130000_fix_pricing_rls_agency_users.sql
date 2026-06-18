-- RLS facturation : agency_users + app_metadata (users / user_roles obsolètes pour Fabien et staff récent)

CREATE OR REPLACE FUNCTION public.agencies_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    COALESCE(
      NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
      (
        SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::integer
        FROM auth.users u
        WHERE u.id = auth.uid()
      )
    ) BETWEEN 1 AND 3
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role_id BETWEEN 1 AND 3
    )
    OR public.user_roles_is_global_admin();
$$;

COMMENT ON FUNCTION public.agencies_is_global_admin() IS
  'Admin global : app_metadata.role_id 1-3, profiles.role_id 1-3, ou user_roles legacy.';

CREATE OR REPLACE FUNCTION public.agencies_user_can_read_row(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.agency_id = p_agency_id
      AND au.role_id BETWEEN 4 AND 6
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND public.normalize_role_label(ur.role_name) IN (
        'admin_agency',
        'curator_expo',
        'equipe_expo'
      )
      AND COALESCE(u.agency_id::text, '') <> ''
      AND u.agency_id::text = p_agency_id::text
  );
$$;

COMMENT ON FUNCTION public.agencies_user_can_read_row(uuid) IS
  'Staff organisation : agency_users (4-6) ou legacy user_roles + users.agency_id.';
