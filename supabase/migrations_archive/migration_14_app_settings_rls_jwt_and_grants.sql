-- migration_14_app_settings_rls_jwt_and_grants.sql
-- Objectif:
-- - Corriger les échecs d'INSERT/UPDATE via Supabase (GRANT + RLS).
-- - Ne pas dépendre d'un SELECT sur public.users dans la policy (souvent bloqué par RLS),
--   en autorisant aussi via les claims JWT (user_metadata/app_metadata).

BEGIN;

-- Sécurité: s'assure que la table existe
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Droits SQL (en plus de la RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT SELECT ON TABLE public.app_settings TO anon;

-- Remplace la policy par une version robuste:
-- - admin via role_id si accessible
-- - OU via role_name présent dans le JWT (user_metadata/app_metadata)
DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;

CREATE POLICY "app_settings_admin_all"
ON public.app_settings
FOR ALL
TO authenticated
USING (
  -- 1) Si public.users est lisible: on garde la source de vérité role_id
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 4)
  )
  OR
  -- 2) Fallback JWT: rôle porté par Supabase Auth (user_metadata/app_metadata)
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur', 'admin_agency'
  )
  OR
  COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur', 'admin_agency'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 4)
  )
  OR
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur', 'admin_agency'
  )
  OR
  COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role_name', '') IN (
    'admin_general', 'super_admin', 'developpeur', 'admin_agency'
  )
);

COMMIT;

