-- Plafond caractères / tokens pour certains prompts (ex. analyse d'image dans app_settings).
BEGIN;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS max_caract numeric,
  ADD COLUMN IF NOT EXISTS max_tokens numeric;

COMMENT ON COLUMN public.app_settings.max_caract IS 'Plafond souhaité en caractères pour le résultat (saisie UI).';
COMMENT ON COLUMN public.app_settings.max_tokens IS 'Équivalent tokens de sortie (dérivé de max_caract), utilisé par l’Edge Function.';

COMMIT;
