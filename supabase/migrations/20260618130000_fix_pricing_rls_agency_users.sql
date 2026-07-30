-- RLS facturation : agency_users + app_metadata (sans dépendance user_roles legacy)

CREATE OR REPLACE FUNCTION public.agencies_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    (
      SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      FROM auth.users u
      WHERE u.id = auth.uid()
    )
  ) BETWEEN 1 AND 3;
$$;

COMMENT ON FUNCTION public.agencies_is_global_admin() IS
  'Admin global : app_metadata.role_id 1-3 (JWT ou auth.users.raw_app_meta_data).';

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
  );
$$;

COMMENT ON FUNCTION public.agencies_user_can_read_row(uuid) IS
  'Staff organisation : agency_users role_id 4-6 rattaché à l''agence.';

GRANT EXECUTE ON FUNCTION public.agencies_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agencies_user_can_read_row(uuid) TO authenticated;
