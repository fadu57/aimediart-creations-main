-- migration_11_rls_artworks_artists.sql
-- Objectif:
-- 1) Réactiver RLS sur artworks et artists
-- 2) Accès complet admins (role_id IN (1,2))
-- 3) Accès SELECT limité à l'agence pour les autres rôles

BEGIN;

ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

-- Nettoyage anciennes politiques (idempotent)
DROP POLICY IF EXISTS "artworks_admin_all" ON public.artworks;
DROP POLICY IF EXISTS "artworks_agency_select" ON public.artworks;
DROP POLICY IF EXISTS "artists_admin_all" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_select" ON public.artists;

-- =========================
-- ARTWORKS
-- =========================

CREATE POLICY "artworks_admin_all"
ON public.artworks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2)
  )
);

CREATE POLICY "artworks_agency_select"
ON public.artworks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.agency_id::text, '') <> ''
      AND (
        public.artworks.artwork_agency_id::text = u.agency_id::text
        OR COALESCE(public.artworks.agency_id::text, '') = u.agency_id::text
      )
  )
);

-- =========================
-- ARTISTS
-- =========================

CREATE POLICY "artists_admin_all"
ON public.artists
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2)
  )
);

CREATE POLICY "artists_agency_select"
ON public.artists
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.agency_id::text, '') <> ''
      AND COALESCE(public.artists.artist_agency_id::text, '') = u.agency_id::text
  )
);

COMMIT;

