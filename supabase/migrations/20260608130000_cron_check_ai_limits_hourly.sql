-- Cron horaire : alertes limites IA → Edge Function check-ai-limits
-- Prérequis : pg_cron + pg_net + Vault secret service_role_key

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'check-ai-limits-hourly'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'check-ai-limits-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ladhkvghtnzpnqolxybb.supabase.co/functions/v1/check-ai-limits',
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
