-- Journal des e-mails Étincelle (seuils visiteurs / essai) — dédoublonnage par clé.

CREATE TABLE IF NOT EXISTS public.etincelle_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etincelle_notification_log_unique UNIQUE (organisation_id, notification_key)
);

CREATE INDEX IF NOT EXISTS etincelle_notification_log_org_idx
  ON public.etincelle_notification_log (organisation_id, sent_at DESC);

COMMENT ON TABLE public.etincelle_notification_log IS
  'Trace des notifications e-mail Étincelle déjà envoyées (visiteurs 80/90/100 %, essai 80/90 %, veille de fin).';

ALTER TABLE public.etincelle_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etincelle_notification_log_service ON public.etincelle_notification_log;
CREATE POLICY etincelle_notification_log_service ON public.etincelle_notification_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON public.etincelle_notification_log TO service_role;
