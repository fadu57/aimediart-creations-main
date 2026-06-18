-- Correctif migration 79 : public.users n'existe plus (→ auth.users.raw_app_meta_data.role_id)

CREATE OR REPLACE FUNCTION public.pricing_is_finance_admin()
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
  ) IN (2, 3);
$$;

COMMENT ON FUNCTION public.pricing_is_finance_admin() IS
  'True si l''utilisateur connecté a role_id 2 ou 3 dans app_metadata (finance / développeur).';
