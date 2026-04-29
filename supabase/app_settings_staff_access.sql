-- À exécuter dans Supabase → SQL Editor (projet cible).
-- Corrige les 403 / « permission denied for table users » sur app_settings.
--
-- Problème : une policy RLS sur app_settings qui fait EXISTS (SELECT … FROM users …)
-- s’exécute avec les droits du rôle « authenticated ». Si la RLS sur `users` interdit
-- cette lecture, Postgres renvoie « permission denied for table users ».
--
-- Solution : une fonction SECURITY DEFINER qui lit `users` avec les droits du propriétaire
-- de la fonction (contourne la RLS sur users pour ce contrôle uniquement).

-- Prérequis : table public.users avec id (= auth.users.id) et role_id.
-- Adaptez la plage role_id si besoin.

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

COMMENT ON FUNCTION public.app_settings_is_staff() IS
  'Vérifie si l’utilisateur connecté est un rôle staff (1–6). Utilisé par les policies RLS sur app_settings.';

GRANT EXECUTE ON FUNCTION public.app_settings_is_staff() TO authenticated;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

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
