-- =============================================================================
-- rls_final_referentiel.sql — RLS Supabase (schéma public, .cursorrules)
-- À exécuter en une fois dans Supabase → SQL Editor.
--
-- Principes :
--   - Rôles lus via public.users.role_id → public.roles_user.role_name (pas de JWT / raw_user_metadata).
--   - Fonctions SECURITY DEFINER pour lire users / roles_user sans boucle RLS.
--   - Admins « globaux » ici : role_name IN ('admin_general', 'super_admin') uniquement.
--   - admin_agency : périmètre strict agency_id = public.users.agency_id.
--
-- Prérequis : tables public.users, public.roles_user, public.artworks, public.expos,
--             public.agencies avec colonnes du référentiel (artwork_agency_id, expo_name, etc.).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fonctions de sécurité (SECURITY DEFINER, search_path fixé)
-- ---------------------------------------------------------------------------

-- role_name de l’utilisateur connecté (jointure référentiel).
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ru.role_name, '')
  FROM public.users u
  LEFT JOIN public.roles_user ru ON ru.role_id = u.role_id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_role() IS
  'Retourne roles_user.role_name pour auth.uid() via public.users (aucune métadonnée JWT).';

-- Normalisation légère pour comparaisons de role_name.
CREATE OR REPLACE FUNCTION public.normalize_role_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  -- Normalisation robuste (comme côté front) :
  -- - trim
  -- - minuscules
  -- - espaces / tirets => underscore
  -- - underscores multiples => underscore unique
  SELECT lower(
    regexp_replace(
      regexp_replace(trim(COALESCE(p, '')), '[\s-]+', '_', 'g'),
      '_+',
      '_',
      'g'
    )
  );
$$;

-- True si l’utilisateur a un rôle global « tout pouvoir » sur les objets métier (artworks, expos, agencies).
CREATE OR REPLACE FUNCTION public.rls_is_global_admin()
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
      AND (
        -- Source de vérité : niveaux 1/2/3 = accès global (admin_general / super_admin / developpeur)
        (
          u.role_id IN (1, 2, 3)
          OR (
            -- Compat: certains schémas stockent le niveau dans users.user_roles (texte)
            u.role_id IS NULL
            AND u.user_roles IS NOT NULL
            AND (u.user_roles::text) ~ '^\s*\d+\s*$'
            AND (trim(u.user_roles::text))::int IN (1, 2, 3)
          )
        )
        OR public.normalize_role_name(
          (SELECT ru.role_name FROM public.roles_user ru WHERE ru.role_id = u.role_id LIMIT 1)
        ) IN ('admin_general', 'super_admin', 'developpeur')
      )
  );
$$;

COMMENT ON FUNCTION public.rls_is_global_admin() IS
  'admin_general ou super_admin : accès total artworks / expos / agencies / écriture users.';

-- agency_id du profil applicatif (peut être NULL).
CREATE OR REPLACE FUNCTION public.rls_current_user_agency_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.agency_id
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

-- True si le profil a le rôle admin_agence (référentiel).
CREATE OR REPLACE FUNCTION public.rls_is_admin_agency()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    INNER JOIN public.roles_user ru ON ru.role_id = u.role_id
    WHERE u.id = auth.uid()
      AND public.normalize_role_name(ru.role_name) = 'admin_agency'
  );
$$;

-- Périmètre agence : œuvre appartient à l’agence du profil.
CREATE OR REPLACE FUNCTION public.rls_artworks_agency_matches(p_artwork_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.rls_is_admin_agency()
    AND p_artwork_agency_id IS NOT NULL
    AND public.rls_current_user_agency_id() IS NOT NULL
    AND p_artwork_agency_id = public.rls_current_user_agency_id();
$$;

-- Périmètre agence : exposition liée à l’agence du profil (expos.agency_id).
CREATE OR REPLACE FUNCTION public.rls_expos_agency_matches(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.rls_is_admin_agency()
    AND p_agency_id IS NOT NULL
    AND public.rls_current_user_agency_id() IS NOT NULL
    AND p_agency_id = public.rls_current_user_agency_id();
$$;

-- Périmètre agence : ligne agencies = son propre agency_id.
CREATE OR REPLACE FUNCTION public.rls_agencies_row_is_mine(p_agency_row_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.rls_is_admin_agency()
    AND p_agency_row_id IS NOT NULL
    AND public.rls_current_user_agency_id() IS NOT NULL
    AND p_agency_row_id = public.rls_current_user_agency_id();
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_role_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_current_user_agency_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_admin_agency() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_artworks_agency_matches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_expos_agency_matches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_agencies_row_is_mine(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Suppression de toutes les politiques existantes sur les 4 tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY['artworks', 'expos', 'agencies', 'users'])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS activée
-- ---------------------------------------------------------------------------

ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Droits de base (ajustez si vous utilisez des rôles customs)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artworks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- ARTWORKS — admin_general / super_admin : tout ; admin_agency : artwork_agency_id = users.agency_id
-- ---------------------------------------------------------------------------

CREATE POLICY "artworks_global_admin_all"
ON public.artworks
FOR ALL
TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "artworks_admin_agency_by_agency_id"
ON public.artworks
FOR ALL
TO authenticated
USING (public.rls_artworks_agency_matches(public.artworks.artwork_agency_id))
WITH CHECK (public.rls_artworks_agency_matches(public.artworks.artwork_agency_id));

-- ---------------------------------------------------------------------------
-- EXPOS — même logique (colonne agency_id sur expos)
-- ---------------------------------------------------------------------------

CREATE POLICY "expos_global_admin_all"
ON public.expos
FOR ALL
TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "expos_admin_agency_by_agency_id"
ON public.expos
FOR ALL
TO authenticated
USING (public.rls_expos_agency_matches(public.expos.agency_id))
WITH CHECK (public.rls_expos_agency_matches(public.expos.agency_id));

-- ---------------------------------------------------------------------------
-- AGENCIES — globaux : tout ; admin_agency : uniquement la fiche dont id = son agency_id
-- ---------------------------------------------------------------------------

CREATE POLICY "agencies_global_admin_all"
ON public.agencies
FOR ALL
TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "agencies_admin_agency_select_own"
ON public.agencies
FOR SELECT
TO authenticated
USING (public.rls_agencies_row_is_mine(public.agencies.id));

CREATE POLICY "agencies_admin_agency_update_own"
ON public.agencies
FOR UPDATE
TO authenticated
USING (public.rls_agencies_row_is_mine(public.agencies.id))
WITH CHECK (public.rls_agencies_row_is_mine(public.agencies.id));

-- ---------------------------------------------------------------------------
-- USERS — lecture : soi-même ou admin_general / super_admin ; écriture : admins globaux uniquement
-- ---------------------------------------------------------------------------

CREATE POLICY "users_select_self_or_global_admin"
ON public.users
FOR SELECT
TO authenticated
USING (
  public.users.id = auth.uid()
  OR public.rls_is_global_admin()
);

CREATE POLICY "users_insert_global_admin_only"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "users_update_global_admin_only"
ON public.users
FOR UPDATE
TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "users_delete_global_admin_only"
ON public.users
FOR DELETE
TO authenticated
USING (public.rls_is_global_admin());

COMMIT;

-- =============================================================================
-- Notes d’exploitation
-- =============================================================================
-- 1) Accès anonyme (anon) : non couvert ici ; ajoutez des politiques séparées si le
--    parcours visiteur doit lire artworks/expos sans compte.
-- 2) Autres rôles (developpeur, curator_expo, equipe_expo, visiteur) : non autorisés
--    par ces politiques ; étendez rls_is_global_admin ou ajoutez des politiques dédiées.
-- 3) Vérifiez que public.users.role_id et public.roles_user sont renseignés pour chaque compte.
-- =============================================================================
