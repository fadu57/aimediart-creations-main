-- Cron mensuel : sync coût fixe Cursor → ai_usage_events
-- Prérequis Supabase : extensions pg_cron + pg_net activées
--
-- Secret Vault (interface 2025+) :
--   Dashboard → Settings (engrenage) → INTEGRATIONS → Vault (BETA)
--   → New secret → Name: service_role_key
--   → Value: clé service_role (Settings → API Keys → onglet
--     « Legacy anon, service_role API keys » → service_role → Reveal)
--
-- URL stable : /functions/v1/sync-cursor-costs

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'sync-cursor-costs-monthly'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'sync-cursor-costs-monthly',
  '0 8 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://ladhkvghtnzpnqolxybb.supabase.co/functions/v1/sync-cursor-costs',
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

-- Vault requis : secret name = service_role_key
-- (Settings → INTEGRATIONS → Vault → New secret)
