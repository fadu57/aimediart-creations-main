-- Plan cible des conditions commerciales agence (ATELIER / HORIZON / RAYONNEMENT)
BEGIN;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS commercial_plan_code public.pricing_plan_code;

COMMENT ON COLUMN public.agencies.commercial_plan_code IS
  'Plan payant visé par le preset commercial. Les remises ne s''appliquent qu''à ce plan lors de la souscription.';

CREATE OR REPLACE FUNCTION public.subscribe_organisation_plan(
  p_plan_code public.pricing_plan_code,
  p_billing_cycle public.billing_cycle DEFAULT 'monthly',
  p_organisation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_agency public.agencies%ROWTYPE;
  v_pricing public.pricing%ROWTYPE;
  v_existing public.organisation_subscriptions%ROWTYPE;
  v_billing_cycle public.billing_cycle;
  v_list_price numeric(10,2);
  v_discount_pct numeric(5,2);
  v_discount_eur numeric(10,2);
  v_net_price numeric(10,2);
  v_commercial_kind public.commercial_kind;
  v_sponsor_until timestamptz;
  v_snapshot jsonb;
  v_sub_id uuid;
  v_started_at timestamptz := now();
  v_trial_ends timestamptz;
  v_next_renewal timestamptz;
  v_status public.subscription_status;
  v_is_trial boolean;
  v_trial_days integer;
  v_commercial_applies boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF p_plan_code NOT IN (
    'ETINCELLE'::public.pricing_plan_code,
    'ATELIER'::public.pricing_plan_code,
    'HORIZON'::public.pricing_plan_code
  ) THEN
    RAISE EXCEPTION 'plan_not_self_service';
  END IF;

  IF p_organisation_id IS NOT NULL THEN
    v_org_id := p_organisation_id;
    IF NOT (
      public.pricing_is_global_admin()
      OR public.pricing_is_finance_admin()
      OR public.pricing_organisation_admin_can_write(v_org_id)
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSE
    SELECT au.agency_id
    INTO v_org_id
    FROM public.agency_users au
    WHERE au.user_id = v_user_id
      AND au.role_id = 4
    ORDER BY au.created_at ASC NULLS LAST
    LIMIT 1;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'organisation_admin_required';
    END IF;
  END IF;

  SELECT *
  INTO v_agency
  FROM public.agencies a
  WHERE a.id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organisation_not_found';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.organisation_subscriptions os
  WHERE os.organisation_id = v_org_id
    AND os.status IN ('trial', 'active', 'standby')
  ORDER BY os.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.plan_code = p_plan_code THEN
      RAISE EXCEPTION 'subscription_already_active';
    END IF;

    IF NOT (
      v_existing.plan_code = 'ETINCELLE'::public.pricing_plan_code
      AND p_plan_code IN (
        'ATELIER'::public.pricing_plan_code,
        'HORIZON'::public.pricing_plan_code
      )
    ) THEN
      RAISE EXCEPTION 'subscription_change_not_allowed';
    END IF;
  END IF;

  SELECT *
  INTO v_pricing
  FROM public.pricing p
  WHERE p.plan_code = p_plan_code
    AND p.is_active = true
    AND p.archived_at IS NULL
  ORDER BY p.pricing_id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_not_found';
  END IF;

  IF COALESCE(v_pricing.is_quote_only, false) THEN
    RAISE EXCEPTION 'plan_quote_only';
  END IF;

  v_commercial_applies :=
    p_plan_code <> 'ETINCELLE'::public.pricing_plan_code
    AND (
      v_agency.commercial_plan_code IS NULL
      OR v_agency.commercial_plan_code = p_plan_code
    );

  IF v_commercial_applies THEN
    v_commercial_kind := COALESCE(v_agency.commercial_kind, 'standard'::public.commercial_kind);
    v_discount_pct := COALESCE(v_agency.discount_percent, 0);
    v_discount_eur := COALESCE(v_agency.discount_amount_eur, 0);
    v_sponsor_until := v_agency.sponsor_valid_until;
  ELSE
    v_commercial_kind := 'standard'::public.commercial_kind;
    v_discount_pct := 0;
    v_discount_eur := 0;
    v_sponsor_until := NULL;
  END IF;

  IF p_plan_code = 'ETINCELLE'::public.pricing_plan_code THEN
    v_billing_cycle := 'monthly'::public.billing_cycle;
    v_list_price := 0;
    v_trial_days := COALESCE(v_pricing.trial_duration_days, 30);
    v_is_trial := true;
    v_status := 'trial'::public.subscription_status;
    v_trial_ends := v_started_at + make_interval(days => v_trial_days);
    v_next_renewal := NULL;
  ELSE
    v_billing_cycle := COALESCE(p_billing_cycle, 'monthly'::public.billing_cycle);
    IF v_billing_cycle = 'annual'::public.billing_cycle THEN
      v_list_price := COALESCE(
        v_pricing.pricing_annual_remis,
        v_pricing.pricing_annuel,
        v_pricing.pricing_monthly_ttc_eur * 12
      );
      v_next_renewal := v_started_at + interval '1 year';
    ELSE
      v_list_price := v_pricing.pricing_monthly_ttc_eur;
      v_next_renewal := v_started_at + interval '1 month';
    END IF;
    v_is_trial := false;
    v_status := 'active'::public.subscription_status;
    v_trial_ends := NULL;
  END IF;

  v_net_price := public.compute_subscription_net_price(v_list_price, v_discount_pct, v_discount_eur);

  v_snapshot := jsonb_build_object(
    'pricing', to_jsonb(v_pricing),
    'commercial', jsonb_build_object(
      'list_price_eur', v_list_price,
      'discount_percent', v_discount_pct,
      'discount_amount_eur', v_discount_eur,
      'net_price_eur', v_net_price,
      'commercial_kind', v_commercial_kind,
      'commercial_plan_code', v_agency.commercial_plan_code,
      'sponsor_valid_until', v_sponsor_until,
      'agency_commercial_notes', v_agency.commercial_notes
    ),
    'subscribed_at', v_started_at,
    'subscribed_by', v_user_id,
    'billing_cycle', v_billing_cycle
  );

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.organisation_subscriptions os
    SET
      pricing_id = v_pricing.pricing_id,
      plan_code = p_plan_code,
      billing_cycle = v_billing_cycle,
      status = v_status,
      standby_status = 'inactive'::public.standby_status,
      is_trial = v_is_trial,
      started_at = v_started_at,
      ends_at = COALESCE(v_trial_ends, v_next_renewal),
      trial_ends_at = v_trial_ends,
      next_renewal_at = v_next_renewal,
      list_price_eur = v_list_price,
      discount_percent = v_discount_pct,
      discount_amount_eur = v_discount_eur,
      net_price_eur = v_net_price,
      commercial_kind = v_commercial_kind,
      sponsor_valid_until = v_sponsor_until,
      commercial_notes = v_agency.commercial_notes,
      pricing_snapshot = v_snapshot,
      updated_at = now()
    WHERE os.id = v_existing.id
    RETURNING os.id INTO v_sub_id;
  ELSE
    INSERT INTO public.organisation_subscriptions (
      organisation_id,
      pricing_id,
      plan_code,
      billing_cycle,
      status,
      standby_status,
      is_trial,
      started_at,
      ends_at,
      trial_ends_at,
      next_renewal_at,
      list_price_eur,
      discount_percent,
      discount_amount_eur,
      net_price_eur,
      commercial_kind,
      sponsor_valid_until,
      commercial_notes,
      pricing_snapshot
    )
    VALUES (
      v_org_id,
      v_pricing.pricing_id,
      p_plan_code,
      v_billing_cycle,
      v_status,
      'inactive'::public.standby_status,
      v_is_trial,
      v_started_at,
      COALESCE(v_trial_ends, v_next_renewal),
      v_trial_ends,
      v_next_renewal,
      v_list_price,
      v_discount_pct,
      v_discount_eur,
      v_net_price,
      v_commercial_kind,
      v_sponsor_until,
      v_agency.commercial_notes,
      v_snapshot
    )
    RETURNING id INTO v_sub_id;
  END IF;

  RETURN jsonb_build_object(
    'subscription_id', v_sub_id,
    'organisation_id', v_org_id,
    'plan_code', p_plan_code,
    'billing_cycle', v_billing_cycle,
    'status', v_status,
    'list_price_eur', v_list_price,
    'discount_percent', v_discount_pct,
    'discount_amount_eur', v_discount_eur,
    'net_price_eur', v_net_price,
    'commercial_kind', v_commercial_kind,
    'commercial_plan_code', v_agency.commercial_plan_code,
    'started_at', v_started_at,
    'trial_ends_at', v_trial_ends,
    'next_renewal_at', v_next_renewal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.subscribe_organisation_plan(public.pricing_plan_code, public.billing_cycle, uuid)
  TO authenticated;

COMMIT;
