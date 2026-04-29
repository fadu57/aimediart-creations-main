-- =============================================================================
-- migration_24_supabase_linter_cleanup.sql
-- À exécuter dans Supabase → SQL Editor (tout le bloc d’un coup).
-- =============================================================================
--
-- Corrige les avertissements fréquents du linter Supabase :
-- - 0014 extension_in_public : voir section OPTIONNELLE en fin de fichier (unaccent)
-- - 0024 rls_policy_always_true : policies UPDATE/INSERT trop permissives
-- - (storage / auth : voir commentaires en fin — hors SQL ou dépend du dashboard)
--
-- Principes :
-- - Pas de auth.jwt() -> 'user_metadata' dans les policies (lint 0015)
-- - Contrôles via public.users (role_id, agency_id) + fonctions SECURITY DEFINER
--
-- Modèle métier « artistes » :
-- - Un artiste n’est pas « rattaché » à une agence sur la table artists.
-- - Chaque agence peut enrichir avec une bio adaptée dans artist_agency_details
--   (voir migration_23) — ce n’est pas une FK obligatoire sur artists.
-- - Les policies sur public.artists pour admin_agence (role_id=4) ne doivent donc PAS
--   exiger une ligne préalable dans artist_agency_details.
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fonctions réutilisables (search_path fixé)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_settings_is_staff()
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
      AND u.role_id IS NOT NULL
      AND u.role_id >= 1
      AND u.role_id <= 6
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_settings_is_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.artists_is_global_admin()
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

GRANT EXECUTE ON FUNCTION public.artists_is_global_admin() TO authenticated;

-- Admin agence (role_id = 4) avec agency_id renseigné : accès backoffice aux fiches
-- artists (catalogue global). La bio « par agence » reste dans artist_agency_details.
CREATE OR REPLACE FUNCTION public.artists_user_is_admin_agency()
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
      AND u.agency_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.artists_user_is_admin_agency() TO authenticated;

-- Anciennes signatures / logique obsolète (rattachement artiste→agence sur artists)
DROP FUNCTION IF EXISTS public.artists_user_is_admin_agency_for_row(uuid);
DROP FUNCTION IF EXISTS public.artists_user_agency_sees_artist(uuid);

-- ---------------------------------------------------------------------------
-- app_settings : retirer UPDATE « always true » si présent
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Ancienne policy souvent basée sur JWT / user_metadata (lint 0015) ou redondante
DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update_authenticated" ON public.app_settings;

-- Politiques staff (si déjà présentes, on les remplace)
DROP POLICY IF EXISTS "app_settings_select_staff" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert_staff" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update_staff" ON public.app_settings;

CREATE POLICY "app_settings_select_staff"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.app_settings_is_staff());

CREATE POLICY "app_settings_insert_staff"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (public.app_settings_is_staff());

CREATE POLICY "app_settings_update_staff"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (public.app_settings_is_staff())
WITH CHECK (public.app_settings_is_staff());

-- ---------------------------------------------------------------------------
-- artists : retirer policies dangereuses (anon / WITH CHECK true)
-- ---------------------------------------------------------------------------

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for anon" ON public.artists;
DROP POLICY IF EXISTS "public_insert_artists" ON public.artists;
DROP POLICY IF EXISTS "public_update_artists" ON public.artists;

-- Anciennes versions possibles (migration_15 / tests) — on nettoie pour éviter doublons + JWT metadata
DROP POLICY IF EXISTS "artists_admin_all" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_select" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_write" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_insert" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_update" ON public.artists;
DROP POLICY IF EXISTS "artists_agency_delete" ON public.artists;

-- Admins globaux (1–3) : tout sur artists
CREATE POLICY "artists_global_admin_all"
ON public.artists
FOR ALL
TO authenticated
USING (public.artists_is_global_admin())
WITH CHECK (public.artists_is_global_admin());

-- Admin agence (4) : lecture / écriture sur la fiche artiste (référentiel partagé).
-- La bio spécifique à une agence = table artist_agency_details (autres RLS).
CREATE POLICY "artists_agency_select"
ON public.artists
FOR SELECT
TO authenticated
USING (public.artists_user_is_admin_agency());

CREATE POLICY "artists_agency_insert"
ON public.artists
FOR INSERT
TO authenticated
WITH CHECK (public.artists_user_is_admin_agency());

CREATE POLICY "artists_agency_update"
ON public.artists
FOR UPDATE
TO authenticated
USING (public.artists_user_is_admin_agency())
WITH CHECK (public.artists_user_is_admin_agency());

CREATE POLICY "artists_agency_delete"
ON public.artists
FOR DELETE
TO authenticated
USING (public.artists_user_is_admin_agency());

-- ---------------------------------------------------------------------------
-- prompt_style : retirer UPDATE « always true »
-- ---------------------------------------------------------------------------

ALTER TABLE public.prompt_style ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_style_update_authenticated" ON public.prompt_style;

CREATE POLICY "prompt_style_update_staff"
ON public.prompt_style
FOR UPDATE
TO authenticated
USING (public.app_settings_is_staff())
WITH CHECK (public.app_settings_is_staff());

COMMIT;

-- =============================================================================
-- OPTIONNEL — Lint 0014 : extension unaccent dans le schéma public
-- =============================================================================
-- À n’exécuter QUE si vous pouvez valider les dépendances (vues, fonctions, index).
--
-- CREATE SCHEMA IF NOT EXISTS extensions;
-- ALTER EXTENSION unaccent SET SCHEMA extensions;
--
-- Puis mettre à jour les références SQL qui appellent unaccent(...) si besoin.
-- =============================================================================

-- =============================================================================
-- Hors SQL (dashboard Supabase)
-- =============================================================================
-- - Lint 0025 public_bucket_allows_listing : réduire la policy SELECT sur
--   storage.objects (ne pas exposer list = true sur tout le bucket), ou passer
--   en URLs signées / bucket privé selon votre modèle.
-- - auth_leaked_password_protection : activer dans Authentication → Settings.
-- =============================================================================
