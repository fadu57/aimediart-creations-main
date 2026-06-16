-- migration_44_sponsors_rls_fix_and_columns.sql
-- ⚠️ Les politiques RLS ci-dessous utilisent auth.jwt() -> user_metadata (alerte linter 0015).
--    Appliquer ensuite migration_74_sponsors_rls_no_user_metadata.sql en production.
-- Corrections :
--   1. Ajout des colonnes manquantes (amount, currency)
--   2. Remplacement des politiques RLS pour inclure les admins globaux (role_id 1-3)
--      selon le pattern utilisé dans les autres migrations de ce projet.

-- ── 1. Colonnes manquantes ───────────────────────────────────────────────────

ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS amount   numeric NULL,
  ADD COLUMN IF NOT EXISTS currency text    NOT NULL DEFAULT 'EUR';

-- ── 2. Suppression des anciennes politiques ──────────────────────────────────

DROP POLICY IF EXISTS "sponsors_select_agency" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_write_agency"  ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_select_v2"     ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_write_v2"      ON public.sponsors;

-- ── 3. Bloc d'aide : admin check réutilisable ────────────────────────────────
-- Le même prédicat est répété dans USING et WITH CHECK (Postgres l'exige séparément).

-- ── 4. Nouvelles politiques ──────────────────────────────────────────────────

-- Lecture : admins globaux (JWT) OU membres de l'agence de l'expo
CREATE POLICY "sponsors_select_v2" ON public.sponsors
FOR SELECT TO authenticated
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role',
           auth.jwt() -> 'user_metadata' ->> 'role_name', '')
    IN ('admin_general', 'super_admin', 'developpeur')
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role',
              auth.jwt() -> 'app_metadata' ->> 'role_name', '')
    IN ('admin_general', 'super_admin', 'developpeur')
  OR id_expo IN (
    SELECT e.id FROM public.expos e
    JOIN public.agency_users au ON au.agency_id = e.agency_id
    WHERE au.user_id = auth.uid()
  )
);

-- Écriture (INSERT / UPDATE / DELETE) : même logique
CREATE POLICY "sponsors_write_v2" ON public.sponsors
FOR ALL TO authenticated
USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role',
           auth.jwt() -> 'user_metadata' ->> 'role_name', '')
    IN ('admin_general', 'super_admin', 'developpeur')
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role',
              auth.jwt() -> 'app_metadata' ->> 'role_name', '')
    IN ('admin_general', 'super_admin', 'developpeur')
  OR id_expo IN (
    SELECT e.id FROM public.expos e
    JOIN public.agency_users au ON au.agency_id = e.agency_id
    WHERE au.user_id = auth.uid()
  )
)
WITH CHECK (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role',
           auth.jwt() -> 'user_metadata' ->> 'role_name', '')
    IN ('admin_general', 'super_admin', 'developpeur')
  OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role',
              auth.jwt() -> 'app_metadata' ->> 'role_name', '')
    IN ('admin_general', 'super_admin', 'developpeur')
  OR id_expo IN (
    SELECT e.id FROM public.expos e
    JOIN public.agency_users au ON au.agency_id = e.agency_id
    WHERE au.user_id = auth.uid()
  )
);
