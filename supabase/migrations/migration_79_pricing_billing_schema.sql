-- migration_79_pricing_billing_schema.sql
-- Chantier pricing / billing / overages / upgrades AIMEDIArt
-- Tables cibles (noms stricts) : pricing, pricing_options, pricing_overage_rules,
-- organisation_subscriptions, account_usage_monthly, billing_alerts, invoice_drafts,
-- invoice_draft_items, upgrade_recommendations, language_option_requests,
-- pricing_audit_log, notifications
--
-- Prérequis : public.agencies, public.artworks, public.visitor_feedback
-- [HYPOTHÈSE H10] organisation_id référence public.agencies(id) (pas de table organisations dédiée à ce jour).

BEGIN;

-- =============================================================================
-- 0. Types énumérés
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.pricing_plan_code AS ENUM (
    'ETINCELLE', 'ATELIER', 'HORIZON', 'RAYONNEMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'trial', 'active', 'standby', 'expired', 'suspended', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.standby_status AS ENUM ('inactive', 'active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('monthly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.overage_metric_code AS ENUM ('ARTWORKS', 'VISITORS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_option_code AS ENUM (
    'EXTRA_MEDIATION_LANG', 'EXTRA_AUDIO_LANG', 'STANDBY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_option_billing_mode AS ENUM (
    'monthly_recurring', 'one_time', 'on_quote'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_type AS ENUM (
    'ARTWORK_OVERAGE',
    'VISITOR_OVERAGE',
    'ARTWORK_UPGRADE_THRESHOLD',
    'VISITOR_UPGRADE_THRESHOLD',
    'ETINCELLE_EXPIRING',
    'ETINCELLE_EXPIRED',
    'INVOICE_PENDING_REVIEW',
    'LANGUAGE_REQUEST_PENDING'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_status AS ENUM (
    'open', 'acknowledged', 'resolved', 'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_draft_status AS ENUM (
    'draft', 'pending_review', 'approved', 'rejected', 'issued', 'cancelled', 'waived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_item_type AS ENUM (
    'subscription',
    'standby',
    'artwork_overage',
    'visitor_overage',
    'language_mediation',
    'language_audio',
    'commercial_adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.upgrade_target_plan AS ENUM (
    'ATELIER', 'HORIZON', 'RAYONNEMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.recommendation_status AS ENUM (
    'pending', 'presented', 'accepted', 'declined', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.language_option_request_type AS ENUM ('mediation', 'audio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.language_option_request_status AS ENUM (
    'requested', 'approved', 'rejected', 'active', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'billing_alert',
    'upgrade_recommendation',
    'invoice_draft',
    'etincelle_expiring',
    'etincelle_expired',
    'language_option_request',
    'usage_monthly_ready',
    'generic'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM ('unread', 'read', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_action_type AS ENUM (
    'create', 'update', 'delete', 'approve', 'reject', 'issue', 'waive', 'compute', 'notify'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 1. pricing — enrichissement table existante
-- =============================================================================

-- Correction typo historique (idempotent)
DO $$ BEGIN
  ALTER TABLE public.pricing RENAME COLUMN princing_max_visitors TO pricing_max_visitors;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.pricing
  ADD COLUMN IF NOT EXISTS plan_code public.pricing_plan_code,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS standby_monthly_price_ttc_eur numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_artworks_included integer,
  ADD COLUMN IF NOT EXISTS max_visitors_per_month_included integer,
  ADD COLUMN IF NOT EXISTS included_mediation_langs_min integer,
  ADD COLUMN IF NOT EXISTS included_mediation_langs_max integer,
  ADD COLUMN IF NOT EXISTS included_audio_langs integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS trial_duration_days integer,
  ADD COLUMN IF NOT EXISTS is_quote_only boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS sort_order smallint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS monthly_equivalent_annual_ttc_eur numeric(10,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN pricing_monthly_ttc_eur IS NULL OR pricing_monthly_ttc_eur = 0 THEN NULL
        ELSE round((pricing_monthly_ttc_eur * 11) / 12, 2)
      END
    ) STORED;

COMMENT ON TABLE public.pricing IS
  'Référentiel des plans tarifaires AIMEDIArt (source unique vitrine + billing).';

COMMENT ON COLUMN public.pricing.plan_code IS
  'Clé canonique du plan (ETINCELLE, ATELIER, HORIZON, RAYONNEMENT).';

-- Synchronisation initiale depuis colonnes legacy si plan_code vide
UPDATE public.pricing p
SET
  plan_code = CASE
    WHEN upper(p.pricing_plan) LIKE '%ETINCELLE%' OR upper(p.pricing_plan) LIKE '%ÉTINCELLE%' THEN 'ETINCELLE'::public.pricing_plan_code
    WHEN upper(p.pricing_plan) LIKE '%ATELIER%' THEN 'ATELIER'::public.pricing_plan_code
    WHEN upper(p.pricing_plan) LIKE '%HORIZON%' THEN 'HORIZON'::public.pricing_plan_code
    WHEN upper(p.pricing_plan) LIKE '%RAYONNEMENT%' THEN 'RAYONNEMENT'::public.pricing_plan_code
    ELSE NULL
  END,
  display_name = COALESCE(p.display_name, p.pricing_label),
  max_artworks_included = COALESCE(p.max_artworks_included, p.pricing_max_oeuvres::integer),
  max_visitors_per_month_included = COALESCE(p.max_visitors_per_month_included, p.pricing_max_visitors::integer)
WHERE p.plan_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_plan_code_active_uidx
  ON public.pricing (plan_code)
  WHERE is_active = true AND archived_at IS NULL AND plan_code IS NOT NULL;

-- =============================================================================
-- 2. pricing_options
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_id bigint NOT NULL REFERENCES public.pricing (pricing_id) ON DELETE CASCADE,
  option_code public.pricing_option_code NOT NULL,
  billing_mode public.pricing_option_billing_mode NOT NULL DEFAULT 'monthly_recurring',
  unit_price_ttc_eur numeric(10,2),
  currency char(3) NOT NULL DEFAULT 'EUR',
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_options_unit_price_chk CHECK (
    unit_price_ttc_eur IS NULL OR unit_price_ttc_eur >= 0
  ),
  CONSTRAINT pricing_options_unique_per_plan UNIQUE (pricing_id, option_code)
);

CREATE INDEX IF NOT EXISTS pricing_options_pricing_id_idx
  ON public.pricing_options (pricing_id);

COMMENT ON TABLE public.pricing_options IS
  'Options facturables par plan (langues supplémentaires, veille, etc.).';

-- =============================================================================
-- 3. pricing_overage_rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_overage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_id bigint NOT NULL REFERENCES public.pricing (pricing_id) ON DELETE CASCADE,
  metric_code public.overage_metric_code NOT NULL,
  included_units integer,
  pack_size integer NOT NULL,
  pack_price_ttc_eur numeric(10,2) NOT NULL,
  upgrade_recommendation_threshold_artworks integer,
  upgrade_recommendation_threshold_visitors integer,
  recommendation_target_plan public.upgrade_target_plan,
  consecutive_months_for_recommendation smallint,
  billing_active boolean NOT NULL DEFAULT true,
  recommendation_active boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_overage_rules_pack_size_chk CHECK (pack_size > 0),
  CONSTRAINT pricing_overage_rules_pack_price_chk CHECK (pack_price_ttc_eur >= 0),
  CONSTRAINT pricing_overage_rules_consecutive_months_chk CHECK (
    consecutive_months_for_recommendation IS NULL OR consecutive_months_for_recommendation BETWEEN 1 AND 12
  ),
  CONSTRAINT pricing_overage_rules_unique_metric UNIQUE (pricing_id, metric_code)
);

CREATE INDEX IF NOT EXISTS pricing_overage_rules_pricing_id_idx
  ON public.pricing_overage_rules (pricing_id);

COMMENT ON TABLE public.pricing_overage_rules IS
  'Règles de dépassement œuvres / visiteurs par plan.';

-- =============================================================================
-- 4. organisation_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organisation_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  pricing_id bigint NOT NULL REFERENCES public.pricing (pricing_id),
  plan_code public.pricing_plan_code NOT NULL,
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  status public.subscription_status NOT NULL DEFAULT 'active',
  standby_status public.standby_status NOT NULL DEFAULT 'inactive',
  is_trial boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  next_renewal_at timestamptz,
  standby_started_at timestamptz,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisation_subscriptions_trial_etincelle_chk CHECK (
    NOT is_trial OR plan_code = 'ETINCELLE'
  ),
  CONSTRAINT organisation_subscriptions_standby_dates_chk CHECK (
    standby_status = 'inactive' OR standby_started_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS organisation_subscriptions_organisation_id_idx
  ON public.organisation_subscriptions (organisation_id);

CREATE INDEX IF NOT EXISTS organisation_subscriptions_active_idx
  ON public.organisation_subscriptions (organisation_id, status)
  WHERE status IN ('trial', 'active', 'standby');

CREATE INDEX IF NOT EXISTS organisation_subscriptions_trial_expiry_idx
  ON public.organisation_subscriptions (trial_ends_at)
  WHERE plan_code = 'ETINCELLE' AND status = 'trial';

COMMENT ON TABLE public.organisation_subscriptions IS
  'Abonnement organisationnel actif (organisation_id → agencies.id).';

COMMENT ON COLUMN public.organisation_subscriptions.pricing_snapshot IS
  'Copie JSON de la ligne pricing + options au moment de la souscription.';

-- Migration optionnelle depuis agency_subscriptions si présente
DO $$
BEGIN
  IF to_regclass('public.agency_subscriptions') IS NOT NULL THEN
    INSERT INTO public.organisation_subscriptions (
      organisation_id,
      pricing_id,
      plan_code,
      billing_cycle,
      status,
      started_at,
      ends_at,
      is_trial,
      trial_ends_at,
      pricing_snapshot,
      created_at,
      updated_at
    )
    SELECT
      a.agency_id,
      COALESCE(
        p.pricing_id,
        (SELECT pr.pricing_id FROM public.pricing pr WHERE pr.plan_code = 'ATELIER' LIMIT 1)
      ),
      COALESCE(
        p.plan_code,
        CASE
          WHEN upper(a.pricing_plan) LIKE '%ETINCELLE%' OR upper(a.pricing_plan) LIKE '%ÉTINCELLE%' THEN 'ETINCELLE'::public.pricing_plan_code
          WHEN upper(a.pricing_plan) LIKE '%ATELIER%' THEN 'ATELIER'::public.pricing_plan_code
          WHEN upper(a.pricing_plan) LIKE '%HORIZON%' THEN 'HORIZON'::public.pricing_plan_code
          WHEN upper(a.pricing_plan) LIKE '%RAYONNEMENT%' THEN 'RAYONNEMENT'::public.pricing_plan_code
          ELSE 'ATELIER'::public.pricing_plan_code
        END
      ),
      CASE WHEN a.billing_cycle = 'annual' THEN 'annual'::public.billing_cycle ELSE 'monthly'::public.billing_cycle END,
      CASE
        WHEN a.is_active = false THEN 'cancelled'::public.subscription_status
        WHEN a.expires_at IS NOT NULL AND a.expires_at < now() THEN 'expired'::public.subscription_status
        ELSE 'active'::public.subscription_status
      END,
      a.started_at,
      a.expires_at,
      COALESCE(p.plan_code = 'ETINCELLE', false),
      CASE WHEN p.plan_code = 'ETINCELLE' THEN a.expires_at ELSE NULL END,
      COALESCE(to_jsonb(p), '{}'::jsonb),
      a.created_at,
      a.updated_at
    FROM public.agency_subscriptions a
    LEFT JOIN public.pricing p ON upper(p.pricing_plan) = upper(COALESCE(a.pricing_plan, ''))
      OR p.plan_code::text = upper(regexp_replace(COALESCE(a.pricing_plan, ''), '^L''?', ''))
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organisation_subscriptions os
      WHERE os.organisation_id = a.agency_id
        AND os.started_at = a.started_at
    );
  END IF;
END $$;

-- =============================================================================
-- 5. account_usage_monthly
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.organisation_subscriptions (id) ON DELETE CASCADE,
  period_month date NOT NULL,
  artworks_count integer NOT NULL DEFAULT 0,
  visitors_count integer NOT NULL DEFAULT 0,
  included_artworks integer NOT NULL DEFAULT 0,
  included_visitors integer NOT NULL DEFAULT 0,
  artwork_overage_units integer NOT NULL DEFAULT 0,
  artwork_overage_amount_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  visitor_overage_units integer NOT NULL DEFAULT 0,
  visitor_overage_amount_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  language_options_amount_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  total_overage_amount_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  recommend_upgrade_artworks boolean NOT NULL DEFAULT false,
  recommend_upgrade_visitors boolean NOT NULL DEFAULT false,
  computation_version text NOT NULL DEFAULT 'v1',
  computation_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_usage_monthly_period_first_day_chk CHECK (
    period_month = date_trunc('month', period_month::timestamptz)::date
  ),
  CONSTRAINT account_usage_monthly_counts_nonneg_chk CHECK (
    artworks_count >= 0 AND visitors_count >= 0
  ),
  CONSTRAINT account_usage_monthly_unique_period UNIQUE (organisation_id, period_month)
);

CREATE INDEX IF NOT EXISTS account_usage_monthly_subscription_idx
  ON public.account_usage_monthly (subscription_id, period_month DESC);

CREATE INDEX IF NOT EXISTS account_usage_monthly_org_period_idx
  ON public.account_usage_monthly (organisation_id, period_month DESC);

-- =============================================================================
-- 6. billing_alerts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.organisation_subscriptions (id) ON DELETE SET NULL,
  alert_type public.alert_type NOT NULL,
  severity public.alert_severity NOT NULL DEFAULT 'warning',
  status public.alert_status NOT NULL DEFAULT 'open',
  period_month date,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_alerts_open_idx
  ON public.billing_alerts (status, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS billing_alerts_org_idx
  ON public.billing_alerts (organisation_id, created_at DESC);

-- =============================================================================
-- 7. invoice_drafts / invoice_draft_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.organisation_subscriptions (id) ON DELETE SET NULL,
  period_month date NOT NULL,
  reason text,
  status public.invoice_draft_status NOT NULL DEFAULT 'draft',
  total_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  requires_human_review boolean NOT NULL DEFAULT false,
  human_review_threshold_ttc_eur numeric(10,2),
  validated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  validated_at timestamptz,
  rejection_reason text,
  issued_external_ref text,
  waived_reason text,
  account_usage_monthly_id uuid REFERENCES public.account_usage_monthly (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_drafts_period_first_day_chk CHECK (
    period_month = date_trunc('month', period_month::timestamptz)::date
  ),
  CONSTRAINT invoice_drafts_unique_org_period UNIQUE (organisation_id, period_month)
);

CREATE INDEX IF NOT EXISTS invoice_drafts_status_idx
  ON public.invoice_drafts (status, period_month DESC);

CREATE TABLE IF NOT EXISTS public.invoice_draft_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_draft_id uuid NOT NULL REFERENCES public.invoice_drafts (id) ON DELETE CASCADE,
  item_type public.invoice_item_type NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  amount_ttc_eur numeric(10,2) NOT NULL DEFAULT 0,
  is_waived boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_draft_items_amount_chk CHECK (amount_ttc_eur >= 0),
  CONSTRAINT invoice_draft_items_quantity_chk CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS invoice_draft_items_draft_idx
  ON public.invoice_draft_items (invoice_draft_id, sort_order);

-- =============================================================================
-- 8. upgrade_recommendations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.upgrade_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.organisation_subscriptions (id) ON DELETE SET NULL,
  current_plan public.pricing_plan_code NOT NULL,
  recommended_plan public.upgrade_target_plan NOT NULL,
  reason text NOT NULL,
  reference_period_month date,
  trigger_metric public.overage_metric_code,
  trigger_value integer,
  threshold_value integer,
  status public.recommendation_status NOT NULL DEFAULT 'pending',
  internal_comment text,
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upgrade_recommendations_pending_idx
  ON public.upgrade_recommendations (status, created_at DESC)
  WHERE status = 'pending';

-- =============================================================================
-- 9. language_option_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.language_option_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.organisation_subscriptions (id) ON DELETE CASCADE,
  request_type public.language_option_request_type NOT NULL,
  lang_code char(5) NOT NULL,
  unit_price_ttc_eur numeric(10,2),
  status public.language_option_request_status NOT NULL DEFAULT 'requested',
  requester_comment text,
  decision_comment text,
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  pricing_option_id uuid REFERENCES public.pricing_options (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT language_option_requests_lang_code_chk CHECK (btrim(lang_code) <> '')
);

CREATE INDEX IF NOT EXISTS language_option_requests_pending_idx
  ON public.language_option_requests (status, created_at DESC)
  WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS language_option_requests_org_idx
  ON public.language_option_requests (organisation_id, status);

-- =============================================================================
-- 10. pricing_audit_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  organisation_id uuid REFERENCES public.agencies (id) ON DELETE SET NULL,
  action public.audit_action_type NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_audit_log_entity_idx
  ON public.pricing_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pricing_audit_log_org_idx
  ON public.pricing_audit_log (organisation_id, created_at DESC);

-- =============================================================================
-- 11. notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES public.agencies (id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link_url text,
  status public.notification_status NOT NULL DEFAULT 'unread',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_user_id, created_at DESC)
  WHERE status = 'unread';

CREATE INDEX IF NOT EXISTS notifications_org_idx
  ON public.notifications (organisation_id, created_at DESC);

-- =============================================================================
-- 12. Trigger updated_at générique
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pricing',
    'pricing_options',
    'pricing_overage_rules',
    'organisation_subscriptions',
    'account_usage_monthly',
    'billing_alerts',
    'invoice_drafts',
    'invoice_draft_items',
    'upgrade_recommendations',
    'language_option_requests',
    'notifications'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp()',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 13. Helpers rôles (RLS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pricing_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.agencies_is_global_admin();
$$;

-- [HYPOTHÈSE H6] role_id 2 = finance interne
CREATE OR REPLACE FUNCTION public.pricing_is_finance_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role_id IN (2, 3)
  );
$$;

CREATE OR REPLACE FUNCTION public.pricing_organisation_user_can_read(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.agencies_user_can_read_row(p_organisation_id);
$$;

-- Admin organisation : role_id 4 sur l'organisation
CREATE OR REPLACE FUNCTION public.pricing_organisation_admin_can_write(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.agency_id = p_organisation_id
      AND au.role_id = 4
  );
$$;

-- =============================================================================
-- 14. Fonctions métier — comptage [HYPOTHÈSES H1, H2]
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_organisation_artworks(p_organisation_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.artworks a
  WHERE a.artwork_agency_id = p_organisation_id
    AND a.deleted_at IS NULL
    AND a.artwork_deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.count_organisation_artworks(uuid) IS
  '[HYPOTHÈSE H2] Compte les œuvres non supprimées rattachées à l''organisation via artwork_agency_id.';

CREATE OR REPLACE FUNCTION public.count_organisation_visitors_for_month(
  p_organisation_id uuid,
  p_period_month date
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.visitor_feedback vf
  WHERE vf.agency_id = p_organisation_id
    AND vf.submitted_at >= p_period_month::timestamptz
    AND vf.submitted_at < (p_period_month + interval '1 month')::timestamptz;
$$;

COMMENT ON FUNCTION public.count_organisation_visitors_for_month(uuid, date) IS
  '[HYPOTHÈSE H1] 1 ligne visitor_feedback = 1 visiteur ; filtre agency_id + submitted_at sur le mois calendaire UTC.';

-- =============================================================================
-- 15. Calcul dépassements
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_overage_packs(
  p_actual integer,
  p_included integer,
  p_pack_size integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_actual <= p_included OR p_pack_size IS NULL OR p_pack_size <= 0 THEN 0
    ELSE ceil((p_actual - p_included)::numeric / p_pack_size)::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_overage_amount(
  p_packs integer,
  p_pack_price numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(COALESCE(p_packs, 0) * COALESCE(p_pack_price, 0), 2);
$$;

-- =============================================================================
-- 16. Snapshot usage mensuel (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_account_usage_monthly(
  p_organisation_id uuid,
  p_period_month date,
  p_force boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := date_trunc('month', p_period_month)::date;
  v_sub public.organisation_subscriptions%ROWTYPE;
  v_pricing public.pricing%ROWTYPE;
  v_artworks integer;
  v_visitors integer;
  v_art_rule public.pricing_overage_rules%ROWTYPE;
  v_vis_rule public.pricing_overage_rules%ROWTYPE;
  v_art_packs integer := 0;
  v_vis_packs integer := 0;
  v_art_amount numeric(10,2) := 0;
  v_vis_amount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_rec_art boolean := false;
  v_rec_vis boolean := false;
  v_existing uuid;
  v_usage_id uuid;
  v_included_art integer;
  v_included_vis integer;
BEGIN
  IF v_period IS NULL THEN
    RAISE EXCEPTION 'period_month invalide';
  END IF;

  SELECT id INTO v_existing
  FROM public.account_usage_monthly
  WHERE organisation_id = p_organisation_id
    AND period_month = v_period;

  IF v_existing IS NOT NULL AND NOT p_force THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_sub
  FROM public.organisation_subscriptions os
  WHERE os.organisation_id = p_organisation_id
    AND os.status IN ('trial', 'active', 'standby')
  ORDER BY os.started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun abonnement actif pour organisation %', p_organisation_id;
  END IF;

  SELECT * INTO v_pricing FROM public.pricing WHERE pricing_id = v_sub.pricing_id;

  v_included_art := COALESCE(v_pricing.max_artworks_included, v_pricing.pricing_max_oeuvres::integer, 0);
  v_included_vis := COALESCE(v_pricing.max_visitors_per_month_included, v_pricing.pricing_max_visitors::integer, 0);

  v_artworks := public.count_organisation_artworks(p_organisation_id);
  v_visitors := public.count_organisation_visitors_for_month(p_organisation_id, v_period);

  SELECT * INTO v_art_rule
  FROM public.pricing_overage_rules r
  WHERE r.pricing_id = v_pricing.pricing_id
    AND r.metric_code = 'ARTWORKS'
    AND r.is_active = true
  LIMIT 1;

  SELECT * INTO v_vis_rule
  FROM public.pricing_overage_rules r
  WHERE r.pricing_id = v_pricing.pricing_id
    AND r.metric_code = 'VISITORS'
    AND r.is_active = true
  LIMIT 1;

  IF v_pricing.is_quote_only THEN
    v_art_packs := 0;
    v_vis_packs := 0;
  ELSE
    IF v_art_rule.id IS NOT NULL AND v_art_rule.billing_active THEN
      v_art_packs := public.calculate_overage_packs(v_artworks, COALESCE(v_art_rule.included_units, v_included_art), v_art_rule.pack_size);
      v_art_amount := public.calculate_overage_amount(v_art_packs, v_art_rule.pack_price_ttc_eur);
      IF v_art_rule.recommendation_active
         AND v_art_rule.upgrade_recommendation_threshold_artworks IS NOT NULL
         AND v_artworks > v_art_rule.upgrade_recommendation_threshold_artworks THEN
        v_rec_art := true;
      END IF;
    END IF;

    IF v_vis_rule.id IS NOT NULL AND v_vis_rule.billing_active THEN
      v_vis_packs := public.calculate_overage_packs(v_visitors, COALESCE(v_vis_rule.included_units, v_included_vis), v_vis_rule.pack_size);
      v_vis_amount := public.calculate_overage_amount(v_vis_packs, v_vis_rule.pack_price_ttc_eur);
    END IF;
  END IF;

  v_total := v_art_amount + v_vis_amount;

  INSERT INTO public.account_usage_monthly (
    organisation_id,
    subscription_id,
    period_month,
    artworks_count,
    visitors_count,
    included_artworks,
    included_visitors,
    artwork_overage_units,
    artwork_overage_amount_ttc_eur,
    visitor_overage_units,
    visitor_overage_amount_ttc_eur,
    total_overage_amount_ttc_eur,
    recommend_upgrade_artworks,
    recommend_upgrade_visitors,
    computation_notes
  ) VALUES (
    p_organisation_id,
    v_sub.id,
    v_period,
    v_artworks,
    v_visitors,
    v_included_art,
    v_included_vis,
    v_art_packs,
    v_art_amount,
    v_vis_packs,
    v_vis_amount,
    v_total,
    v_rec_art,
    false,
    jsonb_build_object(
      'pricing_id', v_pricing.pricing_id,
      'plan_code', v_pricing.plan_code,
      'artworks_count_method', 'count_organisation_artworks',
      'visitors_count_method', 'count_organisation_visitors_for_month'
    )
  )
  ON CONFLICT (organisation_id, period_month) DO UPDATE SET
    subscription_id = EXCLUDED.subscription_id,
    artworks_count = EXCLUDED.artworks_count,
    visitors_count = EXCLUDED.visitors_count,
    included_artworks = EXCLUDED.included_artworks,
    included_visitors = EXCLUDED.included_visitors,
    artwork_overage_units = EXCLUDED.artwork_overage_units,
    artwork_overage_amount_ttc_eur = EXCLUDED.artwork_overage_amount_ttc_eur,
    visitor_overage_units = EXCLUDED.visitor_overage_units,
    visitor_overage_amount_ttc_eur = EXCLUDED.visitor_overage_amount_ttc_eur,
    total_overage_amount_ttc_eur = EXCLUDED.total_overage_amount_ttc_eur,
    recommend_upgrade_artworks = EXCLUDED.recommend_upgrade_artworks,
    computation_notes = EXCLUDED.computation_notes,
    computed_at = now(),
    updated_at = now()
  RETURNING id INTO v_usage_id;

  -- Recommandation visiteurs consécutifs [HYPOTHÈSE H12 : fenêtre 2 ou 3 mois selon règle plan]
  IF v_vis_rule.id IS NOT NULL
     AND v_vis_rule.recommendation_active
     AND v_vis_rule.upgrade_recommendation_threshold_visitors IS NOT NULL
     AND v_vis_rule.consecutive_months_for_recommendation IS NOT NULL THEN
    PERFORM public.evaluate_visitor_upgrade_recommendation(
      p_organisation_id,
      v_sub.id,
      v_pricing.plan_code,
      v_vis_rule,
      v_period
    );
  END IF;

  RETURN v_usage_id;
END;
$$;

-- =============================================================================
-- 17. Recommandations upgrade visiteurs (mois consécutifs)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_visitor_upgrade_recommendation(
  p_organisation_id uuid,
  p_subscription_id uuid,
  p_current_plan public.pricing_plan_code,
  p_vis_rule public.pricing_overage_rules,
  p_period_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold integer := p_vis_rule.upgrade_recommendation_threshold_visitors;
  v_months smallint := p_vis_rule.consecutive_months_for_recommendation;
  v_count integer;
  v_target public.upgrade_target_plan;
BEGIN
  IF v_threshold IS NULL OR v_months IS NULL OR p_vis_rule.recommendation_target_plan IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT aum.visitors_count
    FROM public.account_usage_monthly aum
    WHERE aum.organisation_id = p_organisation_id
      AND aum.period_month <= p_period_month
      AND aum.period_month > (p_period_month - (v_months || ' months')::interval)::date
    ORDER BY aum.period_month DESC
    LIMIT v_months
  ) s
  WHERE s.visitors_count > v_threshold;

  IF v_count < v_months THEN
    RETURN;
  END IF;

  v_target := p_vis_rule.recommendation_target_plan;

  UPDATE public.account_usage_monthly
  SET recommend_upgrade_visitors = true, updated_at = now()
  WHERE organisation_id = p_organisation_id
    AND period_month = p_period_month;

  INSERT INTO public.upgrade_recommendations (
    organisation_id,
    subscription_id,
    current_plan,
    recommended_plan,
    reason,
    reference_period_month,
    trigger_metric,
    trigger_value,
    threshold_value,
    status
  )
  SELECT
    p_organisation_id,
    p_subscription_id,
    p_current_plan,
    v_target,
    format('Visiteurs > %s pendant %s mois consécutifs', v_threshold, v_months),
    p_period_month,
    'VISITORS',
    (SELECT visitors_count FROM public.account_usage_monthly WHERE organisation_id = p_organisation_id AND period_month = p_period_month),
    v_threshold,
    'pending'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.upgrade_recommendations ur
    WHERE ur.organisation_id = p_organisation_id
      AND ur.reference_period_month = p_period_month
      AND ur.trigger_metric = 'VISITORS'
      AND ur.status = 'pending'
  );
END;
$$;

-- =============================================================================
-- 18. Génération alertes + recommandations œuvres
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_billing_alerts_for_usage(p_usage_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_u public.account_usage_monthly%ROWTYPE;
  v_sub public.organisation_subscriptions%ROWTYPE;
  v_art_rule public.pricing_overage_rules%ROWTYPE;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_u FROM public.account_usage_monthly WHERE id = p_usage_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO v_sub FROM public.organisation_subscriptions WHERE id = v_u.subscription_id;

  IF v_u.artwork_overage_units > 0 THEN
    INSERT INTO public.billing_alerts (organisation_id, subscription_id, alert_type, severity, period_month, message, payload)
    VALUES (
      v_u.organisation_id, v_u.subscription_id, 'ARTWORK_OVERAGE', 'warning', v_u.period_month,
      format('Dépassement œuvres : %s pack(s), %s € TTC', v_u.artwork_overage_units, v_u.artwork_overage_amount_ttc_eur),
      jsonb_build_object('usage_id', v_u.id, 'packs', v_u.artwork_overage_units, 'amount', v_u.artwork_overage_amount_ttc_eur)
    );
    v_count := v_count + 1;
  END IF;

  IF v_u.visitor_overage_units > 0 THEN
    INSERT INTO public.billing_alerts (organisation_id, subscription_id, alert_type, severity, period_month, message, payload)
    VALUES (
      v_u.organisation_id, v_u.subscription_id, 'VISITOR_OVERAGE', 'info', v_u.period_month,
      format('Dépassement visiteurs : %s pack(s), %s € TTC', v_u.visitor_overage_units, v_u.visitor_overage_amount_ttc_eur),
      jsonb_build_object('usage_id', v_u.id, 'packs', v_u.visitor_overage_units, 'amount', v_u.visitor_overage_amount_ttc_eur)
    );
    v_count := v_count + 1;
  END IF;

  IF v_u.recommend_upgrade_artworks THEN
    SELECT r.* INTO v_art_rule
    FROM public.pricing_overage_rules r
    JOIN public.organisation_subscriptions os ON os.pricing_id = r.pricing_id
    WHERE os.id = v_u.subscription_id
      AND r.metric_code = 'ARTWORKS'
    LIMIT 1;

    INSERT INTO public.billing_alerts (organisation_id, subscription_id, alert_type, severity, period_month, message, payload)
    VALUES (
      v_u.organisation_id, v_u.subscription_id, 'ARTWORK_UPGRADE_THRESHOLD', 'critical', v_u.period_month,
      format('Seuil œuvres dépassé (%s) — recommandation upgrade', v_u.artworks_count),
      jsonb_build_object('usage_id', v_u.id, 'artworks_count', v_u.artworks_count)
    );
    v_count := v_count + 1;

    IF v_art_rule.recommendation_target_plan IS NOT NULL THEN
      INSERT INTO public.upgrade_recommendations (
        organisation_id, subscription_id, current_plan, recommended_plan,
        reason, reference_period_month, trigger_metric, trigger_value, threshold_value
      )
      SELECT
        v_u.organisation_id, v_u.subscription_id, v_sub.plan_code, v_art_rule.recommendation_target_plan,
        format('Œuvres (%s) au-delà du seuil de recommandation', v_u.artworks_count),
        v_u.period_month, 'ARTWORKS', v_u.artworks_count, v_art_rule.upgrade_recommendation_threshold_artworks
      WHERE NOT EXISTS (
        SELECT 1 FROM public.upgrade_recommendations ur
        WHERE ur.organisation_id = v_u.organisation_id
          AND ur.reference_period_month = v_u.period_month
          AND ur.trigger_metric = 'ARTWORKS'
          AND ur.status = 'pending'
      );
    END IF;
  END IF;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- 19. Brouillons de facture
-- =============================================================================

-- [HYPOTHÈSE H6] Seuil revue humaine par défaut : 50 € TTC
CREATE OR REPLACE FUNCTION public.generate_invoice_draft_for_usage(
  p_usage_id uuid,
  p_human_review_threshold numeric DEFAULT 50.00
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_u public.account_usage_monthly%ROWTYPE;
  v_draft_id uuid;
  v_total numeric(10,2);
BEGIN
  SELECT * INTO v_u FROM public.account_usage_monthly WHERE id = p_usage_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usage introuvable %', p_usage_id;
  END IF;

  v_total := v_u.total_overage_amount_ttc_eur + COALESCE(v_u.language_options_amount_ttc_eur, 0);

  INSERT INTO public.invoice_drafts (
    organisation_id,
    subscription_id,
    period_month,
    reason,
    status,
    total_ttc_eur,
    requires_human_review,
    human_review_threshold_ttc_eur,
    account_usage_monthly_id
  ) VALUES (
    v_u.organisation_id,
    v_u.subscription_id,
    v_u.period_month,
    'Facturation complémentaire dépassements mensuels',
    CASE WHEN v_total >= p_human_review_threshold THEN 'pending_review' ELSE 'draft' END,
    v_total,
    v_total >= p_human_review_threshold,
    p_human_review_threshold,
    v_u.id
  )
  ON CONFLICT (organisation_id, period_month) DO UPDATE SET
    total_ttc_eur = EXCLUDED.total_ttc_eur,
    requires_human_review = EXCLUDED.requires_human_review,
    account_usage_monthly_id = EXCLUDED.account_usage_monthly_id,
    updated_at = now()
  RETURNING id INTO v_draft_id;

  DELETE FROM public.invoice_draft_items WHERE invoice_draft_id = v_draft_id;

  IF v_u.artwork_overage_amount_ttc_eur > 0 THEN
    INSERT INTO public.invoice_draft_items (invoice_draft_id, item_type, description, quantity, unit_price_ttc_eur, amount_ttc_eur, metadata)
    VALUES (
      v_draft_id, 'artwork_overage',
      format('Dépassement œuvres — %s pack(s)', v_u.artwork_overage_units),
      v_u.artwork_overage_units,
      round(v_u.artwork_overage_amount_ttc_eur / NULLIF(v_u.artwork_overage_units, 0), 2),
      v_u.artwork_overage_amount_ttc_eur,
      jsonb_build_object('artworks_count', v_u.artworks_count, 'included', v_u.included_artworks)
    );
  END IF;

  IF v_u.visitor_overage_amount_ttc_eur > 0 THEN
    INSERT INTO public.invoice_draft_items (invoice_draft_id, item_type, description, quantity, unit_price_ttc_eur, amount_ttc_eur, metadata)
    VALUES (
      v_draft_id, 'visitor_overage',
      format('Dépassement visiteurs — %s pack(s)', v_u.visitor_overage_units),
      v_u.visitor_overage_units,
      round(v_u.visitor_overage_amount_ttc_eur / NULLIF(v_u.visitor_overage_units, 0), 2),
      v_u.visitor_overage_amount_ttc_eur,
      jsonb_build_object('visitors_count', v_u.visitors_count, 'included', v_u.included_visitors)
    );
  END IF;

  IF v_total >= p_human_review_threshold THEN
    INSERT INTO public.billing_alerts (organisation_id, subscription_id, alert_type, severity, period_month, message, payload)
    VALUES (
      v_u.organisation_id, v_u.subscription_id, 'INVOICE_PENDING_REVIEW', 'warning', v_u.period_month,
      format('Brouillon facture %s € TTC en attente de validation', v_total),
      jsonb_build_object('invoice_draft_id', v_draft_id, 'total', v_total)
    );
  END IF;

  RETURN v_draft_id;
END;
$$;

-- =============================================================================
-- 20. ETINCELLE — détection fin de période + notifications
-- =============================================================================

CREATE OR REPLACE FUNCTION public.detect_etincelle_expiring_organisations(
  p_days_before integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_count integer := 0;
BEGIN
  FOR v_rec IN
    SELECT os.*
    FROM public.organisation_subscriptions os
    WHERE os.plan_code = 'ETINCELLE'
      AND os.status = 'trial'
      AND os.trial_ends_at IS NOT NULL
      AND os.trial_ends_at <= now() + (p_days_before || ' days')::interval
      AND os.trial_ends_at > now()
  LOOP
    INSERT INTO public.billing_alerts (
      organisation_id, subscription_id, alert_type, severity, message, payload
    )
    SELECT
      v_rec.organisation_id, v_rec.id, 'ETINCELLE_EXPIRING', 'warning',
      'Votre période ETINCELLE se termine bientôt — passage vers ATELIER recommandé',
      jsonb_build_object('trial_ends_at', v_rec.trial_ends_at, 'recommended_plan', 'ATELIER')
    WHERE NOT EXISTS (
      SELECT 1 FROM public.billing_alerts ba
      WHERE ba.organisation_id = v_rec.organisation_id
        AND ba.alert_type = 'ETINCELLE_EXPIRING'
        AND ba.status = 'open'
    );

    INSERT INTO public.upgrade_recommendations (
      organisation_id, subscription_id, current_plan, recommended_plan,
      reason, status
    )
    SELECT
      v_rec.organisation_id, v_rec.id, 'ETINCELLE', 'ATELIER',
      'Fin de période essai ETINCELLE — upsell ATELIER', 'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.upgrade_recommendations ur
      WHERE ur.organisation_id = v_rec.organisation_id
        AND ur.current_plan = 'ETINCELLE'
        AND ur.recommended_plan = 'ATELIER'
        AND ur.status = 'pending'
    );

  PERFORM public.create_organisation_notifications_for_alert(
      v_rec.organisation_id,
      'etincelle_expiring',
      'ETINCELLE — fin de période proche',
      'Votre essai gratuit touche à sa fin. Découvrez le plan ATELIER pour continuer sereinement.',
      jsonb_build_object('subscription_id', v_rec.id, 'trial_ends_at', v_rec.trial_ends_at)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_etincelle_expired_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_count integer := 0;
BEGIN
  FOR v_rec IN
    SELECT * FROM public.organisation_subscriptions
    WHERE plan_code = 'ETINCELLE'
      AND status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at <= now()
  LOOP
  -- [HYPOTHÈSE H3] Passage en expired sans blocage brutal immédiat des données
    UPDATE public.organisation_subscriptions
    SET status = 'expired', ends_at = COALESCE(ends_at, v_rec.trial_ends_at), updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO public.billing_alerts (organisation_id, subscription_id, alert_type, severity, message, payload)
    VALUES (
      v_rec.organisation_id, v_rec.id, 'ETINCELLE_EXPIRED', 'critical',
      'Période ETINCELLE expirée — passage vers ATELIER à envisager',
      jsonb_build_object('expired_at', v_rec.trial_ends_at)
    );

    PERFORM public.create_organisation_notifications_for_alert(
      v_rec.organisation_id,
      'etincelle_expired',
      'ETINCELLE — période terminée',
      'Votre essai est terminé. Passez au plan ATELIER pour retrouver toutes les fonctionnalités.',
      jsonb_build_object('subscription_id', v_rec.id)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organisation_notifications_for_alert(
  p_organisation_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.notifications (
    recipient_user_id, organisation_id, notification_type, title, message, payload
  )
  SELECT
    au.user_id,
    p_organisation_id,
    p_type,
    p_title,
    p_message,
    p_payload
  FROM public.agency_users au
  WHERE au.agency_id = p_organisation_id
    AND au.role_id IN (4, 5, 6);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- 21. Job mensuel idempotent (toutes organisations actives)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_monthly_billing_job(
  p_reference_date date DEFAULT (date_trunc('month', now()) - interval '1 month')::date,
  p_human_review_threshold numeric DEFAULT 50.00
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_usage_id uuid;
  v_period date := date_trunc('month', p_reference_date)::date;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  -- Idempotence : si tous les usages du mois existent déjà, les fonctions ON CONFLICT gèrent le rejeu

  FOR v_org IN
    SELECT DISTINCT os.organisation_id
    FROM public.organisation_subscriptions os
    WHERE os.status IN ('active', 'standby')
      AND os.plan_code <> 'RAYONNEMENT'
  LOOP
    BEGIN
      v_usage_id := public.compute_account_usage_monthly(v_org.organisation_id, v_period, false);
      PERFORM public.generate_billing_alerts_for_usage(v_usage_id);
      IF (SELECT total_overage_amount_ttc_eur FROM public.account_usage_monthly WHERE id = v_usage_id) > 0 THEN
        PERFORM public.generate_invoice_draft_for_usage(v_usage_id, p_human_review_threshold);
      END IF;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'organisation_id', v_org.organisation_id,
        'error', SQLERRM
      );
    END;
  END LOOP;

  INSERT INTO public.pricing_audit_log (action, entity_type, entity_id, new_value, context)
  VALUES (
    'compute',
    'monthly_billing_job',
    NULL,
    jsonb_build_object('processed', v_processed, 'skipped', v_skipped, 'period_month', v_period),
    jsonb_build_object('errors', v_errors, 'reference_date', p_reference_date)
  );

  RETURN jsonb_build_object(
    'period_month', v_period,
    'processed', v_processed,
    'errors', v_errors
  );
END;
$$;

-- =============================================================================
-- 22. SEED DATA
-- =============================================================================

-- Upsert plans (4 lignes canoniques) par plan_code
INSERT INTO public.pricing (
  pricing_label, pricing_plan, plan_code, display_name,
  pricing_monthly_ttc_eur, pricing_max_oeuvres, pricing_max_visitors,
  max_artworks_included, max_visitors_per_month_included,
  standby_monthly_price_ttc_eur,
  included_mediation_langs_min, included_mediation_langs_max, included_audio_langs,
  trial_duration_days, is_quote_only, pricing_is_unlimited, sort_order, is_active
)
SELECT v.label, v.plan_code::text, v.plan_code, v.display_name,
       v.monthly, v.max_art, v.max_vis, v.max_art, v.max_vis, v.standby,
       v.med_min, v.med_max, v.audio, v.trial_days, v.quote_only, v.unlimited, v.sort_ord, true
FROM (VALUES
  ('L''ETINCELLE', 'ETINCELLE'::public.pricing_plan_code, 'Étincelle', 0.00::numeric, 10, 100, NULL::numeric, 1, 1, 0, 30, false, false, 1),
  ('L''ATELIER', 'ATELIER', 'Atelier', 59.00, 100, 1500, 19.00, 1, 2, 1, NULL, false, false, 2),
  ('L''HORIZON', 'HORIZON', 'Horizon', 149.00, 500, 2500, 49.00, 5, 5, 1, NULL, false, false, 3),
  ('LE RAYONNEMENT', 'RAYONNEMENT', 'Rayonnement', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, true, 4)
) AS v(label, plan_code, display_name, monthly, max_art, max_vis, standby, med_min, med_max, audio, trial_days, quote_only, unlimited, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing p WHERE p.plan_code = v.plan_code
);

UPDATE public.pricing SET
  plan_code = v.plan_code,
  display_name = v.display_name,
  pricing_monthly_ttc_eur = v.monthly,
  pricing_max_oeuvres = v.max_art,
  pricing_max_visitors = v.max_vis,
  max_artworks_included = v.max_art,
  max_visitors_per_month_included = v.max_vis,
  standby_monthly_price_ttc_eur = v.standby,
  included_mediation_langs_min = v.med_min,
  included_mediation_langs_max = v.med_max,
  included_audio_langs = v.audio,
  trial_duration_days = v.trial_days,
  is_quote_only = v.quote_only,
  pricing_is_unlimited = v.unlimited,
  sort_order = v.sort_ord,
  is_active = true,
  pricing_label = v.label,
  pricing_plan = v.plan_code::text
FROM (VALUES
  ('ETINCELLE'::public.pricing_plan_code, 'L''ETINCELLE', 'Étincelle', 0.00::numeric, 10, 100, NULL::numeric, 1, 1, 0, 30, false, false, 1),
  ('ATELIER', 'L''ATELIER', 'Atelier', 59.00, 100, 1500, 19.00, 1, 2, 1, NULL, false, false, 2),
  ('HORIZON', 'L''HORIZON', 'Horizon', 149.00, 500, 2500, 49.00, 5, 5, 1, NULL, false, false, 3),
  ('RAYONNEMENT', 'LE RAYONNEMENT', 'Rayonnement', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, true, 4)
) AS v(plan_code, label, display_name, monthly, max_art, max_vis, standby, med_min, med_max, audio, trial_days, quote_only, unlimited, sort_ord)
WHERE public.pricing.plan_code = v.plan_code
   OR upper(public.pricing.pricing_plan) = v.plan_code::text;

-- pricing_options
INSERT INTO public.pricing_options (pricing_id, option_code, billing_mode, unit_price_ttc_eur, description)
SELECT p.pricing_id, o.option_code, o.billing_mode, o.unit_price, o.description
FROM public.pricing p
JOIN (VALUES
  ('ATELIER'::public.pricing_plan_code, 'EXTRA_MEDIATION_LANG'::public.pricing_option_code, 'monthly_recurring'::public.pricing_option_billing_mode, 5.00::numeric, 'Langue médiation supplémentaire'),
  ('ATELIER', 'EXTRA_AUDIO_LANG', 'monthly_recurring', 5.00, 'Langue audio-guide supplémentaire'),
  ('ATELIER', 'STANDBY', 'monthly_recurring', 19.00, 'Plan veille Atelier'),
  ('HORIZON', 'EXTRA_MEDIATION_LANG', 'monthly_recurring', 15.00, 'Langue médiation supplémentaire'),
  ('HORIZON', 'EXTRA_AUDIO_LANG', 'monthly_recurring', 15.00, 'Langue audio-guide supplémentaire'),
  ('HORIZON', 'STANDBY', 'monthly_recurring', 49.00, 'Plan veille Horizon'),
  ('RAYONNEMENT', 'STANDBY', 'on_quote', NULL, 'Plan veille sur devis')
) AS o(plan_code, option_code, billing_mode, unit_price, description)
  ON p.plan_code = o.plan_code
ON CONFLICT (pricing_id, option_code) DO UPDATE SET
  unit_price_ttc_eur = EXCLUDED.unit_price_ttc_eur,
  billing_mode = EXCLUDED.billing_mode,
  description = EXCLUDED.description,
  updated_at = now();

-- pricing_overage_rules
INSERT INTO public.pricing_overage_rules (
  pricing_id, metric_code, included_units, pack_size, pack_price_ttc_eur,
  upgrade_recommendation_threshold_artworks,
  upgrade_recommendation_threshold_visitors,
  recommendation_target_plan,
  consecutive_months_for_recommendation,
  billing_active, recommendation_active
)
SELECT p.pricing_id, r.metric_code, r.included_units, r.pack_size, r.pack_price,
       r.art_threshold, r.vis_threshold, r.target_plan, r.consec_months,
       r.billing_active, r.recommendation_active
FROM public.pricing p
JOIN (VALUES
  ('ATELIER'::public.pricing_plan_code, 'ARTWORKS'::public.overage_metric_code, 100, 25, 15.00::numeric, 200, NULL::integer, 'HORIZON'::public.upgrade_target_plan, NULL::smallint, true, true),
  ('ATELIER', 'VISITORS', 1500, 500, 5.00, NULL, 4500, 'HORIZON', 2, true, true),
  ('HORIZON', 'ARTWORKS', 500, 50, 20.00, 750, NULL, 'RAYONNEMENT', NULL, true, true),
  ('HORIZON', 'VISITORS', 2500, 500, 5.00, NULL, 6000, 'RAYONNEMENT', 2, true, true)
) AS r(plan_code, metric_code, included_units, pack_size, pack_price, art_threshold, vis_threshold, target_plan, consec_months, billing_active, recommendation_active)
  ON p.plan_code = r.plan_code
ON CONFLICT (pricing_id, metric_code) DO UPDATE SET
  included_units = EXCLUDED.included_units,
  pack_size = EXCLUDED.pack_size,
  pack_price_ttc_eur = EXCLUDED.pack_price_ttc_eur,
  upgrade_recommendation_threshold_artworks = EXCLUDED.upgrade_recommendation_threshold_artworks,
  upgrade_recommendation_threshold_visitors = EXCLUDED.upgrade_recommendation_threshold_visitors,
  recommendation_target_plan = EXCLUDED.recommendation_target_plan,
  consecutive_months_for_recommendation = EXCLUDED.consecutive_months_for_recommendation,
  billing_active = EXCLUDED.billing_active,
  recommendation_active = EXCLUDED.recommendation_active,
  updated_at = now();

-- =============================================================================
-- 23. RLS
-- =============================================================================

ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_overage_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_draft_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upgrade_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_option_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- pricing : lecture publique anon + authenticated (vitrine)
DROP POLICY IF EXISTS pricing_public_read ON public.pricing;
CREATE POLICY pricing_public_read ON public.pricing
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND archived_at IS NULL);

DROP POLICY IF EXISTS pricing_admin_write ON public.pricing;
CREATE POLICY pricing_admin_write ON public.pricing
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin())
  WITH CHECK (public.pricing_is_global_admin());

DROP POLICY IF EXISTS pricing_options_public_read ON public.pricing_options;
CREATE POLICY pricing_options_public_read ON public.pricing_options
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS pricing_options_admin_write ON public.pricing_options;
CREATE POLICY pricing_options_admin_write ON public.pricing_options
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin())
  WITH CHECK (public.pricing_is_global_admin());

DROP POLICY IF EXISTS pricing_overage_rules_admin ON public.pricing_overage_rules;
CREATE POLICY pricing_overage_rules_admin ON public.pricing_overage_rules
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin());

-- organisation_subscriptions
DROP POLICY IF EXISTS organisation_subscriptions_org_read ON public.organisation_subscriptions;
CREATE POLICY organisation_subscriptions_org_read ON public.organisation_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.pricing_is_global_admin()
    OR public.pricing_is_finance_admin()
    OR public.pricing_organisation_user_can_read(organisation_id)
  );

DROP POLICY IF EXISTS organisation_subscriptions_admin_write ON public.organisation_subscriptions;
CREATE POLICY organisation_subscriptions_admin_write ON public.organisation_subscriptions
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

-- account_usage_monthly
DROP POLICY IF EXISTS account_usage_monthly_read ON public.account_usage_monthly;
CREATE POLICY account_usage_monthly_read ON public.account_usage_monthly
  FOR SELECT TO authenticated
  USING (
    public.pricing_is_global_admin()
    OR public.pricing_is_finance_admin()
    OR public.pricing_organisation_user_can_read(organisation_id)
  );

DROP POLICY IF EXISTS account_usage_monthly_admin_write ON public.account_usage_monthly;
CREATE POLICY account_usage_monthly_admin_write ON public.account_usage_monthly
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

-- billing_alerts
DROP POLICY IF EXISTS billing_alerts_read ON public.billing_alerts;
CREATE POLICY billing_alerts_read ON public.billing_alerts
  FOR SELECT TO authenticated
  USING (
    public.pricing_is_global_admin()
    OR public.pricing_is_finance_admin()
    OR public.pricing_organisation_user_can_read(organisation_id)
  );

DROP POLICY IF EXISTS billing_alerts_admin_write ON public.billing_alerts;
CREATE POLICY billing_alerts_admin_write ON public.billing_alerts
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

-- invoice_drafts / items
DROP POLICY IF EXISTS invoice_drafts_read ON public.invoice_drafts;
CREATE POLICY invoice_drafts_read ON public.invoice_drafts
  FOR SELECT TO authenticated
  USING (
    public.pricing_is_global_admin()
    OR public.pricing_is_finance_admin()
    OR public.pricing_organisation_user_can_read(organisation_id)
  );

DROP POLICY IF EXISTS invoice_drafts_finance_write ON public.invoice_drafts;
CREATE POLICY invoice_drafts_finance_write ON public.invoice_drafts
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

DROP POLICY IF EXISTS invoice_draft_items_read ON public.invoice_draft_items;
CREATE POLICY invoice_draft_items_read ON public.invoice_draft_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoice_drafts d
      WHERE d.id = invoice_draft_id
        AND (
          public.pricing_is_global_admin()
          OR public.pricing_is_finance_admin()
          OR public.pricing_organisation_user_can_read(d.organisation_id)
        )
    )
  );

DROP POLICY IF EXISTS invoice_draft_items_finance_write ON public.invoice_draft_items;
CREATE POLICY invoice_draft_items_finance_write ON public.invoice_draft_items
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

-- upgrade_recommendations
DROP POLICY IF EXISTS upgrade_recommendations_read ON public.upgrade_recommendations;
CREATE POLICY upgrade_recommendations_read ON public.upgrade_recommendations
  FOR SELECT TO authenticated
  USING (
    public.pricing_is_global_admin()
    OR public.pricing_is_finance_admin()
    OR public.pricing_organisation_user_can_read(organisation_id)
  );

DROP POLICY IF EXISTS upgrade_recommendations_admin_write ON public.upgrade_recommendations;
CREATE POLICY upgrade_recommendations_admin_write ON public.upgrade_recommendations
  FOR ALL TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin())
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

-- language_option_requests
DROP POLICY IF EXISTS language_option_requests_read ON public.language_option_requests;
CREATE POLICY language_option_requests_read ON public.language_option_requests
  FOR SELECT TO authenticated
  USING (
    public.pricing_is_global_admin()
    OR public.pricing_is_finance_admin()
    OR public.pricing_organisation_user_can_read(organisation_id)
  );

DROP POLICY IF EXISTS language_option_requests_org_insert ON public.language_option_requests;
CREATE POLICY language_option_requests_org_insert ON public.language_option_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.pricing_organisation_admin_can_write(organisation_id)
    OR public.pricing_is_global_admin()
  );

DROP POLICY IF EXISTS language_option_requests_admin_update ON public.language_option_requests;
CREATE POLICY language_option_requests_admin_update ON public.language_option_requests
  FOR UPDATE TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_admin_can_write(organisation_id))
  WITH CHECK (public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_admin_can_write(organisation_id));

-- pricing_audit_log : lecture admin / finance uniquement
DROP POLICY IF EXISTS pricing_audit_log_read ON public.pricing_audit_log;
CREATE POLICY pricing_audit_log_read ON public.pricing_audit_log
  FOR SELECT TO authenticated
  USING (public.pricing_is_global_admin() OR public.pricing_is_finance_admin());

-- notifications
DROP POLICY IF EXISTS notifications_recipient ON public.notifications;
CREATE POLICY notifications_recipient ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR public.pricing_is_global_admin());

DROP POLICY IF EXISTS notifications_recipient_update ON public.notifications;
CREATE POLICY notifications_recipient_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Grants
GRANT SELECT ON public.pricing, public.pricing_options, public.pricing_overage_rules TO anon, authenticated;
GRANT SELECT ON public.organisation_subscriptions, public.account_usage_monthly,
  public.billing_alerts, public.invoice_drafts, public.invoice_draft_items,
  public.upgrade_recommendations, public.language_option_requests,
  public.notifications TO authenticated;
GRANT SELECT ON public.pricing_audit_log TO authenticated;

COMMIT;
