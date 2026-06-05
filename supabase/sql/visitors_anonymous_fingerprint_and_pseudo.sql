-- ============================================================================
-- PARTIE 1 / 2 — Visiteurs anonymes (empreinte + inscription)
--
-- À exécuter EN PREMIER sur Supabase. Ne dépend pas de `pseudo_pool`.
-- Ensuite exécuter : supabase/sql/visitors_pseudo_pool_rpc.sql
--
-- Fonctions créées :
--   - register_anonymous_visitor
--   - confirm_visitor_pseudo_from_client
-- ============================================================================

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS visitor_client_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS client_locale text,
  ADD COLUMN IF NOT EXISTS client_timezone text,
  ADD COLUMN IF NOT EXISTS screen_resolution text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fingerprint_source text;

COMMENT ON COLUMN public.visitors.fingerprint_source IS 'ex. fingerprintjs_visitor_id lorsque fingerprint = visitorId FingerprintJS.';
COMMENT ON COLUMN public.visitors.visitor_client_id IS 'UUID navigateur stable (session persistante) — hors auth Supabase.';
COMMENT ON COLUMN public.visitors.user_agent IS 'Analytics uniquement — non utilisé pour reconnaître un visiteur (lookup : fingerprint FingerprintJS + visitor_client_id).';
COMMENT ON COLUMN public.visitors.fingerprint IS 'visitorId FingerprintJS (même navigateur / profil). Distinct du hash UA utilisé ailleurs pour le tracking inscription.';

CREATE INDEX IF NOT EXISTS idx_visitors_visitor_client_id ON public.visitors USING btree (visitor_client_id);

CREATE OR REPLACE FUNCTION public.register_anonymous_visitor(
  p_visitor_client_id text DEFAULT NULL::text,
  p_fingerprint text DEFAULT NULL::text,
  p_fingerprint_source text DEFAULT 'fingerprintjs_visitor_id'::text,
  p_user_agent text DEFAULT NULL::text,
  p_client_locale text DEFAULT NULL::text,
  p_client_timezone text DEFAULT NULL::text,
  p_screen_resolution text DEFAULT NULL::text,
  p_ip_address text DEFAULT NULL::text,
  p_browser_name text DEFAULT NULL::text,
  p_device_type text DEFAULT NULL::text,
  p_country text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  fp text := nullif(trim(p_fingerprint), '');
  cid text := nullif(trim(p_visitor_client_id), '');
BEGIN
  IF fp IS NOT NULL THEN
    SELECT v.id INTO v_id FROM public.visitors v WHERE v.fingerprint = fp LIMIT 1;
  END IF;

  IF v_id IS NULL AND cid IS NOT NULL THEN
    SELECT v.id INTO v_id FROM public.visitors v WHERE v.visitor_client_id = cid LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.visitors v
    SET
      visitor_name = 'Anonymous',
      last_seen_at = now(),
      fingerprint = COALESCE(fp, v.fingerprint),
      fingerprint_source = CASE
        WHEN fp IS NOT NULL THEN nullif(trim(p_fingerprint_source), '')
        ELSE v.fingerprint_source
      END,
      visitor_client_id = COALESCE(cid, v.visitor_client_id),
      user_agent = COALESCE(substring(nullif(trim(p_user_agent), ''), 1, 4000), v.user_agent),
      client_locale = COALESCE(left(nullif(trim(p_client_locale), ''), 32), v.client_locale),
      client_timezone = COALESCE(left(nullif(trim(p_client_timezone), ''), 128), v.client_timezone),
      screen_resolution = COALESCE(left(nullif(trim(p_screen_resolution), ''), 64), v.screen_resolution),
      ip_address = COALESCE(left(nullif(trim(p_ip_address), ''), 256), v.ip_address),
      browser_name = COALESCE(left(nullif(trim(p_browser_name), ''), 128), v.browser_name),
      device_type = COALESCE(left(nullif(trim(p_device_type), ''), 64), v.device_type),
      country = COALESCE(left(nullif(trim(p_country), ''), 128), v.country),
      city = COALESCE(left(nullif(trim(p_city), ''), 128), v.city)
    WHERE v.id = v_id
    RETURNING v.id INTO v_id;

    RETURN v_id;
  END IF;

  INSERT INTO public.visitors (
    visitor_name,
    visitor_client_id,
    fingerprint,
    fingerprint_source,
    user_agent,
    client_locale,
    client_timezone,
    screen_resolution,
    ip_address,
    browser_name,
    device_type,
    country,
    city,
    last_seen_at
  )
  VALUES (
    'Anonymous',
    cid,
    fp,
    CASE WHEN fp IS NOT NULL THEN nullif(trim(p_fingerprint_source), '') ELSE NULL END,
    substring(nullif(trim(p_user_agent), ''), 1, 4000),
    left(nullif(trim(p_client_locale), ''), 32),
    left(nullif(trim(p_client_timezone), ''), 128),
    left(nullif(trim(p_screen_resolution), ''), 64),
    left(nullif(trim(p_ip_address), ''), 256),
    left(nullif(trim(p_browser_name), ''), 128),
    left(nullif(trim(p_device_type), ''), 64),
    left(nullif(trim(p_country), ''), 128),
    left(nullif(trim(p_city), ''), 128),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_visitor_pseudo_from_client(p_visitor_client_id text, p_pseudo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  ps text := nullif(trim(p_pseudo), '');
  cid text := nullif(trim(p_visitor_client_id), '');
BEGIN
  IF cid IS NULL OR ps IS NULL THEN
    RAISE EXCEPTION 'visitor_client_id et pseudo requis';
  END IF;

  IF length(ps) > 80 THEN
    RAISE EXCEPTION 'pseudo trop long (max 80)';
  END IF;

  UPDATE public.visitors v
  SET visitor_pseudo = substring(ps FROM 1 FOR 80)
  WHERE v.visitor_client_id = cid
  RETURNING v.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'visiteur introuvable pour ce visitor_client_id';
  END IF;

  RETURN v_id;
END;
$$;

-- Grants : signature exacte autodétectée (évite l’erreur 42883 sur GRANT manuel).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        (p.proname = 'register_anonymous_visitor' AND p.pronargs = 13)
        OR (p.proname = 'confirm_visitor_pseudo_from_client' AND p.pronargs = 2)
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$$;
