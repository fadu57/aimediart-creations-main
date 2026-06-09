-- =============================================================================
-- migration_66_google_billing_cache.sql
-- Cache des budgets Google Cloud (Cloud Billing Budget API) — refresh ~24h
-- Prérequis : public.rls_is_global_admin()
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.google_billing_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_name       text NOT NULL,
  budget_id         text NOT NULL UNIQUE,
  billing_account   text NOT NULL,
  budget_amount     numeric NOT NULL,
  budget_currency   text NOT NULL DEFAULT 'EUR',
  cost_amount       numeric NOT NULL DEFAULT 0,
  cost_currency     text NOT NULL DEFAULT 'EUR',
  usage_pct         numeric,
  period_start      date,
  period_end        date,
  last_fetched_at   timestamptz NOT NULL DEFAULT now(),
  raw_data          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_billing_cache IS
  'Cache des budgets GCP (Budget API) — synchronisé par sync-google-billing (cron 06:00 UTC).';

CREATE INDEX IF NOT EXISTS idx_google_billing_cache_last_fetched
  ON public.google_billing_cache (last_fetched_at DESC);

ALTER TABLE public.google_billing_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_billing_cache" ON public.google_billing_cache;
CREATE POLICY "admin_read_billing_cache"
  ON public.google_billing_cache FOR SELECT
  TO authenticated
  USING (public.rls_is_global_admin());

DROP POLICY IF EXISTS "service_role_all_billing_cache" ON public.google_billing_cache;
CREATE POLICY "service_role_all_billing_cache"
  ON public.google_billing_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.google_billing_cache TO authenticated;
GRANT ALL ON public.google_billing_cache TO service_role;
