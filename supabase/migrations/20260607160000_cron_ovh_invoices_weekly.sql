-- Cron hebdomadaire : sync factures OVH via API (lundi 9h UTC)

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'ovh-sync-invoices-weekly' LIMIT 1;
  IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;
END;
$$;

SELECT cron.schedule(
  'ovh-sync-invoices-weekly',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://ladhkvghtnzpnqolxybb.supabase.co/functions/v1/ovh-sync-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
