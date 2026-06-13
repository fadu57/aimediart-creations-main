-- RPC : liste utilisateurs backoffice (profiles + agency_users + expo + auth.last_sign_in_at)
-- Exécuter dans Supabase SQL Editor (prod + dev).

DROP FUNCTION IF EXISTS public.get_all_users_with_roles();

CREATE OR REPLACE FUNCTION public.get_all_users_with_roles()
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  birth_year integer,
  role_id integer,
  agency_id uuid,
  expo_id uuid,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url,
    p.phone,
    p.birth_year,
    COALESCE(
      au.role_id,
      (a.raw_app_meta_data->>'role_id')::integer
    ) AS role_id,
    au.agency_id,
    eur.expo_id,
    a.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users a ON a.id = p.id
  LEFT JOIN public.agency_users au ON au.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT e.expo_id
    FROM public.expo_user_role e
    WHERE e.user_id = p.id
    ORDER BY e.assigned_at DESC
    LIMIT 1
  ) eur ON true
  WHERE p.deleted_at IS NULL
  ORDER BY p.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_all_users_with_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_users_with_roles() TO authenticated;

COMMENT ON FUNCTION public.get_all_users_with_roles() IS
  'Liste profiles actifs avec rôle, agence, expo et dernière connexion auth.users.last_sign_in_at.';
