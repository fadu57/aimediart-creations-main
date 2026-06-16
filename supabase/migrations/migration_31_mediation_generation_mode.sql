-- Mode de génération des médiations IA (page Configurations → Paramètres généraux).
-- Valeurs : { "mode": "single_plus_optional" } | { "mode": "all_languages" }

INSERT INTO public.app_settings (key, value)
VALUES (
  'settings_mediation_generation',
  '{"mode":"single_plus_optional"}'
)
ON CONFLICT (key) DO NOTHING;
