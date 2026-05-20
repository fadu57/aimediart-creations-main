-- Retrait de la clé obsolète ai_usage_stats au profit de public.ai_usage_logs
-- (à exécuter une fois si migration_28 avait déjà inséré cette ligne).

DELETE FROM public.app_settings WHERE key = 'ai_usage_stats';
