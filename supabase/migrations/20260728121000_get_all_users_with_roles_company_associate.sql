-- Expose is_company_associate dans la liste utilisateurs backoffice.
-- Prérequis : colonne profiles.is_company_associate (migration 20260728120000).

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
  last_sign_in_at timestamptz,
  is_company_associate boolean
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
    (
      SELECT MIN(v.rid)
      FROM (
        SELECT NULLIF(trim(a.raw_app_meta_data->>'role_id'), '')::integer AS rid
        UNION ALL
        SELECT CASE WHEN p.role_id BETWEEN 1 AND 3 THEN p.role_id::integer ELSE NULL END
        UNION ALL
        SELECT au.role_id::integer
      ) AS v(rid)
      WHERE v.rid IS NOT NULL
    ) AS role_id,
    au.agency_id,
    eur.expo_id,
    a.last_sign_in_at,
    COALESCE(p.is_company_associate, false) AS is_company_associate
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
  'Liste profiles actifs avec rôle fusionné, agence, expo, dernière connexion et flag associé entreprise.';
