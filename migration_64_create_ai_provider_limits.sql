-- =============================================================================
-- migration_64_create_ai_provider_limits.sql
-- Limites API IA (Groq / Gemini) + historique alertes + vue temps réel
--
-- Source de consommation : public.ai_usage_logs (pas ai_calls).
--   provider text, model_id text, total_tokens int, created_at timestamptz, metadata jsonb
--
-- Prérequis : public.rls_is_global_admin() (supabase/rls_security_fix.sql)
-- =============================================================================

-- Index performance sur les logs existants
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider_created_at
  ON public.ai_usage_logs (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider_model_created_at
  ON public.ai_usage_logs (provider, model_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 1) Table des limites configurées
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_provider_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('groq', 'gemini')),
  model text NULL,
  limit_type text NOT NULL CHECK (limit_type IN ('TPM', 'TPD', 'RPM', 'RPD', 'ASH', 'ASD')),
  limit_value integer NOT NULL CHECK (limit_value > 0),
  alert_threshold_warning numeric NOT NULL DEFAULT 0.80
    CHECK (alert_threshold_warning > 0 AND alert_threshold_warning < 1),
  alert_threshold_critical numeric NOT NULL DEFAULT 0.95
    CHECK (alert_threshold_critical > 0 AND alert_threshold_critical <= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_provider_limits_provider_model_type_unique
    UNIQUE (provider, model, limit_type)
);

COMMENT ON TABLE public.ai_provider_limits IS
  'Plafonds API IA par fournisseur / modèle (tier Free documenté Groq & Gemini).';

-- ---------------------------------------------------------------------------
-- 2) Historique des alertes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_limit_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NULL,
  limit_type text NOT NULL,
  usage_pct numeric NOT NULL,
  alert_level text NOT NULL CHECK (alert_level IN ('warning', 'critical', 'blocked')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  notified_email boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ai_limit_alerts_lookup
  ON public.ai_limit_alerts (provider, model, limit_type, alert_level, sent_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Helper : fenêtre temporelle + filtre modèle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_limit_matches_model(p_model_limit text, p_model_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_model_limit IS NULL
    OR p_model_id = p_model_limit
    OR p_model_id ILIKE p_model_limit
    OR p_model_id ILIKE ('%' || p_model_limit || '%');
$$;

CREATE OR REPLACE FUNCTION public.ai_limit_current_usage(
  p_provider text,
  p_model text,
  p_limit_type text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE p_limit_type
      WHEN 'TPM' THEN COALESCE((
        SELECT SUM(u.total_tokens)::numeric
        FROM public.ai_usage_logs u
        WHERE u.provider = p_provider
          AND u.created_at >= now() - interval '1 minute'
          AND public.ai_limit_matches_model(p_model, u.model_id)
      ), 0)
      WHEN 'TPD' THEN COALESCE((
        SELECT SUM(u.total_tokens)::numeric
        FROM public.ai_usage_logs u
        WHERE u.provider = p_provider
          AND u.created_at >= now() - interval '24 hours'
          AND public.ai_limit_matches_model(p_model, u.model_id)
      ), 0)
      WHEN 'RPM' THEN COALESCE((
        SELECT COUNT(*)::numeric
        FROM public.ai_usage_logs u
        WHERE u.provider = p_provider
          AND u.created_at >= now() - interval '1 minute'
          AND public.ai_limit_matches_model(p_model, u.model_id)
      ), 0)
      WHEN 'RPD' THEN COALESCE((
        SELECT COUNT(*)::numeric
        FROM public.ai_usage_logs u
        WHERE u.provider = p_provider
          AND u.created_at >= now() - interval '24 hours'
          AND public.ai_limit_matches_model(p_model, u.model_id)
      ), 0)
      WHEN 'ASH' THEN COALESCE((
        SELECT SUM(COALESCE((u.metadata->>'audio_seconds')::numeric, 0))
        FROM public.ai_usage_logs u
        WHERE u.provider = p_provider
          AND u.created_at >= now() - interval '1 hour'
          AND public.ai_limit_matches_model(p_model, u.model_id)
      ), 0)
      WHEN 'ASD' THEN COALESCE((
        SELECT SUM(COALESCE((u.metadata->>'audio_seconds')::numeric, 0))
        FROM public.ai_usage_logs u
        WHERE u.provider = p_provider
          AND u.created_at >= now() - interval '24 hours'
          AND public.ai_limit_matches_model(p_model, u.model_id)
      ), 0)
      ELSE 0
    END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Vue : consommation vs limites
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.ai_usage_vs_limits
WITH (security_invoker = true)
AS
SELECT
  l.id AS limit_id,
  l.provider,
  l.model,
  l.limit_type,
  l.limit_value,
  l.alert_threshold_warning,
  l.alert_threshold_critical,
  l.is_active,
  public.ai_limit_current_usage(l.provider, l.model, l.limit_type) AS current_usage,
  ROUND(
    (
      public.ai_limit_current_usage(l.provider, l.model, l.limit_type)
      / NULLIF(l.limit_value, 0)::numeric
    ) * 100,
    2
  ) AS usage_pct,
  (
    public.ai_limit_current_usage(l.provider, l.model, l.limit_type)
    / NULLIF(l.limit_value, 0)::numeric
  ) AS usage_ratio,
  CASE
    WHEN public.ai_limit_current_usage(l.provider, l.model, l.limit_type)
      >= l.limit_value::numeric THEN 'blocked'
    WHEN (
      public.ai_limit_current_usage(l.provider, l.model, l.limit_type)
      / NULLIF(l.limit_value, 0)::numeric
    ) >= l.alert_threshold_critical THEN 'critical'
    WHEN (
      public.ai_limit_current_usage(l.provider, l.model, l.limit_type)
      / NULLIF(l.limit_value, 0)::numeric
    ) >= l.alert_threshold_warning THEN 'warning'
    ELSE 'ok'
  END AS status
FROM public.ai_provider_limits l
WHERE l.is_active = true;

COMMENT ON VIEW public.ai_usage_vs_limits IS
  'Jointure temps réel ai_provider_limits × agrégats ai_usage_logs (TPM/TPD/RPM/RPD/ASH/ASD).';

GRANT SELECT ON public.ai_usage_vs_limits TO authenticated;
GRANT SELECT ON public.ai_usage_vs_limits TO service_role;

-- ---------------------------------------------------------------------------
-- 5) RLS — admins globaux (role_id 1-3 via JWT, rls_is_global_admin)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_provider_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_limit_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_provider_limits_select_admin" ON public.ai_provider_limits;
CREATE POLICY "ai_provider_limits_select_admin"
  ON public.ai_provider_limits FOR SELECT TO authenticated
  USING (public.rls_is_global_admin());

DROP POLICY IF EXISTS "ai_provider_limits_write_admin" ON public.ai_provider_limits;
CREATE POLICY "ai_provider_limits_write_admin"
  ON public.ai_provider_limits FOR ALL TO authenticated
  USING (public.rls_is_global_admin())
  WITH CHECK (public.rls_is_global_admin());

DROP POLICY IF EXISTS "ai_limit_alerts_select_admin" ON public.ai_limit_alerts;
CREATE POLICY "ai_limit_alerts_select_admin"
  ON public.ai_limit_alerts FOR SELECT TO authenticated
  USING (public.rls_is_global_admin());

-- Écriture alertes : service_role uniquement (Edge Functions / cron)
-- Pas de policy INSERT pour authenticated.

-- ---------------------------------------------------------------------------
-- 6) Limites initiales — Groq Free tier
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_provider_limits (provider, model, limit_type, limit_value)
VALUES
  ('groq', 'llama-3.1-8b-instant', 'RPM', 30),
  ('groq', 'llama-3.1-8b-instant', 'RPD', 14400),
  ('groq', 'llama-3.1-8b-instant', 'TPM', 6000),
  ('groq', 'llama-3.1-8b-instant', 'TPD', 500000),
  ('groq', 'llama-3.3-70b-versatile', 'RPM', 30),
  ('groq', 'llama-3.3-70b-versatile', 'RPD', 1000),
  ('groq', 'llama-3.3-70b-versatile', 'TPM', 12000),
  ('groq', 'llama-3.3-70b-versatile', 'TPD', 100000),
  ('groq', 'whisper-large-v3', 'RPM', 20),
  ('groq', 'whisper-large-v3', 'RPD', 2000),
  ('groq', 'whisper-large-v3', 'ASH', 7200),
  ('groq', 'whisper-large-v3', 'ASD', 28800)
ON CONFLICT (provider, model, limit_type) DO UPDATE SET
  limit_value = EXCLUDED.limit_value,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 7) Limites initiales — Gemini Free tier
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_provider_limits (provider, model, limit_type, limit_value)
VALUES
  ('gemini', 'gemini-2.5-flash', 'RPM', 10),
  ('gemini', 'gemini-2.5-flash', 'RPD', 500),
  ('gemini', 'gemini-2.5-flash', 'TPM', 250000),
  ('gemini', 'gemini-2.5-flash', 'TPD', 1000000)
ON CONFLICT (provider, model, limit_type) DO UPDATE SET
  limit_value = EXCLUDED.limit_value,
  updated_at = now();
