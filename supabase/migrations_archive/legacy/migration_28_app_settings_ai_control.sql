-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Pilotage IA : clés fondamentales dans public.app_settings
-- Exécuter une fois sur Supabase (SQL Editor ou CLI).

BEGIN;

INSERT INTO public.app_settings (key, value, max_caract, max_tokens)
VALUES
  (
    'selected_ai_model',
    'gemini-2.5-flash',
    NULL,
    1000000
  ),
  (
    'available_models_cache',
    '[]',
    NULL,
    NULL
  )
ON CONFLICT (key) DO NOTHING;

COMMIT;
