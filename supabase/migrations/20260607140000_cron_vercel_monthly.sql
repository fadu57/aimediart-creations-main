-- Cron mensuel : sync coût fixe Vercel → ai_usage_events (plan Pro uniquement)
-- Prérequis : secret Vault service_role_key (voir 20260607120000_cron_cursor_monthly.sql)

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'sync-vercel-costs-monthly'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'sync-vercel-costs-monthly',
  '10 8 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://ladhkvghtnzpnqolxybb.supabase.co/functions/v1/sync-vercel-costs',
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
