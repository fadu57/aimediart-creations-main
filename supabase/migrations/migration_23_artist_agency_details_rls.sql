-- =============================================================================
-- migration_23_artist_agency_details_rls.sql
-- À exécuter dans Supabase → SQL Editor (tout le bloc d’un coup).
-- =============================================================================
--
-- But :
-- 1) Corriger "new row violates row-level security policy for table artist_agency_details"
-- 2) Satisfaire le linter Supabase : NE PAS référencer auth.jwt() -> 'user_metadata' dans les RLS
--    (user_metadata est modifiable par l’utilisateur → non fiable pour la sécurité).
--
-- Prérequis recommandé : migration_22_rls_user_roles_agencies_artworks.sql (fonctions
--   public.user_roles_is_global_admin(), public.agencies_user_can_read_row(uuid), etc.)
--
-- Si migration_22 n’est pas appliquée, ce fichier redéclare des équivalents minimaux
-- basés uniquement sur public.users (role_id + agency_id), sans JWT metadata.
--
-- Table attendue : public.artist_agency_details avec agency_id uuid NOT NULL.
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fonctions de contrôle (sans user_metadata JWT)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artist_agency_details_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 3)
  );
$$;

COMMENT ON FUNCTION public.artist_agency_details_is_global_admin() IS
  'True si l’utilisateur est admin global selon public.users.role_id (1–3).';

CREATE OR REPLACE FUNCTION public.artist_agency_details_user_is_admin_agency_for(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id = 4
      AND COALESCE(u.agency_id::text, '') <> ''
      AND u.agency_id::text = p_agency_id::text
  );
$$;

COMMENT ON FUNCTION public.artist_agency_details_user_is_admin_agency_for(uuid) IS
  'True si admin agence (role_id=4) et même agency_id que la ligne.';

GRANT EXECUTE ON FUNCTION public.artist_agency_details_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_agency_details_user_is_admin_agency_for(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.artist_agency_details ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artist_agency_details TO authenticated;

DROP POLICY IF EXISTS "artist_agency_details_admin_all" ON public.artist_agency_details;
DROP POLICY IF EXISTS "artist_agency_details_agency_select" ON public.artist_agency_details;
DROP POLICY IF EXISTS "artist_agency_details_agency_write" ON public.artist_agency_details;

-- Admins globaux : accès complet (uniquement public.users, pas de JWT metadata)
CREATE POLICY "artist_agency_details_admin_all"
ON public.artist_agency_details
FOR ALL
TO authenticated
USING (public.artist_agency_details_is_global_admin())
WITH CHECK (public.artist_agency_details_is_global_admin());

-- Staff agence : lecture / écriture sur les lignes de son agence
CREATE POLICY "artist_agency_details_agency_select"
ON public.artist_agency_details
FOR SELECT
TO authenticated
USING (
  public.artist_agency_details_user_is_admin_agency_for(public.artist_agency_details.agency_id)
);

CREATE POLICY "artist_agency_details_agency_write"
ON public.artist_agency_details
FOR INSERT
TO authenticated
WITH CHECK (
  public.artist_agency_details_user_is_admin_agency_for(public.artist_agency_details.agency_id)
);

CREATE POLICY "artist_agency_details_agency_update"
ON public.artist_agency_details
FOR UPDATE
TO authenticated
USING (
  public.artist_agency_details_user_is_admin_agency_for(public.artist_agency_details.agency_id)
)
WITH CHECK (
  public.artist_agency_details_user_is_admin_agency_for(public.artist_agency_details.agency_id)
);

CREATE POLICY "artist_agency_details_agency_delete"
ON public.artist_agency_details
FOR DELETE
TO authenticated
USING (
  public.artist_agency_details_user_is_admin_agency_for(public.artist_agency_details.agency_id)
);

COMMIT;
