-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Métadonnées optionnelles sur ai_usage_logs (job_type, source_function, usage_missing, etc.)
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_usage_logs.metadata IS
  'Contexte d''appel (job_type, source_function, usage_missing, …).';
