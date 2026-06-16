-- =============================================================================
-- migration_25_users_triggers_and_get_my_role_cleanup.sql
-- À relire puis exécuter dans Supabase → SQL Editor (une transaction).
-- =============================================================================
--
-- Contexte (état des lieux) :
-- - Triggers / fonctions qui référencent de mauvais noms (user vs users, user_id vs id)
--   peuvent bloquer toute écriture sur public.users.
-- - get_my_role() doit lire public.users (clé = id = auth.uid()) et idéalement
--   joindre roles_user pour un libellé stable.
--
-- AVANT d’exécuter : vérifier les noms exacts des triggers sur public.users :
--   SELECT tgname, pg_get_triggerdef(oid)
--   FROM pg_trigger
--   WHERE tgrelid = 'public.users'::regclass
--     AND NOT tgisinternal;
--
-- Si les noms diffèrent de ceux ci-dessous, adaptez les DROP TRIGGER.
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Désactiver les automates cassés (noms à ajuster si besoin)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_role_updated ON public.users;
DROP TRIGGER IF EXISTS sync_user_role_to_metadata_trigger ON public.users;

-- Si le trigger porte un autre nom, ajoutez une ligne DROP TRIGGER ici.

-- ---------------------------------------------------------------------------
-- 2) Supprimer l’ancienne fonction de sync (recréée plus bas seulement si vous
--    en avez encore besoin — souvent on supprime et on gère le rôle uniquement
--    dans public.users + appli).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.sync_user_role_to_metadata() CASCADE;

-- Autres signatures possibles (décommenter si l’erreur indique des args) :
-- DROP FUNCTION IF EXISTS public.sync_user_role_to_metadata(uuid) CASCADE;

-- ---------------------------------------------------------------------------
-- 3) get_my_role() — lecture stable via public.users + roles_user
--    (SECURITY DEFINER + search_path figé = linter OK)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ru.label, ru.role_name, 'role_' || u.role_id::text, '')
  FROM public.users u
  LEFT JOIN public.roles_user ru ON ru.role_id = u.role_id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
  'Libellé de rôle (roles_user) pour l’utilisateur courant, via public.users.id = auth.uid().';

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) generate_artwork_fingerprint_sql — figer search_path sur toutes surcharge(s)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'generate_artwork_fingerprint_sql'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- Après exécution : contrôles manuels
-- =============================================================================
-- 1) Forcer votre profil (remplacer l’UUID par celui de Auth → Users) :
--
-- UPDATE public.users
-- SET role_id = 2
-- WHERE id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;
--
-- 2) Vérifier :
-- SELECT public.get_my_role();
--
-- 3) Si vous souhaitez réintroduire un trigger « sync vers JWT », préférez
--    en général une Edge Function (service role) plutôt qu’un trigger fragile
--    sur public.users, qui ne peut pas toujours écrire dans auth.users.
-- =============================================================================
