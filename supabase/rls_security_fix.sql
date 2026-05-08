-- =============================================================================
-- rls_security_fix.sql — Correction sécurité Supabase (alerte 03/05/2026)
-- Nouveau schéma : public.profiles / agency_users / expo_user_role (PAS public.users)
--
-- À exécuter en une seule fois dans Supabase → SQL Editor.
--
-- Ce script :
--   1. Recrée les fonctions RLS en utilisant le NOUVEAU schéma (JWT + agency_users)
--   2. Active RLS sur toutes les tables publiques sensibles
--   3. Crée des politiques cohérentes pour chaque table
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Suppression des ANCIENNES fonctions qui référencent public.users
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.rls_is_global_admin() CASCADE;
DROP FUNCTION IF EXISTS public.rls_current_user_agency_id() CASCADE;
DROP FUNCTION IF EXISTS public.rls_is_admin_agency() CASCADE;
DROP FUNCTION IF EXISTS public.rls_artworks_agency_matches(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.rls_expos_agency_matches(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.rls_agencies_row_is_mine(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.app_settings_is_staff() CASCADE;
DROP FUNCTION IF EXISTS public.matrice_securite_is_staff() CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Nouvelles fonctions RLS — basées sur JWT (app_metadata) + agency_users
--    SECURITY DEFINER pour éviter les boucles RLS sur agency_users
-- ---------------------------------------------------------------------------

-- Admin global : role_id 1-3 dans app_metadata du JWT (aucune requête DB)
CREATE OR REPLACE FUNCTION public.rls_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::integer,
    0
  ) BETWEEN 1 AND 3;
$$;

COMMENT ON FUNCTION public.rls_is_global_admin() IS
  'Vrai si role_id 1-3 dans app_metadata JWT (admin_general / super_admin / developpeur). Aucune lecture DB.';

-- Staff : global admin OU rôle métier 4-6 dans agency_users
CREATE OR REPLACE FUNCTION public.rls_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role_id')::integer, 0) BETWEEN 1 AND 3
    OR EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE user_id = auth.uid()
        AND role_id BETWEEN 4 AND 6
    );
$$;

COMMENT ON FUNCTION public.rls_is_staff() IS
  'Vrai si rôle 1-6 (global admin via JWT ou rôle agence via agency_users).';

-- agency_id principal de l'utilisateur courant (premier rang le plus élevé)
CREATE OR REPLACE FUNCTION public.rls_current_agency_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id
  FROM public.agency_users
  WHERE user_id = auth.uid()
  ORDER BY role_id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.rls_current_agency_id() IS
  'agency_id principal de l''utilisateur courant (role_id le plus bas = rang le plus élevé).';

-- Vrai si l'utilisateur est staff au sein d'une agence donnée (role_id 4-6)
CREATE OR REPLACE FUNCTION public.rls_is_agency_staff_for(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_users
    WHERE user_id = auth.uid()
      AND agency_id = p_agency_id
      AND role_id BETWEEN 4 AND 6
  );
$$;

COMMENT ON FUNCTION public.rls_is_agency_staff_for(uuid) IS
  'Vrai si l''utilisateur a un rôle 4-6 dans l''agence donnée.';

-- Vrai si l'utilisateur peut accéder à une agence (global admin OU membre de cette agence)
CREATE OR REPLACE FUNCTION public.rls_can_access_agency(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.rls_is_global_admin()
    OR public.rls_is_agency_staff_for(p_agency_id);
$$;

COMMENT ON FUNCTION public.rls_can_access_agency(uuid) IS
  'Vrai si l''utilisateur est admin global ou membre de cette agence.';

-- Accorde les droits d'exécution
GRANT EXECUTE ON FUNCTION public.rls_is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_current_agency_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_is_agency_staff_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_can_access_agency(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Suppression des politiques existantes sur les tables concernées
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'profiles', 'agency_users', 'expo_user_role',
        'agencies', 'expos', 'artists', 'artworks',
        'retention_settings', 'roles_user',
        'matrice_securite', 'matrice_navigation', 'app_settings'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Activation RLS sur toutes les tables sensibles
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expo_user_role    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artworks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matrice_securite  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;

-- app_settings et matrice_navigation : activer si ces tables existent
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings') THEN
    EXECUTE 'ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matrice_navigation') THEN
    EXECUTE 'ALTER TABLE public.matrice_navigation ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Droits de base pour le rôle authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_users      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expo_user_role    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expos             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artworks          TO authenticated;
GRANT SELECT                         ON public.roles_user        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matrice_securite  TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.retention_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. PROFILES — chaque user lit/modifie son propre profil ; global admin lit tout
-- ---------------------------------------------------------------------------

CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.rls_is_global_admin());

CREATE POLICY "profiles_insert_own_or_admin"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.rls_is_global_admin());

CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.rls_is_global_admin())
WITH CHECK (id = auth.uid() OR public.rls_is_global_admin());

CREATE POLICY "profiles_delete_admin_only"
ON public.profiles FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 5. AGENCY_USERS — un user voit ses propres lignes + les membres de son agence (staff)
-- ---------------------------------------------------------------------------

CREATE POLICY "agency_users_select"
ON public.agency_users FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(agency_id)
);

CREATE POLICY "agency_users_insert"
ON public.agency_users FOR INSERT TO authenticated
WITH CHECK (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(agency_id)
);

CREATE POLICY "agency_users_update"
ON public.agency_users FOR UPDATE TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "agency_users_delete"
ON public.agency_users FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 6. EXPO_USER_ROLE — un user voit ses propres lignes ; staff voit les lignes de son agence
-- ---------------------------------------------------------------------------

CREATE POLICY "expo_user_role_select"
ON public.expo_user_role FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.rls_is_global_admin()
  OR EXISTS (
    SELECT 1 FROM public.expos e
    WHERE e.id = expo_user_role.expo_id
      AND public.rls_is_agency_staff_for(e.agency_id)
  )
);

CREATE POLICY "expo_user_role_insert"
ON public.expo_user_role FOR INSERT TO authenticated
WITH CHECK (
  public.rls_is_global_admin()
  OR EXISTS (
    SELECT 1 FROM public.expos e
    WHERE e.id = expo_id
      AND public.rls_is_agency_staff_for(e.agency_id)
  )
);

CREATE POLICY "expo_user_role_update"
ON public.expo_user_role FOR UPDATE TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "expo_user_role_delete"
ON public.expo_user_role FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 7. AGENCIES — global admin : tout ; staff agence : lecture + mise à jour de son agence
-- ---------------------------------------------------------------------------

CREATE POLICY "agencies_select"
ON public.agencies FOR SELECT TO authenticated
USING (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(id)
);

CREATE POLICY "agencies_insert"
ON public.agencies FOR INSERT TO authenticated
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "agencies_update"
ON public.agencies FOR UPDATE TO authenticated
USING (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(id)
)
WITH CHECK (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(id)
);

CREATE POLICY "agencies_delete"
ON public.agencies FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 8. EXPOS — global admin : tout ; staff agence : CRUD sur ses expos
-- ---------------------------------------------------------------------------

CREATE POLICY "expos_select"
ON public.expos FOR SELECT TO authenticated
USING (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(agency_id)
);

CREATE POLICY "expos_insert"
ON public.expos FOR INSERT TO authenticated
WITH CHECK (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(agency_id)
);

CREATE POLICY "expos_update"
ON public.expos FOR UPDATE TO authenticated
USING (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(agency_id)
)
WITH CHECK (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(agency_id)
);

CREATE POLICY "expos_delete"
ON public.expos FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 9. ARTISTS — global admin : tout ; staff authentifié : lecture + modification
--    Note : si la table artists n'a pas de colonne agency_id directe,
--    la politique utilise un périmètre large "staff authentifié".
--    Ajuster si une colonne agency_id existe sur artists.
-- ---------------------------------------------------------------------------

CREATE POLICY "artists_select_staff"
ON public.artists FOR SELECT TO authenticated
USING (public.rls_is_staff());

CREATE POLICY "artists_insert_staff"
ON public.artists FOR INSERT TO authenticated
WITH CHECK (public.rls_is_staff());

CREATE POLICY "artists_update_staff"
ON public.artists FOR UPDATE TO authenticated
USING (public.rls_is_staff())
WITH CHECK (public.rls_is_staff());

CREATE POLICY "artists_delete_admin"
ON public.artists FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 10. ARTWORKS — global admin : tout ; staff agence : CRUD sur artwork_agency_id
-- ---------------------------------------------------------------------------

CREATE POLICY "artworks_select"
ON public.artworks FOR SELECT TO authenticated
USING (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(artwork_agency_id)
);

CREATE POLICY "artworks_insert"
ON public.artworks FOR INSERT TO authenticated
WITH CHECK (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(artwork_agency_id)
);

CREATE POLICY "artworks_update"
ON public.artworks FOR UPDATE TO authenticated
USING (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(artwork_agency_id)
)
WITH CHECK (
  public.rls_is_global_admin()
  OR public.rls_is_agency_staff_for(artwork_agency_id)
);

CREATE POLICY "artworks_delete"
ON public.artworks FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 11. ROLES_USER — lecture seule pour tout utilisateur connecté
-- ---------------------------------------------------------------------------

CREATE POLICY "roles_user_select_authenticated"
ON public.roles_user FOR SELECT TO authenticated
USING (true);

-- ---------------------------------------------------------------------------
-- 12. MATRICE_SECURITE — lecture : tous staff ; écriture : admin global
-- ---------------------------------------------------------------------------

CREATE POLICY "matrice_securite_select_staff"
ON public.matrice_securite FOR SELECT TO authenticated
USING (public.rls_is_staff());

CREATE POLICY "matrice_securite_write_admin"
ON public.matrice_securite FOR ALL TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 13. RETENTION_SETTINGS — lecture/écriture : admin global (role_id 1-3) seulement
-- ---------------------------------------------------------------------------

CREATE POLICY "retention_settings_select_admin"
ON public.retention_settings FOR SELECT TO authenticated
USING (public.rls_is_global_admin());

CREATE POLICY "retention_settings_insert_admin"
ON public.retention_settings FOR INSERT TO authenticated
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "retention_settings_update_admin"
ON public.retention_settings FOR UPDATE TO authenticated
USING (public.rls_is_global_admin())
WITH CHECK (public.rls_is_global_admin());

CREATE POLICY "retention_settings_delete_admin"
ON public.retention_settings FOR DELETE TO authenticated
USING (public.rls_is_global_admin());

-- ---------------------------------------------------------------------------
-- 14. APP_SETTINGS et MATRICE_NAVIGATION (si tables existantes)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  -- app_settings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings') THEN
    EXECUTE $pol$
      CREATE POLICY "app_settings_select_staff"
      ON public.app_settings FOR SELECT TO authenticated
      USING (public.rls_is_staff());

      CREATE POLICY "app_settings_write_admin"
      ON public.app_settings FOR ALL TO authenticated
      USING (public.rls_is_global_admin())
      WITH CHECK (public.rls_is_global_admin());
    $pol$;
  END IF;

  -- matrice_navigation
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matrice_navigation') THEN
    EXECUTE $pol$
      CREATE POLICY "matrice_navigation_select_authenticated"
      ON public.matrice_navigation FOR SELECT TO authenticated
      USING (true);

      CREATE POLICY "matrice_navigation_write_admin"
      ON public.matrice_navigation FOR ALL TO authenticated
      USING (public.rls_is_global_admin())
      WITH CHECK (public.rls_is_global_admin());
    $pol$;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Récapitulatif des tables couvertes et des politiques créées
-- =============================================================================
--
-- FONCTIONS CRÉÉES (nouveau schéma, sans public.users) :
--   rls_is_global_admin()         → role_id 1-3 dans app_metadata JWT
--   rls_is_staff()                → rôle 1-6 (JWT + agency_users)
--   rls_current_agency_id()       → agency_id principal de l'utilisateur
--   rls_is_agency_staff_for(uuid) → membre actif d'une agence donnée
--   rls_can_access_agency(uuid)   → admin global OU membre agence
--
-- TABLES PROTÉGÉES :
--   profiles          → lecture/écriture du profil propre + admin global
--   agency_users      → membres de l'agence + admin global
--   expo_user_role    → propres lignes + staff agence + admin global
--   agencies          → staff agence (lecture+update) + admin global (tout)
--   expos             → staff agence + admin global
--   artists           → tout staff (lecture+CRUD) + admin global (delete)
--   artworks          → staff agence (artwork_agency_id) + admin global
--   roles_user        → lecture seule pour tous les connectés
--   matrice_securite  → lecture staff + écriture admin global
--   retention_settings → admin global seulement
--   app_settings      → lecture staff + écriture admin global
--   matrice_navigation → lecture tous connectés + écriture admin global
--
-- IMPORTANT : vérifiez que raw_app_meta_data.role_id est bien renseigné pour
-- les comptes admin_general (role_id 1), super_admin (2), developpeur (3).
-- Sans cela, rls_is_global_admin() retournera false pour ces comptes.
--
-- Pour vérifier : SELECT auth.jwt() -> 'app_metadata'; dans une session connectée.
-- =============================================================================
