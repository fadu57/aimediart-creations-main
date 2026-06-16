-- migration_15_artists_rls_insert_update_fix.sql
-- Fix: permettre la création d'artistes malgré RLS (admin via role_id OU via JWT),
-- et autoriser admin_agency à écrire uniquement dans son agence.

BEGIN;

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

-- Droits SQL (en plus des policies RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artists TO authenticated;

-- Nettoyage policies existantes
DROP POLICY IF EXISTS "artists_admin_all" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_select" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_write" ON public.artists;

-- Admins: accès complet.
-- Robustesse: on accepte role_id via public.users si dispo, OU rôle JWT.
CREATE POLICY "artists_admin_all"
ON public.artists
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 3)
  )
  OR
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
  OR
  COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 3)
  )
  OR
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
  OR
  COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
);

-- Admin agence: lecture limitée à son agence
CREATE POLICY "artists_agency_select"
ON public.artists
FOR SELECT
TO authenticated
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') = 'admin_agency'
  AND COALESCE(public.artists.artist_agency_id::text, '') = COALESCE(auth.jwt() -> 'user_metadata' ->> 'agency_id', auth.jwt() -> 'app_metadata' ->> 'agency_id', '')
);

-- Admin agence: écriture limitée à son agence (INSERT/UPDATE/DELETE)
CREATE POLICY "artists_agency_write"
ON public.artists
FOR ALL
TO authenticated
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') = 'admin_agency'
  AND COALESCE(public.artists.artist_agency_id::text, '') = COALESCE(auth.jwt() -> 'user_metadata' ->> 'agency_id', auth.jwt() -> 'app_metadata' ->> 'agency_id', '')
)
WITH CHECK (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') = 'admin_agency'
  AND COALESCE(public.artists.artist_agency_id::text, '') = COALESCE(auth.jwt() -> 'user_metadata' ->> 'agency_id', auth.jwt() -> 'app_metadata' ->> 'agency_id', '')
);

COMMIT;

