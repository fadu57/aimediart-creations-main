-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Retrait de la clé obsolète ai_usage_stats au profit de public.ai_usage_logs
-- (à exécuter une fois si migration_28 avait déjà inséré cette ligne).

DELETE FROM public.app_settings WHERE key = 'ai_usage_stats';
