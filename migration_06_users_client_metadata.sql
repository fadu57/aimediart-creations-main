-- migration_06_users_client_metadata.sql
-- Ajoute des colonnes optionnelles de traçage client sur public.users.
-- Toutes les colonnes sont NULLABLE pour ne pas bloquer les lignes existantes.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_ip_address text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS os_name text,
  ADD COLUMN IF NOT EXISTS browser_name text;

COMMENT ON COLUMN public.users.last_ip_address IS 'Dernière adresse IP connue (saisie côté app, pas garantie exacte).';
COMMENT ON COLUMN public.users.device_type IS 'Type d’appareil (ex. mobile, desktop).';
COMMENT ON COLUMN public.users.os_name IS 'Système d’exploitation détecté.';
COMMENT ON COLUMN public.users.browser_name IS 'Navigateur détecté.';

COMMIT;

-- Si votre schéma utilise public.profiles au lieu de public.users, exécutez :
-- ALTER TABLE public.profiles
--   ADD COLUMN IF NOT EXISTS last_ip_address text,
--   ADD COLUMN IF NOT EXISTS device_type text,
--   ADD COLUMN IF NOT EXISTS os_name text,
--   ADD COLUMN IF NOT EXISTS browser_name text;
