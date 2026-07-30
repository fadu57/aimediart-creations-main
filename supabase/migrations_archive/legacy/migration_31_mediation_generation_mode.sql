-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Mode de génération des médiations IA (page Configurations → Paramètres généraux).
-- Valeurs : { "mode": "single_plus_optional" } | { "mode": "all_languages" }

INSERT INTO public.app_settings (key, value)
VALUES (
  'settings_mediation_generation',
  '{"mode":"single_plus_optional"}'
)
ON CONFLICT (key) DO NOTHING;
