-- =============================================================================
-- Prérequis officiels pour visitor_expo_visits
-- Rend explicites et idempotents :
--   - helpers RLS utilisés par les policies
--   - colonne visitors.auth_user_id
--   - colonne expos.deleted_at (soft delete, utilisée partout dans l'app)
--   - fonction trigger set_updated_at
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vérifications bloquantes (échec explicite, pas d'échec implicite plus tard)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.visitors') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUIS BLOQUANT : table public.visitors absente. Déployer le schéma métier de base avant cette migration.';
  END IF;

  IF to_regclass('public.expos') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUIS BLOQUANT : table public.expos absente.';
  END IF;

  IF to_regclass('public.agencies') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUIS BLOQUANT : table public.agencies absente.';
  END IF;

  IF to_regclass('public.visitor_feedback') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUIS BLOQUANT : table public.visitor_feedback absente.';
  END IF;

  IF to_regclass('public.expo_user_role') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUIS BLOQUANT : table public.expo_user_role absente.';
  END IF;

  IF to_regclass('public.agency_users') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUIS BLOQUANT : table public.agency_users absente.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. expos.deleted_at — non présent dans les migrations historiques, requis par l'app
-- ---------------------------------------------------------------------------
ALTER TABLE public.expos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.expos.deleted_at IS
  'Soft delete exposition (corbeille). NULL = active.';

CREATE INDEX IF NOT EXISTS idx_expos_deleted_at
  ON public.expos (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Helpers RLS (idempotents — remplace une version antérieure si présente)
--    search_path vide + qualification explicite (recommandation Supabase)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::integer,
    0
  ) BETWEEN 1 AND 3;
$$;

COMMENT ON FUNCTION public.rls_is_global_admin() IS
  'role_id JWT 1-3 (admin global). Migration officielle visitor_expo_visits.';

CREATE OR REPLACE FUNCTION public.rls_is_agency_staff_for(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.agency_id = p_agency_id
      AND au.role_id BETWEEN 4 AND 6
  );
$$;

COMMENT ON FUNCTION public.rls_is_agency_staff_for(uuid) IS
  'Staff agence role_id 4-6. Migration officielle visitor_expo_visits.';

REVOKE ALL ON FUNCTION public.rls_is_global_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_is_agency_staff_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_agency_staff_for(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. visitors.auth_user_id (colonnes hors migrations historiques → officialisée)
-- ---------------------------------------------------------------------------
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
    REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.visitors.auth_user_id IS
  'Lien optionnel vers auth.users (inscription / liaison visiteur).';

CREATE INDEX IF NOT EXISTS idx_visitors_auth_user_id
  ON public.visitors (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Trigger helper set_updated_at (création uniquement si absente)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
      AND p.pronargs = 0
  ) THEN
    EXECUTE $sql$
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = ''
      AS $fn$
      BEGIN
        NEW.updated_at := pg_catalog.now();
        RETURN NEW;
      END;
      $fn$;
    $sql$;
  END IF;
END $$;
