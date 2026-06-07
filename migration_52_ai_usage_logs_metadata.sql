-- Métadonnées optionnelles sur ai_usage_logs (job_type, source_function, usage_missing, etc.)
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_usage_logs.metadata IS
  'Contexte d''appel (job_type, source_function, usage_missing, …).';
