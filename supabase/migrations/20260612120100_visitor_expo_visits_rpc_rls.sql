-- =============================================================================
-- RPC + RLS pour public.visitor_expo_visits
-- Prérequis :
--   20260612110000_visitor_expo_visits_prerequisites.sql
--   20260612120000_visitor_expo_visits_schema.sql
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.visitor_expo_visits') IS NULL THEN
    RAISE EXCEPTION
      'Appliquer d''abord 20260612120000_visitor_expo_visits_schema.sql';
  END IF;
END $$;

-- ===========================================================================
-- HELPERS INTERNES (non exposés aux rôles API)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public._resolve_visitor_id_for_expo_visit(
  p_visitor_client_id text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cid text := NULLIF(pg_catalog.btrim(p_visitor_client_id), '');
  v_id uuid;
  v_auth uuid := auth.uid();
BEGIN
  IF v_cid IS NOT NULL THEN
    SELECT v.id INTO v_id
    FROM public.visitors v
    WHERE v.visitor_client_id = v_cid
    LIMIT 1;
  END IF;

  IF v_id IS NULL AND v_auth IS NOT NULL THEN
    SELECT v.id INTO v_id
    FROM public.visitors v
    WHERE v.auth_user_id = v_auth
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public._resolve_visitor_id_for_expo_visit(text) IS
  'Interne : résout public.visitors.id. Pas de création implicite de visiteur.';

CREATE OR REPLACE FUNCTION public._visitor_owns_expo_visit(
  p_visit_id uuid,
  p_visitor_client_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.visitor_expo_visits vev
    INNER JOIN public.visitors v ON v.id = vev.visitor_id
    WHERE vev.id = p_visit_id
      AND (
        (
          NULLIF(pg_catalog.btrim(p_visitor_client_id), '') IS NOT NULL
          AND v.visitor_client_id = NULLIF(pg_catalog.btrim(p_visitor_client_id), '')
        )
        OR (
          auth.uid() IS NOT NULL
          AND v.auth_user_id IS NOT NULL
          AND v.auth_user_id = auth.uid()
        )
      )
  );
$$;

COMMENT ON FUNCTION public._visitor_owns_expo_visit(uuid, text) IS
  'Interne : vérifie l''appartenance visiteur ↔ session (touch/end).';

REVOKE ALL ON FUNCTION public._resolve_visitor_id_for_expo_visit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._visitor_owns_expo_visit(uuid, text) FROM PUBLIC;

-- ===========================================================================
-- RPC MÉTIER
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.start_visitor_expo_visit(
  p_visitor_client_id text,
  p_expo_id uuid,
  p_entry_source text DEFAULT 'unknown'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_visitor_id uuid;
  v_expo_id uuid := p_expo_id;
  v_agency_id uuid;
  v_visit_id uuid;
  v_auth uuid := auth.uid();
  v_stale_cutoff timestamptz := pg_catalog.now() - interval '12 hours';
BEGIN
  IF v_expo_id IS NULL THEN
    RAISE EXCEPTION 'expo_id requis';
  END IF;

  v_visitor_id := public._resolve_visitor_id_for_expo_visit(p_visitor_client_id);
  IF v_visitor_id IS NULL THEN
    RAISE EXCEPTION
      'Visiteur introuvable : appeler register_anonymous_visitor avant start_visitor_expo_visit';
  END IF;

  SELECT e.agency_id INTO v_agency_id
  FROM public.expos e
  WHERE e.id = v_expo_id
    AND e.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exposition introuvable ou supprimée (deleted_at)';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_visitor_id::text || ':' || v_expo_id::text, 0)
  );

  -- A) abandon soft (> 12 h sans activité)
  UPDATE public.visitor_expo_visits vev
  SET
    status = 'abandoned',
    ended_at = pg_catalog.now()
  WHERE vev.visitor_id = v_visitor_id
    AND vev.status = 'active'
    AND vev.last_activity_at < v_stale_cutoff;

  -- B) autre expo active → ended
  UPDATE public.visitor_expo_visits vev
  SET
    status = 'ended',
    ended_at = pg_catalog.now()
  WHERE vev.visitor_id = v_visitor_id
    AND vev.status = 'active'
    AND vev.expo_id IS DISTINCT FROM v_expo_id;

  -- C) reprise même expo
  SELECT vev.id INTO v_visit_id
  FROM public.visitor_expo_visits vev
  WHERE vev.visitor_id = v_visitor_id
    AND vev.expo_id = v_expo_id
    AND vev.status = 'active'
  LIMIT 1;

  IF v_visit_id IS NOT NULL THEN
    UPDATE public.visitor_expo_visits vev
    SET
      last_activity_at = pg_catalog.now(),
      agency_id = pg_catalog.coalesce(vev.agency_id, v_agency_id),
      auth_user_id = pg_catalog.coalesce(vev.auth_user_id, v_auth),
      entry_source = pg_catalog.coalesce(
        NULLIF(pg_catalog.btrim(p_entry_source), ''),
        vev.entry_source
      )
    WHERE vev.id = v_visit_id;

    RETURN v_visit_id;
  END IF;

  -- D) nouvelle visite
  BEGIN
    INSERT INTO public.visitor_expo_visits (
      visitor_id,
      expo_id,
      agency_id,
      auth_user_id,
      entry_source,
      status
    )
    VALUES (
      v_visitor_id,
      v_expo_id,
      v_agency_id,
      v_auth,
      NULLIF(pg_catalog.btrim(p_entry_source), ''),
      'active'
    )
    RETURNING id INTO v_visit_id;

  EXCEPTION
    WHEN unique_violation THEN
      SELECT vev.id INTO v_visit_id
      FROM public.visitor_expo_visits vev
      WHERE vev.visitor_id = v_visitor_id
        AND vev.expo_id = v_expo_id
        AND vev.status = 'active'
      LIMIT 1;

      IF v_visit_id IS NULL THEN
        RAISE;
      END IF;

      UPDATE public.visitor_expo_visits vev
      SET last_activity_at = pg_catalog.now()
      WHERE vev.id = v_visit_id;
  END;

  RETURN v_visit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_visitor_expo_visit(
  p_visit_id uuid,
  p_visitor_client_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_visit_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public._visitor_owns_expo_visit(p_visit_id, p_visitor_client_id) THEN
    RETURN false;
  END IF;

  UPDATE public.visitor_expo_visits vev
  SET last_activity_at = pg_catalog.now()
  WHERE vev.id = p_visit_id
    AND vev.status = 'active';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_visitor_expo_visit(
  p_visit_id uuid,
  p_visitor_client_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_visit_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public._visitor_owns_expo_visit(p_visit_id, p_visitor_client_id) THEN
    RETURN false;
  END IF;

  UPDATE public.visitor_expo_visits vev
  SET
    status = 'ended',
    ended_at = pg_catalog.now(),
    last_activity_at = pg_catalog.now()
  WHERE vev.id = p_visit_id
    AND vev.status = 'active';

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.start_visitor_expo_visit(text, uuid, text) IS
  'Ouvre ou reprend une visite active. Anti-doublon : abandon 12h, fin si autre expo, index unique partiel.';

COMMENT ON FUNCTION public.touch_visitor_expo_visit(uuid, text) IS
  'Heartbeat last_activity_at. Requiert p_visitor_client_id pour contrôle d''appartenance.';

COMMENT ON FUNCTION public.end_visitor_expo_visit(uuid, text) IS
  'Clôture explicite (status=ended). Requiert p_visitor_client_id pour contrôle d''appartenance.';

REVOKE ALL ON FUNCTION public.start_visitor_expo_visit(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_visitor_expo_visit(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_visitor_expo_visit(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_visitor_expo_visit(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_visitor_expo_visit(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_visitor_expo_visit(uuid, text) TO anon, authenticated;

-- ===========================================================================
-- RLS POLICIES
-- ===========================================================================

DROP POLICY IF EXISTS visitor_expo_visits_select_staff ON public.visitor_expo_visits;
CREATE POLICY visitor_expo_visits_select_staff
  ON public.visitor_expo_visits
  FOR SELECT
  TO authenticated
  USING (
    public.rls_is_global_admin()
    OR (
      agency_id IS NOT NULL
      AND public.rls_is_agency_staff_for(agency_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.expo_user_role eur
      WHERE eur.user_id = auth.uid()
        AND eur.expo_id = visitor_expo_visits.expo_id
    )
  );

DROP POLICY IF EXISTS visitor_expo_visits_select_own_auth ON public.visitor_expo_visits;
CREATE POLICY visitor_expo_visits_select_own_auth
  ON public.visitor_expo_visits
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id IS NOT NULL
    AND auth.uid() = auth_user_id
  );

-- Aucune policy INSERT / UPDATE / DELETE pour anon ni authenticated.
-- Écritures : RPC SECURITY DEFINER uniquement.

-- Nécessaire : sans GRANT SELECT, PostgreSQL refuse l'accès avant d'évaluer les policies RLS.
GRANT SELECT ON public.visitor_expo_visits TO authenticated;
