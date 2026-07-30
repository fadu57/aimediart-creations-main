-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Optionnel : empreinte FingerprintJS (après consentement) pour corrélation des visites anonymes.
-- Exécuter sur le projet Supabase si vous souhaitez remplir guest_visits.device_fingerprint.

ALTER TABLE public.guest_visits
  ADD COLUMN IF NOT EXISTS device_fingerprint text NULL;

CREATE INDEX IF NOT EXISTS idx_guest_visits_device_fingerprint ON public.guest_visits (device_fingerprint);
