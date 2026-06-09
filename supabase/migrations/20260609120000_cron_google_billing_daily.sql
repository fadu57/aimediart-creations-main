-- Cron quotidien : sync budgets Google Cloud → google_billing_cache
-- Prérequis : pg_cron, pg_net, Vault secret service_role_key
-- URL : /functions/v1/sync-google-billing

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'sync-google-billing-daily'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'sync-google-billing-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ladhkvghtnzpnqolxybb.supabase.co/functions/v1/sync-google-billing',
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
