-- ============================================================================
-- Visiteurs anonymes — empreinte appareil cross-navigateur (device_fingerprint)
--
-- Prérequis : visitors_anonymous_fingerprint_and_pseudo.sql
--
-- Objectif :
--   Ajouter un 3ᵉ signal d'identification dans `register_anonymous_visitor` :
--   un hash hardware/OS (résolution, CPU, timezone…) stable quel que soit le
--   navigateur utilisé sur le même appareil.
--
--   Ordre de reconnaissance :
--     1. fingerprint  (FingerprintJS visitorId — précis, mono-navigateur)
--     2. visitor_client_id (UUID localStorage — précis, mono-navigateur)
--     3. device_fingerprint (hardware hash — probabiliste, cross-navigateur)
-- ============================================================================

-- Colonne + index
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS device_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_visitors_device_fingerprint
  ON public.visitors (device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.visitors.device_fingerprint IS
  'Hash 32 chars des signaux hardware/OS (résolution×couleur, CPU, timezone, touchpoints, plateforme). Stable cross-navigateur sur le même appareil. Reconnaissance probabiliste uniquement.';

-- ============================================================================
-- register_anonymous_visitor — version étendue avec p_device_fingerprint
-- Remplace la version précédente (même nom, +1 paramètre, DEFAULT NULL).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_anonymous_visitor(
  p_visitor_client_id  text    DEFAULT NULL,
  p_fingerprint        text    DEFAULT NULL,
  p_fingerprint_source text    DEFAULT 'fingerprintjs_visitor_id',
  p_user_agent         text    DEFAULT NULL,
  p_client_locale      text    DEFAULT NULL,
  p_client_timezone    text    DEFAULT NULL,
  p_screen_resolution  text    DEFAULT NULL,
  p_ip_address         text    DEFAULT NULL,
  p_browser_name       text    DEFAULT NULL,
  p_device_type        text    DEFAULT NULL,
  p_country            text    DEFAULT NULL,
  p_city               text    DEFAULT NULL,
  p_device_fingerprint text    DEFAULT NULL   -- nouveau paramètre
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id  uuid;
  fp    text := nullif(trim(p_fingerprint), '');
  cid   text := nullif(trim(p_visitor_client_id), '');
  dfp   text := nullif(trim(p_device_fingerprint), '');
BEGIN
  -- 1. Recherche par FingerprintJS visitorId (précis, mono-navigateur)
  IF fp IS NOT NULL THEN
    SELECT v.id INTO v_id FROM public.visitors v WHERE v.fingerprint = fp LIMIT 1;
  END IF;

  -- 2. Recherche par UUID navigateur localStorage (précis, mono-navigateur)
  IF v_id IS NULL AND cid IS NOT NULL THEN
    SELECT v.id INTO v_id FROM public.visitors v WHERE v.visitor_client_id = cid LIMIT 1;
  END IF;

  -- 3. Recherche par device_fingerprint (probabiliste, cross-navigateur)
  --    N'est utilisée que si les deux premiers ont échoué ET que le hash n'est pas vide.
  IF v_id IS NULL AND dfp IS NOT NULL THEN
    SELECT v.id INTO v_id FROM public.visitors v WHERE v.device_fingerprint = dfp LIMIT 1;
  END IF;

  -- Mise à jour si trouvé
  IF v_id IS NOT NULL THEN
    UPDATE public.visitors v
    SET
      last_seen_at        = now(),
      fingerprint         = COALESCE(fp,  v.fingerprint),
      fingerprint_source  = CASE
                              WHEN fp IS NOT NULL THEN nullif(trim(p_fingerprint_source), '')
                              ELSE v.fingerprint_source
                            END,
      visitor_client_id   = COALESCE(cid, v.visitor_client_id),
      device_fingerprint  = COALESCE(dfp, v.device_fingerprint),
      user_agent          = COALESCE(substring(nullif(trim(p_user_agent), ''), 1, 4000), v.user_agent),
      client_locale       = COALESCE(left(nullif(trim(p_client_locale), ''), 32),  v.client_locale),
      client_timezone     = COALESCE(left(nullif(trim(p_client_timezone), ''), 128), v.client_timezone),
      screen_resolution   = COALESCE(left(nullif(trim(p_screen_resolution), ''), 64), v.screen_resolution),
      ip_address          = COALESCE(left(nullif(trim(p_ip_address), ''), 256),    v.ip_address),
      browser_name        = COALESCE(left(nullif(trim(p_browser_name), ''), 128),  v.browser_name),
      device_type         = COALESCE(left(nullif(trim(p_device_type), ''), 64),    v.device_type),
      country             = COALESCE(left(nullif(trim(p_country), ''), 128),       v.country),
      city                = COALESCE(left(nullif(trim(p_city), ''), 128),          v.city)
    WHERE v.id = v_id
    RETURNING v.id INTO v_id;

    RETURN v_id;
  END IF;

  -- Création nouveau visiteur
  INSERT INTO public.visitors (
    visitor_name, visitor_client_id, fingerprint, fingerprint_source,
    device_fingerprint,
    user_agent, client_locale, client_timezone, screen_resolution,
    ip_address, browser_name, device_type, country, city, last_seen_at
  )
  VALUES (
    'Anonymous', cid, fp,
    CASE WHEN fp IS NOT NULL THEN nullif(trim(p_fingerprint_source), '') ELSE NULL END,
    dfp,
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

-- Grants (détection automatique de la signature à 13 params)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_anonymous_visitor'
      AND p.pronargs = 13
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;
