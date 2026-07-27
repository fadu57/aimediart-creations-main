-- =============================================================================
-- migration_74_sponsors_rls_no_user_metadata.sql
-- À exécuter dans Supabase → SQL Editor (tout le bloc d'un coup).
-- =============================================================================
--
-- Corrige l'alerte linter Supabase (0015) :
--   sponsors_select_v2 / sponsors_write_v2 ne doivent pas lire auth.jwt() -> user_metadata.
--
-- Schéma réel de ce projet :
--   - public.profiles (role_id 1–3 = admins globaux sans ligne agency_users)
--   - public.agency_users + public.expos (accès agence / expo)
--   (pas de table public.users)
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fonctions RLS (SECURITY DEFINER, sans JWT user_metadata)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sponsors_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role_id IN (1, 2, 3)
  )
  OR EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.role_id IN (1, 2, 3)
  );
$$;

COMMENT ON FUNCTION public.sponsors_is_global_admin() IS
  'True si admin global : profiles.role_id 1–3 ou agency_users.role_id 1–3.';

CREATE OR REPLACE FUNCTION public.sponsors_user_can_access_expo(p_expo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expos e
    INNER JOIN public.agency_users au ON au.agency_id = e.agency_id
    WHERE e.id = p_expo_id
      AND au.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.sponsors_user_can_access_expo(uuid) IS
  'True si l''utilisateur est membre de l''agence propriétaire de l''exposition.';

CREATE OR REPLACE FUNCTION public.sponsors_user_can_access_row(p_expo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.sponsors_is_global_admin()
      OR public.sponsors_user_can_access_expo(p_expo_id);
$$;

COMMENT ON FUNCTION public.sponsors_user_can_access_row(uuid) IS
  'Prédicat RLS sponsors : admin global ou membre agence de l''expo.';

GRANT EXECUTE ON FUNCTION public.sponsors_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sponsors_user_can_access_expo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sponsors_user_can_access_row(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Politiques sponsors (sans user_metadata / app_metadata JWT)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsors TO authenticated;

DROP POLICY IF EXISTS "sponsors_select_v2" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_write_v2" ON public.sponsors;

CREATE POLICY "sponsors_select_v2"
ON public.sponsors
FOR SELECT
TO authenticated
USING (public.sponsors_user_can_access_row(id_expo));

CREATE POLICY "sponsors_write_v2"
ON public.sponsors
FOR ALL
TO authenticated
USING (public.sponsors_user_can_access_row(id_expo))
WITH CHECK (public.sponsors_user_can_access_row(id_expo));

COMMIT;
