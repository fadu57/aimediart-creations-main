-- Optionnel : empreinte FingerprintJS (après consentement) pour corrélation des visites anonymes.
-- Exécuter sur le projet Supabase si vous souhaitez remplir guest_visits.device_fingerprint.

ALTER TABLE public.guest_visits
  ADD COLUMN IF NOT EXISTS device_fingerprint text NULL;

CREATE INDEX IF NOT EXISTS idx_guest_visits_device_fingerprint ON public.guest_visits (device_fingerprint);
