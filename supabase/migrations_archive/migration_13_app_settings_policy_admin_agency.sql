-- migration_13_app_settings_policy_admin_agency.sql
-- Étend l'accès à app_settings aux admins agence (role_id=4).

BEGIN;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;

CREATE POLICY "app_settings_admin_all"
ON public.app_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 4)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2, 4)
  )
);

COMMIT;

