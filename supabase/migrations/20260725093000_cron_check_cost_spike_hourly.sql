-- Cron horaire : alerte hausse coût total (> 20 %) → Edge Function check-cost-spike
-- Prérequis : pg_cron + pg_net + Vault secret service_role_key

INSERT INTO public.app_settings (key, value)
VALUES (
  'cost_spike_monitor',
  '{"last_total_usd":0,"last_checked_at":null,"last_alert_at":null,"last_alert_from_usd":null,"last_alert_to_usd":null,"last_alert_pct":null}'
)
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'check-cost-spike-hourly'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'check-cost-spike-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ladhkvghtnzpnqolxybb.supabase.co/functions/v1/check-cost-spike',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
