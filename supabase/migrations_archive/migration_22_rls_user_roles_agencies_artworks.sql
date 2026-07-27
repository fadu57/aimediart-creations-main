-- =============================================================================
-- migration_22_rls_user_roles_agencies_artworks.sql
-- À copier-coller dans Supabase → SQL Editor (tout le bloc d’un coup).
-- =============================================================================
--
-- Prérequis (table métier des rôles par utilisateur) :
--   public.user_roles avec au minimum :
--     - user_id uuid NOT NULL  → identifiant Supabase Auth (= auth.uid()), même clé que public.users.id
--     - role_id integer        → identifiant du rôle (ex. 1)
--     - role_name text         → libellé technique (ex. 'admin_general', 'super_admin')
--
-- Lien utilisateur (ce dépôt lit le profil dans public.users) :
--   user_roles.user_id = public.users.id = auth.uid()
-- Si chez vous le profil applicatif est dans public.profiles, voir la section
-- « VARIANTE profiles » en fin de fichier (remplacer users par profiles).
--
-- Rôles globaux (tout sur agencies + artworks) : admin_general, super_admin, developpeur
-- Rôles agence / expo : admin_agency, curator_expo, equipe_expo (périmètre via public.users)
--
-- Performance : index sur user_roles(user_id) pour les EXISTS (auth.uid()).
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role_name
  ON public.user_roles (user_id, lower(trim(role_name)));

-- ---------------------------------------------------------------------------
-- Comparaison de noms de rôles (insensible à la casse, espaces → underscores)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_role_label(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(trim(COALESCE(p, '')), '\s+', '_', 'g'),
      '-+',
      '_',
      'g'
    )
  );
$$;

COMMENT ON FUNCTION public.normalize_role_label(text) IS
  'Normalise un role_name pour comparaison (admin general → admin_general).';

-- ---------------------------------------------------------------------------
-- Vérifications sur user_roles (SECURITY DEFINER : lecture sans exposer users en policy)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_roles_has_normalized_role(p_allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND public.normalize_role_label(ur.role_name) = ANY (
        SELECT public.normalize_role_label(x)
        FROM unnest(p_allowed) AS t(x)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_roles_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_roles_has_normalized_role(
    ARRAY['admin_general', 'super_admin', 'developpeur']
  );
$$;

COMMENT ON FUNCTION public.user_roles_is_global_admin() IS
  'True si une ligne user_roles de l’utilisateur a un role_name d’admin global (ou équivalent normalisé).';

CREATE OR REPLACE FUNCTION public.agencies_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_roles_is_global_admin();
$$;

-- Staff 4–6 : même agence que la ligne agencies (via public.users.agency_id)
CREATE OR REPLACE FUNCTION public.agencies_user_can_read_row(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND public.normalize_role_label(ur.role_name) IN (
        'admin_agency',
        'curator_expo',
        'equipe_expo'
      )
      AND COALESCE(u.agency_id::text, '') <> ''
      AND u.agency_id::text = p_agency_id::text
  );
$$;

-- Admin agence uniquement : mise à jour de la fiche de son agence
CREATE OR REPLACE FUNCTION public.agencies_user_can_update_own_agency_row(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND public.normalize_role_label(ur.role_name) = 'admin_agency'
      AND COALESCE(u.agency_id::text, '') <> ''
      AND u.agency_id::text = p_agency_id::text
  );
$$;

CREATE OR REPLACE FUNCTION public.artworks_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_roles_is_global_admin();
$$;

CREATE OR REPLACE FUNCTION public.artworks_staff_can_select_row(
  p_artwork_agency_id uuid,
  p_artwork_expo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.users u ON u.id = ur.user_id
      WHERE ur.user_id = auth.uid()
        AND public.normalize_role_label(ur.role_name) = 'admin_agency'
        AND COALESCE(u.agency_id::text, '') <> ''
        AND p_artwork_agency_id IS NOT NULL
        AND u.agency_id::text = p_artwork_agency_id::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      INNER JOIN public.users u ON u.id = ur.user_id
      WHERE ur.user_id = auth.uid()
        AND public.normalize_role_label(ur.role_name) IN ('curator_expo', 'equipe_expo')
        AND COALESCE(u.user_expo_id::text, '') <> ''
        AND p_artwork_expo_id IS NOT NULL
        AND u.user_expo_id::text = p_artwork_expo_id::text
    );
$$;

COMMENT ON FUNCTION public.artworks_staff_can_select_row(uuid, uuid) IS
  'SELECT œuvres : admin_agency par agence ; curator_expo / equipe_expo par expo (users.user_expo_id).';

GRANT EXECUTE ON FUNCTION public.normalize_role_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_roles_has_normalized_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_roles_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agencies_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agencies_user_can_read_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agencies_user_can_update_own_agency_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artworks_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.artworks_staff_can_select_row(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- AGENCIES : sans raw_user_metadata / JWT — uniquement user_roles + users
-- ---------------------------------------------------------------------------

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agencies_admin_all" ON public.agencies;
DROP POLICY IF EXISTS "agencies_agency_select" ON public.agencies;
DROP POLICY IF EXISTS "agencies_agency_update" ON public.agencies;

CREATE POLICY "agencies_admin_all"
ON public.agencies
FOR ALL
TO authenticated
USING (public.agencies_is_global_admin())
WITH CHECK (public.agencies_is_global_admin());

CREATE POLICY "agencies_agency_select"
ON public.agencies
FOR SELECT
TO authenticated
USING (public.agencies_user_can_read_row(public.agencies.id));

CREATE POLICY "agencies_agency_update"
ON public.agencies
FOR UPDATE
TO authenticated
USING (public.agencies_user_can_update_own_agency_row(public.agencies.id))
WITH CHECK (public.agencies_user_can_update_own_agency_row(public.agencies.id));

-- ---------------------------------------------------------------------------
-- ARTWORKS
-- ---------------------------------------------------------------------------

ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artworks_admin_all" ON public.artworks;
DROP POLICY IF EXISTS "artworks_agency_select" ON public.artworks;

CREATE POLICY "artworks_admin_all"
ON public.artworks
FOR ALL
TO authenticated
USING (public.artworks_is_global_admin())
WITH CHECK (public.artworks_is_global_admin());

CREATE POLICY "artworks_agency_select"
ON public.artworks
FOR SELECT
TO authenticated
USING (
  public.artworks_staff_can_select_row(
    public.artworks.artwork_agency_id,
    public.artworks.artwork_expo_id
  )
);

COMMIT;

-- =============================================================================
-- VARIANTE : profil dans public.profiles au lieu de public.users
-- =============================================================================
-- Si user_roles.user_id = profiles.id et agency_id / user_expo_id sont sur profiles :
--
-- 1) Remplacer dans les 4 fonctions ci-dessus toutes les occurrences de
--      INNER JOIN public.users u ON u.id = ur.user_id
--    par
--      INNER JOIN public.profiles u ON u.id = ur.user_id
--    (et vérifier les noms de colonnes : agency_id, user_expo_id ou expo_id).
--
-- 2) Re-exécuter uniquement les blocs CREATE OR REPLACE FUNCTION ... pour ces
--    fonctions, puis aucun changement sur les CREATE POLICY (elles appellent déjà
--    les mêmes noms de fonctions).
-- =============================================================================
