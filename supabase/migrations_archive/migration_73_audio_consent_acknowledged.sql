-- Migration 73 : consentement audio déclaratif (remplace la détection écouteurs)

ALTER TABLE public.visitor_audio_presence
  ADD COLUMN IF NOT EXISTS audio_consent_acknowledged boolean;

COMMENT ON COLUMN public.visitor_audio_presence.audio_consent_acknowledged IS
  'True si le visiteur a accepté les règles audio en expo intérieure (approche déclarative).';

-- Nettoie les anciennes valeurs de détection matérielle obsolètes
UPDATE public.visitor_audio_presence
SET headphones_detected = NULL
WHERE headphones_detected IS NOT NULL;
