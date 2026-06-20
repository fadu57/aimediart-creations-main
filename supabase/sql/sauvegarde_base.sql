-- =============================================================================
-- AIMEDIArt — Sauvegarde base Supabase (PostgreSQL)
-- =============================================================================
--
-- IMPORTANT
-- ---------
-- Sur Supabase hébergé, une sauvegarde complète (schéma + données + fonctions
-- + RLS + triggers) ne s'exécute PAS depuis l'éditeur SQL.
-- Elle se fait avec pg_dump ou la CLI Supabase (voir scripts/backup-supabase-db.ps1).
--
-- Ce fichier sert à :
--   1. Inventorier l'état de la base AVANT / APRÈS une sauvegarde
--   2. Vérifier les tables métier critiques AIMEDIArt
--   3. Contrôler l'intégrité des volumes de données
--
-- Exécution : Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Inventaire des tables du schéma public
-- -----------------------------------------------------------------------------
SELECT
  schemaname AS schema,
  tablename  AS table_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)) AS taille
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass) DESC;


-- -----------------------------------------------------------------------------
-- 2. Comptages — tables métier AIMEDIArt (vérification post-sauvegarde)
-- -----------------------------------------------------------------------------
SELECT 'agencies'              AS table_name, COUNT(*) AS row_count FROM public.agencies
UNION ALL SELECT 'expos',                    COUNT(*) FROM public.expos
UNION ALL SELECT 'artworks',                 COUNT(*) FROM public.artworks
UNION ALL SELECT 'artists',                  COUNT(*) FROM public.artists
UNION ALL SELECT 'profiles',                COUNT(*) FROM public.profiles
UNION ALL SELECT 'agency_users',             COUNT(*) FROM public.agency_users
UNION ALL SELECT 'expo_user_role',          COUNT(*) FROM public.expo_user_role
UNION ALL SELECT 'visitor_feedback',        COUNT(*) FROM public.visitor_feedback
UNION ALL SELECT 'visitors',                COUNT(*) FROM public.visitors
UNION ALL SELECT 'visitor_expo_visits',     COUNT(*) FROM public.visitor_expo_visits
UNION ALL SELECT 'emotions',                COUNT(*) FROM public.emotions
UNION ALL SELECT 'prompt_style',            COUNT(*) FROM public.prompt_style
UNION ALL SELECT 'audio_files',             COUNT(*) FROM public.audio_files
UNION ALL SELECT 'daily_stats',             COUNT(*) FROM public.daily_stats
UNION ALL SELECT 'ai_usage_logs',           COUNT(*) FROM public.ai_usage_logs
UNION ALL SELECT 'ai_jobs',                 COUNT(*) FROM public.ai_jobs
ORDER BY table_name;


-- -----------------------------------------------------------------------------
-- 3. Fonctions et vues public (inventaire)
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  p.proname AS routine_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

SELECT
  schemaname AS schema,
  viewname   AS view_name
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;


-- -----------------------------------------------------------------------------
-- 4. Politiques RLS actives (schéma public)
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- -----------------------------------------------------------------------------
-- 5. Horodatage de la vérification (à noter dans votre journal de sauvegarde)
-- -----------------------------------------------------------------------------
SELECT
  now() AT TIME ZONE 'Europe/Paris' AS verification_heure_paris,
  current_database()                AS base,
  current_user                      AS utilisateur;


-- =============================================================================
-- RESTAURATION (rappel — à exécuter en local, PAS dans l'éditeur Supabase)
-- =============================================================================
--
-- psql "postgresql://postgres:[MOT_DE_PASSE]@db.[REF].supabase.co:5432/postgres" ^
--   -f "X:\1-AIMEDIART\Sauvegarde AIMEDIART\aimediart-db-backup_YYYY-MM-DD_HH-mm-ss.sql"
--
-- Ou via npm (recommandé si CLI Supabase connectée via GitHub) :
--   supabase login    -- connexion avec compte GitHub
--   supabase link     -- lier le projet local
--   npm run backup:supabase
--
-- Secours sans CLI : définir SUPABASE_DB_URL dans .env (mot de passe base,
-- Dashboard → Database — indépendant du login GitHub)
--
-- =============================================================================
