-- migration_19_agencies_rls.sql
-- Problème : INSERT sur public.agencies refusé (« new row violates row-level security policy »).
-- Solution : politiques alignées sur artists (admins globaux + lecture/MAJ limitée à son agence).

BEGIN;

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agencies TO authenticated;

DROP POLICY IF EXISTS "agencies_admin_all" ON public.agencies;
DROP POLICY IF EXISTS "agencies_agency_select" ON public.agencies;
DROP POLICY IF EXISTS "agencies_agency_update" ON public.agencies;

-- Admins / dev (rôles 1–3 ou équivalent JWT) : tout sur toutes les lignes (dont INSERT création d’agence).
CREATE POLICY "agencies_admin_all"
ON public.agencies
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 3)
  )
  OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
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
  OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur'
  )
);

-- Staff agence / expo : lecture de la ligne de leur agence uniquement.
CREATE POLICY "agencies_agency_select"
ON public.agencies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (4, 5, 6)
      AND COALESCE(u.agency_id::text, '') <> ''
      AND public.agencies.id::text = u.agency_id::text
  )
);

-- Admin agence : mise à jour de sa fiche agence uniquement (pas d’INSERT ici — réservé aux admins globaux).
CREATE POLICY "agencies_agency_update"
ON public.agencies
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id = 4
      AND COALESCE(u.agency_id::text, '') <> ''
      AND public.agencies.id::text = u.agency_id::text
  )
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
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id = 4
      AND COALESCE(u.agency_id::text, '') <> ''
      AND public.agencies.id::text = u.agency_id::text
  )
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
