-- Seuils présence configurables (app_settings) + clôture auto des sessions abandonnées

INSERT INTO public.app_settings (key, value)
VALUES (
  'settings_presence_thresholds',
  '{"organizer":{"activeMinutes":30,"abandonedHours":4},"visitor":{"activeMinutes":20,"abandonedHours":2}}'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.close_stale_error_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  org_abandoned interval;
  vis_abandoned interval;
  n_org integer := 0;
  n_vis integer := 0;
BEGIN
  SELECT value::jsonb INTO cfg
  FROM public.app_settings
  WHERE key = 'settings_presence_thresholds';

  org_abandoned := make_interval(
    hours => COALESCE((cfg -> 'organizer' ->> 'abandonedHours')::integer, 4)
  );
  vis_abandoned := make_interval(
    hours => COALESCE((cfg -> 'visitor' ->> 'abandonedHours')::integer, 2)
  );

  UPDATE public.organizer_error_sessions
  SET ended_at = GREATEST(last_activity_at, started_at)
  WHERE ended_at IS NULL
    AND last_activity_at < pg_catalog.now() - org_abandoned;
  GET DIAGNOSTICS n_org = ROW_COUNT;

  UPDATE public.visitor_error_sessions
  SET ended_at = GREATEST(last_activity_at, started_at)
  WHERE ended_at IS NULL
    AND last_activity_at < pg_catalog.now() - vis_abandoned;
  GET DIAGNOSTICS n_vis = ROW_COUNT;

  RETURN jsonb_build_object(
    'closed_organizer', n_org,
    'closed_visitor', n_vis,
    'ran_at', pg_catalog.now()
  );
END;
$$;

COMMENT ON FUNCTION public.close_stale_error_sessions() IS
  'Clôture les sessions ouvertes dont last_activity_at dépasse le seuil « abandonnée » (settings_presence_thresholds).';

REVOKE ALL ON FUNCTION public.close_stale_error_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_stale_error_sessions() TO service_role;

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'close-stale-error-sessions-hourly'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'close-stale-error-sessions-hourly',
  '15 * * * *',
  $$SELECT public.close_stale_error_sessions();$$
);
