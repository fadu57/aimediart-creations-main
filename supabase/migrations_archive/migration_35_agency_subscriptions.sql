-- migration_35_agency_subscriptions.sql
-- Abonnements agence : plan tarifaire + dates de validité.
-- Prérequis : tables public.agencies et public.pricing (lecture vitrine).

CREATE TABLE IF NOT EXISTS public.agency_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- Clé plan alignée sur pricing.pricing_plan (ex. L'ATELIER).
  pricing_plan text,
  billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'annual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_subscriptions_agency_id_idx
  ON public.agency_subscriptions (agency_id);

CREATE INDEX IF NOT EXISTS agency_subscriptions_active_expires_idx
  ON public.agency_subscriptions (agency_id, is_active, expires_at DESC);

COMMENT ON TABLE public.agency_subscriptions IS
  'Abonnement SaaS par agence : plan, cycle de facturation et date d''expiration.';

ALTER TABLE public.agency_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.agency_subscriptions TO authenticated;

-- Admins globaux (role_id 1–3 via JWT app_metadata)
CREATE POLICY "agency_subscriptions_global_admin_all"
ON public.agency_subscriptions
FOR ALL
TO authenticated
USING (public.agencies_is_global_admin())
WITH CHECK (public.agencies_is_global_admin());

-- Staff agence : lecture de l'abonnement de leur agence
CREATE POLICY "agency_subscriptions_agency_read"
ON public.agency_subscriptions
FOR SELECT
TO authenticated
USING (public.agencies_user_can_read_row(public.agency_subscriptions.agency_id));
