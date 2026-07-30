-- Visiteurs géographie statistiques : tous les participants (feedback + visites + profils).
-- visitor_feedback.visitor_id est text (UUID auth ou visitor_client_id).

DROP FUNCTION IF EXISTS public.get_statistics_geography_visitors(uuid, uuid, timestamptz, timestamptz, uuid[]);

CREATE OR REPLACE FUNCTION public.get_statistics_geography_visitors(
  p_agency_id uuid DEFAULT NULL,
  p_expo_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_artwork_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  visitor_key text,
  visitor_pseudo text,
  visitor_name text,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  selfie_url text,
  city text,
  zip_code text,
  country text,
  country_code text,
  ip_address text,
  auth_user_id uuid,
  visitor_client_id text,
  visitor_db_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT (
    public.rls_is_global_admin()
    OR (p_agency_id IS NOT NULL AND public.rls_is_agency_staff_for(p_agency_id))
    OR (
      p_agency_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.agency_users au
        WHERE au.user_id = auth.uid()
          AND au.role_id BETWEEN 4 AND 6
      )
    )
    OR (
      p_expo_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.expo_user_role eur
        WHERE eur.user_id = auth.uid()
          AND eur.expo_id = p_expo_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  WITH agency_scope AS (
    SELECT p_agency_id AS agency_id
    WHERE p_agency_id IS NOT NULL

    UNION

    SELECT au.agency_id
    FROM public.agency_users au
    WHERE p_agency_id IS NULL
      AND NOT public.rls_is_global_admin()
      AND au.user_id = auth.uid()
      AND au.role_id BETWEEN 4 AND 6
  ),
  scoped_feedback AS (
    SELECT DISTINCT vf.visitor_id, vf.visit_id
    FROM public.visitor_feedback vf
    WHERE (
        NOT EXISTS (SELECT 1 FROM agency_scope)
        OR vf.agency_id IN (SELECT agency_id FROM agency_scope)
      )
      AND (p_expo_id IS NULL OR vf.expo_id = p_expo_id)
      AND (p_date_from IS NULL OR vf.submitted_at >= p_date_from)
      AND (p_date_to IS NULL OR vf.submitted_at <= p_date_to)
  ),
  scoped_vev AS (
    SELECT DISTINCT vev.visitor_id, vev.auth_user_id
    FROM public.visitor_expo_visits vev
    WHERE (
        NOT EXISTS (SELECT 1 FROM agency_scope)
        OR vev.agency_id IN (SELECT agency_id FROM agency_scope)
      )
      AND (p_expo_id IS NULL OR vev.expo_id = p_expo_id)
      AND (p_date_from IS NULL OR vev.entered_at >= p_date_from)
      AND (p_date_to IS NULL OR vev.entered_at <= p_date_to)
  ),
  resolved_pks AS (
    SELECT DISTINCT pk AS visitor_pk
    FROM (
      SELECT COALESCE(
        vev.visitor_id,
        v_by_client.id,
        v_by_auth.id,
        v_by_pk.id
      ) AS pk
      FROM scoped_feedback sf
      LEFT JOIN public.visitor_expo_visits vev ON vev.id = sf.visit_id
      LEFT JOIN public.visitors v_by_client
        ON v_by_client.visitor_client_id = sf.visitor_id
      LEFT JOIN public.visitors v_by_auth
        ON v_by_auth.auth_user_id::text = sf.visitor_id
      LEFT JOIN public.visitors v_by_pk
        ON v_by_pk.id::text = sf.visitor_id
      WHERE COALESCE(vev.visitor_id, v_by_client.id, v_by_auth.id, v_by_pk.id) IS NOT NULL

      UNION

      SELECT sv.visitor_id AS pk
      FROM scoped_vev sv
      WHERE sv.visitor_id IS NOT NULL
    ) x
    WHERE pk IS NOT NULL
  ),
  visitor_auth AS (
    SELECT
      v.id AS visitor_pk,
      COALESCE(
        v.auth_user_id,
        (
          SELECT sv.auth_user_id
          FROM scoped_vev sv
          WHERE sv.visitor_id = v.id
            AND sv.auth_user_id IS NOT NULL
          LIMIT 1
        )
      ) AS profile_id
    FROM resolved_pks rp
    INNER JOIN public.visitors v ON v.id = rp.visitor_pk
  ),
  profile_auth_ids AS (
    SELECT DISTINCT profile_id AS auth_id
    FROM (
      SELECT sf.visitor_id::uuid AS profile_id
      FROM scoped_feedback sf
      WHERE sf.visitor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

      UNION

      SELECT sv.auth_user_id AS profile_id
      FROM scoped_vev sv
      WHERE sv.auth_user_id IS NOT NULL

      UNION

      SELECT va.profile_id
      FROM visitor_auth va
      WHERE va.profile_id IS NOT NULL

      UNION

      -- Tous les utilisateurs enregistrés (table profiles)
      SELECT p.id AS profile_id
      FROM public.profiles p
      WHERE p.deleted_at IS NULL
    ) ids
    WHERE profile_id IS NOT NULL
  ),
  from_visitors AS (
    SELECT
      COALESCE(va.profile_id::text, v.visitor_client_id, v.id::text) AS out_visitor_key,
      v.visitor_pseudo AS out_visitor_pseudo,
      v.visitor_name AS out_visitor_name,
      p.first_name AS out_first_name,
      p.last_name AS out_last_name,
      p.username AS out_username,
      COALESCE(NULLIF(trim(v.avatar_url), ''), NULLIF(trim(p.avatar_url), '')) AS out_avatar_url,
      v.selfie_url AS out_selfie_url,
      COALESCE(NULLIF(trim(v.city), ''), NULLIF(trim(p.city), '')) AS out_city,
      NULLIF(trim(p.zip_code), '') AS out_zip_code,
      v.country AS out_country,
      p.country_code::text AS out_country_code,
      COALESCE(NULLIF(trim(v.ip_address), ''), NULLIF(trim(p.ip_address), '')) AS out_ip_address,
      va.profile_id AS out_auth_user_id,
      v.visitor_client_id AS out_visitor_client_id,
      v.id AS out_visitor_db_id
    FROM visitor_auth va
    INNER JOIN public.visitors v ON v.id = va.visitor_pk
    LEFT JOIN public.profiles p ON p.id = va.profile_id
  ),
  from_profiles AS (
    SELECT
      p.id::text AS out_visitor_key,
      NULL::text AS out_visitor_pseudo,
      NULL::text AS out_visitor_name,
      p.first_name AS out_first_name,
      p.last_name AS out_last_name,
      p.username AS out_username,
      p.avatar_url AS out_avatar_url,
      NULL::text AS out_selfie_url,
      p.city AS out_city,
      NULLIF(trim(p.zip_code), '') AS out_zip_code,
      NULL::text AS out_country,
      p.country_code::text AS out_country_code,
      NULLIF(trim(p.ip_address), '') AS out_ip_address,
      p.id AS out_auth_user_id,
      NULL::text AS out_visitor_client_id,
      NULL::uuid AS out_visitor_db_id
    FROM profile_auth_ids pa
    INNER JOIN public.profiles p ON p.id = pa.auth_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM from_visitors fv
      WHERE fv.out_auth_user_id = p.id
    )
  ),
  combined AS (
    SELECT * FROM from_visitors
    UNION ALL
    SELECT * FROM from_profiles
  )
  SELECT
    c.out_visitor_key,
    c.out_visitor_pseudo,
    c.out_visitor_name,
    c.out_first_name,
    c.out_last_name,
    c.out_username,
    c.out_avatar_url,
    c.out_selfie_url,
    c.out_city,
    c.out_zip_code,
    c.out_country,
    c.out_country_code,
    c.out_ip_address,
    c.out_auth_user_id,
    c.out_visitor_client_id,
    c.out_visitor_db_id
  FROM combined c
  WHERE NULLIF(trim(c.out_visitor_key), '') IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.get_statistics_geography_visitors(uuid, uuid, timestamptz, timestamptz, uuid[]) IS
  'Liste visiteurs + tous les profils enregistrés pour la géographie statistiques.';

REVOKE ALL ON FUNCTION public.get_statistics_geography_visitors(uuid, uuid, timestamptz, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_statistics_geography_visitors(uuid, uuid, timestamptz, timestamptz, uuid[]) TO authenticated;
