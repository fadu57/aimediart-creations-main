-- Demande de plan veille (ATELIER / HORIZON mensuel) + fenêtre d'annulation 24 h

ALTER TABLE public.organisation_subscriptions
  ADD COLUMN IF NOT EXISTS standby_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS standby_cancel_deadline_at timestamptz;

COMMENT ON COLUMN public.organisation_subscriptions.standby_requested_at IS
  'Horodatage de la demande de passage en plan veille (restriction navigation immédiate).';
COMMENT ON COLUMN public.organisation_subscriptions.standby_cancel_deadline_at IS
  'Date limite pour annuler la demande (24 h après la demande, sauf si échéance déjà passée).';

CREATE OR REPLACE FUNCTION public.resolve_auth_user_role_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (
      SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      FROM auth.users u
      WHERE u.id = auth.uid()
    ),
    (
      SELECT au.role_id
      FROM public.agency_users au
      WHERE au.user_id = auth.uid()
      ORDER BY au.role_id ASC
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_auth_user_agency_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT au.agency_id
  FROM public.agency_users au
  WHERE au.user_id = auth.uid()
  ORDER BY au.role_id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_organisation_standby_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role integer;
  v_agency uuid;
  v_sub public.organisation_subscriptions%ROWTYPE;
  v_can_request boolean := false;
  v_can_cancel boolean := false;
  v_nav_restricted boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  v_role := public.resolve_auth_user_role_id();
  v_agency := public.resolve_auth_user_agency_id();

  IF v_agency IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'role_id', v_role,
      'has_subscription', false,
      'can_request_standby', false
    );
  END IF;

  SELECT os.*
  INTO v_sub
  FROM public.organisation_subscriptions os
  WHERE os.organisation_id = v_agency
    AND os.status IN ('trial', 'active', 'standby')
  ORDER BY os.started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'role_id', v_role,
      'agency_id', v_agency,
      'has_subscription', false,
      'can_request_standby', false
    );
  END IF;

  v_nav_restricted :=
    v_sub.standby_status = 'active'
    OR v_sub.status = 'standby'
    OR v_sub.standby_requested_at IS NOT NULL;

  v_can_cancel :=
    v_sub.standby_requested_at IS NOT NULL
    AND v_sub.standby_status = 'inactive'
    AND v_sub.status <> 'standby'
    AND now() < v_sub.standby_requested_at + interval '24 hours'
    AND (v_sub.next_renewal_at IS NULL OR now() < v_sub.next_renewal_at);

  v_can_request :=
    v_role IS NOT NULL
    AND v_role < 6
    AND v_sub.billing_cycle = 'monthly'
    AND v_sub.plan_code IN ('ATELIER'::public.pricing_plan_code, 'HORIZON'::public.pricing_plan_code)
    AND v_sub.standby_requested_at IS NULL
    AND v_sub.standby_status = 'inactive'
    AND v_sub.status = 'active';

  RETURN jsonb_build_object(
    'authenticated', true,
    'role_id', v_role,
    'agency_id', v_agency,
    'has_subscription', true,
    'subscription_id', v_sub.id,
    'plan_code', v_sub.plan_code,
    'billing_cycle', v_sub.billing_cycle,
    'status', v_sub.status,
    'standby_status', v_sub.standby_status,
    'standby_requested_at', v_sub.standby_requested_at,
    'standby_cancel_deadline_at', v_sub.standby_cancel_deadline_at,
    'standby_effective_at', v_sub.next_renewal_at,
    'next_renewal_at', v_sub.next_renewal_at,
    'is_nav_restricted', v_nav_restricted,
    'can_request_standby', v_can_request,
    'can_cancel_standby_request', v_can_cancel
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_organisation_standby()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role integer;
  v_agency uuid;
  v_sub public.organisation_subscriptions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  v_role := public.resolve_auth_user_role_id();
  IF v_role IS NULL OR v_role >= 6 THEN
    RAISE EXCEPTION 'Le plan veille est réservé aux utilisateurs de niveau inférieur à 6';
  END IF;

  v_agency := public.resolve_auth_user_agency_id();
  IF v_agency IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation rattachée';
  END IF;

  SELECT os.*
  INTO v_sub
  FROM public.organisation_subscriptions os
  WHERE os.organisation_id = v_agency
    AND os.status = 'active'
  ORDER BY os.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun abonnement actif trouvé';
  END IF;

  IF v_sub.billing_cycle <> 'monthly' THEN
    RAISE EXCEPTION 'Le plan veille est réservé aux abonnements mensuels';
  END IF;

  IF v_sub.plan_code NOT IN ('ATELIER'::public.pricing_plan_code, 'HORIZON'::public.pricing_plan_code) THEN
    RAISE EXCEPTION 'Le plan veille est réservé aux formules Atelier et Horizon';
  END IF;

  IF v_sub.standby_requested_at IS NOT NULL OR v_sub.standby_status = 'active' THEN
    RAISE EXCEPTION 'Une demande de plan veille est déjà en cours';
  END IF;

  UPDATE public.organisation_subscriptions
  SET
    standby_requested_at = now(),
    standby_cancel_deadline_at = now() + interval '24 hours',
    updated_at = now()
  WHERE id = v_sub.id;

  RETURN public.get_my_organisation_standby_state();
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_organisation_standby_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role integer;
  v_agency uuid;
  v_sub public.organisation_subscriptions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  v_role := public.resolve_auth_user_role_id();
  IF v_role IS NULL OR v_role >= 6 THEN
    RAISE EXCEPTION 'Action non autorisée';
  END IF;

  v_agency := public.resolve_auth_user_agency_id();
  IF v_agency IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation rattachée';
  END IF;

  SELECT os.*
  INTO v_sub
  FROM public.organisation_subscriptions os
  WHERE os.organisation_id = v_agency
    AND os.standby_requested_at IS NOT NULL
  ORDER BY os.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune demande de plan veille à annuler';
  END IF;

  IF NOT (
    now() < v_sub.standby_requested_at + interval '24 hours'
    AND (v_sub.next_renewal_at IS NULL OR now() < v_sub.next_renewal_at)
  ) THEN
    RAISE EXCEPTION 'Le délai d''annulation de 24 h est expiré ou la nouvelle échéance a démarré';
  END IF;

  UPDATE public.organisation_subscriptions
  SET
    standby_requested_at = NULL,
    standby_cancel_deadline_at = NULL,
    updated_at = now()
  WHERE id = v_sub.id;

  RETURN public.get_my_organisation_standby_state();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organisation_standby_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_organisation_standby() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_organisation_standby_request() TO authenticated;
