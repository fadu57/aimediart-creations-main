-- =============================================================================
-- Baseline unique — remplace les 74 migrations legacy (voir supabase/migrations_archive/)
-- Générée par scripts/build-baseline-migration.mjs à partir d'un dump pg_dump de PROD
-- (fourni par l'associé le 2026-07-27, confirmé comme reflétant l'état réel de prod).
-- Ticket : AIM-173.
--
-- Exclusions volontaires par rapport au dump source :
--   - CREATE SCHEMA public / storage (provisionnés automatiquement par Supabase)
--   - Schéma "storage" : uniquement POLICY conservées, le reste (tables, fonctions,
--     triggers, activation de la RLS) est géré par le service storage-api.
-- =============================================================================

BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: Age; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Age" AS ENUM (
    '0-12 ans (Enfant)',
    '13-17 ans (adolescent)',
    '18-24 ans (Jeunes adultes / Étudiants)',
    '25-34 ans (Jeunes actifs)',
    '35-44 ans (Actifs confirmés)',
    '45-54 ans (Actifs expérimentés)',
    '55-64 ans (Actifs très expérimentés)',
    '65 ans et plus (Retraités)'
);

--
-- Name: agency_legal_rep_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agency_legal_rep_role AS ENUM (
    'gerant',
    'president',
    'president_dg',
    'president_ca',
    'directeur_general',
    'maire',
    'president_conseil_departemental',
    'president_conseil_regional',
    'dgs',
    'directeur'
);

--
-- Name: agency_structure_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agency_structure_category AS ENUM (
    'private_lucratif',
    'private_non_lucratif',
    'public_parapublic'
);

--
-- Name: agency_structure_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agency_structure_type AS ENUM (
    'societe_commerciale',
    'entreprise_individuelle',
    'societe_civile',
    'profession_liberale',
    'association',
    'fondation',
    'fonds_dotation',
    'administration_etat',
    'collectivite_territoriale',
    'etablissement_public'
);

--
-- Name: alert_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);

--
-- Name: alert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_status AS ENUM (
    'open',
    'acknowledged',
    'resolved',
    'dismissed'
);

--
-- Name: alert_type; Type: TYPE; Schema: public; Owner: -
--

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

--
-- Name: audit_action_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action_type AS ENUM (
    'create',
    'update',
    'delete',
    'approve',
    'reject',
    'issue',
    'waive',
    'compute',
    'notify'
);

--
-- Name: billing_cycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_cycle AS ENUM (
    'monthly',
    'annual'
);

--
-- Name: genre_FR; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."genre_FR" AS ENUM (
    'F',
    'M'
);

--
-- Name: invoice_draft_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_draft_status AS ENUM (
    'draft',
    'pending_review',
    'approved',
    'rejected',
    'issued',
    'cancelled',
    'waived'
);

--
-- Name: invoice_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_item_type AS ENUM (
    'subscription',
    'standby',
    'artwork_overage',
    'visitor_overage',
    'language_mediation',
    'language_audio',
    'commercial_adjustment'
);

--
-- Name: language_option_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.language_option_request_status AS ENUM (
    'requested',
    'approved',
    'rejected',
    'active',
    'cancelled'
);

--
-- Name: language_option_request_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.language_option_request_type AS ENUM (
    'mediation',
    'audio'
);

--
-- Name: month_FR; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."month_FR" AS ENUM (
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
);

--
-- Name: TYPE "month_FR"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public."month_FR" IS 'mois';

--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'unread',
    'read',
    'archived'
);

--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

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

--
-- Name: overage_metric_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.overage_metric_code AS ENUM (
    'ARTWORKS',
    'VISITORS'
);

--
-- Name: pricing_option_billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pricing_option_billing_mode AS ENUM (
    'monthly_recurring',
    'one_time',
    'on_quote'
);

--
-- Name: pricing_option_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pricing_option_code AS ENUM (
    'EXTRA_MEDIATION_LANG',
    'EXTRA_AUDIO_LANG',
    'STANDBY',
    'EXTRA_ARTWORKS_PACK'
);

--
-- Name: pricing_plan_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pricing_plan_code AS ENUM (
    'ETINCELLE',
    'ATELIER',
    'HORIZON',
    'ENVERGURE',
    'RAYONNEMENT',
    'ZENITH'
);

--
-- Name: recommendation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recommendation_status AS ENUM (
    'pending',
    'presented',
    'accepted',
    'declined',
    'expired'
);

--
-- Name: standby_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.standby_status AS ENUM (
    'inactive',
    'active'
);

--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'trial',
    'active',
    'standby',
    'expired',
    'suspended',
    'cancelled'
);

--
-- Name: upgrade_target_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.upgrade_target_plan AS ENUM (
    'ATELIER',
    'HORIZON',
    'ENVERGURE',
    'RAYONNEMENT'
);

--
-- Name: _pseudo_pool_pick_label(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._pseudo_pool_pick_label(fr text, en text, de text, es text, it text, locale text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT NULLIF(trim(
  CASE lower(left(coalesce(locale, 'fr'), 2))
    WHEN 'fr' THEN coalesce(NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(de), ''), NULLIF(trim(es), ''), NULLIF(trim(it), ''))
    WHEN 'en' THEN coalesce(NULLIF(trim(en), ''), NULLIF(trim(fr), ''), NULLIF(trim(de), ''), NULLIF(trim(es), ''), NULLIF(trim(it), ''))
    WHEN 'de' THEN coalesce(NULLIF(trim(de), ''), NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(es), ''), NULLIF(trim(it), ''))
    WHEN 'es' THEN coalesce(NULLIF(trim(es), ''), NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(de), ''), NULLIF(trim(it), ''))
    WHEN 'it' THEN coalesce(NULLIF(trim(it), ''), NULLIF(trim(fr), ''), NULLIF(trim(en), ''), NULLIF(trim(de), ''), NULLIF(trim(es), ''))
    ELSE coalesce(NULLIF(trim(fr), ''), NULLIF(trim(en), ''), '')
  END
), '');
$$;

--
-- Name: _random_visitor_recovery_plain(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._random_visitor_recovery_plain() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  plain text := '';
  i int;
  b bytea;
BEGIN
  b := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    plain := plain || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  END LOOP;
  RETURN plain;
END;
$$;

--
-- Name: _resolve_visitor_id_for_expo_visit(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._resolve_visitor_id_for_expo_visit(p_visitor_client_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_cid text := NULLIF(pg_catalog.btrim(p_visitor_client_id), '');
  v_id uuid;
  v_auth uuid := auth.uid();
BEGIN
  IF v_cid IS NOT NULL THEN
    SELECT v.id INTO v_id
    FROM public.visitors v
    WHERE v.visitor_client_id = v_cid
    LIMIT 1;
  END IF;

  IF v_id IS NULL AND v_auth IS NOT NULL THEN
    SELECT v.id INTO v_id
    FROM public.visitors v
    WHERE v.auth_user_id = v_auth
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

--
-- Name: FUNCTION _resolve_visitor_id_for_expo_visit(p_visitor_client_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._resolve_visitor_id_for_expo_visit(p_visitor_client_id text) IS 'Interne : résout public.visitors.id. Pas de création implicite de visiteur.';

--
-- Name: _visitor_owns_expo_visit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._visitor_owns_expo_visit(p_visit_id uuid, p_visitor_client_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.visitor_expo_visits vev
    INNER JOIN public.visitors v ON v.id = vev.visitor_id
    WHERE vev.id = p_visit_id
      AND (
        (
          NULLIF(pg_catalog.btrim(p_visitor_client_id), '') IS NOT NULL
          AND v.visitor_client_id = NULLIF(pg_catalog.btrim(p_visitor_client_id), '')
        )
        OR (
          auth.uid() IS NOT NULL
          AND v.auth_user_id IS NOT NULL
          AND v.auth_user_id = auth.uid()
        )
      )
  );
$$;

--
-- Name: FUNCTION _visitor_owns_expo_visit(p_visit_id uuid, p_visitor_client_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._visitor_owns_expo_visit(p_visit_id uuid, p_visitor_client_id text) IS 'Interne : vérifie l''appartenance visiteur ↔ session (touch/end).';

--
-- Name: agencies_is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agencies_is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    (
      SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      FROM auth.users u
      WHERE u.id = auth.uid()
    )
  ) BETWEEN 1 AND 3;
$$;

--
-- Name: FUNCTION agencies_is_global_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.agencies_is_global_admin() IS 'Admin global : app_metadata.role_id 1-3 (JWT ou auth.users.raw_app_meta_data).';

--
-- Name: agencies_user_can_read_row(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agencies_user_can_read_row(p_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.agency_id = p_agency_id
      AND au.role_id BETWEEN 4 AND 6
  );
$$;

--
-- Name: FUNCTION agencies_user_can_read_row(p_agency_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.agencies_user_can_read_row(p_agency_id uuid) IS 'Staff organisation : agency_users role_id 4-6 rattaché à l''agence.';

--
-- Name: agencies_user_can_update_own_agency_row(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agencies_user_can_update_own_agency_row(p_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int IN (1, 2, 3)
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = auth.uid()
        AND au.role_id = 4
        AND au.agency_id = p_agency_id
    )
  );
$$;

--
-- Name: FUNCTION agencies_user_can_update_own_agency_row(p_agency_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.agencies_user_can_update_own_agency_row(p_agency_id uuid) IS 'RLS agencies : admin agence (role_id 4) met à jour uniquement sa fiche agence.';

--
-- Name: agency_legal_rep_role_valid(public.agency_structure_type, public.agency_legal_rep_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agency_legal_rep_role_valid(p_structure_type public.agency_structure_type, p_role public.agency_legal_rep_role) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_structure_type IS NULL OR p_role IS NULL THEN true
    WHEN p_structure_type IN (
      'societe_commerciale'::public.agency_structure_type,
      'entreprise_individuelle'::public.agency_structure_type,
      'societe_civile'::public.agency_structure_type,
      'profession_liberale'::public.agency_structure_type
    ) THEN p_role IN (
      'gerant'::public.agency_legal_rep_role,
      'president'::public.agency_legal_rep_role,
      'president_dg'::public.agency_legal_rep_role,
      'president_ca'::public.agency_legal_rep_role,
      'directeur_general'::public.agency_legal_rep_role
    )
    WHEN p_structure_type = 'collectivite_territoriale'::public.agency_structure_type THEN p_role IN (
      'maire'::public.agency_legal_rep_role,
      'president_conseil_departemental'::public.agency_legal_rep_role,
      'president_conseil_regional'::public.agency_legal_rep_role,
      'dgs'::public.agency_legal_rep_role
    )
    WHEN p_structure_type IN (
      'association'::public.agency_structure_type,
      'fondation'::public.agency_structure_type,
      'fonds_dotation'::public.agency_structure_type,
      'administration_etat'::public.agency_structure_type,
      'etablissement_public'::public.agency_structure_type
    ) THEN p_role IN (
      'president'::public.agency_legal_rep_role,
      'directeur'::public.agency_legal_rep_role
    )
    ELSE false
  END;
$$;

--
-- Name: ai_limit_current_usage(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_limit_current_usage(p_provider text, p_model text, p_limit_type text) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE p_limit_type
    WHEN 'TPM' THEN COALESCE((
      SELECT SUM(total_tokens)::numeric FROM public.ai_usage_logs
      WHERE provider = p_provider AND created_at >= now() - interval '1 minute'
        AND public.ai_limit_matches_model(p_model, model_id)
    ), 0)
    WHEN 'TPD' THEN COALESCE((
      SELECT SUM(total_tokens)::numeric FROM public.ai_usage_logs
      WHERE provider = p_provider AND created_at >= now() - interval '24 hours'
        AND public.ai_limit_matches_model(p_model, model_id)
    ), 0)
    WHEN 'RPM' THEN COALESCE((
      SELECT COUNT(*)::numeric FROM public.ai_usage_logs
      WHERE provider = p_provider AND created_at >= now() - interval '1 minute'
        AND public.ai_limit_matches_model(p_model, model_id)
    ), 0)
    WHEN 'RPD' THEN COALESCE((
      SELECT COUNT(*)::numeric FROM public.ai_usage_logs
      WHERE provider = p_provider AND created_at >= now() - interval '24 hours'
        AND public.ai_limit_matches_model(p_model, model_id)
    ), 0)
    WHEN 'ASH' THEN COALESCE((
      SELECT SUM(COALESCE((metadata->>'audio_seconds')::numeric, 0))
      FROM public.ai_usage_logs
      WHERE provider = p_provider AND created_at >= now() - interval '1 hour'
        AND public.ai_limit_matches_model(p_model, model_id)
    ), 0)
    WHEN 'ASD' THEN COALESCE((
      SELECT SUM(COALESCE((metadata->>'audio_seconds')::numeric, 0))
      FROM public.ai_usage_logs
      WHERE provider = p_provider AND created_at >= now() - interval '24 hours'
        AND public.ai_limit_matches_model(p_model, model_id)
    ), 0)
    ELSE 0
  END;
$$;

--
-- Name: ai_limit_matches_model(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_limit_matches_model(p_model_limit text, p_model_id text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT p_model_limit IS NULL
      OR p_model_id = p_model_limit
      OR p_model_id ILIKE ('%' || p_model_limit || '%');
$$;

--
-- Name: ai_upsert_observed_limit(text, text, text, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_upsert_observed_limit(p_provider text, p_model text, p_limit_type text, p_limit_value integer, p_remaining integer DEFAULT NULL::integer, p_reset_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Snapshot historique
  INSERT INTO public.ai_ratelimit_snapshots 
    (provider, model, limit_type, limit_value, remaining, reset_at)
  VALUES 
    (p_provider, p_model, p_limit_type, p_limit_value, p_remaining, p_reset_at);

  -- Upsert dans la table de limites (observed = source de vérité)
  INSERT INTO public.ai_provider_limits 
    (provider, model, limit_type, limit_value_observed, observed_at, observed_source)
  VALUES 
    (p_provider, p_model, p_limit_type, p_limit_value, now(), p_provider || '_header')
  ON CONFLICT (provider, model, limit_type) DO UPDATE SET
    limit_value_observed = EXCLUDED.limit_value_observed,
    observed_at          = EXCLUDED.observed_at,
    observed_source      = EXCLUDED.observed_source,
    updated_at           = now();
END;
$$;

--
-- Name: app_settings_is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_settings_is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role_id')::integer, 0) BETWEEN 1 AND 3
    OR EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE user_id = auth.uid()
        AND role_id BETWEEN 4 AND 6
    );
$$;

--
-- Name: artist_agency_details_is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.artist_agency_details_is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int IN (1, 2, 3)
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = auth.uid()
        AND au.role_id IN (1, 2, 3)
    )
  );
$$;

--
-- Name: FUNCTION artist_agency_details_is_global_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.artist_agency_details_is_global_admin() IS 'True si l’utilisateur est admin global selon public.users.role_id (1–3).';

--
-- Name: artist_agency_details_user_is_admin_agency_for(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.artist_agency_details_user_is_admin_agency_for(p_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int IN (1, 2, 3)
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = auth.uid()
        AND au.role_id = 4
        AND au.agency_id = p_agency_id
    )
  );
$$;

--
-- Name: FUNCTION artist_agency_details_user_is_admin_agency_for(p_agency_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.artist_agency_details_user_is_admin_agency_for(p_agency_id uuid) IS 'True si admin agence (role_id=4) et même agency_id que la ligne.';

--
-- Name: artists_is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.artists_is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int IN (1, 2, 3)
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = auth.uid()
        AND au.role_id IN (1, 2, 3)
    )
  );
$$;

--
-- Name: artists_user_is_admin_agency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.artists_user_is_admin_agency() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int IN (1, 2, 3, 4)
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = auth.uid()
        AND au.role_id = 4
        AND au.agency_id IS NOT NULL
    )
  );
$$;

--
-- Name: artwork_group_is_visitor_visible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.artwork_group_is_visitor_visible(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.artwork_group_members agm
    INNER JOIN public.artworks aw ON aw.artwork_id = agm.artwork_id
    WHERE agm.group_id = p_group_id
      AND aw.artwork_deleted_at IS NULL
      AND COALESCE(aw.deleted_at, aw.artwork_deleted_at) IS NULL
      AND lower(trim(COALESCE(aw.artwork_status, ''))) = 'active'
  );
$$;

--
-- Name: FUNCTION artwork_group_is_visitor_visible(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.artwork_group_is_visitor_visible(p_group_id uuid) IS 'True si le groupe a au moins une œuvre active non supprimée.';

--
-- Name: audio_file_is_ready(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audio_file_is_ready(p_storage_path text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audio_files af
    WHERE af.storage_path = p_storage_path
      AND af.status = 'ready'
  );
$$;

--
-- Name: FUNCTION audio_file_is_ready(p_storage_path text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.audio_file_is_ready(p_storage_path text) IS 'True si un audio_files.status = ready référence ce storage_path. SECURITY DEFINER : indépendant de la policy RLS anon sur audio_files.';

--
-- Name: calculate_overage_amount(integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_overage_amount(p_packs integer, p_pack_price numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT round(COALESCE(p_packs, 0) * COALESCE(p_pack_price, 0), 2);
$$;

--
-- Name: calculate_overage_packs(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_overage_packs(p_actual integer, p_included integer, p_pack_size integer) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_actual <= p_included OR p_pack_size IS NULL OR p_pack_size <= 0 THEN 0
    ELSE ceil((p_actual - p_included)::numeric / p_pack_size)::integer
  END;
$$;

--
-- Name: cancel_my_organisation_standby_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_my_organisation_standby_request() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: avatars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_pseudo_fr text,
    prompt_en text,
    noun_en text NOT NULL,
    adjective_en text NOT NULL,
    full_pseudo_en text NOT NULL,
    noun_fr text,
    adjective_fr text,
    noun_de text,
    adjective_de text,
    full_pseudo_de text,
    noun_es text,
    adjective_es text,
    full_pseudo_es text,
    noun_it text,
    adjective_it text,
    full_pseudo_it text,
    created_at timestamp with time zone DEFAULT now(),
    prompt text,
    status text DEFAULT 'pending'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    storage_bucket text DEFAULT 'avatars'::text NOT NULL,
    generation_provider text DEFAULT 'leonardo'::text NOT NULL,
    "genre_FR" text,
    adjectif_fr text,
    noun_id bigint,
    adjective_key text,
    CONSTRAINT avatars_status_check_new CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'error'::text])))
);

--
-- Name: claim_random_avatars(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_random_avatars(batch_size integer DEFAULT 10) RETURNS SETOF public.avatars
    LANGUAGE plpgsql
    AS $$
begin
  return query
  with picked as (
    select id
    from public.avatars
    where status = 'pending'
      and image_path is null
      and prompt_en is not null
    order by random()
    limit batch_size
    for update skip locked
  )
  update public.avatars a
  set
    status = 'running',
    generation_started_at = now(),
    generation_attempts = coalesce(a.generation_attempts, 0) + 1,
    error_message = null
  from picked
  where a.id = picked.id
  returning a.*;
end;
$$;

--
-- Name: close_stale_error_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_stale_error_sessions() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: FUNCTION close_stale_error_sessions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.close_stale_error_sessions() IS 'Clôture les sessions ouvertes dont last_activity_at dépasse le seuil « abandonnée » (settings_presence_thresholds).';

--
-- Name: compute_account_usage_monthly(uuid, date, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_account_usage_monthly(p_organisation_id uuid, p_period_month date, p_force boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: compute_subscription_net_price(numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_subscription_net_price(p_list_price numeric, p_discount_percent numeric, p_discount_amount_eur numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT GREATEST(
    0::numeric,
    round(
      COALESCE(p_list_price, 0) * (1 - COALESCE(p_discount_percent, 0) / 100.0)
      - COALESCE(p_discount_amount_eur, 0),
      2
    )
  );
$$;

--
-- Name: confirm_visitor_pseudo_from_client(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_visitor_pseudo_from_client(p_visitor_client_id text, p_pseudo text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: confirm_visitor_pseudo_from_client(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_visitor_pseudo_from_client(p_visitor_client_id text, p_pseudo text, p_avatar_url text DEFAULT NULL::text, p_avatar_object_path text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  ps text := nullif(trim(p_pseudo), '');
  cid text := nullif(trim(p_visitor_client_id), '');
  av_url text := nullif(trim(p_avatar_url), '');
  av_path text := nullif(trim(p_avatar_object_path), '');
BEGIN
  IF cid IS NULL OR ps IS NULL THEN
    RAISE EXCEPTION 'visitor_client_id et pseudo requis';
  END IF;

  IF length(ps) > 80 THEN
    RAISE EXCEPTION 'pseudo trop long (max 80)';
  END IF;

  UPDATE public.visitors v
  SET
    visitor_pseudo = substring(ps FROM 1 FOR 80),
    avatar_url = COALESCE(left(av_url, 2048), v.avatar_url),
    avatar_object_path = COALESCE(left(av_path, 512), v.avatar_object_path),
    last_seen_at = now()
  WHERE v.visitor_client_id = cid
  RETURNING v.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'visiteur introuvable pour ce visitor_client_id';
  END IF;

  RETURN v_id;
END;
$$;

--
-- Name: confirm_visitor_pseudo_from_client(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_visitor_pseudo_from_client(p_visitor_client_id text, p_pseudo text, p_avatar_url text DEFAULT NULL::text, p_avatar_object_path text DEFAULT NULL::text, p_selfie_url text DEFAULT NULL::text, p_selfie_object_path text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  ps text := nullif(trim(p_pseudo), '');
  cid text := nullif(trim(p_visitor_client_id), '');
  av_url text := nullif(trim(p_avatar_url), '');
  av_path text := nullif(trim(p_avatar_object_path), '');
  sf_url text := nullif(trim(p_selfie_url), '');
  sf_path text := nullif(trim(p_selfie_object_path), '');
BEGIN
  IF cid IS NULL OR ps IS NULL THEN
    RAISE EXCEPTION 'visitor_client_id et pseudo requis';
  END IF;

  IF length(ps) > 80 THEN
    RAISE EXCEPTION 'pseudo trop long (max 80)';
  END IF;

  UPDATE public.visitors v
  SET
    visitor_pseudo = substring(ps FROM 1 FOR 80),
    avatar_url = COALESCE(left(av_url, 2048), v.avatar_url),
    avatar_object_path = COALESCE(left(av_path, 512), v.avatar_object_path),
    selfie_url = COALESCE(left(sf_url, 2048), v.selfie_url),
    selfie_object_path = COALESCE(left(sf_path, 512), v.selfie_object_path),
    last_seen_at = now()
  WHERE v.visitor_client_id = cid
  RETURNING v.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'visiteur introuvable pour ce visitor_client_id';
  END IF;

  RETURN v_id;
END;
$$;

--
-- Name: count_ai_usage_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_ai_usage_events() RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select count(*)::bigint from public.ai_usage_events;
$$;

--
-- Name: count_organisation_artworks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_organisation_artworks(p_organisation_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::integer
  FROM public.artworks a
  WHERE a.artwork_agency_id = p_organisation_id
    AND a.artwork_deleted_at IS NULL;
$$;

--
-- Name: FUNCTION count_organisation_artworks(p_organisation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.count_organisation_artworks(p_organisation_id uuid) IS '[HYPOTHÈSE H2] Compte les œuvres non supprimées rattachées à l''organisation via artwork_agency_id.';

--
-- Name: count_organisation_visitors_for_month(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_organisation_visitors_for_month(p_organisation_id uuid, p_period_month date) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::integer
  FROM public.visitor_feedback vf
  WHERE vf.agency_id = p_organisation_id
    AND vf.submitted_at >= p_period_month::timestamptz
    AND vf.submitted_at < (p_period_month + interval '1 month')::timestamptz;
$$;

--
-- Name: FUNCTION count_organisation_visitors_for_month(p_organisation_id uuid, p_period_month date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.count_organisation_visitors_for_month(p_organisation_id uuid, p_period_month date) IS '[HYPOTHÈSE H1] 1 ligne visitor_feedback = 1 visiteur ; filtre agency_id + submitted_at sur le mois calendaire UTC.';

--
-- Name: create_organisation_notifications_for_alert(uuid, public.notification_type, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organisation_notifications_for_alert(p_organisation_id uuid, p_type public.notification_type, p_title text, p_message text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: create_travel_diary_share_link(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_travel_diary_share_link(p_visitor_id text, p_expo_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_visitor_id text := nullif(trim(p_visitor_id), '');
  v_existing public.travel_diary_share_links%ROWTYPE;
  v_token text;
  v_expires timestamptz := now() + interval '30 days';
BEGIN
  IF v_visitor_id IS NULL THEN
    RAISE EXCEPTION 'missing_visitor_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.visitor_feedback vf
    WHERE vf.visitor_id = v_visitor_id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'no_diary';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.travel_diary_share_links s
  WHERE s.visitor_client_id = v_visitor_id
    AND s.expo_id IS NOT DISTINCT FROM p_expo_id
    AND s.expires_at > now()
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'token', v_existing.token,
      'expires_at', v_existing.expires_at
    );
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.travel_diary_share_links (
    token,
    visitor_client_id,
    expo_id,
    expires_at,
    created_by
  )
  VALUES (
    v_token,
    v_visitor_id,
    p_expo_id,
    v_expires,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires
  );
END;
$$;

--
-- Name: current_role_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_role_id() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int,
    (SELECT au.role_id FROM public.agency_users au
     WHERE au.user_id = auth.uid() LIMIT 1)
  );
$$;

--
-- Name: detect_etincelle_expiring_organisations(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detect_etincelle_expiring_organisations(p_days_before integer DEFAULT 7) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: end_visitor_expo_visit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_visitor_expo_visit(p_visit_id uuid, p_visitor_client_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_visit_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public._visitor_owns_expo_visit(p_visit_id, p_visitor_client_id) THEN
    RETURN false;
  END IF;

  UPDATE public.visitor_expo_visits vev
  SET
    status = 'ended',
    ended_at = pg_catalog.now(),
    last_activity_at = pg_catalog.now()
  WHERE vev.id = p_visit_id
    AND vev.status = 'active';

  RETURN FOUND;
END;
$$;

--
-- Name: FUNCTION end_visitor_expo_visit(p_visit_id uuid, p_visitor_client_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.end_visitor_expo_visit(p_visit_id uuid, p_visitor_client_id text) IS 'Clôture explicite (status=ended). Requiert p_visitor_client_id pour contrôle d''appartenance.';

--
-- Name: pricing_overage_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_overage_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pricing_id bigint NOT NULL,
    metric_code public.overage_metric_code NOT NULL,
    included_units integer,
    pack_size integer NOT NULL,
    pack_price_ttc_eur numeric(10,2) NOT NULL,
    upgrade_recommendation_threshold_artworks integer,
    upgrade_recommendation_threshold_visitors integer,
    recommendation_target_plan public.upgrade_target_plan,
    consecutive_months_for_recommendation smallint,
    billing_active boolean DEFAULT true NOT NULL,
    recommendation_active boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_overage_rules_consecutive_months_chk CHECK (((consecutive_months_for_recommendation IS NULL) OR ((consecutive_months_for_recommendation >= 1) AND (consecutive_months_for_recommendation <= 12)))),
    CONSTRAINT pricing_overage_rules_pack_price_chk CHECK ((pack_price_ttc_eur >= (0)::numeric)),
    CONSTRAINT pricing_overage_rules_pack_size_chk CHECK ((pack_size > 0))
);

--
-- Name: TABLE pricing_overage_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_overage_rules IS 'Règles de dépassement œuvres / visiteurs par plan.';

--
-- Name: evaluate_visitor_upgrade_recommendation(uuid, uuid, public.pricing_plan_code, public.pricing_overage_rules, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_visitor_upgrade_recommendation(p_organisation_id uuid, p_subscription_id uuid, p_current_plan public.pricing_plan_code, p_vis_rule public.pricing_overage_rules, p_period_month date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: generate_artwork_fingerprint_sql(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_artwork_fingerprint_sql(artist_firstname text, artist_lastname text, artist_nickname text, artwork_title text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare
  artist_raw text := coalesce(artist_firstname, '') || ' ' || coalesce(artist_lastname, '') || ' ' || coalesce(artist_nickname, '');
  title_raw  text := coalesce(artwork_title, '');
  artist_clean text;
  title_clean  text;
begin
  -- Minuscule + retrait accents
  artist_clean := lower(unaccent(artist_raw));
  title_clean  := lower(unaccent(title_raw));

  -- Apostrophes -> espace (d'art -> d art)
  artist_clean := regexp_replace(artist_clean, '[''’]', ' ', 'g');
  title_clean  := regexp_replace(title_clean, '[''’]', ' ', 'g');

  -- Garder alnum + espaces
  artist_clean := regexp_replace(artist_clean, '[^a-z0-9\s]', ' ', 'g');
  title_clean  := regexp_replace(title_clean,  '[^a-z0-9\s]', ' ', 'g');

  -- Normaliser espaces
  artist_clean := regexp_replace(artist_clean, '\s+', ' ', 'g');
  title_clean  := regexp_replace(title_clean,  '\s+', ' ', 'g');

  -- Retirer "de la" d'abord (groupe de 2 mots)
  artist_clean := regexp_replace(artist_clean, '\mde la\M', ' ', 'g');
  title_clean  := regexp_replace(title_clean,  '\mde la\M', ' ', 'g');

  -- Retirer articles simples
  artist_clean := regexp_replace(artist_clean, '\m(le|la|les|un|une|des|du|de|d|l)\M', ' ', 'g');
  title_clean  := regexp_replace(title_clean,  '\m(le|la|les|un|une|des|du|de|d|l)\M', ' ', 'g');

  -- Supprimer tous les espaces finaux
  artist_clean := regexp_replace(trim(artist_clean), '\s+', '', 'g');
  title_clean  := regexp_replace(trim(title_clean),  '\s+', '', 'g');

  if artist_clean = '' and title_clean = '' then
    return null;
  elsif artist_clean = '' then
    return title_clean;
  elsif title_clean = '' then
    return artist_clean;
  else
    return artist_clean || '_' || title_clean;
  end if;
end;
$$;

--
-- Name: generate_billing_alerts_for_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_billing_alerts_for_usage(p_usage_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: generate_invoice_draft_for_usage(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_draft_for_usage(p_usage_id uuid, p_human_review_threshold numeric DEFAULT 50.00) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: generate_visitor_pseudo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_visitor_pseudo(locale text DEFAULT 'fr'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  noun text;
  adj text;
  suffix text;
  loc text := left(coalesce(nullif(trim(locale), ''), 'fr'), 10);
BEGIN
  SELECT public._pseudo_pool_pick_label(pp.label_fr, pp.label_en, pp.label_de, pp.label_es, pp.label_it, loc)
    INTO noun
  FROM public.pseudo_pool pp
  WHERE lower(trim(pp.type::text)) = 'noun'
    AND (
      COALESCE(trim(pp.label_fr), '') <> ''
      OR NULLIF(trim(pp.label_en), '') IS NOT NULL
      OR NULLIF(trim(pp.label_de), '') IS NOT NULL
      OR NULLIF(trim(pp.label_es), '') IS NOT NULL
      OR NULLIF(trim(pp.label_it), '') IS NOT NULL
    )
  ORDER BY random()
  LIMIT 1;

  SELECT public._pseudo_pool_pick_label(pp.label_fr, pp.label_en, pp.label_de, pp.label_es, pp.label_it, loc)
    INTO adj
  FROM public.pseudo_pool pp
  WHERE lower(trim(pp.type::text)) = 'adjective'
    AND (
      COALESCE(trim(pp.label_fr), '') <> ''
      OR NULLIF(trim(pp.label_en), '') IS NOT NULL
      OR NULLIF(trim(pp.label_de), '') IS NOT NULL
      OR NULLIF(trim(pp.label_es), '') IS NOT NULL
      OR NULLIF(trim(pp.label_it), '') IS NOT NULL
    )
  ORDER BY random()
  LIMIT 1;

  IF noun IS NULL OR adj IS NULL THEN
    RAISE EXCEPTION 'pseudo_pool incomplet : besoin d''au moins une ligne ''noun'' et une ligne ''adjective'' avec labels pour la locale %.', loc;
  END IF;

  suffix := LPAD((floor(random() * 1000))::bigint::text, 3, '0');
  RETURN initcap(noun) || initcap(adj) || suffix;
END;
$$;

--
-- Name: generate_visitor_recovery_code(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_visitor_recovery_code(p_visitor_client_id text, p_regenerate boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cid text := nullif(trim(p_visitor_client_id), '');
  v_row public.visitors%ROWTYPE;
  plain text;
  code_hash text;
BEGIN
  IF cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_client_id');
  END IF;

  SELECT v.* INTO v_row
  FROM public.visitors v
  WHERE v.visitor_client_id = cid
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'visitor_not_found');
  END IF;

  IF nullif(trim(v_row.visitor_pseudo), '') IS NULL OR nullif(trim(v_row.avatar_url), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_incomplete');
  END IF;

  IF v_row.recovery_code_hash IS NOT NULL AND NOT coalesce(p_regenerate, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_set');
  END IF;

  plain := public._random_visitor_recovery_plain();
  code_hash := public.hash_visitor_recovery_code(plain);

  UPDATE public.visitors v
  SET
    recovery_code_hash = code_hash,
    recovery_code_created_at = now(),
    last_seen_at = now()
  WHERE v.id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'recovery_code', plain,
    'recovery_code_display', substr(plain, 1, 4) || '-' || substr(plain, 5, 4)
  );
END;
$$;

--
-- Name: get_ai_usage_cost_rollup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ai_usage_cost_rollup() RETURNS TABLE(provider text, currency text, call_count bigint, sum_cost numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    e.provider,
    upper(coalesce(e.currency, 'USD')) as currency,
    count(*)::bigint as call_count,
    coalesce(sum(e.cost_estimated), 0)::numeric as sum_cost
  from public.ai_usage_events e
  group by e.provider, upper(coalesce(e.currency, 'USD'))
  order by e.provider, upper(coalesce(e.currency, 'USD'));
$$;

--
-- Name: FUNCTION get_ai_usage_cost_rollup(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_ai_usage_cost_rollup() IS 'Synthèse coûts par fournisseur/devise — utilisée par Paramètres → Coûts (KPI globaux).';

--
-- Name: get_all_users_with_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_users_with_roles() RETURNS TABLE(id uuid, first_name text, last_name text, username text, avatar_url text, phone text, birth_year integer, role_id integer, agency_id uuid, expo_id uuid, last_sign_in_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url,
    p.phone,
    p.birth_year,
    (
      SELECT MIN(v.rid)
      FROM (
        SELECT NULLIF(trim(a.raw_app_meta_data->>'role_id'), '')::integer AS rid
        UNION ALL
        SELECT CASE WHEN p.role_id BETWEEN 1 AND 3 THEN p.role_id::integer ELSE NULL END
        UNION ALL
        SELECT au.role_id::integer
      ) AS v(rid)
      WHERE v.rid IS NOT NULL
    ) AS role_id,
    au.agency_id,
    eur.expo_id,
    a.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users a ON a.id = p.id
  LEFT JOIN public.agency_users au ON au.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT e.expo_id
    FROM public.expo_user_role e
    WHERE e.user_id = p.id
    ORDER BY e.assigned_at DESC
    LIMIT 1
  ) eur ON true
  WHERE p.deleted_at IS NULL
  ORDER BY p.created_at DESC;
END;
$$;

--
-- Name: FUNCTION get_all_users_with_roles(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_all_users_with_roles() IS 'Liste profiles actifs avec rôle fusionné (MIN global + métier), agence, expo et dernière connexion.';

--
-- Name: get_anonymous_visitor_profile(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_anonymous_visitor_profile(p_visitor_client_id text DEFAULT NULL::text, p_fingerprint text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row public.visitors%ROWTYPE;
  cid text := nullif(trim(p_visitor_client_id), '');
  fp text := nullif(trim(p_fingerprint), '');
BEGIN
  IF fp IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.fingerprint = fp
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL AND cid IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.visitor_client_id = cid
    LIMIT 1;
  END IF;

  IF v_row.id IS NOT NULL AND cid IS NOT NULL
     AND nullif(trim(v_row.visitor_client_id), '') IS DISTINCT FROM cid THEN
    UPDATE public.visitors v
    SET visitor_client_id = cid, last_seen_at = now()
    WHERE v.id = v_row.id;
    v_row.visitor_client_id := cid;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('is_returning', false);
  END IF;

  IF nullif(trim(v_row.visitor_pseudo), '') IS NULL THEN
    RETURN jsonb_build_object(
      'is_returning', false,
      'persona_defaut', v_row.persona_defaut
    );
  END IF;

  RETURN jsonb_build_object(
    'is_returning', true,
    'visitor_pseudo', v_row.visitor_pseudo,
    'avatar_url', v_row.avatar_url,
    'avatar_object_path', v_row.avatar_object_path,
    'selfie_url', v_row.selfie_url,
    'selfie_object_path', v_row.selfie_object_path,
    'persona_defaut', v_row.persona_defaut
  );
END;
$$;

--
-- Name: get_my_organisation_standby_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_organisation_standby_state() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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

--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(ru.label, ru.role_name, 'role_' || r.role_id::text, '')
  FROM (
    SELECT COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'role_id')::int,
      (SELECT au.role_id FROM public.agency_users au
       WHERE au.user_id = auth.uid() LIMIT 1)
    ) AS role_id
  ) r
  LEFT JOIN public.roles_user ru ON ru.role_id = r.role_id;
$$;

--
-- Name: FUNCTION get_my_role(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_role() IS 'Libellé de rôle (roles_user) pour l’utilisateur courant, via public.users.id = auth.uid().';

--
-- Name: get_statistics_geography_visitors(uuid, uuid, timestamp with time zone, timestamp with time zone, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_statistics_geography_visitors(p_agency_id uuid DEFAULT NULL::uuid, p_expo_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_artwork_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(visitor_key text, visitor_pseudo text, visitor_name text, first_name text, last_name text, username text, avatar_url text, selfie_url text, adresse_postale text, city text, zip_code text, country text, country_code text, ip_address text, auth_user_id uuid, visitor_client_id text, visitor_db_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT (
    public.rls_is_global_admin()
    OR (p_agency_id IS NOT NULL AND public.rls_is_agency_staff_for(p_agency_id))
    OR (
      p_agency_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.agency_users au
        WHERE au.user_id = auth.uid()
          AND au.role_id BETWEEN 4 AND 6
      )
    )
    OR (
      p_expo_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.expo_user_role eur
        WHERE eur.user_id = auth.uid()
          AND eur.expo_id = p_expo_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  WITH agency_scope AS (
    SELECT p_agency_id AS agency_id
    WHERE p_agency_id IS NOT NULL

    UNION

    SELECT au.agency_id
    FROM public.agency_users au
    WHERE p_agency_id IS NULL
      AND NOT public.rls_is_global_admin()
      AND au.user_id = auth.uid()
      AND au.role_id BETWEEN 4 AND 6
  ),
  scoped_feedback AS (
    SELECT DISTINCT vf.visitor_id, vf.visit_id
    FROM public.visitor_feedback vf
    WHERE (
        NOT EXISTS (SELECT 1 FROM agency_scope)
        OR vf.agency_id IN (SELECT agency_id FROM agency_scope)
      )
      AND (p_expo_id IS NULL OR vf.expo_id = p_expo_id)
      AND (p_date_from IS NULL OR vf.submitted_at >= p_date_from)
      AND (p_date_to IS NULL OR vf.submitted_at <= p_date_to)
  ),
  scoped_vev AS (
    SELECT DISTINCT vev.visitor_id, vev.auth_user_id
    FROM public.visitor_expo_visits vev
    WHERE (
        NOT EXISTS (SELECT 1 FROM agency_scope)
        OR vev.agency_id IN (SELECT agency_id FROM agency_scope)
      )
      AND (p_expo_id IS NULL OR vev.expo_id = p_expo_id)
      AND (p_date_from IS NULL OR vev.entered_at >= p_date_from)
      AND (p_date_to IS NULL OR vev.entered_at <= p_date_to)
  ),
  resolved_pks AS (
    SELECT DISTINCT pk AS visitor_pk
    FROM (
      SELECT COALESCE(
        vev.visitor_id,
        v_by_client.id,
        v_by_auth.id,
        v_by_pk.id
      ) AS pk
      FROM scoped_feedback sf
      LEFT JOIN public.visitor_expo_visits vev ON vev.id = sf.visit_id
      LEFT JOIN public.visitors v_by_client
        ON v_by_client.visitor_client_id = sf.visitor_id
      LEFT JOIN public.visitors v_by_auth
        ON v_by_auth.auth_user_id::text = sf.visitor_id
      LEFT JOIN public.visitors v_by_pk
        ON v_by_pk.id::text = sf.visitor_id
      WHERE COALESCE(vev.visitor_id, v_by_client.id, v_by_auth.id, v_by_pk.id) IS NOT NULL

      UNION

      SELECT sv.visitor_id AS pk
      FROM scoped_vev sv
      WHERE sv.visitor_id IS NOT NULL
    ) x
    WHERE pk IS NOT NULL
  ),
  visitor_auth AS (
    SELECT
      v.id AS visitor_pk,
      COALESCE(
        v.auth_user_id,
        (
          SELECT sv.auth_user_id
          FROM scoped_vev sv
          WHERE sv.visitor_id = v.id
            AND sv.auth_user_id IS NOT NULL
          LIMIT 1
        )
      ) AS profile_id
    FROM resolved_pks rp
    INNER JOIN public.visitors v ON v.id = rp.visitor_pk
  ),
  profile_auth_ids AS (
    SELECT DISTINCT profile_id AS auth_id
    FROM (
      SELECT sf.visitor_id::uuid AS profile_id
      FROM scoped_feedback sf
      WHERE sf.visitor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

      UNION

      SELECT sv.auth_user_id AS profile_id
      FROM scoped_vev sv
      WHERE sv.auth_user_id IS NOT NULL

      UNION

      SELECT va.profile_id
      FROM visitor_auth va
      WHERE va.profile_id IS NOT NULL

      UNION

      SELECT p.id AS profile_id
      FROM public.profiles p
      WHERE p.deleted_at IS NULL
    ) ids
    WHERE profile_id IS NOT NULL
  ),
  from_visitors AS (
    SELECT
      COALESCE(va.profile_id::text, v.visitor_client_id, v.id::text) AS out_visitor_key,
      v.visitor_pseudo AS out_visitor_pseudo,
      v.visitor_name AS out_visitor_name,
      p.first_name AS out_first_name,
      p.last_name AS out_last_name,
      p.username AS out_username,
      COALESCE(NULLIF(trim(v.avatar_url), ''), NULLIF(trim(p.avatar_url), '')) AS out_avatar_url,
      v.selfie_url AS out_selfie_url,
      NULLIF(trim(p.adresse_postale), '') AS out_adresse_postale,
      COALESCE(NULLIF(trim(v.city), ''), NULLIF(trim(p.city), '')) AS out_city,
      NULLIF(trim(p.zip_code), '') AS out_zip_code,
      v.country AS out_country,
      p.country_code::text AS out_country_code,
      COALESCE(NULLIF(trim(v.ip_address), ''), NULLIF(trim(p.ip_address), '')) AS out_ip_address,
      va.profile_id AS out_auth_user_id,
      v.visitor_client_id AS out_visitor_client_id,
      v.id AS out_visitor_db_id
    FROM visitor_auth va
    INNER JOIN public.visitors v ON v.id = va.visitor_pk
    LEFT JOIN public.profiles p ON p.id = va.profile_id
  ),
  from_profiles AS (
    SELECT
      p.id::text AS out_visitor_key,
      NULL::text AS out_visitor_pseudo,
      NULL::text AS out_visitor_name,
      p.first_name AS out_first_name,
      p.last_name AS out_last_name,
      p.username AS out_username,
      p.avatar_url AS out_avatar_url,
      NULL::text AS out_selfie_url,
      NULLIF(trim(p.adresse_postale), '') AS out_adresse_postale,
      p.city AS out_city,
      NULLIF(trim(p.zip_code), '') AS out_zip_code,
      NULL::text AS out_country,
      p.country_code::text AS out_country_code,
      NULLIF(trim(p.ip_address), '') AS out_ip_address,
      p.id AS out_auth_user_id,
      NULL::text AS out_visitor_client_id,
      NULL::uuid AS out_visitor_db_id
    FROM profile_auth_ids pa
    INNER JOIN public.profiles p ON p.id = pa.auth_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM from_visitors fv
      WHERE fv.out_auth_user_id = p.id
    )
  ),
  combined AS (
    SELECT * FROM from_visitors
    UNION ALL
    SELECT * FROM from_profiles
  )
  SELECT
    c.out_visitor_key,
    c.out_visitor_pseudo,
    c.out_visitor_name,
    c.out_first_name,
    c.out_last_name,
    c.out_username,
    c.out_avatar_url,
    c.out_selfie_url,
    c.out_adresse_postale,
    c.out_city,
    c.out_zip_code,
    c.out_country,
    c.out_country_code,
    c.out_ip_address,
    c.out_auth_user_id,
    c.out_visitor_client_id,
    c.out_visitor_db_id
  FROM combined c
  WHERE NULLIF(trim(c.out_visitor_key), '') IS NOT NULL;
END;
$_$;

--
-- Name: FUNCTION get_statistics_geography_visitors(p_agency_id uuid, p_expo_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_artwork_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_statistics_geography_visitors(p_agency_id uuid, p_expo_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_artwork_ids uuid[]) IS 'Liste visiteurs + tous les profils enregistrés pour la géographie statistiques.';

--
-- Name: get_supabase_db_relation_sizes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_supabase_db_relation_sizes(p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_db_size bigint;
  v_conn_count int;
  v_conn_max int;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 50;
  elsif p_limit > 200 then
    p_limit := 200;
  end if;

  select pg_database_size(current_database()) into v_db_size;

  select count(*)::int
  from pg_stat_activity
  where datname = current_database()
  into v_conn_count;

  select coalesce(
    (select setting::int from pg_settings where name = 'max_connections'),
    0
  ) into v_conn_max;

  return jsonb_build_object(
    'database_name', current_database(),
    'database_size_bytes', v_db_size,
    'active_connections', v_conn_count,
    'max_connections', v_conn_max,
    'fetched_at', now(),
    'large_objects', coalesce((
      select jsonb_agg(obj order by (obj->>'total_bytes')::bigint desc)
      from (
        select jsonb_build_object(
          'object_name', format('%I.%I', n.nspname, c.relname),
          'schema_name', n.nspname,
          'relation_name', c.relname,
          'kind', case c.relkind
            when 'r' then 'table'
            when 'i' then 'index'
            when 't' then 'toast'
            when 'm' then 'materialized_view'
            when 'S' then 'sequence'
            else c.relkind::text
          end,
          'total_bytes', pg_total_relation_size(c.oid),
          'data_bytes', pg_relation_size(c.oid),
          'index_bytes', pg_indexes_size(c.oid),
          'share_pct', case
            when v_db_size > 0 then round(
              (pg_total_relation_size(c.oid)::numeric / v_db_size::numeric) * 100,
              2
            )
            else 0
          end
        ) as obj
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'i', 't', 'm')
          and n.nspname not in ('pg_catalog', 'information_schema')
        order by pg_total_relation_size(c.oid) desc
        limit p_limit
      ) ranked
    ), '[]'::jsonb)
  );
end;
$$;

--
-- Name: FUNCTION get_supabase_db_relation_sizes(p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_supabase_db_relation_sizes(p_limit integer) IS 'Instantané taille BDD, connexions actives et plus gros objets (service_role / Edge Functions).';

--
-- Name: get_user_edit_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_edit_details(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_email text;
  v_meta jsonb;
  v_avatar text;
  v_birth_year integer;
  v_birth_month text;
  v_first_name text;
  v_last_name text;
  v_username text;
  v_phone text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant utilisateur requis';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF v_caller <> p_user_id
     AND COALESCE(v_caller_app_role, 0) NOT BETWEEN 1 AND 3
     AND NOT EXISTS (
       SELECT 1
       FROM public.agency_users caller_au
       INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
       WHERE caller_au.user_id = v_caller
         AND target_au.user_id = p_user_id
         AND caller_au.role_id = 4
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  INTO v_email, v_meta
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  SELECT p.avatar_url, p.birth_year, p.first_name, p.last_name, p.username, p.phone
  INTO v_avatar, v_birth_year, v_first_name, v_last_name, v_username, v_phone
  FROM public.profiles p
  WHERE p.id = p_user_id;

  v_birth_month := NULLIF(trim(v_meta->>'birth_month'), '');

  RETURN jsonb_build_object(
    'email', v_email,
    'first_name', NULLIF(trim(v_first_name), ''),
    'last_name', NULLIF(trim(v_last_name), ''),
    'username', NULLIF(trim(v_username), ''),
    'phone', NULLIF(trim(v_phone), ''),
    'avatar_url', COALESCE(
      NULLIF(trim(v_avatar), ''),
      NULLIF(trim(v_meta->>'avatar_url'), ''),
      NULLIF(trim(v_meta->>'user_photo_url'), ''),
      NULLIF(trim(v_meta->>'picture'), ''),
      NULLIF(trim(v_meta->>'photo_url'), '')
    ),
    'birth_year', v_birth_year,
    'birth_month', v_birth_month
  );
END;
$$;

--
-- Name: FUNCTION get_user_edit_details(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_edit_details(p_user_id uuid) IS 'Email (auth.users) + avatar/naissance pour édition fiche utilisateur. Accès : soi-même, admin global 1-3, admin org 4 (même agence).';

--
-- Name: visitor_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    artwork_id uuid,
    expo_id uuid,
    emotion_id integer,
    visitor_id text,
    heart_rating integer,
    comment_text text,
    submitted_at timestamp with time zone DEFAULT now(),
    visit_id uuid,
    language text,
    visitor_age numeric
);

--
-- Name: COLUMN visitor_feedback.visit_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_feedback.visit_id IS 'FK optionnelle vers visitor_expo_visits. Indépendant de visitor_feedback.visitor_id (sémantique client).';

--
-- Name: COLUMN visitor_feedback.language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_feedback.language IS 'Code langue interface visiteur (2 lettres) au moment de la soumission du feedback.';

--
-- Name: COLUMN visitor_feedback.visitor_age; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_feedback.visitor_age IS 'Âge du visiteur en années, renseigné au carnet de voyage.';

--
-- Name: get_visitor_feedback_for_share(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_visitor_feedback_for_share(p_token text) RETURNS SETOF public.visitor_feedback
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT vf.*
  FROM public.visitor_feedback vf
  INNER JOIN public.travel_diary_share_links s
    ON s.visitor_client_id = vf.visitor_id
  WHERE s.token = nullif(trim(p_token), '')
    AND s.expires_at > now()
  ORDER BY vf.submitted_at ASC
  LIMIT 80;
$$;

--
-- Name: get_visitor_persona_defaut(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_visitor_persona_defaut(p_visitor_client_id text DEFAULT NULL::text, p_fingerprint text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row public.visitors%ROWTYPE;
  cid text := nullif(trim(p_visitor_client_id), '');
  fp text := nullif(trim(p_fingerprint), '');
BEGIN
  IF fp IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.fingerprint = fp
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL AND cid IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.visitor_client_id = cid
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_row.id IS NOT NULL AND cid IS NOT NULL
     AND nullif(trim(v_row.visitor_client_id), '') IS DISTINCT FROM cid THEN
    UPDATE public.visitors v
    SET visitor_client_id = cid, last_seen_at = now()
    WHERE v.id = v_row.id;
  END IF;

  RETURN v_row.persona_defaut;
END;
$$;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    username,
    avatar_url,
    phone,
    birth_year,
    timezone,
    language
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'phone',
    case
      when new.raw_user_meta_data ->> 'birth_year' is null then null
      when (new.raw_user_meta_data ->> 'birth_year') ~ '^\d{4}$'
        then (new.raw_user_meta_data ->> 'birth_year')::integer
      else null
    end,
    new.raw_user_meta_data ->> 'timezone',
    coalesce(new.raw_user_meta_data ->> 'language', 'fr')
  )
  on conflict (id) do nothing;

  return new;
end;
$_$;

--
-- Name: hash_visitor_recovery_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_visitor_recovery_code(p_code text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT encode(digest(public.normalize_visitor_recovery_code(p_code), 'sha256'), 'hex');
$$;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::int IN (1, 2, 3, 4)
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = auth.uid()
        AND au.role_id IN (1, 2, 3, 4)
    )
  );
$$;

--
-- Name: is_aimediart_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_aimediart_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select coalesce(
    nullif(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    (
      select nullif(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      from auth.users u
      where u.id = auth.uid()
    )
  ) in (1, 2, 3);
$$;

--
-- Name: FUNCTION is_aimediart_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_aimediart_admin() IS 'True si l''utilisateur connecté a role_id 1, 2 ou 3 (admins globaux SaaS).';

--
-- Name: is_cost_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_cost_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select coalesce(
    nullif(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    (
      select nullif(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      from auth.users u
      where u.id = auth.uid()
    )
  ) in (1, 2);
$$;

--
-- Name: FUNCTION is_cost_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_cost_admin() IS 'True si l''utilisateur connecté a role_id 1 ou 2 (admin_general / super_admin) — saisie manuelle des coûts.';

--
-- Name: link_visitor_profile_by_recovery_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_visitor_profile_by_recovery_code(p_recovery_code text, p_visitor_client_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cid text := nullif(trim(p_visitor_client_id), '');
  norm text := public.normalize_visitor_recovery_code(p_recovery_code);
  code_hash text;
  v_row public.visitors%ROWTYPE;
BEGIN
  IF cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_client_id');
  END IF;

  IF length(norm) <> 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;

  code_hash := public.hash_visitor_recovery_code(norm);

  SELECT v.* INTO v_row
  FROM public.visitors v
  WHERE v.recovery_code_hash = code_hash
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF nullif(trim(v_row.visitor_pseudo), '') IS NULL OR nullif(trim(v_row.avatar_url), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_incomplete');
  END IF;

  UPDATE public.visitors v
  SET
    visitor_client_id = cid,
    last_seen_at = now()
  WHERE v.id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'is_returning', true,
    'visitor_pseudo', v_row.visitor_pseudo,
    'avatar_url', v_row.avatar_url,
    'avatar_object_path', v_row.avatar_object_path,
    'selfie_url', v_row.selfie_url,
    'selfie_object_path', v_row.selfie_object_path
  );
END;
$$;

--
-- Name: link_visitor_to_auth_user(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_visitor_to_auth_user(p_visitor_client_id text, p_auth_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cid text := nullif(trim(p_visitor_client_id), '');
  updated int;
BEGIN
  IF cid IS NULL OR p_auth_user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.visitors v
  SET auth_user_id = p_auth_user_id, last_seen_at = now()
  WHERE v.visitor_client_id = cid;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;

--
-- Name: list_backoffice_anonymous_visitors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_backoffice_anonymous_visitors() RETURNS TABLE(id uuid, visitor_pseudo text, last_seen_at timestamp with time zone, auth_user_id uuid, fingerprint text, device_fingerprint text, avatar_url text, selfie_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF NOT (
    COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3
    OR COALESCE(v_caller_app_role, 0) = 4
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = v_caller AND au.role_id = 4
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.visitor_pseudo,
    v.last_seen_at,
    v.auth_user_id,
    v.fingerprint,
    v.device_fingerprint,
    v.avatar_url,
    v.selfie_url
  FROM public.visitors v
  WHERE v.deleted_at IS NULL
  ORDER BY v.last_seen_at DESC NULLS LAST;
END;
$$;

--
-- Name: FUNCTION list_backoffice_anonymous_visitors(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_backoffice_anonymous_visitors() IS 'Liste les sessions visitors actives (deleted_at IS NULL) pour le backoffice.';

--
-- Name: list_backoffice_profile_selfies(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_backoffice_profile_selfies() RETURNS TABLE(profile_id uuid, selfie_url text, visitor_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF NOT (
    COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3
    OR COALESCE(v_caller_app_role, 0) = 4
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = v_caller AND au.role_id = 4
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  WITH cand AS (
    -- 1) Session déjà liée au profil
    SELECT
      v.auth_user_id AS profile_id,
      NULLIF(trim(v.selfie_url), '') AS selfie_url,
      v.id AS visitor_id,
      v.last_seen_at,
      1 AS prio
    FROM public.visitors v
    INNER JOIN public.profiles p ON p.id = v.auth_user_id AND p.deleted_at IS NULL
    WHERE v.auth_user_id IS NOT NULL
      AND NULLIF(trim(v.selfie_url), '') IS NOT NULL

    UNION ALL

    -- 2) Session anonyme : fingerprint / device_fingerprint = meta appareil du profil
    SELECT
      u.id AS profile_id,
      NULLIF(trim(v.selfie_url), '') AS selfie_url,
      v.id AS visitor_id,
      v.last_seen_at,
      2 AS prio
    FROM public.visitors v
    INNER JOIN auth.users u ON (
      NULLIF(trim(v.fingerprint), '') IS NOT NULL
      AND NULLIF(trim(v.fingerprint), '') = NULLIF(trim(u.raw_user_meta_data->>'device_fingerprint'), '')
    )
    INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
    WHERE NULLIF(trim(v.selfie_url), '') IS NOT NULL

    UNION ALL

    SELECT
      u.id AS profile_id,
      NULLIF(trim(v.selfie_url), '') AS selfie_url,
      v.id AS visitor_id,
      v.last_seen_at,
      2 AS prio
    FROM public.visitors v
    INNER JOIN auth.users u ON (
      NULLIF(trim(v.device_fingerprint), '') IS NOT NULL
      AND NULLIF(trim(v.device_fingerprint), '') = NULLIF(trim(u.raw_user_meta_data->>'device_fingerprint'), '')
    )
    INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
    WHERE NULLIF(trim(v.selfie_url), '') IS NOT NULL

    UNION ALL

    -- 3) Selfie uploadé sous l’UUID auth (chemin photos/visitors/{user_id}.*)
    --    stocké en meta user_photo_url (pas l’avatar pool /avatars/)
    SELECT
      u.id AS profile_id,
      NULLIF(trim(u.raw_user_meta_data->>'user_photo_url'), '') AS selfie_url,
      NULL::uuid AS visitor_id,
      u.last_sign_in_at AS last_seen_at,
      3 AS prio
    FROM auth.users u
    INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
    WHERE NULLIF(trim(u.raw_user_meta_data->>'user_photo_url'), '') IS NOT NULL
      AND (
        u.raw_user_meta_data->>'user_photo_url' ILIKE '%/photos/visitors/%'
        OR u.raw_user_meta_data->>'user_photo_url' ILIKE '%/selfies/%'
      )
  )
  SELECT DISTINCT ON (c.profile_id)
    c.profile_id,
    c.selfie_url,
    c.visitor_id
  FROM cand c
  WHERE c.selfie_url IS NOT NULL
  ORDER BY c.profile_id, c.prio ASC, c.last_seen_at DESC NULLS LAST;
END;
$$;

--
-- Name: FUNCTION list_backoffice_profile_selfies(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_backoffice_profile_selfies() IS 'Selfies visiteurs pour le backoffice : visitors.selfie_url (auth ou empreinte) + meta user_photo_url type selfie.';

--
-- Name: list_backoffice_trashed_visitors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_backoffice_trashed_visitors() RETURNS TABLE(id uuid, source text, first_name text, last_name text, pseudo text, deleted_at timestamp with time zone, auth_user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF NOT (
    COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3
    OR COALESCE(v_caller_app_role, 0) = 4
    OR EXISTS (
      SELECT 1 FROM public.agency_users au
      WHERE au.user_id = v_caller AND au.role_id = 4
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      p.id,
      'profiles'::text AS source,
      p.first_name,
      p.last_name,
      p.username AS pseudo,
      p.deleted_at,
      NULL::uuid AS auth_user_id
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    WHERE p.deleted_at IS NOT NULL
      -- Exclure admins globaux et staff métier (1-6)
      AND COALESCE(NULLIF(trim(au.raw_app_meta_data->>'role_id'), '')::int, 0) NOT BETWEEN 1 AND 3
      AND NOT EXISTS (
        SELECT 1
        FROM public.agency_users ag
        WHERE ag.user_id = p.id
          AND ag.role_id BETWEEN 1 AND 6
      )

    UNION ALL

    SELECT
      v.id,
      'visitors'::text AS source,
      NULL::text AS first_name,
      NULL::text AS last_name,
      v.visitor_pseudo AS pseudo,
      v.deleted_at,
      v.auth_user_id
    FROM public.visitors v
    WHERE v.deleted_at IS NOT NULL
  ) AS trash
  ORDER BY trash.deleted_at ASC NULLS LAST;
END;
$$;

--
-- Name: FUNCTION list_backoffice_trashed_visitors(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_backoffice_trashed_visitors() IS 'Corbeille visiteurs : profiles archivés (hors staff) + visitors archivés.';

--
-- Name: normalize_role_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_role_name(p text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public'
    AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(trim(COALESCE(p, '')), '[\s-]+', '_', 'g'),
      '_+',
      '_',
      'g'
    )
  );
$$;

--
-- Name: normalize_visitor_recovery_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_visitor_recovery_code(p_code text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT upper(regexp_replace(coalesce(trim(p_code), ''), '[^A-Za-z0-9]', '', 'g'));
$$;

--
-- Name: patch_visitor_feedback_age(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patch_visitor_feedback_age(p_visitor_id text, p_visitor_age integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF nullif(trim(p_visitor_id), '') IS NULL THEN
    RAISE EXCEPTION 'visitor_id requis';
  END IF;
  IF p_visitor_age IS NULL OR p_visitor_age < 1 OR p_visitor_age > 120 THEN
    RAISE EXCEPTION 'visitor_age invalide (1–120 attendu)';
  END IF;

  UPDATE public.visitor_feedback vf
  SET visitor_age = p_visitor_age
  WHERE vf.visitor_id = trim(p_visitor_id)
    AND vf.visitor_age IS NULL;
END;
$$;

--
-- Name: pricing_is_finance_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pricing_is_finance_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    (
      SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      FROM auth.users u
      WHERE u.id = auth.uid()
    )
  ) IN (2, 3);
$$;

--
-- Name: FUNCTION pricing_is_finance_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pricing_is_finance_admin() IS 'True si l''utilisateur connecté a role_id 2 ou 3 dans app_metadata (finance / développeur).';

--
-- Name: pricing_is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pricing_is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.agencies_is_global_admin();
$$;

--
-- Name: pricing_organisation_admin_can_write(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pricing_organisation_admin_can_write(p_organisation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.agency_id = p_organisation_id
      AND au.role_id = 4
  );
$$;

--
-- Name: pricing_organisation_user_can_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pricing_organisation_user_can_read(p_organisation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.agencies_user_can_read_row(p_organisation_id);
$$;

--
-- Name: process_etincelle_expired_subscriptions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_etincelle_expired_subscriptions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: register_anonymous_visitor(text, text, text, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_anonymous_visitor(p_visitor_client_id text DEFAULT NULL::text, p_fingerprint text DEFAULT NULL::text, p_fingerprint_source text DEFAULT 'fingerprintjs_visitor_id'::text, p_user_agent text DEFAULT NULL::text, p_client_locale text DEFAULT NULL::text, p_client_timezone text DEFAULT NULL::text, p_screen_resolution text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_browser_name text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: register_anonymous_visitor(text, text, text, text, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_anonymous_visitor(p_visitor_client_id text DEFAULT NULL::text, p_fingerprint text DEFAULT NULL::text, p_fingerprint_source text DEFAULT 'fingerprintjs_visitor_id'::text, p_user_agent text DEFAULT NULL::text, p_client_locale text DEFAULT NULL::text, p_client_timezone text DEFAULT NULL::text, p_screen_resolution text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_browser_name text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_device_fingerprint text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: request_my_organisation_standby(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_my_organisation_standby() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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

--
-- Name: resolve_auth_user_agency_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_auth_user_agency_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT au.agency_id
  FROM public.agency_users au
  WHERE au.user_id = auth.uid()
  ORDER BY au.role_id ASC
  LIMIT 1;
$$;

--
-- Name: resolve_auth_user_role_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_auth_user_role_id() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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

--
-- Name: resolve_travel_diary_share_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_travel_diary_share_token(p_token text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row public.travel_diary_share_links%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.travel_diary_share_links s
  WHERE s.token = nullif(trim(p_token), '')
    AND s.expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'visitor_id', v_row.visitor_client_id,
    'expo_id', v_row.expo_id,
    'expires_at', v_row.expires_at
  );
END;
$$;

--
-- Name: restore_visitor(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_visitor(p_id uuid, p_source text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_source text := lower(trim(coalesce(p_source, '')));
  v_linked int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant requis';
  END IF;

  IF v_source NOT IN ('profiles', 'visitors') THEN
    RAISE EXCEPTION 'Source invalide (profiles|visitors)';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  -- Restauration : admins globaux 1-3 uniquement (aligné canRestore < 4 côté UI)
  IF NOT (COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_source = 'profiles' THEN
    UPDATE public.profiles
    SET deleted_at = null, updated_at = now()
    WHERE id = p_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil introuvable';
    END IF;

    UPDATE public.visitors
    SET deleted_at = null
    WHERE auth_user_id = p_id
      AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'id', p_id,
      'source', 'profiles',
      'linked_visitors', v_linked
    );
  END IF;

  UPDATE public.visitors
  SET deleted_at = null
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visiteur anonyme introuvable';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'source', 'visitors'
  );
END;
$$;

--
-- Name: FUNCTION restore_visitor(p_id uuid, p_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_visitor(p_id uuid, p_source text) IS 'Restaure un visiteur archivé (+ sessions visitors liées si profil). Accès : admin global 1-3.';

--
-- Name: rls_can_access_agency(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_can_access_agency(p_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.rls_is_global_admin()
    OR public.rls_is_agency_staff_for(p_agency_id);
$$;

--
-- Name: FUNCTION rls_can_access_agency(p_agency_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rls_can_access_agency(p_agency_id uuid) IS 'Vrai si l''utilisateur est admin global ou membre de cette agence.';

--
-- Name: rls_current_agency_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_current_agency_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT agency_id
  FROM public.agency_users
  WHERE user_id = auth.uid()
  ORDER BY role_id ASC
  LIMIT 1;
$$;

--
-- Name: FUNCTION rls_current_agency_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rls_current_agency_id() IS 'agency_id principal de l''utilisateur courant (role_id le plus bas = rang le plus élevé).';

--
-- Name: rls_is_agency_staff_for(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_is_agency_staff_for(p_agency_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.agency_id = p_agency_id
      AND au.role_id BETWEEN 4 AND 6
  );
$$;

--
-- Name: FUNCTION rls_is_agency_staff_for(p_agency_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rls_is_agency_staff_for(p_agency_id uuid) IS 'Staff agence role_id 4-6. Migration officielle visitor_expo_visits.';

--
-- Name: rls_is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role_id')::integer,
    0
  ) BETWEEN 1 AND 3;
$$;

--
-- Name: FUNCTION rls_is_global_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rls_is_global_admin() IS 'role_id JWT 1-3 (admin global). Migration officielle visitor_expo_visits.';

--
-- Name: rls_is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role_id')::integer, 0) BETWEEN 1 AND 3
    OR EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE user_id = auth.uid()
        AND role_id BETWEEN 4 AND 6
    );
$$;

--
-- Name: FUNCTION rls_is_staff(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rls_is_staff() IS 'Vrai si rôle 1-6 (global admin via JWT ou rôle agence via agency_users).';

--
-- Name: run_monthly_billing_job(date, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_monthly_billing_job(p_reference_date date DEFAULT ((date_trunc('month'::text, now()) - '1 mon'::interval))::date, p_human_review_threshold numeric DEFAULT 50.00) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

--
-- Name: scan_project_activity_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.scan_project_activity_timestamps() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  r record;
  v_sql text;
  v_columns jsonb := '[]'::jsonb;
  v_by_table jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_first timestamptz;
  v_last timestamptz;
  v_cols_ok int := 0;
  v_cols_err int := 0;
  v_row record;
begin
  create temp table _project_ts_scan (
    table_name       text not null,
    column_name      text not null,
    data_type        text not null,
    rows_total       bigint not null default 0,
    rows_non_null    bigint not null default 0,
    first_activity   timestamptz null,
    last_activity    timestamptz null,
    scan_error       text null,
    primary key (table_name, column_name)
  ) on commit drop;

  create temp table _project_daily (
    day date not null,
    event_count bigint not null default 0,
    primary key (day)
  ) on commit drop;

  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name in ('created_at', 'updated_at')
      and c.data_type in (
        'timestamp with time zone',
        'timestamp without time zone',
        'date'
      )
    order by c.table_name, c.column_name
  loop
    begin
      if r.data_type = 'date' then
        v_sql := format(
          $q$insert into _project_ts_scan
            select %L, %L, %L, count(*), count(%I),
                   min(%I::timestamp)::timestamptz, max(%I::timestamp)::timestamptz, null
            from public.%I$q$,
          r.table_name, r.column_name, r.data_type,
          r.column_name, r.column_name, r.column_name, r.table_name
        );
      elsif r.data_type = 'timestamp without time zone' then
        v_sql := format(
          $q$insert into _project_ts_scan
            select %L, %L, %L, count(*), count(%I),
                   min(%I at time zone 'UTC'), max(%I at time zone 'UTC'), null
            from public.%I$q$,
          r.table_name, r.column_name, r.data_type,
          r.column_name, r.column_name, r.column_name, r.table_name
        );
      else
        v_sql := format(
          $q$insert into _project_ts_scan
            select %L, %L, %L, count(*), count(%I),
                   min(%I), max(%I), null
            from public.%I$q$,
          r.table_name, r.column_name, r.data_type,
          r.column_name, r.column_name, r.column_name, r.table_name
        );
      end if;
      execute v_sql;

      if r.column_name = 'created_at' then
        if r.data_type = 'date' then
          v_sql := format(
            $q$insert into _project_daily (day, event_count)
            select (%I::timestamp)::date, count(*)
            from public.%I where %I is not null
            group by 1
            on conflict (day) do update set event_count = _project_daily.event_count + excluded.event_count$q$,
            r.column_name, r.table_name, r.column_name
          );
        elsif r.data_type = 'timestamp without time zone' then
          v_sql := format(
            $q$insert into _project_daily (day, event_count)
            select ((%I at time zone 'UTC') at time zone 'Europe/Paris')::date, count(*)
            from public.%I where %I is not null
            group by 1
            on conflict (day) do update set event_count = _project_daily.event_count + excluded.event_count$q$,
            r.column_name, r.table_name, r.column_name
          );
        else
          v_sql := format(
            $q$insert into _project_daily (day, event_count)
            select (%I at time zone 'Europe/Paris')::date, count(*)
            from public.%I where %I is not null
            group by 1
            on conflict (day) do update set event_count = _project_daily.event_count + excluded.event_count$q$,
            r.column_name, r.table_name, r.column_name
          );
        end if;
        begin
          execute v_sql;
        exception when others then
          null;
        end;
      end if;

    exception when others then
      insert into _project_ts_scan (table_name, column_name, data_type, scan_error)
      values (r.table_name, r.column_name, r.data_type, sqlerrm);
    end;
  end loop;

  select jsonb_agg(to_jsonb(t) order by t.table_name, t.column_name)
  into v_columns
  from (
    select table_name, column_name, data_type, rows_total, rows_non_null,
           first_activity, last_activity, scan_error
    from _project_ts_scan
  ) t;

  select jsonb_agg(to_jsonb(t) order by t.table_name)
  into v_by_table
  from (
    select table_name,
           min(first_activity) as first_activity,
           max(last_activity) as last_activity,
           sum(rows_total) as rows_total,
           sum(rows_non_null) as rows_non_null
    from _project_ts_scan
    where scan_error is null
    group by table_name
  ) t;

  select jsonb_agg(to_jsonb(t) order by t.day)
  into v_daily
  from (
    select day, event_count from _project_daily
  ) t;

  select min(first_activity), max(last_activity),
         count(*) filter (where scan_error is null),
         count(*) filter (where scan_error is not null)
  into v_first, v_last, v_cols_ok, v_cols_err
  from _project_ts_scan;

  return jsonb_build_object(
    'scanned_at', now(),
    'timezone', 'Europe/Paris',
    'summary', jsonb_build_object(
      'project_first_activity', v_first,
      'project_last_activity', v_last,
      'columns_scanned_ok', v_cols_ok,
      'columns_scan_errors', v_cols_err
    ),
    'columns', coalesce(v_columns, '[]'::jsonb),
    'by_table', coalesce(v_by_table, '[]'::jsonb),
    'daily_activity', coalesce(v_daily, '[]'::jsonb)
  );
end;
$_$;

--
-- Name: FUNCTION scan_project_activity_timestamps(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.scan_project_activity_timestamps() IS 'Scan public.created_at / updated_at : min/max par table et activité journalière (created_at).';

--
-- Name: set_artwork_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_artwork_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.artwork_updated_at := NOW();
  RETURN NEW;
END;
$$;

--
-- Name: set_current_timestamp_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

--
-- Name: set_updated_at_language(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_language() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- Name: set_updated_at_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

--
-- Name: set_visitor_persona_defaut(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_visitor_persona_defaut(p_visitor_client_id text, p_persona_defaut uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  cid text := nullif(trim(p_visitor_client_id), '');
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'visitor_client_id requis';
  END IF;

  IF p_persona_defaut IS NOT NULL THEN
    PERFORM 1
    FROM public.prompt_style ps
    WHERE ps.id = p_persona_defaut;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'persona_defaut invalide (prompt_style introuvable)';
    END IF;
  END IF;

  UPDATE public.visitors v
  SET
    persona_defaut = p_persona_defaut,
    last_seen_at = now()
  WHERE v.visitor_client_id = cid
  RETURNING v.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'visiteur introuvable pour ce visitor_client_id';
  END IF;

  RETURN v_id;
END;
$$;

--
-- Name: soft_delete_team_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_team_member(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_target_app_role int;
  v_updated boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant utilisateur requis';
  END IF;

  IF v_caller = p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous archiver vous-même';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_target_app_role
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF COALESCE(v_target_app_role, 0) BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Suppression non autorisée pour cet utilisateur';
  END IF;

  IF COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3 THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM public.agency_users caller_au
    INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
    WHERE caller_au.user_id = v_caller
      AND caller_au.role_id = 4
      AND target_au.user_id = p_user_id
      AND target_au.role_id BETWEEN 4 AND 6
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.profiles
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_user_id;

  IF FOUND THEN
    v_updated := true;
  ELSE
    INSERT INTO public.profiles (
      id,
      deleted_at,
      language,
      country_code,
      created_at,
      updated_at
    )
    VALUES (
      p_user_id,
      now(),
      'fr',
      'FR',
      now(),
      now()
    );
    v_updated := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', v_updated,
    'user_id', p_user_id,
    'deleted_at', now()
  );
END;
$$;

--
-- Name: FUNCTION soft_delete_team_member(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.soft_delete_team_member(p_user_id uuid) IS 'Archive un membre équipe (profiles.deleted_at). Accès : admin global 1-3, admin org 4 (même agence, cible 4-6).';

--
-- Name: soft_delete_visitor(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_visitor(p_id uuid, p_source text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_app_role int;
  v_source text := lower(trim(coalesce(p_source, '')));
  v_now timestamptz := now();
  v_linked int := 0;
  v_fp text;
  v_dfp text;
  v_auth uuid;
  v_siblings int := 0;
  v_first text;
  v_last text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant requis';
  END IF;

  IF v_source NOT IN ('profiles', 'visitors') THEN
    RAISE EXCEPTION 'Source invalide (profiles|visitors)';
  END IF;

  IF v_caller = p_id AND v_source = 'profiles' THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous archiver vous-même';
  END IF;

  SELECT NULLIF(trim(u.raw_app_meta_data->>'role_id'), '')::int
  INTO v_caller_app_role
  FROM auth.users u
  WHERE u.id = v_caller;

  IF COALESCE(v_caller_app_role, 0) BETWEEN 1 AND 3 THEN
    NULL;
  ELSIF COALESCE(v_caller_app_role, 0) = 4 THEN
    IF v_source = 'profiles' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.agency_users caller_au
        INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
        WHERE caller_au.user_id = v_caller
          AND caller_au.role_id = 4
          AND target_au.user_id = p_id
          AND target_au.role_id = 7
      ) THEN
        RAISE EXCEPTION 'Accès refusé';
      END IF;
    END IF;
    -- source visitors (anonyme) : admin org 4 autorisé (liste backoffice 1-4)
  ELSIF EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = v_caller
      AND au.role_id = 4
  ) THEN
    -- app_metadata sans role_id global mais agency_users role 4
    IF v_source = 'profiles' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.agency_users caller_au
        INNER JOIN public.agency_users target_au ON caller_au.agency_id = target_au.agency_id
        WHERE caller_au.user_id = v_caller
          AND caller_au.role_id = 4
          AND target_au.user_id = p_id
          AND target_au.role_id = 7
      ) THEN
        RAISE EXCEPTION 'Accès refusé';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_source = 'profiles' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_id) THEN
      RAISE EXCEPTION 'Utilisateur introuvable';
    END IF;

    SELECT
      nullif(trim(p.first_name), ''),
      nullif(trim(p.last_name), '')
    INTO v_first, v_last
    FROM public.profiles p
    WHERE p.id = p_id;

    UPDATE public.profiles
    SET deleted_at = v_now, updated_at = v_now
    WHERE id = p_id;

    IF NOT FOUND THEN
      INSERT INTO public.profiles (
        id,
        deleted_at,
        language,
        country_code,
        created_at,
        updated_at
      )
      VALUES (
        p_id,
        v_now,
        'fr',
        'FR',
        v_now,
        v_now
      );
    END IF;

    -- Autres comptes auth avec le même prénom+nom (doublons de test)
    IF v_first IS NOT NULL
       AND lower(v_first) NOT IN ('anonyme', 'anonymous') THEN
      UPDATE public.profiles p
      SET deleted_at = v_now, updated_at = v_now
      WHERE p.deleted_at IS NULL
        AND p.id <> p_id
        AND lower(trim(coalesce(p.first_name, ''))) = lower(v_first)
        AND lower(trim(coalesce(p.last_name, ''))) = lower(trim(coalesce(v_last, '')));
      GET DIAGNOSTICS v_siblings = ROW_COUNT;
    END IF;

    UPDATE public.visitors
    SET deleted_at = v_now
    WHERE deleted_at IS NULL
      AND (
        auth_user_id = p_id
        OR auth_user_id IN (
          SELECT p2.id FROM public.profiles p2
          WHERE p2.deleted_at IS NOT NULL
            AND p2.deleted_at = v_now
            AND (
              p2.id = p_id
              OR (
                v_first IS NOT NULL
                AND lower(trim(coalesce(p2.first_name, ''))) = lower(v_first)
                AND lower(trim(coalesce(p2.last_name, ''))) = lower(trim(coalesce(v_last, '')))
              )
            )
        )
      );
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'id', p_id,
      'source', 'profiles',
      'linked_visitors', v_linked,
      'sibling_profiles', v_siblings,
      'deleted_at', v_now
    );
  END IF;

  -- source = visitors
  SELECT v.fingerprint, v.device_fingerprint, v.auth_user_id
  INTO v_fp, v_dfp, v_auth
  FROM public.visitors v
  WHERE v.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visiteur anonyme introuvable';
  END IF;

  UPDATE public.visitors
  SET deleted_at = v_now
  WHERE id = p_id
    AND deleted_at IS NULL;

  -- Cascade : même empreinte / device / compte auth = même personne physique
  UPDATE public.visitors
  SET deleted_at = v_now
  WHERE deleted_at IS NULL
    AND id <> p_id
    AND (
      (v_auth IS NOT NULL AND auth_user_id = v_auth)
      OR (nullif(trim(v_fp), '') IS NOT NULL AND fingerprint = v_fp)
      OR (nullif(trim(v_dfp), '') IS NOT NULL AND device_fingerprint = v_dfp)
    );
  GET DIAGNOSTICS v_siblings = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'source', 'visitors',
    'deleted_at', v_now,
    'sibling_visitors', v_siblings
  );
END;
$$;

--
-- Name: FUNCTION soft_delete_visitor(p_id uuid, p_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.soft_delete_visitor(p_id uuid, p_source text) IS 'Archive un visiteur (profiles et/ou visitors.deleted_at). Accès : admin global 1-3, admin org 4.';

--
-- Name: sponsors_is_global_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sponsors_is_global_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role_id IN (1, 2, 3)
  )
  OR EXISTS (
    SELECT 1
    FROM public.agency_users au
    WHERE au.user_id = auth.uid()
      AND au.role_id IN (1, 2, 3)
  );
$$;

--
-- Name: FUNCTION sponsors_is_global_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sponsors_is_global_admin() IS 'True si admin global : profiles.role_id 1–3 ou agency_users.role_id 1–3.';

--
-- Name: sponsors_user_can_access_expo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sponsors_user_can_access_expo(p_expo_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expos e
    INNER JOIN public.agency_users au ON au.agency_id = e.agency_id
    WHERE e.id = p_expo_id
      AND au.user_id = auth.uid()
  );
$$;

--
-- Name: FUNCTION sponsors_user_can_access_expo(p_expo_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sponsors_user_can_access_expo(p_expo_id uuid) IS 'True si l''utilisateur est membre de l''agence propriétaire de l''exposition.';

--
-- Name: sponsors_user_can_access_row(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sponsors_user_can_access_row(p_expo_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.sponsors_is_global_admin()
      OR public.sponsors_user_can_access_expo(p_expo_id);
$$;

--
-- Name: FUNCTION sponsors_user_can_access_row(p_expo_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sponsors_user_can_access_row(p_expo_id uuid) IS 'Prédicat RLS sponsors : admin global ou membre agence de l''expo.';

--
-- Name: start_visitor_expo_visit(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_visitor_expo_visit(p_visitor_client_id text, p_expo_id uuid, p_entry_source text DEFAULT 'unknown'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_visitor_id uuid;
  v_expo_id uuid := p_expo_id;
  v_agency_id uuid;
  v_visit_id uuid;
  v_auth uuid := auth.uid();
  v_stale_cutoff timestamptz := pg_catalog.now() - interval '12 hours';
BEGIN
  IF v_expo_id IS NULL THEN
    RAISE EXCEPTION 'expo_id requis';
  END IF;

  v_visitor_id := public._resolve_visitor_id_for_expo_visit(p_visitor_client_id);
  IF v_visitor_id IS NULL THEN
    RAISE EXCEPTION
      'Visiteur introuvable : appeler register_anonymous_visitor avant start_visitor_expo_visit';
  END IF;

  SELECT e.agency_id INTO v_agency_id
  FROM public.expos e
  WHERE e.id = v_expo_id
    AND e.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exposition introuvable ou supprimée (deleted_at)';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_visitor_id::text || ':' || v_expo_id::text, 0)
  );

  -- A) abandon soft (> 12 h sans activité)
  UPDATE public.visitor_expo_visits vev
  SET
    status = 'abandoned',
    ended_at = pg_catalog.now()
  WHERE vev.visitor_id = v_visitor_id
    AND vev.status = 'active'
    AND vev.last_activity_at < v_stale_cutoff;

  -- B) autre expo active → ended
  UPDATE public.visitor_expo_visits vev
  SET
    status = 'ended',
    ended_at = pg_catalog.now()
  WHERE vev.visitor_id = v_visitor_id
    AND vev.status = 'active'
    AND vev.expo_id IS DISTINCT FROM v_expo_id;

  -- C) reprise même expo
  SELECT vev.id INTO v_visit_id
  FROM public.visitor_expo_visits vev
  WHERE vev.visitor_id = v_visitor_id
    AND vev.expo_id = v_expo_id
    AND vev.status = 'active'
  LIMIT 1;

  IF v_visit_id IS NOT NULL THEN
    UPDATE public.visitor_expo_visits vev
    SET
      last_activity_at = pg_catalog.now(),
      agency_id = pg_catalog.coalesce(vev.agency_id, v_agency_id),
      auth_user_id = pg_catalog.coalesce(vev.auth_user_id, v_auth),
      entry_source = pg_catalog.coalesce(
        NULLIF(pg_catalog.btrim(p_entry_source), ''),
        vev.entry_source
      )
    WHERE vev.id = v_visit_id;

    RETURN v_visit_id;
  END IF;

  -- D) nouvelle visite
  BEGIN
    INSERT INTO public.visitor_expo_visits (
      visitor_id,
      expo_id,
      agency_id,
      auth_user_id,
      entry_source,
      status
    )
    VALUES (
      v_visitor_id,
      v_expo_id,
      v_agency_id,
      v_auth,
      NULLIF(pg_catalog.btrim(p_entry_source), ''),
      'active'
    )
    RETURNING id INTO v_visit_id;

  EXCEPTION
    WHEN unique_violation THEN
      SELECT vev.id INTO v_visit_id
      FROM public.visitor_expo_visits vev
      WHERE vev.visitor_id = v_visitor_id
        AND vev.expo_id = v_expo_id
        AND vev.status = 'active'
      LIMIT 1;

      IF v_visit_id IS NULL THEN
        RAISE;
      END IF;

      UPDATE public.visitor_expo_visits vev
      SET last_activity_at = pg_catalog.now()
      WHERE vev.id = v_visit_id;
  END;

  RETURN v_visit_id;
END;
$$;

--
-- Name: FUNCTION start_visitor_expo_visit(p_visitor_client_id text, p_expo_id uuid, p_entry_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.start_visitor_expo_visit(p_visitor_client_id text, p_expo_id uuid, p_entry_source text) IS 'Ouvre ou reprend une visite active. Anti-doublon : abandon 12h, fin si autre expo, index unique partiel.';

--
-- Name: storage_photos_path_is_own(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_photos_path_is_own(p_prefix text, p_name text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT p_name LIKE p_prefix || auth.uid()::text || '.%';
$$;

--
-- Name: FUNCTION storage_photos_path_is_own(p_prefix text, p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.storage_photos_path_is_own(p_prefix text, p_name text) IS 'Vrai si object name = {prefix}{auth.uid()}.{ext} (ex. users/uuid.webp).';

--
-- Name: subscribe_organisation_plan(public.pricing_plan_code, public.billing_cycle, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subscribe_organisation_plan(p_plan_code public.pricing_plan_code, p_billing_cycle public.billing_cycle DEFAULT 'monthly'::public.billing_cycle, p_organisation_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
  v_commercial_kind text;
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
    'HORIZON'::public.pricing_plan_code,
    'ENVERGURE'::public.pricing_plan_code
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
        'HORIZON'::public.pricing_plan_code,
        'ENVERGURE'::public.pricing_plan_code
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
    v_commercial_kind := COALESCE(NULLIF(trim(v_agency.commercial_kind), ''), 'standard');
    v_discount_pct := COALESCE(v_agency.discount_percent, 0);
    v_discount_eur := COALESCE(v_agency.discount_amount_eur, 0);
    v_sponsor_until := v_agency.sponsor_valid_until;
  ELSE
    v_commercial_kind := 'standard';
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

--
-- Name: FUNCTION subscribe_organisation_plan(p_plan_code public.pricing_plan_code, p_billing_cycle public.billing_cycle, p_organisation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.subscribe_organisation_plan(p_plan_code public.pricing_plan_code, p_billing_cycle public.billing_cycle, p_organisation_id uuid) IS 'Souscription self-service : admin org (role 4) ou admin global. Applique les remises preset agencies + snapshot.';

--
-- Name: sync_auth_user_ip_on_login(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_auth_user_ip_on_login(p_ip_address text, p_visitor_client_id text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
  ip text := left(nullif(trim(p_ip_address), ''), 256);
  cid text := nullif(trim(p_visitor_client_id), '');
BEGIN
  IF uid IS NULL OR ip IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles p
  SET
    ip_address = ip,
    updated_at = now()
  WHERE p.id = uid;

  IF cid IS NOT NULL THEN
    UPDATE public.visitors v
    SET
      auth_user_id = uid,
      ip_address = ip,
      last_seen_at = now()
    WHERE v.visitor_client_id = cid;
  END IF;

  UPDATE public.visitors v
  SET
    ip_address = ip,
    last_seen_at = now()
  WHERE v.auth_user_id = uid;

  RETURN true;
END;
$$;

--
-- Name: FUNCTION sync_auth_user_ip_on_login(p_ip_address text, p_visitor_client_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_auth_user_ip_on_login(p_ip_address text, p_visitor_client_id text) IS 'Persiste l''IP du client sur profiles + visitors liés (auth_user_id ou visitor_client_id).';

--
-- Name: touch_visitor_expo_visit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_visitor_expo_visit(p_visit_id uuid, p_visitor_client_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_visit_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public._visitor_owns_expo_visit(p_visit_id, p_visitor_client_id) THEN
    RETURN false;
  END IF;

  UPDATE public.visitor_expo_visits vev
  SET last_activity_at = pg_catalog.now()
  WHERE vev.id = p_visit_id
    AND vev.status = 'active';

  RETURN FOUND;
END;
$$;

--
-- Name: FUNCTION touch_visitor_expo_visit(p_visit_id uuid, p_visitor_client_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.touch_visitor_expo_visit(p_visit_id uuid, p_visitor_client_id text) IS 'Heartbeat last_activity_at. Requiert p_visitor_client_id pour contrôle d''appartenance.';

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

--
-- Name: account_usage_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_usage_monthly (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    period_month date NOT NULL,
    artworks_count integer DEFAULT 0 NOT NULL,
    visitors_count integer DEFAULT 0 NOT NULL,
    included_artworks integer DEFAULT 0 NOT NULL,
    included_visitors integer DEFAULT 0 NOT NULL,
    artwork_overage_units integer DEFAULT 0 NOT NULL,
    artwork_overage_amount_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    visitor_overage_units integer DEFAULT 0 NOT NULL,
    visitor_overage_amount_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    language_options_amount_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    total_overage_amount_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    recommend_upgrade_artworks boolean DEFAULT false NOT NULL,
    recommend_upgrade_visitors boolean DEFAULT false NOT NULL,
    computation_version text DEFAULT 'v1'::text NOT NULL,
    computation_notes jsonb DEFAULT '{}'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_usage_monthly_counts_nonneg_chk CHECK (((artworks_count >= 0) AND (visitors_count >= 0))),
    CONSTRAINT account_usage_monthly_period_first_day_chk CHECK ((period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date))
);

--
-- Name: agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_agency text NOT NULL,
    logo_agency text,
    created_at timestamp with time zone DEFAULT now(),
    logo2_agency text,
    adresse_agency text,
    compl_adresse_agency text,
    zip_agency text,
    city_agency text,
    cedex_agency text,
    phone_agency text,
    mail_agency text,
    web_agency text,
    acronyme_expo text,
    deleted_at timestamp with time zone,
    commercial_kind text DEFAULT 'standard'::text NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    discount_amount_eur numeric(10,2) DEFAULT 0 NOT NULL,
    sponsor_valid_until timestamp with time zone,
    commercial_notes text,
    commercial_plan_code public.pricing_plan_code,
    structure_category public.agency_structure_category,
    structure_type public.agency_structure_type,
    siret character(14),
    legal_rep_firstname text,
    legal_rep_lastname text,
    legal_rep_role public.agency_legal_rep_role,
    agency_pays text,
    CONSTRAINT agencies_discount_amount_eur_chk CHECK ((discount_amount_eur >= (0)::numeric)),
    CONSTRAINT agencies_discount_percent_chk CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT agencies_legal_rep_role_valid_chk CHECK (public.agency_legal_rep_role_valid(structure_type, legal_rep_role)),
    CONSTRAINT agencies_siret_format_chk CHECK (((siret IS NULL) OR (siret ~ '^\d{14}$'::text))),
    CONSTRAINT agencies_structure_type_category_chk CHECK (((structure_category IS NULL) OR (structure_type IS NULL) OR ((structure_category = 'private_lucratif'::public.agency_structure_category) AND (structure_type = ANY (ARRAY['societe_commerciale'::public.agency_structure_type, 'entreprise_individuelle'::public.agency_structure_type, 'societe_civile'::public.agency_structure_type, 'profession_liberale'::public.agency_structure_type]))) OR ((structure_category = 'private_non_lucratif'::public.agency_structure_category) AND (structure_type = ANY (ARRAY['association'::public.agency_structure_type, 'fondation'::public.agency_structure_type, 'fonds_dotation'::public.agency_structure_type]))) OR ((structure_category = 'public_parapublic'::public.agency_structure_category) AND (structure_type = ANY (ARRAY['administration_etat'::public.agency_structure_type, 'collectivite_territoriale'::public.agency_structure_type, 'etablissement_public'::public.agency_structure_type])))))
);

--
-- Name: COLUMN agencies.commercial_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.commercial_kind IS 'Profil commercial (preset standard/partner_showcase/sponsoring/internal_test ou libellé personnalisé).';

--
-- Name: COLUMN agencies.commercial_plan_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.commercial_plan_code IS 'Plan payant visé par le preset commercial. Les remises ne s''appliquent qu''à ce plan lors de la souscription.';

--
-- Name: COLUMN agencies.structure_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.structure_category IS 'Grande famille juridique : lucratif, non lucratif, public/parapublic.';

--
-- Name: COLUMN agencies.structure_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.structure_type IS 'Forme juridique détaillée (sous-type selon structure_category).';

--
-- Name: COLUMN agencies.siret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.siret IS 'Numéro SIRET (14 chiffres, sans espaces). Affichage UI : XXX XXX XXX XXXXX.';

--
-- Name: COLUMN agencies.legal_rep_firstname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.legal_rep_firstname IS 'Prénom du responsable légal.';

--
-- Name: COLUMN agencies.legal_rep_lastname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.legal_rep_lastname IS 'Nom du responsable légal.';

--
-- Name: COLUMN agencies.legal_rep_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.legal_rep_role IS 'Qualité du responsable légal (enum selon structure_type).';

--
-- Name: COLUMN agencies.agency_pays; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agencies.agency_pays IS 'Pays de l''organisation (libellé, ex. France, Belgique, Autres). Même format que artists.artist_pays.';

--
-- Name: agency_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_users (
    user_id uuid NOT NULL,
    agency_id uuid NOT NULL,
    role_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: ai_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    job_type text NOT NULL,
    payload jsonb NOT NULL,
    model text DEFAULT 'llama-3.1-8b-instant'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_run_at timestamp with time zone DEFAULT now(),
    result jsonb,
    error jsonb,
    CONSTRAINT ai_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['generate_fiche'::text, 'translate_fiche'::text]))),
    CONSTRAINT ai_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'error'::text, 'retry_later'::text])))
);

--
-- Name: TABLE ai_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_jobs IS 'Jobs asynchrones pour appels Groq (créés via API, traités par worker).';

--
-- Name: ai_limit_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_limit_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text,
    limit_type text NOT NULL,
    usage_pct numeric NOT NULL,
    alert_level text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_email boolean DEFAULT false NOT NULL,
    CONSTRAINT ai_limit_alerts_alert_level_check CHECK ((alert_level = ANY (ARRAY['warning'::text, 'critical'::text, 'blocked'::text])))
);

--
-- Name: ai_provider_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_provider_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text,
    limit_type text NOT NULL,
    limit_value_observed integer,
    observed_at timestamp with time zone,
    observed_source text,
    limit_value_manual integer,
    manual_updated_at timestamp with time zone,
    alert_threshold_warning numeric DEFAULT 0.80 NOT NULL,
    alert_threshold_critical numeric DEFAULT 0.95 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_provider_limits_alert_threshold_critical_check CHECK (((alert_threshold_critical >= (0)::numeric) AND (alert_threshold_critical <= (1)::numeric))),
    CONSTRAINT ai_provider_limits_alert_threshold_warning_check CHECK (((alert_threshold_warning >= (0)::numeric) AND (alert_threshold_warning <= (1)::numeric))),
    CONSTRAINT ai_provider_limits_limit_type_check CHECK ((limit_type = ANY (ARRAY['TPM'::text, 'TPD'::text, 'RPM'::text, 'RPD'::text, 'ASH'::text, 'ASD'::text]))),
    CONSTRAINT ai_provider_limits_provider_check CHECK ((provider = ANY (ARRAY['groq'::text, 'gemini'::text])))
);

--
-- Name: TABLE ai_provider_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_provider_limits IS 'Limites API IA. limit_value_observed = source de vérité (headers API). 
   limit_value_manual = fallback admin. Aucune valeur hardcodée dans la migration.';

--
-- Name: COLUMN ai_provider_limits.limit_value_observed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_provider_limits.limit_value_observed IS 'Alimenté automatiquement par les Edge Functions depuis x-ratelimit-limit-* (Groq) 
   ou headers équivalents (Gemini). Se met à jour à chaque appel API.';

--
-- Name: COLUMN ai_provider_limits.limit_value_manual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_provider_limits.limit_value_manual IS 'Saisi manuellement via l''UI admin. Utilisé uniquement si limit_value_observed est NULL.
   À mettre à jour quand vous changez de plan sur console.groq.com/settings/limits';

--
-- Name: ai_ratelimit_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_ratelimit_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    limit_type text NOT NULL,
    limit_value integer NOT NULL,
    remaining integer,
    reset_at timestamp with time zone,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE ai_ratelimit_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_ratelimit_snapshots IS 'Historique des limites réelles retournées par les headers API à chaque appel.
   Permet de détecter automatiquement un changement de plan.';

--
-- Name: ai_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    project_id uuid,
    tool_type text NOT NULL,
    provider text NOT NULL,
    api_name text,
    model_name text,
    operation_name text,
    input_units numeric,
    output_units numeric,
    unit_type text,
    cost_estimated numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    request_id text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    import_hash text,
    CONSTRAINT ai_usage_events_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'partial'::text, 'timeout'::text])))
);

--
-- Name: TABLE ai_usage_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_usage_events IS 'Événements de consommation IA / outils : chaque appel facturé est enregistré ici.';

--
-- Name: COLUMN ai_usage_events.tool_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_usage_events.tool_type IS 'Catégorie fonctionnelle : tts, image_gen, ocr, translation, summary, embedding, chat…';

--
-- Name: COLUMN ai_usage_events.provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_usage_events.provider IS 'Fournisseur API : groq, openai, google, huggingface, leonardo…';

--
-- Name: COLUMN ai_usage_events.unit_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_usage_events.unit_type IS 'Unité de facturation : tokens, chars, images, seconds, calls';

--
-- Name: COLUMN ai_usage_events.cost_estimated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_usage_events.cost_estimated IS 'Coût estimé dans la devise `currency`.';

--
-- Name: COLUMN ai_usage_events.import_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_usage_events.import_hash IS 'Clé d''idempotence pour les imports billing / logs (ex. google_billing:…, groq_log:…).';

--
-- Name: ai_usage_daily_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_usage_daily_summary WITH (security_invoker='on') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    provider,
    tool_type,
    currency,
    count(*) AS call_count,
    sum(cost_estimated) AS total_cost,
    sum(input_units) AS total_input_units,
    sum(output_units) AS total_output_units
   FROM public.ai_usage_events
  GROUP BY (date_trunc('day'::text, created_at)), provider, tool_type, currency
  ORDER BY (date_trunc('day'::text, created_at)) DESC;

--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_id text NOT NULL,
    provider text NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    artwork_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

--
-- Name: COLUMN ai_usage_logs.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_usage_logs.metadata IS 'Contexte d''appel (job_type, source_function, usage_missing, …).';

--
-- Name: ai_usage_vs_limits; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_usage_vs_limits WITH (security_invoker='true') AS
 SELECT id AS limit_id,
    provider,
    model,
    limit_type,
    COALESCE(limit_value_observed, limit_value_manual) AS limit_value,
    limit_value_observed,
    limit_value_manual,
    observed_at,
    observed_source,
    manual_updated_at,
        CASE
            WHEN (limit_value_observed IS NOT NULL) THEN 'auto'::text
            WHEN (limit_value_manual IS NOT NULL) THEN 'manual'::text
            ELSE 'unknown'::text
        END AS limit_source,
    alert_threshold_warning,
    alert_threshold_critical,
    is_active,
    public.ai_limit_current_usage(provider, model, limit_type) AS current_usage,
        CASE
            WHEN (COALESCE(limit_value_observed, limit_value_manual) IS NOT NULL) THEN round(((public.ai_limit_current_usage(provider, model, limit_type) / (NULLIF(COALESCE(limit_value_observed, limit_value_manual), 0))::numeric) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS usage_pct,
        CASE
            WHEN (COALESCE(limit_value_observed, limit_value_manual) IS NULL) THEN 'unknown'::text
            WHEN (public.ai_limit_current_usage(provider, model, limit_type) >= (COALESCE(limit_value_observed, limit_value_manual))::numeric) THEN 'blocked'::text
            WHEN ((public.ai_limit_current_usage(provider, model, limit_type) / (NULLIF(COALESCE(limit_value_observed, limit_value_manual), 0))::numeric) >= alert_threshold_critical) THEN 'critical'::text
            WHEN ((public.ai_limit_current_usage(provider, model, limit_type) / (NULLIF(COALESCE(limit_value_observed, limit_value_manual), 0))::numeric) >= alert_threshold_warning) THEN 'warning'::text
            ELSE 'ok'::text
        END AS status
   FROM public.ai_provider_limits l
  WHERE (is_active = true);

--
-- Name: aimediart_document_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aimediart_document_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    share_token uuid DEFAULT gen_random_uuid() NOT NULL,
    description text,
    CONSTRAINT aimediart_document_folders_name_nonempty CHECK ((length(TRIM(BOTH FROM name)) > 0))
);

--
-- Name: TABLE aimediart_document_folders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aimediart_document_folders IS 'Sous-dossiers GED AIMEDIArt (1 niveau) — admins globaux uniquement.';

--
-- Name: COLUMN aimediart_document_folders.share_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_document_folders.share_token IS 'Token opaque pour lien de partage public du sous-dossier (edge aimediart-doc-share).';

--
-- Name: COLUMN aimediart_document_folders.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_document_folders.description IS 'Commentaire libre (2–3 lignes) affiché en popup dans la GED.';

--
-- Name: aimediart_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aimediart_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    name text NOT NULL,
    size_bytes bigint,
    mime_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    folder_id uuid,
    share_token uuid DEFAULT gen_random_uuid() NOT NULL
);

--
-- Name: TABLE aimediart_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aimediart_documents IS 'Documents internes AIMEDIArt (Légal/INPI/Société, BP, Marketing) — admins globaux uniquement.';

--
-- Name: COLUMN aimediart_documents.folder_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_documents.folder_id IS 'Sous-dossier GED (null = racine de la catégorie).';

--
-- Name: COLUMN aimediart_documents.share_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_documents.share_token IS 'Token opaque pour lien de partage public (edge aimediart-doc-share).';

--
-- Name: aimediart_ged_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aimediart_ged_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    share_token uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone,
    description text,
    CONSTRAINT aimediart_ged_sections_name_nonempty CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT aimediart_ged_sections_slug_nonempty CHECK ((length(TRIM(BOTH FROM slug)) > 0))
);

--
-- Name: TABLE aimediart_ged_sections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aimediart_ged_sections IS 'Dossiers principaux GED AIMEDIArt (dynamiques) — admins globaux uniquement.';

--
-- Name: COLUMN aimediart_ged_sections.share_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_ged_sections.share_token IS 'Token opaque pour lien de partage public du dossier principal (edge aimediart-doc-share).';

--
-- Name: COLUMN aimediart_ged_sections.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_ged_sections.deleted_at IS 'Soft-delete : non null = en corbeille (restaurable).';

--
-- Name: COLUMN aimediart_ged_sections.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aimediart_ged_sections.description IS 'Commentaire libre (2–3 lignes) affiché en popup dans la GED.';

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    max_caract numeric,
    max_tokens numeric
);

--
-- Name: artist_agency_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artist_agency_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    artist_id uuid,
    agency_id uuid,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

--
-- Name: artist_bios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artist_bios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    artist_id uuid NOT NULL,
    language text NOT NULL,
    bio_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT artist_bios_language_check CHECK ((language = ANY (ARRAY['fr'::text, 'en'::text, 'es'::text, 'de'::text, 'it'::text])))
);

--
-- Name: artist_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artist_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    artist_id uuid NOT NULL,
    locale text NOT NULL,
    name text,
    biography text,
    seo_title text,
    seo_description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: artists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artists (
    artist_id uuid DEFAULT gen_random_uuid() NOT NULL,
    artist_lastname text,
    artist_firstname text,
    artist_nickname text,
    "artist_bio(OLD)" text,
    artist_email text,
    artist_phone text,
    artist_photo_url text,
    artist_birth_date date,
    artist_initiale_artist text,
    artist_control text,
    artist_created_at timestamp with time zone DEFAULT now(),
    artist_typ text,
    artist_pays text,
    artist_zipcode text,
    artist_ville text,
    artist_adresse text,
    artist_address text,
    artist_city text,
    deleted_at timestamp with time zone,
    artist_adresse2 text,
    artist_vivant boolean DEFAULT true NOT NULL,
    artist_death_date date
);

--
-- Name: COLUMN artists.artist_vivant; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artists.artist_vivant IS 'Statut de vie : true = vivant(e), false = décédé(e).';

--
-- Name: COLUMN artists.artist_death_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artists.artist_death_date IS 'Date de décès de l''artiste (null si vivant ou date inconnue).';

--
-- Name: artwork_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artwork_group_members (
    group_id uuid NOT NULL,
    artwork_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

--
-- Name: TABLE artwork_group_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.artwork_group_members IS 'Membres ordonnés d''un regroupement d''œuvres (une œuvre = un seul groupe).';

--
-- Name: artwork_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artwork_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expo_id uuid NOT NULL,
    agency_id uuid NOT NULL,
    group_type text NOT NULL,
    group_label text NOT NULL,
    group_display_number text,
    group_artist_id uuid,
    group_qr_code_url text,
    group_qrcode_image text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT artwork_groups_group_type_check CHECK ((group_type = ANY (ARRAY['artist'::text, 'theme'::text])))
);

--
-- Name: TABLE artwork_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.artwork_groups IS 'Regroupement d''œuvres d''une expo (artiste ou thème) avec QR unique.';

--
-- Name: artworks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artworks (
    artwork_id uuid DEFAULT gen_random_uuid() NOT NULL,
    artwork_artist_id uuid,
    artwork_expo_id uuid,
    artwork_agency_id uuid,
    artwork_photo_url text,
    artwork_qr_code_url text,
    artwork_room_name text,
    artwork_status text DEFAULT 'draft'::text,
    artwork_moyenne_coeurs numeric DEFAULT 0,
    artwork_total_visites integer DEFAULT 0,
    artwork_created_at timestamp with time zone DEFAULT now(),
    artwork_prompt_style_id uuid,
    artwork_title text,
    artwork_qrcode_image text,
    artwork_fingerprint text,
    artwork_source_material text,
    artwork_image_url text,
    artwork_deleted_at timestamp with time zone,
    deleted_at timestamp with time zone,
    artwork_source_material_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    artwork_description_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    artwork_updated_at timestamp with time zone,
    artwork_title_i18n jsonb,
    artwork_title_i18n_enabled boolean DEFAULT false NOT NULL
);

--
-- Name: COLUMN artworks.artwork_title_i18n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artworks.artwork_title_i18n IS 'Titres multilingues. Structure : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}. Repli legacy : artwork_title.';

--
-- Name: COLUMN artworks.artwork_title_i18n_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artworks.artwork_title_i18n_enabled IS 'Si true, le titre est géré en i18n pour les langues de médiation sélectionnées.';

--
-- Name: audio_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    text_id uuid NOT NULL,
    text_type text NOT NULL,
    lang text DEFAULT 'fr'::text NOT NULL,
    prompt_style_id uuid,
    voice_id text NOT NULL,
    gender text NOT NULL,
    storage_path text NOT NULL,
    duration_sec numeric,
    file_size_bytes integer,
    provider text DEFAULT 'openai'::text NOT NULL,
    model text DEFAULT 'tts-1'::text NOT NULL,
    input_chars integer,
    input_tokens integer,
    cost_usd numeric(10,6),
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    CONSTRAINT audio_files_gender_check CHECK ((gender = ANY (ARRAY['F'::text, 'M'::text]))),
    CONSTRAINT audio_files_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'ready'::text, 'error'::text]))),
    CONSTRAINT audio_files_text_type_check CHECK ((text_type = ANY (ARRAY['bio'::text, 'mediation'::text])))
);

--
-- Name: audio_files_visitor; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.audio_files_visitor AS
 SELECT id,
    text_id,
    text_type,
    lang,
    prompt_style_id,
    voice_id,
    gender,
    storage_path,
    duration_sec,
    status,
    error_message,
    created_at,
    updated_at
   FROM public.audio_files
  WHERE (status = 'ready'::text);

--
-- Name: avatar_adjective_lexicon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatar_adjective_lexicon (
    adj_key text NOT NULL,
    lang text NOT NULL,
    base_form text NOT NULL,
    form_m text,
    form_f text,
    form_n text,
    invariant boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avatar_adjective_lexicon_adj_key_not_blank CHECK ((btrim(adj_key) <> ''::text)),
    CONSTRAINT avatar_adjective_lexicon_base_form_not_blank CHECK ((btrim(base_form) <> ''::text)),
    CONSTRAINT avatar_adjective_lexicon_lang_check CHECK ((lang = ANY (ARRAY['fr'::text, 'en'::text, 'de'::text, 'it'::text, 'es'::text])))
);

--
-- Name: avatar_noun_lexicon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatar_noun_lexicon (
    id bigint NOT NULL,
    noun_fr text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avatar_noun_lexicon_noun_fr_not_blank CHECK ((btrim(noun_fr) <> ''::text))
);

--
-- Name: avatar_noun_lexicon_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avatar_noun_lexicon_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: avatar_noun_lexicon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avatar_noun_lexicon_id_seq OWNED BY public.avatar_noun_lexicon.id;

--
-- Name: avatar_noun_translation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatar_noun_translation (
    noun_id bigint NOT NULL,
    lang text NOT NULL,
    noun_local text NOT NULL,
    gender_local text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avatar_noun_translation_gender_check CHECK (((gender_local IS NULL) OR (gender_local = ANY (ARRAY['M'::text, 'F'::text, 'N'::text, 'X'::text])))),
    CONSTRAINT avatar_noun_translation_lang_check CHECK ((lang = ANY (ARRAY['fr'::text, 'en'::text, 'de'::text, 'it'::text, 'es'::text]))),
    CONSTRAINT avatar_noun_translation_noun_local_not_blank CHECK ((btrim(noun_local) <> ''::text))
);

--
-- Name: billing_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    subscription_id uuid,
    alert_type public.alert_type NOT NULL,
    severity public.alert_severity DEFAULT 'warning'::public.alert_severity NOT NULL,
    status public.alert_status DEFAULT 'open'::public.alert_status NOT NULL,
    period_month date,
    message text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: connected_expo_quote_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connected_expo_quote_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    agency_id uuid,
    org_name text NOT NULL,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    address text,
    zip_code text,
    city text,
    contact_phone text NOT NULL,
    need_description text NOT NULL,
    floor_plan_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferred_contact_time text
);

--
-- Name: TABLE connected_expo_quote_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.connected_expo_quote_requests IS 'Demandes de devis Wi-Fi exposition connectée (vitrine /organisation/connexion).';

--
-- Name: COLUMN connected_expo_quote_requests.preferred_contact_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.connected_expo_quote_requests.preferred_contact_time IS 'Créneau souhaité pour être recontacté (date, heure, etc.).';

--
-- Name: cost_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_key text NOT NULL,
    provider_name text NOT NULL,
    category text,
    detected_in_code boolean DEFAULT false NOT NULL,
    configured boolean DEFAULT false NOT NULL,
    sync_supported boolean DEFAULT false NOT NULL,
    cost_import_supported boolean DEFAULT false NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_detected_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    last_sync_status text,
    last_sync_error text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    actively_used boolean DEFAULT false NOT NULL,
    CONSTRAINT cost_providers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'configured_not_used'::text, 'inactive'::text, 'unknown'::text, 'error'::text, 'detected_not_configured'::text])))
);

--
-- Name: TABLE cost_providers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cost_providers IS 'Inventaire des fournisseurs IA / outils : détection et état de synchronisation des coûts.';

--
-- Name: COLUMN cost_providers.provider_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_providers.provider_key IS 'Identifiant technique unique (ex. groq, openai, google_gemini).';

--
-- Name: COLUMN cost_providers.detected_in_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_providers.detected_in_code IS 'True si le fournisseur est référencé dans le registre applicatif (providerRegistry.ts). Indépendant de la configuration.';

--
-- Name: COLUMN cost_providers.configured; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_providers.configured IS 'True si la clé API / variable d''environnement est présente côté Edge Function. Ne signifie pas que le fournisseur est réellement utilisé.';

--
-- Name: COLUMN cost_providers.sync_supported; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_providers.sync_supported IS 'True si une logique de sync des coûts existe pour ce fournisseur.';

--
-- Name: COLUMN cost_providers.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_providers.status IS 'État opérationnel : active, inactive, unknown, error, detected_not_configured.';

--
-- Name: COLUMN cost_providers.actively_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_providers.actively_used IS 'True si le fournisseur est détecté dans les logs de consommation récents (ai_usage_events ou ai_usage_logs). Un secret présent ne suffit pas.';

--
-- Name: countries_phone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries_phone (
    id integer NOT NULL,
    name text NOT NULL,
    iso_code text NOT NULL,
    dial_code text NOT NULL,
    flag_emoji text,
    priority integer DEFAULT 100,
    min_length integer DEFAULT 8,
    max_length integer DEFAULT 15
);

--
-- Name: countries_phone_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.countries_phone_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: countries_phone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.countries_phone_id_seq OWNED BY public.countries_phone.id;

--
-- Name: daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_stats (
    id integer NOT NULL,
    agency_id uuid,
    artwork_id uuid,
    expo_id uuid,
    day date DEFAULT CURRENT_DATE,
    visits_count integer DEFAULT 0,
    avg_heart_rating numeric DEFAULT 0
);

--
-- Name: daily_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: daily_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_stats_id_seq OWNED BY public.daily_stats.id;

--
-- Name: emotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emotions (
    id integer NOT NULL,
    name_emotion text NOT NULL,
    icone_emotion text,
    "Emotion_F" text,
    "Emotion_M" text,
    name_emotion_en text,
    name_emotion_de text,
    name_emotion_es text,
    name_emotion_it text,
    is_active boolean DEFAULT true
);

--
-- Name: emotions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.emotions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: emotions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.emotions_id_seq OWNED BY public.emotions.id;

--
-- Name: etincelle_notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etincelle_notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    notification_key text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE etincelle_notification_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.etincelle_notification_log IS 'Trace des notifications e-mail Étincelle déjà envoyées (visiteurs 80/90/100 %, essai 80/90 %, veille de fin).';

--
-- Name: expo_user_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expo_user_role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expo_id uuid,
    user_id uuid,
    notes text,
    assigned_at timestamp with time zone DEFAULT now()
);

--
-- Name: expos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    expo_name text NOT NULL,
    lieu_expo text,
    logo_expo text,
    curator_name text,
    created_at timestamp with time zone DEFAULT now(),
    expo_id uuid DEFAULT gen_random_uuid(),
    curator text,
    logo2_expo text,
    date_expo_du date,
    date_expo_au date,
    adress_expo text,
    zip_expo text,
    city_expo text,
    ref_expo text,
    tel_ref_expo text,
    email_ref_expo text,
    curator_firstname text,
    deleted_at timestamp with time zone,
    expo_descript_i18n jsonb,
    expo_horaires jsonb,
    type_navigation boolean DEFAULT false,
    expo_indoor boolean DEFAULT true NOT NULL
);

--
-- Name: COLUMN expos.ref_expo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expos.ref_expo IS 'le référent sur place de cette expo';

--
-- Name: COLUMN expos.tel_ref_expo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expos.tel_ref_expo IS 'le n° de téléphone du référent de l''expo';

--
-- Name: COLUMN expos.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expos.deleted_at IS 'Soft delete exposition (corbeille). NULL = active.';

--
-- Name: COLUMN expos.expo_descript_i18n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expos.expo_descript_i18n IS 'Descriptif multilingue. Structure : {"source_lang":"fr","fr":"...","en":"...","de":"...","es":"...","it":"..."}';

--
-- Name: COLUMN expos.expo_horaires; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expos.expo_horaires IS 'Horaires d''ouverture par jour : objet JSON avec les clés lundi…dimanche, chacun contenant {debut, fin, ferme}.';

--
-- Name: COLUMN expos.expo_indoor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expos.expo_indoor IS 'Lieu de l''exposition pour le parcours visiteur : true = en intérieur, false = en extérieur.';

--
-- Name: google_billing_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_billing_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_name text NOT NULL,
    budget_id text NOT NULL,
    billing_account text NOT NULL,
    budget_amount numeric NOT NULL,
    budget_currency text DEFAULT 'EUR'::text NOT NULL,
    cost_amount numeric DEFAULT 0 NOT NULL,
    cost_currency text DEFAULT 'EUR'::text NOT NULL,
    usage_pct numeric,
    period_start date,
    period_end date,
    last_fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE google_billing_cache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.google_billing_cache IS 'Cache des budgets GCP (Budget API) — synchronisé par sync-google-billing (cron 06:00 UTC).';

--
-- Name: invoice_draft_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_draft_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_draft_id uuid NOT NULL,
    item_type public.invoice_item_type NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    amount_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    is_waived boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_draft_items_amount_chk CHECK ((amount_ttc_eur >= (0)::numeric)),
    CONSTRAINT invoice_draft_items_quantity_chk CHECK ((quantity >= (0)::numeric))
);

--
-- Name: invoice_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    subscription_id uuid,
    period_month date NOT NULL,
    reason text,
    status public.invoice_draft_status DEFAULT 'draft'::public.invoice_draft_status NOT NULL,
    total_ttc_eur numeric(10,2) DEFAULT 0 NOT NULL,
    requires_human_review boolean DEFAULT false NOT NULL,
    human_review_threshold_ttc_eur numeric(10,2),
    validated_by uuid,
    validated_at timestamp with time zone,
    rejection_reason text,
    issued_external_ref text,
    waived_reason text,
    account_usage_monthly_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_drafts_period_first_day_chk CHECK ((period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date))
);

--
-- Name: language_option_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.language_option_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    request_type public.language_option_request_type NOT NULL,
    lang_code character(5) NOT NULL,
    unit_price_ttc_eur numeric(10,2),
    status public.language_option_request_status DEFAULT 'requested'::public.language_option_request_status NOT NULL,
    requester_comment text,
    decision_comment text,
    decided_by uuid,
    decided_at timestamp with time zone,
    activated_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    pricing_option_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT language_option_requests_lang_code_chk CHECK ((btrim((lang_code)::text) <> ''::text))
);

--
-- Name: locales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locales (
    code text NOT NULL,
    label text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

--
-- Name: matrice_securite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matrice_securite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id integer NOT NULL,
    ressource text NOT NULL,
    lecture boolean DEFAULT false NOT NULL,
    ecriture boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT matrice_securite_ressource_chk CHECK ((ressource = ANY (ARRAY['app_settings'::text, 'prompt_style'::text, 'menu_home'::text, 'menu_agence'::text, 'menu_user'::text, 'menu_expos'::text, 'menu_artiste'::text, 'menu_catalogue'::text, 'menu_stats'::text, 'page_œuvre'::text, 'page_oeuvre'::text, 'page_settings_couts'::text, 'page_qui_en_ligne'::text, 'page_presence_seuils'::text, 'page_prompts'::text, 'page_controle_ia'::text, 'page_group_suivis'::text, 'page_group_erreurs'::text, 'page_group_corbeilles'::text, 'page_group_expos_sousvues'::text, 'page_group_ged'::text, 'page_suivi_temps'::text, 'page_suivi_supabase'::text, 'page_suivi_tokens'::text, 'page_suivi_erreurs_visiteurs'::text, 'page_suivi_erreurs_organisateurs'::text, 'page_artistes_corbeille'::text, 'page_catalogue_corbeille'::text, 'page_agencies_corbeille'::text, 'page_users_corbeille'::text, 'page_expos_corbeille'::text, 'page_visiteurs_corbeille'::text, 'page_expos_visitors'::text, 'page_expos_visitor_audio'::text, 'page_expos_sponsors'::text, 'page_artistes2'::text, 'page_catalogue2'::text, 'page_agencies2'::text, 'page_expos2'::text, 'page_aimediart_legal'::text, 'page_aimediart_bp'::text, 'page_aimediart_marketing'::text])))
);

--
-- Name: TABLE matrice_securite; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.matrice_securite IS 'Matrice de permissions par rôle : tables sensibles (app_settings, prompt_style) et accès menus/pages (menu_*, page_oeuvre).';

--
-- Name: COLUMN matrice_securite.role_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.matrice_securite.role_id IS 'Identifiant de rôle métier (aligné sur users.role_id et roles_user.role_id).';

--
-- Name: COLUMN matrice_securite.ressource; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.matrice_securite.ressource IS 'Ressource : app_settings, prompt_style ; menus/pages menu_home … menu_stats, page_oeuvre (pour ces lignes, lecture = accès UI, ecriture souvent false).';

--
-- Name: COLUMN matrice_securite.lecture; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.matrice_securite.lecture IS 'Pour app_settings/prompt_style : droit lecture. Pour menu_* / page_oeuvre : case « accès » cochée en UI.';

--
-- Name: COLUMN matrice_securite.ecriture; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.matrice_securite.ecriture IS 'Pour app_settings/prompt_style : droit écriture. Pour menu_* / page_oeuvre : laisser false (non utilisé pour la barre de navigation).';

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid,
    organisation_id uuid,
    notification_type public.notification_type NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link_url text,
    status public.notification_status DEFAULT 'unread'::public.notification_status NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: organisation_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisation_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    pricing_id bigint NOT NULL,
    plan_code public.pricing_plan_code NOT NULL,
    billing_cycle public.billing_cycle DEFAULT 'monthly'::public.billing_cycle NOT NULL,
    status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL,
    standby_status public.standby_status DEFAULT 'inactive'::public.standby_status NOT NULL,
    is_trial boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    next_renewal_at timestamp with time zone,
    standby_started_at timestamp with time zone,
    pricing_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    commercial_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    standby_requested_at timestamp with time zone,
    standby_cancel_deadline_at timestamp with time zone,
    list_price_eur numeric(10,2),
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    discount_amount_eur numeric(10,2) DEFAULT 0 NOT NULL,
    net_price_eur numeric(10,2),
    commercial_kind text DEFAULT 'standard'::text NOT NULL,
    sponsor_valid_until timestamp with time zone,
    CONSTRAINT organisation_subscriptions_discount_amount_eur_chk CHECK ((discount_amount_eur >= (0)::numeric)),
    CONSTRAINT organisation_subscriptions_discount_percent_chk CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT organisation_subscriptions_standby_dates_chk CHECK (((standby_status = 'inactive'::public.standby_status) OR (standby_started_at IS NOT NULL))),
    CONSTRAINT organisation_subscriptions_trial_etincelle_chk CHECK (((NOT is_trial) OR (plan_code = 'ETINCELLE'::public.pricing_plan_code)))
);

--
-- Name: TABLE organisation_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organisation_subscriptions IS 'Abonnement organisationnel actif (organisation_id → agencies.id).';

--
-- Name: COLUMN organisation_subscriptions.pricing_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisation_subscriptions.pricing_snapshot IS 'Copie JSON de la ligne pricing + options au moment de la souscription.';

--
-- Name: COLUMN organisation_subscriptions.standby_requested_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisation_subscriptions.standby_requested_at IS 'Horodatage de la demande de passage en plan veille (restriction navigation immédiate).';

--
-- Name: COLUMN organisation_subscriptions.standby_cancel_deadline_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organisation_subscriptions.standby_cancel_deadline_at IS 'Date limite pour annuler la demande (24 h après la demande, sauf si échéance déjà passée).';

--
-- Name: organizer_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    error_source text NOT NULL,
    page_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE organizer_error_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organizer_error_logs IS 'Erreurs capturées côté client pendant une session organisateur.';

--
-- Name: organizer_error_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_error_sessions (
    id uuid NOT NULL,
    auth_user_id uuid,
    agency_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    user_agent text,
    last_page_url text,
    locale text,
    timezone text,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE organizer_error_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organizer_error_sessions IS 'Session backoffice organisateur — de la connexion à la déconnexion / fermeture onglet.';

--
-- Name: COLUMN organizer_error_sessions.last_activity_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizer_error_sessions.last_activity_at IS 'Dernier signal client (heartbeat, erreur, début session). Utilisé pour la présence à 3 états.';

--
-- Name: postcode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postcode (
    id integer NOT NULL,
    city_name text,
    zip_codes text,
    country text
);

--
-- Name: postcode_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.postcode_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: postcode_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.postcode_id_seq OWNED BY public.postcode.id;

--
-- Name: pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing (
    pricing_id bigint NOT NULL,
    pricing_label text NOT NULL,
    pricing_plan text NOT NULL,
    pricing_max_oeuvres numeric,
    pricing_is_unlimited boolean DEFAULT false NOT NULL,
    pricing_monthly_ttc_eur numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pricing_max_visitors numeric,
    plan_code public.pricing_plan_code,
    display_name text,
    standby_monthly_price_ttc_eur numeric(10,2),
    max_artworks_included integer,
    max_visitors_per_month_included integer,
    included_mediation_langs_min integer,
    included_mediation_langs_max integer,
    included_audio_langs integer DEFAULT 0 NOT NULL,
    trial_duration_days integer,
    is_quote_only boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    monthly_equivalent_annual_ttc_eur numeric(10,2) GENERATED ALWAYS AS (
CASE
    WHEN ((pricing_monthly_ttc_eur IS NULL) OR (pricing_monthly_ttc_eur = (0)::numeric)) THEN NULL::numeric
    ELSE round(((pricing_monthly_ttc_eur * (11)::numeric) / (12)::numeric), 2)
END) STORED,
    pricing_annuel numeric(10,2) GENERATED ALWAYS AS (
CASE
    WHEN ((pricing_monthly_ttc_eur IS NULL) OR (pricing_monthly_ttc_eur = (0)::numeric)) THEN NULL::numeric
    ELSE round((pricing_monthly_ttc_eur * (12)::numeric), 2)
END) STORED,
    pricing_annual_remis numeric(10,2) GENERATED ALWAYS AS (
CASE
    WHEN ((pricing_monthly_ttc_eur IS NULL) OR (pricing_monthly_ttc_eur = (0)::numeric)) THEN NULL::numeric
    ELSE round((pricing_monthly_ttc_eur * (10)::numeric), 2)
END) STORED,
    "éco_annuel" numeric(10,2) GENERATED ALWAYS AS (
CASE
    WHEN ((pricing_monthly_ttc_eur IS NULL) OR (pricing_monthly_ttc_eur = (0)::numeric)) THEN NULL::numeric
    ELSE round((pricing_monthly_ttc_eur * (2)::numeric), 2)
END) STORED,
    CONSTRAINT pricing_max_oeuvres_chk CHECK (((pricing_max_oeuvres IS NULL) OR (pricing_max_oeuvres > (0)::numeric)))
);

--
-- Name: TABLE pricing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing IS 'Référentiel des plans tarifaires AIMEDIArt (source unique vitrine + billing).';

--
-- Name: COLUMN pricing.plan_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing.plan_code IS 'Clé canonique du plan (ETINCELLE, ATELIER, HORIZON, RAYONNEMENT, ZENITH).';

--
-- Name: pricing_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    organisation_id uuid,
    action public.audit_action_type NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    old_value jsonb,
    new_value jsonb,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: pricing_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pricing_id bigint NOT NULL,
    option_code public.pricing_option_code NOT NULL,
    billing_mode public.pricing_option_billing_mode DEFAULT 'monthly_recurring'::public.pricing_option_billing_mode NOT NULL,
    unit_price_ttc_eur numeric(10,2),
    currency character(3) DEFAULT 'EUR'::bpchar NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_options_unit_price_chk CHECK (((unit_price_ttc_eur IS NULL) OR (unit_price_ttc_eur >= (0)::numeric)))
);

--
-- Name: TABLE pricing_options; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_options IS 'Options facturables par plan (langues supplémentaires, veille, etc.).';

--
-- Name: pricing_pricing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pricing_pricing_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pricing_pricing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pricing_pricing_id_seq OWNED BY public.pricing.pricing_id;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    first_name text,
    last_name text,
    username text,
    avatar_url text,
    phone text,
    zip_code text,
    city text,
    country_code character(2) DEFAULT 'FR'::bpchar,
    timezone text,
    language character varying(10) DEFAULT 'fr'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    birth_year integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    preferred_locale text DEFAULT 'fr'::text,
    birth_month text,
    role_id integer,
    ip_address text,
    adresse_postale text,
    country text,
    compl_adresse text,
    CONSTRAINT profiles_birth_year_check CHECK (((birth_year IS NULL) OR ((birth_year >= 1900) AND (birth_year <= (EXTRACT(year FROM CURRENT_DATE))::integer))))
);

--
-- Name: COLUMN profiles.birth_month; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.birth_month IS 'mois de naissance';

--
-- Name: COLUMN profiles.ip_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.ip_address IS 'Dernière adresse IP publique connue à la connexion (max 256 car.).';

--
-- Name: COLUMN profiles.adresse_postale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.adresse_postale IS 'Voie et numéro (ligne 1).';

--
-- Name: COLUMN profiles.country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.country IS 'Libellé pays (ex. France), aligné sur COUNTRY_OPTIONS.';

--
-- Name: COLUMN profiles.compl_adresse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.compl_adresse IS 'Complément d''adresse (ligne 2).';

--
-- Name: prompt_style; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_style (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    name_fr text,
    icon text,
    persona_vibe text,
    style_rules text,
    system_instruction text,
    max_tokens integer,
    created_at timestamp with time zone DEFAULT now(),
    ordonnancement numeric NOT NULL,
    name_en text,
    name_de text,
    name_es text,
    name_it text,
    code text,
    voice_f text,
    voice_m text,
    voice_f_desc text,
    voice_m_desc text
);

--
-- Name: provider_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    run_type text NOT NULL,
    provider_key text,
    status text NOT NULL,
    message text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    triggered_by uuid,
    duration_ms integer,
    CONSTRAINT provider_sync_runs_run_type_check CHECK ((run_type = ANY (ARRAY['analyze'::text, 'sync_costs'::text]))),
    CONSTRAINT provider_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'error'::text])))
);

--
-- Name: TABLE provider_sync_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.provider_sync_runs IS 'Historique des exécutions d''analyse et de synchronisation des fournisseurs.';

--
-- Name: pseudo_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pseudo_pool (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    label_fr text NOT NULL,
    label_de text NOT NULL,
    label_en text NOT NULL,
    label_es text NOT NULL,
    label_it text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    gender_fr text,
    gender_de text,
    gender_es text,
    gender_it text,
    gender_en text,
    adj_fr_m text,
    adj_fr_f text,
    adj_de_m text,
    adj_de_f text,
    adj_de_n text,
    adj_es_m text,
    adj_es_f text,
    adj_it_m text,
    adj_it_f text,
    adj_en text
);

--
-- Name: retention_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_settings (
    id integer NOT NULL,
    entity text NOT NULL,
    table_name text NOT NULL,
    retention_days integer DEFAULT 30 NOT NULL,
    auto_purge boolean DEFAULT true NOT NULL,
    archive_before_purge boolean DEFAULT false NOT NULL,
    notify_before_days integer DEFAULT 7,
    notify_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);

--
-- Name: retention_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retention_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: retention_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retention_settings_id_seq OWNED BY public.retention_settings.id;

--
-- Name: roles_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_user (
    role_id integer NOT NULL,
    label text NOT NULL,
    role_name text,
    role_name_clair text
);

--
-- Name: roles_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: roles_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_user_id_seq OWNED BY public.roles_user.role_id;

--
-- Name: social_link_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_link_types (
    id integer NOT NULL,
    label text NOT NULL
);

--
-- Name: social_link_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_link_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: social_link_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_link_types_id_seq OWNED BY public.social_link_types.id;

--
-- Name: social_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_links (
    id integer NOT NULL,
    artist_id uuid,
    link_type_id integer,
    url text NOT NULL,
    type_link text
);

--
-- Name: social_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: social_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_links_id_seq OWNED BY public.social_links.id;

--
-- Name: sponsors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    id_expo uuid NOT NULL,
    nom_expo text,
    nom_sponsor text NOT NULL,
    contact_sponsor text,
    mail_sponsor text,
    tel_sponsor text,
    adresse_sponsor text,
    zipcode_sponsor text,
    city_sponsor text,
    url_logo_sponsor text,
    descrip_sponsor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    amount numeric(12,2),
    currency text DEFAULT 'EUR'::text NOT NULL,
    CONSTRAINT sponsors_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT sponsors_currency_check CHECK ((currency = ANY (ARRAY['EUR'::text, 'USD'::text, 'GBP'::text, 'CHF'::text])))
);

--
-- Name: supabase_metrics_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supabase_metrics_snapshots (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    counters jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: TABLE supabase_metrics_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.supabase_metrics_snapshots IS 'Snapshots Metrics API Supabase — alimente les graphiques /suivi_supabase (service_role uniquement).';

--
-- Name: supabase_metrics_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supabase_metrics_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: supabase_metrics_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supabase_metrics_snapshots_id_seq OWNED BY public.supabase_metrics_snapshots.id;

--
-- Name: translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.translations (
    id integer NOT NULL,
    lng text,
    key text,
    value text
);

--
-- Name: translations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.translations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: translations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.translations_id_seq OWNED BY public.translations.id;

--
-- Name: travel_diary_share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_diary_share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    visitor_client_id text NOT NULL,
    expo_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

--
-- Name: TABLE travel_diary_share_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.travel_diary_share_links IS 'Jetons de partage public du carnet visiteur (accès lecture seule, expiration 30 jours).';

--
-- Name: upgrade_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upgrade_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    subscription_id uuid,
    current_plan public.pricing_plan_code NOT NULL,
    recommended_plan public.upgrade_target_plan NOT NULL,
    reason text NOT NULL,
    reference_period_month date,
    trigger_metric public.overage_metric_code,
    trigger_value integer,
    threshold_value integer,
    status public.recommendation_status DEFAULT 'pending'::public.recommendation_status NOT NULL,
    internal_comment text,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: users_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users_legacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    user_email text NOT NULL,
    user_nom text,
    user_prenom text,
    user_age public."Age",
    user_roles integer,
    user_photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    role_id integer,
    user_expo_id text,
    user_control text,
    expo_id uuid,
    user_phone text,
    user_pseudo text,
    user_fingerprint text,
    user_device_details jsonb,
    user_ip_address text,
    user_zip_code text,
    user_city text,
    user_country_code character(2) DEFAULT 'FR'::bpchar,
    user_timezone text,
    user_language character varying(10) DEFAULT 'fr'::character varying,
    CONSTRAINT check_allowed_roles CHECK (((user_roles >= 1) AND (user_roles <= 7)))
);

--
-- Name: vercel_metrics_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vercel_metrics_snapshots (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
    usage jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: TABLE vercel_metrics_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vercel_metrics_snapshots IS 'Snapshots API Vercel — alimente les graphiques /suivi_vercel (service_role uniquement).';

--
-- Name: vercel_metrics_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vercel_metrics_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: vercel_metrics_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vercel_metrics_snapshots_id_seq OWNED BY public.vercel_metrics_snapshots.id;

--
-- Name: visit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_logs (
    id integer NOT NULL,
    artwork_id uuid,
    visitor_id uuid,
    emotion_id integer,
    session_token text,
    visited_at timestamp with time zone DEFAULT now()
);

--
-- Name: visit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: visit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visit_logs_id_seq OWNED BY public.visit_logs.id;

--
-- Name: visitor_audio_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_audio_presence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_client_id text NOT NULL,
    expo_id uuid,
    artwork_id uuid,
    artwork_title text,
    page_url text,
    headphones_detected boolean,
    banned_at timestamp with time zone,
    banned_by uuid,
    ban_reason text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_consent_acknowledged boolean,
    CONSTRAINT visitor_audio_presence_visitor_client_id_chk CHECK ((char_length(TRIM(BOTH FROM visitor_client_id)) > 0))
);

--
-- Name: TABLE visitor_audio_presence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.visitor_audio_presence IS 'Présence temps réel des visiteurs en expo intérieure — position QR + statut bannissement audio.';

--
-- Name: COLUMN visitor_audio_presence.audio_consent_acknowledged; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_audio_presence.audio_consent_acknowledged IS 'True si le visiteur a accepté les règles audio en expo intérieure (approche déclarative).';

--
-- Name: visitor_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    error_source text NOT NULL,
    page_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE visitor_error_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.visitor_error_logs IS 'Erreurs JavaScript capturées côté client pendant une session visiteur.';

--
-- Name: visitor_error_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_error_sessions (
    id uuid NOT NULL,
    visitor_client_id text,
    auth_user_id uuid,
    expo_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    user_agent text,
    last_page_url text,
    locale text,
    timezone text,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    age_visitor numeric
);

--
-- Name: TABLE visitor_error_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.visitor_error_sessions IS 'Session de navigation visiteur (connexion anonyme ou auth role 7) — du début au signOut / fermeture onglet.';

--
-- Name: COLUMN visitor_error_sessions.last_activity_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_error_sessions.last_activity_at IS 'Dernier signal client (heartbeat, erreur, début session). Utilisé pour la présence à 3 états.';

--
-- Name: visitor_expo_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_expo_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id uuid NOT NULL,
    expo_id uuid NOT NULL,
    agency_id uuid,
    auth_user_id uuid,
    entry_source text,
    status text DEFAULT 'active'::text NOT NULL,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visitor_expo_visits_active_ended_chk CHECK ((((status = 'active'::text) AND (ended_at IS NULL)) OR ((status = ANY (ARRAY['ended'::text, 'abandoned'::text])) AND (ended_at IS NOT NULL)))),
    CONSTRAINT visitor_expo_visits_dates_chk CHECK (((ended_at IS NULL) OR (ended_at >= entered_at))),
    CONSTRAINT visitor_expo_visits_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text, 'abandoned'::text])))
);

--
-- Name: TABLE visitor_expo_visits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.visitor_expo_visits IS 'Historique canonique des passages visiteur dans une exposition.';

--
-- Name: COLUMN visitor_expo_visits.agency_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_expo_visits.agency_id IS 'Dénormalisé depuis public.expos.agency_id au démarrage.';

--
-- Name: COLUMN visitor_expo_visits.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_expo_visits.auth_user_id IS 'auth.uid() capturé au start_visitor_expo_visit (si session auth).';

--
-- Name: COLUMN visitor_expo_visits.entry_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitor_expo_visits.entry_source IS 'visitor_welcome | resume | direct_link | first_scan | artwork_page | unknown';

--
-- Name: visitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text,
    device_type text,
    browser_name text,
    city text,
    country text,
    first_seen_at timestamp with time zone DEFAULT now(),
    visitor_prenom text,
    visitor_name text,
    visitor_age public."Age",
    visitor_country text,
    visitor_zipcode text,
    visitor_ville text,
    visitor_adresse text,
    visitor_email text,
    visitor_control text,
    fingerprint text,
    visitor_pseudo text,
    avatar_url text,
    birth_month integer,
    birth_year integer,
    is_registered boolean DEFAULT false,
    visitor_client_id text,
    user_agent text,
    client_locale text,
    client_timezone text,
    screen_resolution text,
    last_seen_at timestamp with time zone DEFAULT now(),
    fingerprint_source text,
    avatar_object_path text,
    recovery_code_hash text,
    recovery_code_created_at timestamp with time zone,
    auth_user_id uuid,
    selfie_url text,
    selfie_object_path text,
    deleted_at timestamp with time zone,
    device_fingerprint text,
    persona_defaut text
);

--
-- Name: COLUMN visitors.visitor_pseudo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.visitor_pseudo IS 'Pseudo affiché (pool avatars + 3 chiffres).';

--
-- Name: COLUMN visitors.avatar_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.avatar_url IS 'URL publique Supabase Storage (bucket avatars).';

--
-- Name: COLUMN visitors.visitor_client_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.visitor_client_id IS 'UUID navigateur stable (session persistante) — hors auth Supabase.';

--
-- Name: COLUMN visitors.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.user_agent IS 'User-Agent brut transmis volontairement par le navigateur après consentement.';

--
-- Name: COLUMN visitors.fingerprint_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.fingerprint_source IS 'ex. fingerprintjs_visitor_id lorsque fingerprint = visitorId FingerprintJS.';

--
-- Name: COLUMN visitors.avatar_object_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.avatar_object_path IS 'Chemin objet Storage relatif au bucket avatars.';

--
-- Name: COLUMN visitors.recovery_code_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.recovery_code_hash IS 'SHA-256 hex du code de liaison normalisé (8 caractères). Non réversible.';

--
-- Name: COLUMN visitors.recovery_code_created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.recovery_code_created_at IS 'Date de création ou dernière régénération du code de liaison.';

--
-- Name: COLUMN visitors.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.auth_user_id IS 'Lien optionnel vers auth.users (inscription / liaison visiteur).';

--
-- Name: COLUMN visitors.selfie_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.selfie_url IS 'URL publique selfie visiteur (bucket photos/visitors).';

--
-- Name: COLUMN visitors.selfie_object_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.selfie_object_path IS 'Chemin objet Storage relatif au selfie (ex. visitors/{uuid}.webp).';

--
-- Name: COLUMN visitors.device_fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.device_fingerprint IS 'Hash 32 chars des signaux hardware/OS (résolution×couleur, CPU, timezone, touchpoints, plateforme). Stable cross-navigateur sur le même appareil. Reconnaissance probabiliste uniquement.';

--
-- Name: COLUMN visitors.persona_defaut; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visitors.persona_defaut IS 'Persona (prompt_style.id) choisie par défaut par le visiteur — synchronisée entre expositions.';

--
-- Name: avatar_noun_lexicon id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_noun_lexicon ALTER COLUMN id SET DEFAULT nextval('public.avatar_noun_lexicon_id_seq'::regclass);

--
-- Name: countries_phone id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries_phone ALTER COLUMN id SET DEFAULT nextval('public.countries_phone_id_seq'::regclass);

--
-- Name: daily_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_stats ALTER COLUMN id SET DEFAULT nextval('public.daily_stats_id_seq'::regclass);

--
-- Name: emotions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emotions ALTER COLUMN id SET DEFAULT nextval('public.emotions_id_seq'::regclass);

--
-- Name: postcode id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postcode ALTER COLUMN id SET DEFAULT nextval('public.postcode_id_seq'::regclass);

--
-- Name: pricing pricing_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing ALTER COLUMN pricing_id SET DEFAULT nextval('public.pricing_pricing_id_seq'::regclass);

--
-- Name: retention_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_settings ALTER COLUMN id SET DEFAULT nextval('public.retention_settings_id_seq'::regclass);

--
-- Name: roles_user role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_user ALTER COLUMN role_id SET DEFAULT nextval('public.roles_user_id_seq'::regclass);

--
-- Name: social_link_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_link_types ALTER COLUMN id SET DEFAULT nextval('public.social_link_types_id_seq'::regclass);

--
-- Name: social_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links ALTER COLUMN id SET DEFAULT nextval('public.social_links_id_seq'::regclass);

--
-- Name: supabase_metrics_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_metrics_snapshots ALTER COLUMN id SET DEFAULT nextval('public.supabase_metrics_snapshots_id_seq'::regclass);

--
-- Name: translations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translations ALTER COLUMN id SET DEFAULT nextval('public.translations_id_seq'::regclass);

--
-- Name: vercel_metrics_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vercel_metrics_snapshots ALTER COLUMN id SET DEFAULT nextval('public.vercel_metrics_snapshots_id_seq'::regclass);

--
-- Name: visit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs ALTER COLUMN id SET DEFAULT nextval('public.visit_logs_id_seq'::regclass);

--
-- Name: account_usage_monthly account_usage_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_usage_monthly
    ADD CONSTRAINT account_usage_monthly_pkey PRIMARY KEY (id);

--
-- Name: account_usage_monthly account_usage_monthly_unique_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_usage_monthly
    ADD CONSTRAINT account_usage_monthly_unique_period UNIQUE (organisation_id, period_month);

--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);

--
-- Name: agency_users agency_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_users
    ADD CONSTRAINT agency_users_pkey PRIMARY KEY (user_id, agency_id);

--
-- Name: ai_jobs ai_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_pkey PRIMARY KEY (id);

--
-- Name: ai_limit_alerts ai_limit_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_limit_alerts
    ADD CONSTRAINT ai_limit_alerts_pkey PRIMARY KEY (id);

--
-- Name: ai_provider_limits ai_provider_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_limits
    ADD CONSTRAINT ai_provider_limits_pkey PRIMARY KEY (id);

--
-- Name: ai_provider_limits ai_provider_limits_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_limits
    ADD CONSTRAINT ai_provider_limits_unique UNIQUE (provider, model, limit_type);

--
-- Name: ai_ratelimit_snapshots ai_ratelimit_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_ratelimit_snapshots
    ADD CONSTRAINT ai_ratelimit_snapshots_pkey PRIMARY KEY (id);

--
-- Name: ai_usage_events ai_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_pkey PRIMARY KEY (id);

--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);

--
-- Name: aimediart_document_folders aimediart_document_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_document_folders
    ADD CONSTRAINT aimediart_document_folders_pkey PRIMARY KEY (id);

--
-- Name: aimediart_documents aimediart_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_documents
    ADD CONSTRAINT aimediart_documents_pkey PRIMARY KEY (id);

--
-- Name: aimediart_ged_sections aimediart_ged_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_ged_sections
    ADD CONSTRAINT aimediart_ged_sections_pkey PRIMARY KEY (id);

--
-- Name: aimediart_ged_sections aimediart_ged_sections_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_ged_sections
    ADD CONSTRAINT aimediart_ged_sections_slug_key UNIQUE (slug);

--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

--
-- Name: artist_agency_details artist_agency_details_artist_id_agency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_agency_details
    ADD CONSTRAINT artist_agency_details_artist_id_agency_id_key UNIQUE (artist_id, agency_id);

--
-- Name: artist_agency_details artist_agency_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_agency_details
    ADD CONSTRAINT artist_agency_details_pkey PRIMARY KEY (id);

--
-- Name: artist_bios artist_bios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_bios
    ADD CONSTRAINT artist_bios_pkey PRIMARY KEY (id);

--
-- Name: artists artist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artists
    ADD CONSTRAINT artist_pkey PRIMARY KEY (artist_id);

--
-- Name: artist_translations artist_translations_artist_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_translations
    ADD CONSTRAINT artist_translations_artist_locale_key UNIQUE (artist_id, locale);

--
-- Name: artist_translations artist_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_translations
    ADD CONSTRAINT artist_translations_pkey PRIMARY KEY (id);

--
-- Name: artwork_group_members artwork_group_members_artwork_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_group_members
    ADD CONSTRAINT artwork_group_members_artwork_unique UNIQUE (artwork_id);

--
-- Name: artwork_group_members artwork_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_group_members
    ADD CONSTRAINT artwork_group_members_pkey PRIMARY KEY (group_id, artwork_id);

--
-- Name: artwork_groups artwork_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_groups
    ADD CONSTRAINT artwork_groups_pkey PRIMARY KEY (id);

--
-- Name: artworks artworks_artwork_fingerprint_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artworks
    ADD CONSTRAINT artworks_artwork_fingerprint_unique UNIQUE (artwork_fingerprint);

--
-- Name: artworks artworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artworks
    ADD CONSTRAINT artworks_pkey PRIMARY KEY (artwork_id);

--
-- Name: audio_files audio_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_files
    ADD CONSTRAINT audio_files_pkey PRIMARY KEY (id);

--
-- Name: audio_files audio_files_text_id_text_type_lang_prompt_style_id_gender_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_files
    ADD CONSTRAINT audio_files_text_id_text_type_lang_prompt_style_id_gender_key UNIQUE (text_id, text_type, lang, prompt_style_id, gender);

--
-- Name: avatar_adjective_lexicon avatar_adjective_lexicon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_adjective_lexicon
    ADD CONSTRAINT avatar_adjective_lexicon_pkey PRIMARY KEY (adj_key, lang);

--
-- Name: avatar_noun_lexicon avatar_noun_lexicon_noun_fr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_noun_lexicon
    ADD CONSTRAINT avatar_noun_lexicon_noun_fr_key UNIQUE (noun_fr);

--
-- Name: avatar_noun_lexicon avatar_noun_lexicon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_noun_lexicon
    ADD CONSTRAINT avatar_noun_lexicon_pkey PRIMARY KEY (id);

--
-- Name: avatar_noun_translation avatar_noun_translation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_noun_translation
    ADD CONSTRAINT avatar_noun_translation_pkey PRIMARY KEY (noun_id, lang);

--
-- Name: avatars avatars_full_pseudo_en_key_new; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatars
    ADD CONSTRAINT avatars_full_pseudo_en_key_new UNIQUE (full_pseudo_en);

--
-- Name: avatars avatars_pkey_new; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatars
    ADD CONSTRAINT avatars_pkey_new PRIMARY KEY (id);

--
-- Name: billing_alerts billing_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT billing_alerts_pkey PRIMARY KEY (id);

--
-- Name: connected_expo_quote_requests connected_expo_quote_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_expo_quote_requests
    ADD CONSTRAINT connected_expo_quote_requests_pkey PRIMARY KEY (id);

--
-- Name: cost_providers cost_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_providers
    ADD CONSTRAINT cost_providers_pkey PRIMARY KEY (id);

--
-- Name: cost_providers cost_providers_provider_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_providers
    ADD CONSTRAINT cost_providers_provider_key_key UNIQUE (provider_key);

--
-- Name: countries_phone countries_phone_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries_phone
    ADD CONSTRAINT countries_phone_pkey PRIMARY KEY (id);

--
-- Name: daily_stats daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_stats
    ADD CONSTRAINT daily_stats_pkey PRIMARY KEY (id);

--
-- Name: emotions emotions_name_emotion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emotions
    ADD CONSTRAINT emotions_name_emotion_key UNIQUE (name_emotion);

--
-- Name: emotions emotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emotions
    ADD CONSTRAINT emotions_pkey PRIMARY KEY (id);

--
-- Name: etincelle_notification_log etincelle_notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etincelle_notification_log
    ADD CONSTRAINT etincelle_notification_log_pkey PRIMARY KEY (id);

--
-- Name: etincelle_notification_log etincelle_notification_log_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etincelle_notification_log
    ADD CONSTRAINT etincelle_notification_log_unique UNIQUE (organisation_id, notification_key);

--
-- Name: expo_user_role expo_user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_user_role
    ADD CONSTRAINT expo_user_role_pkey PRIMARY KEY (id);

--
-- Name: expos expos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expos
    ADD CONSTRAINT expos_pkey PRIMARY KEY (id);

--
-- Name: google_billing_cache google_billing_cache_budget_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_billing_cache
    ADD CONSTRAINT google_billing_cache_budget_id_key UNIQUE (budget_id);

--
-- Name: google_billing_cache google_billing_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_billing_cache
    ADD CONSTRAINT google_billing_cache_pkey PRIMARY KEY (id);

--
-- Name: invoice_draft_items invoice_draft_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_draft_items
    ADD CONSTRAINT invoice_draft_items_pkey PRIMARY KEY (id);

--
-- Name: invoice_drafts invoice_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_drafts
    ADD CONSTRAINT invoice_drafts_pkey PRIMARY KEY (id);

--
-- Name: invoice_drafts invoice_drafts_unique_org_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_drafts
    ADD CONSTRAINT invoice_drafts_unique_org_period UNIQUE (organisation_id, period_month);

--
-- Name: language_option_requests language_option_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.language_option_requests
    ADD CONSTRAINT language_option_requests_pkey PRIMARY KEY (id);

--
-- Name: locales locales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locales
    ADD CONSTRAINT locales_pkey PRIMARY KEY (code);

--
-- Name: matrice_securite matrice_securite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matrice_securite
    ADD CONSTRAINT matrice_securite_pkey PRIMARY KEY (id);

--
-- Name: matrice_securite matrice_securite_role_ressource_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matrice_securite
    ADD CONSTRAINT matrice_securite_role_ressource_unique UNIQUE (role_id, ressource);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: organisation_subscriptions organisation_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation_subscriptions
    ADD CONSTRAINT organisation_subscriptions_pkey PRIMARY KEY (id);

--
-- Name: organizer_error_logs organizer_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_error_logs
    ADD CONSTRAINT organizer_error_logs_pkey PRIMARY KEY (id);

--
-- Name: organizer_error_sessions organizer_error_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_error_sessions
    ADD CONSTRAINT organizer_error_sessions_pkey PRIMARY KEY (id);

--
-- Name: postcode postcode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postcode
    ADD CONSTRAINT postcode_pkey PRIMARY KEY (id);

--
-- Name: pricing_audit_log pricing_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_audit_log
    ADD CONSTRAINT pricing_audit_log_pkey PRIMARY KEY (id);

--
-- Name: pricing_options pricing_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_options
    ADD CONSTRAINT pricing_options_pkey PRIMARY KEY (id);

--
-- Name: pricing_options pricing_options_unique_per_plan; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_options
    ADD CONSTRAINT pricing_options_unique_per_plan UNIQUE (pricing_id, option_code);

--
-- Name: pricing_overage_rules pricing_overage_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_overage_rules
    ADD CONSTRAINT pricing_overage_rules_pkey PRIMARY KEY (id);

--
-- Name: pricing_overage_rules pricing_overage_rules_unique_metric; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_overage_rules
    ADD CONSTRAINT pricing_overage_rules_unique_metric UNIQUE (pricing_id, metric_code);

--
-- Name: pricing pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing
    ADD CONSTRAINT pricing_pkey PRIMARY KEY (pricing_id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);

--
-- Name: prompt_style prompt_style_name_fr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_style
    ADD CONSTRAINT prompt_style_name_fr_key UNIQUE (name_fr);

--
-- Name: prompt_style prompt_style_ordonnancement_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_style
    ADD CONSTRAINT prompt_style_ordonnancement_key UNIQUE (ordonnancement);

--
-- Name: prompt_style prompt_style_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_style
    ADD CONSTRAINT prompt_style_pkey PRIMARY KEY (id);

--
-- Name: provider_sync_runs provider_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_runs
    ADD CONSTRAINT provider_sync_runs_pkey PRIMARY KEY (id);

--
-- Name: pseudo_pool pseudo_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pseudo_pool
    ADD CONSTRAINT pseudo_pool_pkey PRIMARY KEY (id);

--
-- Name: retention_settings retention_settings_entity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_settings
    ADD CONSTRAINT retention_settings_entity_key UNIQUE (entity);

--
-- Name: retention_settings retention_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_settings
    ADD CONSTRAINT retention_settings_pkey PRIMARY KEY (id);

--
-- Name: retention_settings retention_settings_table_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_settings
    ADD CONSTRAINT retention_settings_table_name_key UNIQUE (table_name);

--
-- Name: roles_user roles_user_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_user
    ADD CONSTRAINT roles_user_label_key UNIQUE (label);

--
-- Name: roles_user roles_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_user
    ADD CONSTRAINT roles_user_pkey PRIMARY KEY (role_id);

--
-- Name: social_link_types social_link_types_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_link_types
    ADD CONSTRAINT social_link_types_label_key UNIQUE (label);

--
-- Name: social_link_types social_link_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_link_types
    ADD CONSTRAINT social_link_types_pkey PRIMARY KEY (id);

--
-- Name: social_links social_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_pkey PRIMARY KEY (id);

--
-- Name: sponsors sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsors
    ADD CONSTRAINT sponsors_pkey PRIMARY KEY (id);

--
-- Name: supabase_metrics_snapshots supabase_metrics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_metrics_snapshots
    ADD CONSTRAINT supabase_metrics_snapshots_pkey PRIMARY KEY (id);

--
-- Name: translations translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT translations_pkey PRIMARY KEY (id);

--
-- Name: travel_diary_share_links travel_diary_share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_diary_share_links
    ADD CONSTRAINT travel_diary_share_links_pkey PRIMARY KEY (id);

--
-- Name: travel_diary_share_links travel_diary_share_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_diary_share_links
    ADD CONSTRAINT travel_diary_share_links_token_key UNIQUE (token);

--
-- Name: prompt_style unique_ordonnancement; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_style
    ADD CONSTRAINT unique_ordonnancement UNIQUE (ordonnancement);

--
-- Name: upgrade_recommendations upgrade_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upgrade_recommendations
    ADD CONSTRAINT upgrade_recommendations_pkey PRIMARY KEY (id);

--
-- Name: users_legacy user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_legacy
    ADD CONSTRAINT user_email_key UNIQUE (user_email);

--
-- Name: users_legacy user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_legacy
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);

--
-- Name: vercel_metrics_snapshots vercel_metrics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vercel_metrics_snapshots
    ADD CONSTRAINT vercel_metrics_snapshots_pkey PRIMARY KEY (id);

--
-- Name: visit_logs visit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_pkey PRIMARY KEY (id);

--
-- Name: visitor_audio_presence visitor_audio_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_audio_presence
    ADD CONSTRAINT visitor_audio_presence_pkey PRIMARY KEY (id);

--
-- Name: visitor_error_logs visitor_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_error_logs
    ADD CONSTRAINT visitor_error_logs_pkey PRIMARY KEY (id);

--
-- Name: visitor_error_sessions visitor_error_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_error_sessions
    ADD CONSTRAINT visitor_error_sessions_pkey PRIMARY KEY (id);

--
-- Name: visitor_expo_visits visitor_expo_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_expo_visits
    ADD CONSTRAINT visitor_expo_visits_pkey PRIMARY KEY (id);

--
-- Name: visitor_feedback visitor_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_feedback
    ADD CONSTRAINT visitor_feedback_pkey PRIMARY KEY (id);

--
-- Name: visitors visitors_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitors
    ADD CONSTRAINT visitors_fingerprint_key UNIQUE (fingerprint);

--
-- Name: visitors visitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitors
    ADD CONSTRAINT visitors_pkey PRIMARY KEY (id);

--
-- Name: visitors visitors_visitor_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitors
    ADD CONSTRAINT visitors_visitor_client_id_key UNIQUE (visitor_client_id);

--
-- Name: account_usage_monthly_org_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_usage_monthly_org_period_idx ON public.account_usage_monthly USING btree (organisation_id, period_month DESC);

--
-- Name: account_usage_monthly_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_usage_monthly_subscription_idx ON public.account_usage_monthly USING btree (subscription_id, period_month DESC);

--
-- Name: agency_users_agency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agency_users_agency_id_idx ON public.agency_users USING btree (agency_id);

--
-- Name: agency_users_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agency_users_role_id_idx ON public.agency_users USING btree (role_id);

--
-- Name: ai_jobs_pending_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_jobs_pending_run_idx ON public.ai_jobs USING btree (status, next_run_at, created_at) WHERE (status = 'pending'::text);

--
-- Name: ai_usage_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_created_at_idx ON public.ai_usage_events USING btree (created_at DESC);

--
-- Name: ai_usage_events_import_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_import_hash_idx ON public.ai_usage_events USING btree (import_hash) WHERE (import_hash IS NOT NULL);

--
-- Name: ai_usage_events_import_hash_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_usage_events_import_hash_uidx ON public.ai_usage_events USING btree (import_hash) WHERE (import_hash IS NOT NULL);

--
-- Name: ai_usage_events_model_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_model_name_idx ON public.ai_usage_events USING btree (model_name);

--
-- Name: ai_usage_events_provider_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_provider_date_idx ON public.ai_usage_events USING btree (provider, created_at DESC);

--
-- Name: ai_usage_events_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_provider_idx ON public.ai_usage_events USING btree (provider);

--
-- Name: ai_usage_events_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_status_idx ON public.ai_usage_events USING btree (status);

--
-- Name: ai_usage_events_tool_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_tool_type_idx ON public.ai_usage_events USING btree (tool_type);

--
-- Name: aimediart_document_folders_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aimediart_document_folders_category_idx ON public.aimediart_document_folders USING btree (category, created_at);

--
-- Name: aimediart_document_folders_category_name_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX aimediart_document_folders_category_name_uidx ON public.aimediart_document_folders USING btree (category, lower(TRIM(BOTH FROM name)));

--
-- Name: aimediart_document_folders_share_token_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX aimediart_document_folders_share_token_uidx ON public.aimediart_document_folders USING btree (share_token);

--
-- Name: aimediart_documents_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aimediart_documents_category_idx ON public.aimediart_documents USING btree (category, created_at DESC);

--
-- Name: aimediart_documents_folder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aimediart_documents_folder_id_idx ON public.aimediart_documents USING btree (folder_id);

--
-- Name: aimediart_documents_share_token_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX aimediart_documents_share_token_uidx ON public.aimediart_documents USING btree (share_token);

--
-- Name: aimediart_ged_sections_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aimediart_ged_sections_deleted_at_idx ON public.aimediart_ged_sections USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

--
-- Name: aimediart_ged_sections_share_token_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX aimediart_ged_sections_share_token_uidx ON public.aimediart_ged_sections USING btree (share_token);

--
-- Name: aimediart_ged_sections_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aimediart_ged_sections_sort_idx ON public.aimediart_ged_sections USING btree (sort_order, name);

--
-- Name: artists_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX artists_deleted_at_idx ON public.artists USING btree (deleted_at);

--
-- Name: artworks_artwork_artist_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX artworks_artwork_artist_id_idx ON public.artworks USING btree (artwork_artist_id);

--
-- Name: artworks_artwork_fingerprint_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX artworks_artwork_fingerprint_uidx ON public.artworks USING btree (artwork_fingerprint) WHERE (artwork_fingerprint IS NOT NULL);

--
-- Name: artworks_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX artworks_deleted_at_idx ON public.artworks USING btree (artwork_deleted_at);

--
-- Name: audio_files_lang_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audio_files_lang_idx ON public.audio_files USING btree (lang);

--
-- Name: audio_files_prompt_style_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audio_files_prompt_style_idx ON public.audio_files USING btree (prompt_style_id);

--
-- Name: audio_files_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audio_files_status_idx ON public.audio_files USING btree (status);

--
-- Name: audio_files_storage_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audio_files_storage_path_idx ON public.audio_files USING btree (storage_path);

--
-- Name: audio_files_text_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audio_files_text_id_idx ON public.audio_files USING btree (text_id);

--
-- Name: avatar_adjective_lexicon_lang_base_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX avatar_adjective_lexicon_lang_base_uidx ON public.avatar_adjective_lexicon USING btree (lang, lower(base_form));

--
-- Name: avatar_noun_translation_lang_noun_local_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX avatar_noun_translation_lang_noun_local_uidx ON public.avatar_noun_translation USING btree (lang, lower(noun_local));

--
-- Name: billing_alerts_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_alerts_open_idx ON public.billing_alerts USING btree (status, created_at DESC) WHERE (status = 'open'::public.alert_status);

--
-- Name: billing_alerts_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_alerts_org_idx ON public.billing_alerts USING btree (organisation_id, created_at DESC);

--
-- Name: connected_expo_quote_requests_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connected_expo_quote_requests_created_at_idx ON public.connected_expo_quote_requests USING btree (created_at DESC);

--
-- Name: cost_providers_actively_used_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cost_providers_actively_used_idx ON public.cost_providers USING btree (actively_used);

--
-- Name: cost_providers_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cost_providers_category_idx ON public.cost_providers USING btree (category);

--
-- Name: cost_providers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cost_providers_status_idx ON public.cost_providers USING btree (status);

--
-- Name: cost_providers_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cost_providers_updated_at_idx ON public.cost_providers USING btree (updated_at DESC);

--
-- Name: etincelle_notification_log_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etincelle_notification_log_org_idx ON public.etincelle_notification_log USING btree (organisation_id, sent_at DESC);

--
-- Name: idx_ai_limit_alerts_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_limit_alerts_lookup ON public.ai_limit_alerts USING btree (provider, model, limit_type, alert_level, sent_at DESC);

--
-- Name: idx_ai_ratelimit_snapshots_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_ratelimit_snapshots_lookup ON public.ai_ratelimit_snapshots USING btree (provider, model, limit_type, captured_at DESC);

--
-- Name: idx_ai_usage_logs_artwork_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_artwork_id ON public.ai_usage_logs USING btree (artwork_id) WHERE (artwork_id IS NOT NULL);

--
-- Name: INDEX idx_ai_usage_logs_artwork_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_ai_usage_logs_artwork_id IS 'Filtres coûts par œuvre — colonne artwork_id.';

--
-- Name: idx_ai_usage_logs_metadata_artwork_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_metadata_artwork_id ON public.ai_usage_logs USING btree (((metadata ->> 'artwork_id'::text))) WHERE ((metadata ->> 'artwork_id'::text) IS NOT NULL);

--
-- Name: INDEX idx_ai_usage_logs_metadata_artwork_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_ai_usage_logs_metadata_artwork_id IS 'Filtres coûts par œuvre — repli metadata.artwork_id.';

--
-- Name: idx_ai_usage_logs_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_model ON public.ai_usage_logs USING btree (model_id);

--
-- Name: idx_ai_usage_logs_provider_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_provider_created_at ON public.ai_usage_logs USING btree (provider, created_at DESC);

--
-- Name: idx_ai_usage_logs_provider_model_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_provider_model_created_at ON public.ai_usage_logs USING btree (provider, model_id, created_at DESC);

--
-- Name: idx_artist_bios_artist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artist_bios_artist ON public.artist_bios USING btree (artist_id);

--
-- Name: idx_artist_bios_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artist_bios_language ON public.artist_bios USING btree (language);

--
-- Name: idx_artwork_group_members_group_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artwork_group_members_group_sort ON public.artwork_group_members USING btree (group_id, sort_order);

--
-- Name: idx_artwork_groups_agency_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artwork_groups_agency_id ON public.artwork_groups USING btree (agency_id);

--
-- Name: idx_artwork_groups_expo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artwork_groups_expo_id ON public.artwork_groups USING btree (expo_id);

--
-- Name: idx_avatars_full_pseudo_en_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatars_full_pseudo_en_new ON public.avatars USING btree (full_pseudo_en);

--
-- Name: idx_avatars_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatars_status_created_at ON public.avatars USING btree (status, created_at);

--
-- Name: idx_avatars_status_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatars_status_new ON public.avatars USING btree (status);

--
-- Name: idx_expos_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expos_deleted_at ON public.expos USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

--
-- Name: idx_google_billing_cache_last_fetched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_billing_cache_last_fetched ON public.google_billing_cache USING btree (last_fetched_at DESC);

--
-- Name: idx_organizer_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_error_logs_created_at ON public.organizer_error_logs USING btree (created_at DESC);

--
-- Name: idx_organizer_error_logs_error_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_error_logs_error_source ON public.organizer_error_logs USING btree (error_source);

--
-- Name: idx_organizer_error_logs_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_error_logs_session_id ON public.organizer_error_logs USING btree (session_id, created_at DESC);

--
-- Name: idx_organizer_error_sessions_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_error_sessions_auth_user_id ON public.organizer_error_sessions USING btree (auth_user_id);

--
-- Name: idx_organizer_error_sessions_last_activity_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_error_sessions_last_activity_at ON public.organizer_error_sessions USING btree (last_activity_at DESC) WHERE (ended_at IS NULL);

--
-- Name: idx_organizer_error_sessions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_error_sessions_started_at ON public.organizer_error_sessions USING btree (started_at DESC);

--
-- Name: idx_pseudo_pool_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pseudo_pool_type ON public.pseudo_pool USING btree (type);

--
-- Name: idx_sponsors_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsors_currency ON public.sponsors USING btree (currency);

--
-- Name: idx_sponsors_id_expo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsors_id_expo ON public.sponsors USING btree (id_expo);

--
-- Name: idx_travel_diary_share_links_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_diary_share_links_expires ON public.travel_diary_share_links USING btree (expires_at);

--
-- Name: idx_travel_diary_share_links_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_diary_share_links_visitor ON public.travel_diary_share_links USING btree (visitor_client_id);

--
-- Name: idx_unique_artist_bio; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_artist_bio ON public.artist_bios USING btree (artist_id, language);

--
-- Name: idx_user_fr_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_fr_dept ON public.users_legacy USING btree ("left"(user_zip_code, 2)) WHERE (user_country_code = 'FR'::bpchar);

--
-- Name: idx_users_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_fingerprint ON public.users_legacy USING btree (user_fingerprint);

--
-- Name: idx_users_location_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_location_composite ON public.users_legacy USING btree (user_country_code, user_zip_code);

--
-- Name: idx_visitor_audio_presence_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_audio_presence_banned ON public.visitor_audio_presence USING btree (banned_at) WHERE (banned_at IS NOT NULL);

--
-- Name: idx_visitor_audio_presence_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_visitor_audio_presence_client ON public.visitor_audio_presence USING btree (visitor_client_id);

--
-- Name: idx_visitor_audio_presence_expo_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_audio_presence_expo_last_seen ON public.visitor_audio_presence USING btree (expo_id, last_seen_at DESC);

--
-- Name: idx_visitor_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_error_logs_created_at ON public.visitor_error_logs USING btree (created_at DESC);

--
-- Name: idx_visitor_error_logs_error_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_error_logs_error_source ON public.visitor_error_logs USING btree (error_source);

--
-- Name: idx_visitor_error_logs_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_error_logs_session_id ON public.visitor_error_logs USING btree (session_id, created_at DESC);

--
-- Name: idx_visitor_error_sessions_last_activity_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_error_sessions_last_activity_at ON public.visitor_error_sessions USING btree (last_activity_at DESC) WHERE (ended_at IS NULL);

--
-- Name: idx_visitor_error_sessions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_error_sessions_started_at ON public.visitor_error_sessions USING btree (started_at DESC);

--
-- Name: idx_visitor_error_sessions_visitor_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_error_sessions_visitor_client_id ON public.visitor_error_sessions USING btree (visitor_client_id);

--
-- Name: idx_visitor_expo_visits_agency_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_agency_id ON public.visitor_expo_visits USING btree (agency_id) WHERE (agency_id IS NOT NULL);

--
-- Name: idx_visitor_expo_visits_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_auth_user_id ON public.visitor_expo_visits USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

--
-- Name: idx_visitor_expo_visits_expo_entered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_expo_entered ON public.visitor_expo_visits USING btree (expo_id, entered_at DESC);

--
-- Name: idx_visitor_expo_visits_expo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_expo_id ON public.visitor_expo_visits USING btree (expo_id);

--
-- Name: idx_visitor_expo_visits_one_active_per_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_visitor_expo_visits_one_active_per_pair ON public.visitor_expo_visits USING btree (visitor_id, expo_id) WHERE (status = 'active'::text);

--
-- Name: idx_visitor_expo_visits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_status ON public.visitor_expo_visits USING btree (status);

--
-- Name: idx_visitor_expo_visits_visitor_entered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_visitor_entered ON public.visitor_expo_visits USING btree (visitor_id, entered_at DESC);

--
-- Name: idx_visitor_expo_visits_visitor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_expo_visits_visitor_id ON public.visitor_expo_visits USING btree (visitor_id);

--
-- Name: idx_visitor_feedback_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_feedback_visit_id ON public.visitor_feedback USING btree (visit_id) WHERE (visit_id IS NOT NULL);

--
-- Name: idx_visitors_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_auth_user_id ON public.visitors USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

--
-- Name: idx_visitors_device_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_device_fingerprint ON public.visitors USING btree (device_fingerprint) WHERE (device_fingerprint IS NOT NULL);

--
-- Name: idx_visitors_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_fingerprint ON public.visitors USING btree (fingerprint);

--
-- Name: idx_visitors_persona_defaut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_persona_defaut ON public.visitors USING btree (persona_defaut) WHERE (persona_defaut IS NOT NULL);

--
-- Name: idx_visitors_recovery_code_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_visitors_recovery_code_hash ON public.visitors USING btree (recovery_code_hash) WHERE (recovery_code_hash IS NOT NULL);

--
-- Name: idx_visitors_visitor_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_visitor_client_id ON public.visitors USING btree (visitor_client_id);

--
-- Name: idx_visitors_visitor_pseudo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_visitor_pseudo ON public.visitors USING btree (visitor_pseudo);

--
-- Name: invoice_draft_items_draft_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_draft_items_draft_idx ON public.invoice_draft_items USING btree (invoice_draft_id, sort_order);

--
-- Name: invoice_drafts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_drafts_status_idx ON public.invoice_drafts USING btree (status, period_month DESC);

--
-- Name: language_option_requests_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX language_option_requests_org_idx ON public.language_option_requests USING btree (organisation_id, status);

--
-- Name: language_option_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX language_option_requests_pending_idx ON public.language_option_requests USING btree (status, created_at DESC) WHERE (status = 'requested'::public.language_option_request_status);

--
-- Name: matrice_securite_ressource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matrice_securite_ressource_idx ON public.matrice_securite USING btree (ressource);

--
-- Name: matrice_securite_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matrice_securite_role_id_idx ON public.matrice_securite USING btree (role_id);

--
-- Name: notifications_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_org_idx ON public.notifications USING btree (organisation_id, created_at DESC);

--
-- Name: notifications_recipient_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_unread_idx ON public.notifications USING btree (recipient_user_id, created_at DESC) WHERE (status = 'unread'::public.notification_status);

--
-- Name: organisation_subscriptions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organisation_subscriptions_active_idx ON public.organisation_subscriptions USING btree (organisation_id, status) WHERE (status = ANY (ARRAY['trial'::public.subscription_status, 'active'::public.subscription_status, 'standby'::public.subscription_status]));

--
-- Name: organisation_subscriptions_organisation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organisation_subscriptions_organisation_id_idx ON public.organisation_subscriptions USING btree (organisation_id);

--
-- Name: organisation_subscriptions_trial_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organisation_subscriptions_trial_expiry_idx ON public.organisation_subscriptions USING btree (trial_ends_at) WHERE ((plan_code = 'ETINCELLE'::public.pricing_plan_code) AND (status = 'trial'::public.subscription_status));

--
-- Name: pricing_audit_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_audit_log_entity_idx ON public.pricing_audit_log USING btree (entity_type, entity_id, created_at DESC);

--
-- Name: pricing_audit_log_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_audit_log_org_idx ON public.pricing_audit_log USING btree (organisation_id, created_at DESC);

--
-- Name: pricing_label_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pricing_label_unique ON public.pricing USING btree (pricing_label);

--
-- Name: pricing_options_pricing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_options_pricing_id_idx ON public.pricing_options USING btree (pricing_id);

--
-- Name: pricing_overage_rules_pricing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_overage_rules_pricing_id_idx ON public.pricing_overage_rules USING btree (pricing_id);

--
-- Name: pricing_plan_code_active_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pricing_plan_code_active_uidx ON public.pricing USING btree (plan_code) WHERE ((is_active = true) AND (archived_at IS NULL) AND (plan_code IS NOT NULL));

--
-- Name: provider_sync_runs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_sync_runs_created_at_idx ON public.provider_sync_runs USING btree (created_at DESC);

--
-- Name: provider_sync_runs_run_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_sync_runs_run_type_idx ON public.provider_sync_runs USING btree (run_type);

--
-- Name: provider_sync_runs_triggered_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_sync_runs_triggered_by_idx ON public.provider_sync_runs USING btree (triggered_by);

--
-- Name: supabase_metrics_snapshots_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supabase_metrics_snapshots_captured_at_idx ON public.supabase_metrics_snapshots USING btree (captured_at DESC);

--
-- Name: upgrade_recommendations_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upgrade_recommendations_pending_idx ON public.upgrade_recommendations USING btree (status, created_at DESC) WHERE (status = 'pending'::public.recommendation_status);

--
-- Name: vercel_metrics_snapshots_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vercel_metrics_snapshots_captured_at_idx ON public.vercel_metrics_snapshots USING btree (captured_at DESC);

--
-- Name: ai_jobs ai_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_jobs_set_updated_at BEFORE UPDATE ON public.ai_jobs FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

--
-- Name: cost_providers cost_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cost_providers_updated_at BEFORE UPDATE ON public.cost_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: retention_settings retention_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER retention_settings_updated_at BEFORE UPDATE ON public.retention_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: avatar_adjective_lexicon set_avatar_adjective_lexicon_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_avatar_adjective_lexicon_updated_at BEFORE UPDATE ON public.avatar_adjective_lexicon FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

--
-- Name: avatar_noun_lexicon set_avatar_noun_lexicon_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_avatar_noun_lexicon_updated_at BEFORE UPDATE ON public.avatar_noun_lexicon FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

--
-- Name: avatar_noun_translation set_avatar_noun_translation_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_avatar_noun_translation_updated_at BEFORE UPDATE ON public.avatar_noun_translation FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

--
-- Name: avatars set_avatars_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_avatars_updated_at BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: account_usage_monthly trg_account_usage_monthly_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_account_usage_monthly_updated_at BEFORE UPDATE ON public.account_usage_monthly FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: artwork_groups trg_artwork_groups_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_artwork_groups_set_updated_at BEFORE UPDATE ON public.artwork_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: billing_alerts trg_billing_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_billing_alerts_updated_at BEFORE UPDATE ON public.billing_alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: invoice_draft_items trg_invoice_draft_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_draft_items_updated_at BEFORE UPDATE ON public.invoice_draft_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: invoice_drafts trg_invoice_drafts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_drafts_updated_at BEFORE UPDATE ON public.invoice_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: language_option_requests trg_language_option_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_language_option_requests_updated_at BEFORE UPDATE ON public.language_option_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: notifications trg_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: organisation_subscriptions trg_organisation_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_organisation_subscriptions_updated_at BEFORE UPDATE ON public.organisation_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: pricing_options trg_pricing_options_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pricing_options_updated_at BEFORE UPDATE ON public.pricing_options FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: pricing_overage_rules trg_pricing_overage_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pricing_overage_rules_updated_at BEFORE UPDATE ON public.pricing_overage_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: pricing trg_pricing_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pricing_updated_at BEFORE UPDATE ON public.pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: artworks trg_set_artwork_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_artwork_updated_at BEFORE UPDATE ON public.artworks FOR EACH ROW EXECUTE FUNCTION public.set_artwork_updated_at();

--
-- Name: upgrade_recommendations trg_upgrade_recommendations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_upgrade_recommendations_updated_at BEFORE UPDATE ON public.upgrade_recommendations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

--
-- Name: artist_bios update_artist_bios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_artist_bios_updated_at BEFORE UPDATE ON public.artist_bios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: visitor_expo_visits visitor_expo_visits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visitor_expo_visits_updated_at BEFORE UPDATE ON public.visitor_expo_visits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: account_usage_monthly account_usage_monthly_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_usage_monthly
    ADD CONSTRAINT account_usage_monthly_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: account_usage_monthly account_usage_monthly_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_usage_monthly
    ADD CONSTRAINT account_usage_monthly_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.organisation_subscriptions(id) ON DELETE CASCADE;

--
-- Name: agency_users agency_users_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_users
    ADD CONSTRAINT agency_users_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: agency_users agency_users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_users
    ADD CONSTRAINT agency_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles_user(role_id);

--
-- Name: agency_users agency_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_users
    ADD CONSTRAINT agency_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: ai_usage_events ai_usage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: aimediart_document_folders aimediart_document_folders_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_document_folders
    ADD CONSTRAINT aimediart_document_folders_category_fk FOREIGN KEY (category) REFERENCES public.aimediart_ged_sections(slug) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: aimediart_documents aimediart_documents_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_documents
    ADD CONSTRAINT aimediart_documents_category_fk FOREIGN KEY (category) REFERENCES public.aimediart_ged_sections(slug) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: aimediart_documents aimediart_documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aimediart_documents
    ADD CONSTRAINT aimediart_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.aimediart_document_folders(id) ON DELETE RESTRICT;

--
-- Name: artist_agency_details artist_agency_details_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_agency_details
    ADD CONSTRAINT artist_agency_details_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: artist_agency_details artist_agency_details_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_agency_details
    ADD CONSTRAINT artist_agency_details_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(artist_id) ON DELETE CASCADE;

--
-- Name: artist_bios artist_bios_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_bios
    ADD CONSTRAINT artist_bios_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(artist_id) ON DELETE CASCADE;

--
-- Name: artist_translations artist_translations_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_translations
    ADD CONSTRAINT artist_translations_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(artist_id) ON DELETE CASCADE;

--
-- Name: artist_translations artist_translations_locale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_translations
    ADD CONSTRAINT artist_translations_locale_fkey FOREIGN KEY (locale) REFERENCES public.locales(code);

--
-- Name: artwork_group_members artwork_group_members_artwork_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_group_members
    ADD CONSTRAINT artwork_group_members_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES public.artworks(artwork_id) ON DELETE CASCADE;

--
-- Name: artwork_group_members artwork_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_group_members
    ADD CONSTRAINT artwork_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.artwork_groups(id) ON DELETE CASCADE;

--
-- Name: artwork_groups artwork_groups_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_groups
    ADD CONSTRAINT artwork_groups_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: artwork_groups artwork_groups_expo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_groups
    ADD CONSTRAINT artwork_groups_expo_id_fkey FOREIGN KEY (expo_id) REFERENCES public.expos(id) ON DELETE CASCADE;

--
-- Name: artwork_groups artwork_groups_group_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artwork_groups
    ADD CONSTRAINT artwork_groups_group_artist_id_fkey FOREIGN KEY (group_artist_id) REFERENCES public.artists(artist_id) ON DELETE SET NULL;

--
-- Name: artworks artworks_artwork_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artworks
    ADD CONSTRAINT artworks_artwork_agency_id_fkey FOREIGN KEY (artwork_agency_id) REFERENCES public.agencies(id);

--
-- Name: artworks artworks_artwork_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artworks
    ADD CONSTRAINT artworks_artwork_artist_id_fkey FOREIGN KEY (artwork_artist_id) REFERENCES public.artists(artist_id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: artworks artworks_artwork_expo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artworks
    ADD CONSTRAINT artworks_artwork_expo_id_fkey FOREIGN KEY (artwork_expo_id) REFERENCES public.expos(id);

--
-- Name: audio_files audio_files_prompt_style_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_files
    ADD CONSTRAINT audio_files_prompt_style_id_fkey FOREIGN KEY (prompt_style_id) REFERENCES public.prompt_style(id) ON DELETE SET NULL;

--
-- Name: avatar_noun_translation avatar_noun_translation_noun_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_noun_translation
    ADD CONSTRAINT avatar_noun_translation_noun_id_fkey FOREIGN KEY (noun_id) REFERENCES public.avatar_noun_lexicon(id) ON DELETE CASCADE;

--
-- Name: avatars avatars_noun_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatars
    ADD CONSTRAINT avatars_noun_id_fkey FOREIGN KEY (noun_id) REFERENCES public.avatar_noun_lexicon(id);

--
-- Name: billing_alerts billing_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT billing_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: billing_alerts billing_alerts_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT billing_alerts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: billing_alerts billing_alerts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT billing_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: billing_alerts billing_alerts_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_alerts
    ADD CONSTRAINT billing_alerts_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.organisation_subscriptions(id) ON DELETE SET NULL;

--
-- Name: connected_expo_quote_requests connected_expo_quote_requests_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_expo_quote_requests
    ADD CONSTRAINT connected_expo_quote_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;

--
-- Name: connected_expo_quote_requests connected_expo_quote_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_expo_quote_requests
    ADD CONSTRAINT connected_expo_quote_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: daily_stats daily_stats_agency_id_fkey_to_agencies; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_stats
    ADD CONSTRAINT daily_stats_agency_id_fkey_to_agencies FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: daily_stats daily_stats_expo_id_fkey_to_expos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_stats
    ADD CONSTRAINT daily_stats_expo_id_fkey_to_expos FOREIGN KEY (expo_id) REFERENCES public.expos(id) ON DELETE CASCADE;

--
-- Name: etincelle_notification_log etincelle_notification_log_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etincelle_notification_log
    ADD CONSTRAINT etincelle_notification_log_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: expo_user_role expo_user_role_expo_id_fkey_to_expos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_user_role
    ADD CONSTRAINT expo_user_role_expo_id_fkey_to_expos FOREIGN KEY (expo_id) REFERENCES public.expos(id) ON DELETE CASCADE;

--
-- Name: expo_user_role expo_user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_user_role
    ADD CONSTRAINT expo_user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_legacy(id) ON DELETE CASCADE;

--
-- Name: expos expos_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expos
    ADD CONSTRAINT expos_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);

--
-- Name: users_legacy fk_users_roles; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_legacy
    ADD CONSTRAINT fk_users_roles FOREIGN KEY (user_roles) REFERENCES public.roles_user(role_id);

--
-- Name: invoice_draft_items invoice_draft_items_invoice_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_draft_items
    ADD CONSTRAINT invoice_draft_items_invoice_draft_id_fkey FOREIGN KEY (invoice_draft_id) REFERENCES public.invoice_drafts(id) ON DELETE CASCADE;

--
-- Name: invoice_drafts invoice_drafts_account_usage_monthly_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_drafts
    ADD CONSTRAINT invoice_drafts_account_usage_monthly_id_fkey FOREIGN KEY (account_usage_monthly_id) REFERENCES public.account_usage_monthly(id) ON DELETE SET NULL;

--
-- Name: invoice_drafts invoice_drafts_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_drafts
    ADD CONSTRAINT invoice_drafts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: invoice_drafts invoice_drafts_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_drafts
    ADD CONSTRAINT invoice_drafts_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.organisation_subscriptions(id) ON DELETE SET NULL;

--
-- Name: invoice_drafts invoice_drafts_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_drafts
    ADD CONSTRAINT invoice_drafts_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: language_option_requests language_option_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.language_option_requests
    ADD CONSTRAINT language_option_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: language_option_requests language_option_requests_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.language_option_requests
    ADD CONSTRAINT language_option_requests_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: language_option_requests language_option_requests_pricing_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.language_option_requests
    ADD CONSTRAINT language_option_requests_pricing_option_id_fkey FOREIGN KEY (pricing_option_id) REFERENCES public.pricing_options(id) ON DELETE SET NULL;

--
-- Name: language_option_requests language_option_requests_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.language_option_requests
    ADD CONSTRAINT language_option_requests_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.organisation_subscriptions(id) ON DELETE CASCADE;

--
-- Name: notifications notifications_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: notifications notifications_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: organisation_subscriptions organisation_subscriptions_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation_subscriptions
    ADD CONSTRAINT organisation_subscriptions_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: organisation_subscriptions organisation_subscriptions_pricing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation_subscriptions
    ADD CONSTRAINT organisation_subscriptions_pricing_id_fkey FOREIGN KEY (pricing_id) REFERENCES public.pricing(pricing_id);

--
-- Name: organizer_error_logs organizer_error_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_error_logs
    ADD CONSTRAINT organizer_error_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.organizer_error_sessions(id) ON DELETE CASCADE;

--
-- Name: organizer_error_sessions organizer_error_sessions_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_error_sessions
    ADD CONSTRAINT organizer_error_sessions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;

--
-- Name: organizer_error_sessions organizer_error_sessions_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_error_sessions
    ADD CONSTRAINT organizer_error_sessions_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: pricing_audit_log pricing_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_audit_log
    ADD CONSTRAINT pricing_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: pricing_audit_log pricing_audit_log_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_audit_log
    ADD CONSTRAINT pricing_audit_log_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE SET NULL;

--
-- Name: pricing_options pricing_options_pricing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_options
    ADD CONSTRAINT pricing_options_pricing_id_fkey FOREIGN KEY (pricing_id) REFERENCES public.pricing(pricing_id) ON DELETE CASCADE;

--
-- Name: pricing_overage_rules pricing_overage_rules_pricing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_overage_rules
    ADD CONSTRAINT pricing_overage_rules_pricing_id_fkey FOREIGN KEY (pricing_id) REFERENCES public.pricing(pricing_id) ON DELETE CASCADE;

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_preferred_locale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_preferred_locale_fkey FOREIGN KEY (preferred_locale) REFERENCES public.locales(code);

--
-- Name: profiles profiles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles_user(role_id);

--
-- Name: prompt_style prompt_style_agency_id_fkey_to_agencies; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_style
    ADD CONSTRAINT prompt_style_agency_id_fkey_to_agencies FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: provider_sync_runs provider_sync_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_runs
    ADD CONSTRAINT provider_sync_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: retention_settings retention_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_settings
    ADD CONSTRAINT retention_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

--
-- Name: social_links social_links_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(artist_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: social_links social_links_link_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_link_type_id_fkey FOREIGN KEY (link_type_id) REFERENCES public.social_link_types(id);

--
-- Name: sponsors sponsors_id_expo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsors
    ADD CONSTRAINT sponsors_id_expo_fkey FOREIGN KEY (id_expo) REFERENCES public.expos(id) ON DELETE CASCADE;

--
-- Name: travel_diary_share_links travel_diary_share_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_diary_share_links
    ADD CONSTRAINT travel_diary_share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: travel_diary_share_links travel_diary_share_links_expo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_diary_share_links
    ADD CONSTRAINT travel_diary_share_links_expo_id_fkey FOREIGN KEY (expo_id) REFERENCES public.expos(id) ON DELETE SET NULL;

--
-- Name: upgrade_recommendations upgrade_recommendations_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upgrade_recommendations
    ADD CONSTRAINT upgrade_recommendations_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: upgrade_recommendations upgrade_recommendations_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upgrade_recommendations
    ADD CONSTRAINT upgrade_recommendations_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

--
-- Name: upgrade_recommendations upgrade_recommendations_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upgrade_recommendations
    ADD CONSTRAINT upgrade_recommendations_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.organisation_subscriptions(id) ON DELETE SET NULL;

--
-- Name: users_legacy user_agency_id_fkey_to_agencies; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_legacy
    ADD CONSTRAINT user_agency_id_fkey_to_agencies FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;

--
-- Name: users_legacy user_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_legacy
    ADD CONSTRAINT user_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles_user(role_id);

--
-- Name: visit_logs visit_logs_artwork_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES public.artworks(artwork_id);

--
-- Name: visit_logs visit_logs_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES public.visitors(id);

--
-- Name: visitor_audio_presence visitor_audio_presence_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_audio_presence
    ADD CONSTRAINT visitor_audio_presence_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: visitor_audio_presence visitor_audio_presence_expo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_audio_presence
    ADD CONSTRAINT visitor_audio_presence_expo_id_fkey FOREIGN KEY (expo_id) REFERENCES public.expos(id) ON DELETE SET NULL;

--
-- Name: visitor_error_logs visitor_error_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_error_logs
    ADD CONSTRAINT visitor_error_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.visitor_error_sessions(id) ON DELETE CASCADE;

--
-- Name: visitor_error_sessions visitor_error_sessions_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_error_sessions
    ADD CONSTRAINT visitor_error_sessions_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: visitor_expo_visits visitor_expo_visits_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_expo_visits
    ADD CONSTRAINT visitor_expo_visits_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;

--
-- Name: visitor_expo_visits visitor_expo_visits_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_expo_visits
    ADD CONSTRAINT visitor_expo_visits_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: visitor_expo_visits visitor_expo_visits_expo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_expo_visits
    ADD CONSTRAINT visitor_expo_visits_expo_id_fkey FOREIGN KEY (expo_id) REFERENCES public.expos(id) ON DELETE CASCADE;

--
-- Name: visitor_expo_visits visitor_expo_visits_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_expo_visits
    ADD CONSTRAINT visitor_expo_visits_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES public.visitors(id) ON DELETE CASCADE;

--
-- Name: visitor_feedback visitor_feedback_agency_id_fkey_to_agencies; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_feedback
    ADD CONSTRAINT visitor_feedback_agency_id_fkey_to_agencies FOREIGN KEY (agency_id) REFERENCES public.agencies(id);

--
-- Name: visitor_feedback visitor_feedback_emotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_feedback
    ADD CONSTRAINT visitor_feedback_emotion_id_fkey FOREIGN KEY (emotion_id) REFERENCES public.emotions(id);

--
-- Name: visitor_feedback visitor_feedback_expo_id_fkey_to_expos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_feedback
    ADD CONSTRAINT visitor_feedback_expo_id_fkey_to_expos FOREIGN KEY (expo_id) REFERENCES public.expos(id);

--
-- Name: visitor_feedback visitor_feedback_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_feedback
    ADD CONSTRAINT visitor_feedback_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visitor_expo_visits(id) ON DELETE SET NULL;

--
-- Name: prompt_style Allow public read access for prompt_style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access for prompt_style" ON public.prompt_style FOR SELECT TO anon USING (true);

--
-- Name: artist_bios Anyone can read artist_bios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read artist_bios" ON public.artist_bios FOR SELECT USING (true);

--
-- Name: artist_bios Authenticated users can delete artist_bios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete artist_bios" ON public.artist_bios FOR DELETE USING ((auth.role() = 'authenticated'::text));

--
-- Name: artist_bios Authenticated users can insert artist_bios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert artist_bios" ON public.artist_bios FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));

--
-- Name: artist_bios Authenticated users can update artist_bios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update artist_bios" ON public.artist_bios FOR UPDATE USING ((auth.role() = 'authenticated'::text));

--
-- Name: prompt_style Public Select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public Select" ON public.prompt_style FOR SELECT USING (true);

--
-- Name: artist_agency_details Users can view artist bios for their agency; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view artist bios for their agency" ON public.artist_agency_details FOR SELECT USING ((agency_id = ( SELECT users_legacy.agency_id
   FROM public.users_legacy
  WHERE (users_legacy.id = auth.uid()))));

--
-- Name: account_usage_monthly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_usage_monthly ENABLE ROW LEVEL SECURITY;

--
-- Name: account_usage_monthly account_usage_monthly_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_usage_monthly_admin_write ON public.account_usage_monthly TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: account_usage_monthly account_usage_monthly_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_usage_monthly_read ON public.account_usage_monthly FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(organisation_id)));

--
-- Name: google_billing_cache admin_read_billing_cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_billing_cache ON public.google_billing_cache FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: agencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

--
-- Name: agencies agencies_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_delete ON public.agencies FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: agencies agencies_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_insert ON public.agencies FOR INSERT TO authenticated WITH CHECK (public.rls_is_global_admin());

--
-- Name: agencies agencies_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_select ON public.agencies FOR SELECT TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(id)));

--
-- Name: agencies agencies_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agencies_update ON public.agencies FOR UPDATE TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(id))) WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(id)));

--
-- Name: agency_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_users ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_users agency_users_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_users_delete ON public.agency_users FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: agency_users agency_users_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_users_insert ON public.agency_users FOR INSERT TO authenticated WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: agency_users agency_users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_users_select ON public.agency_users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: agency_users agency_users_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_users_update ON public.agency_users FOR UPDATE TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: ai_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_jobs ai_jobs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_jobs_select_authenticated ON public.ai_jobs FOR SELECT TO authenticated USING (true);

--
-- Name: ai_limit_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_limit_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_provider_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_provider_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_ratelimit_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_ratelimit_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_events ai_usage_events_delete_manual_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_events_delete_manual_admin ON public.ai_usage_events FOR DELETE TO authenticated USING (((source = 'manual_entry'::text) AND public.is_cost_admin()));

--
-- Name: ai_usage_events ai_usage_events_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_events_insert_authenticated ON public.ai_usage_events FOR INSERT TO authenticated WITH CHECK (true);

--
-- Name: ai_usage_events ai_usage_events_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_events_select_authenticated ON public.ai_usage_events FOR SELECT TO authenticated USING (true);

--
-- Name: ai_usage_events ai_usage_events_update_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_events_update_admin_all ON public.ai_usage_events FOR UPDATE TO authenticated USING (public.is_cost_admin()) WITH CHECK (public.is_cost_admin());

--
-- Name: ai_usage_events ai_usage_events_update_manual_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_events_update_manual_admin ON public.ai_usage_events FOR UPDATE TO authenticated USING (((source = 'manual_entry'::text) AND public.is_cost_admin())) WITH CHECK (((source = 'manual_entry'::text) AND public.is_cost_admin()));

--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_logs ai_usage_logs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_logs_select_authenticated ON public.ai_usage_logs FOR SELECT TO authenticated USING (true);

--
-- Name: aimediart_document_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aimediart_document_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: aimediart_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aimediart_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: aimediart_documents aimediart_documents_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_documents_delete_admin ON public.aimediart_documents FOR DELETE TO authenticated USING (public.is_aimediart_admin());

--
-- Name: aimediart_documents aimediart_documents_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_documents_insert_admin ON public.aimediart_documents FOR INSERT TO authenticated WITH CHECK (public.is_aimediart_admin());

--
-- Name: aimediart_documents aimediart_documents_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_documents_select_admin ON public.aimediart_documents FOR SELECT TO authenticated USING (public.is_aimediart_admin());

--
-- Name: aimediart_documents aimediart_documents_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_documents_update_admin ON public.aimediart_documents FOR UPDATE TO authenticated USING (public.is_aimediart_admin()) WITH CHECK (public.is_aimediart_admin());

--
-- Name: aimediart_document_folders aimediart_folders_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_folders_delete_admin ON public.aimediart_document_folders FOR DELETE TO authenticated USING (public.is_aimediart_admin());

--
-- Name: aimediart_document_folders aimediart_folders_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_folders_insert_admin ON public.aimediart_document_folders FOR INSERT TO authenticated WITH CHECK (public.is_aimediart_admin());

--
-- Name: aimediart_document_folders aimediart_folders_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_folders_select_admin ON public.aimediart_document_folders FOR SELECT TO authenticated USING (public.is_aimediart_admin());

--
-- Name: aimediart_document_folders aimediart_folders_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_folders_update_admin ON public.aimediart_document_folders FOR UPDATE TO authenticated USING (public.is_aimediart_admin()) WITH CHECK (public.is_aimediart_admin());

--
-- Name: aimediart_ged_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aimediart_ged_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: aimediart_ged_sections aimediart_sections_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_sections_delete_admin ON public.aimediart_ged_sections FOR DELETE TO authenticated USING (public.is_aimediart_admin());

--
-- Name: aimediart_ged_sections aimediart_sections_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_sections_insert_admin ON public.aimediart_ged_sections FOR INSERT TO authenticated WITH CHECK (public.is_aimediart_admin());

--
-- Name: aimediart_ged_sections aimediart_sections_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_sections_select_admin ON public.aimediart_ged_sections FOR SELECT TO authenticated USING (public.is_aimediart_admin());

--
-- Name: aimediart_ged_sections aimediart_sections_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aimediart_sections_update_admin ON public.aimediart_ged_sections FOR UPDATE TO authenticated USING (public.is_aimediart_admin()) WITH CHECK (public.is_aimediart_admin());

--
-- Name: ai_limit_alerts alerts_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_admin_select ON public.ai_limit_alerts FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_forest_canopy_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_forest_canopy_public_read ON public.app_settings FOR SELECT TO authenticated, anon USING ((key = 'settings_forest_canopy'::text));

--
-- Name: app_settings app_settings_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_select_staff ON public.app_settings FOR SELECT TO authenticated USING (public.rls_is_staff());

--
-- Name: app_settings app_settings_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_write_admin ON public.app_settings TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: artist_translations artist translations readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "artist translations readable by everyone" ON public.artist_translations FOR SELECT TO authenticated, anon USING (true);

--
-- Name: artist_agency_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artist_agency_details ENABLE ROW LEVEL SECURITY;

--
-- Name: artist_agency_details artist_agency_details_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artist_agency_details_admin_all ON public.artist_agency_details TO authenticated USING (public.artist_agency_details_is_global_admin()) WITH CHECK (public.artist_agency_details_is_global_admin());

--
-- Name: artist_agency_details artist_agency_details_agency_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artist_agency_details_agency_delete ON public.artist_agency_details FOR DELETE TO authenticated USING (public.artist_agency_details_user_is_admin_agency_for(agency_id));

--
-- Name: artist_agency_details artist_agency_details_agency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artist_agency_details_agency_select ON public.artist_agency_details FOR SELECT TO authenticated USING (public.artist_agency_details_user_is_admin_agency_for(agency_id));

--
-- Name: artist_agency_details artist_agency_details_agency_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artist_agency_details_agency_update ON public.artist_agency_details FOR UPDATE TO authenticated USING (public.artist_agency_details_user_is_admin_agency_for(agency_id)) WITH CHECK (public.artist_agency_details_user_is_admin_agency_for(agency_id));

--
-- Name: artist_agency_details artist_agency_details_agency_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artist_agency_details_agency_write ON public.artist_agency_details FOR INSERT TO authenticated WITH CHECK (public.artist_agency_details_user_is_admin_agency_for(agency_id));

--
-- Name: artist_bios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artist_bios ENABLE ROW LEVEL SECURITY;

--
-- Name: artist_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artist_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: artists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

--
-- Name: artists artists readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "artists readable by everyone" ON public.artists FOR SELECT TO authenticated, anon USING ((deleted_at IS NULL));

--
-- Name: artists artists_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artists_delete_admin ON public.artists FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: artists artists_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artists_insert_staff ON public.artists FOR INSERT TO authenticated WITH CHECK (public.rls_is_staff());

--
-- Name: artists artists_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artists_select_staff ON public.artists FOR SELECT TO authenticated USING (public.rls_is_staff());

--
-- Name: artists artists_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artists_update_staff ON public.artists FOR UPDATE TO authenticated USING (public.rls_is_staff()) WITH CHECK (public.rls_is_staff());

--
-- Name: artwork_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artwork_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: artwork_group_members artwork_group_members_anon_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artwork_group_members_anon_select ON public.artwork_group_members FOR SELECT TO anon USING ((public.artwork_group_is_visitor_visible(group_id) AND (EXISTS ( SELECT 1
   FROM public.artworks aw
  WHERE ((aw.artwork_id = artwork_group_members.artwork_id) AND (aw.artwork_deleted_at IS NULL) AND (COALESCE(aw.deleted_at, aw.artwork_deleted_at) IS NULL) AND (lower(TRIM(BOTH FROM COALESCE(aw.artwork_status, ''::text))) = 'active'::text))))));

--
-- Name: artwork_group_members artwork_group_members_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artwork_group_members_select_authenticated ON public.artwork_group_members FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.artwork_groups ag
  WHERE ((ag.id = artwork_group_members.group_id) AND (public.rls_is_global_admin() OR public.rls_is_agency_staff_for(ag.agency_id))))));

--
-- Name: artwork_group_members artwork_group_members_write_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artwork_group_members_write_authenticated ON public.artwork_group_members TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.artwork_groups ag
  WHERE ((ag.id = artwork_group_members.group_id) AND (public.rls_is_global_admin() OR public.rls_is_agency_staff_for(ag.agency_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.artwork_groups ag
  WHERE ((ag.id = artwork_group_members.group_id) AND (public.rls_is_global_admin() OR public.rls_is_agency_staff_for(ag.agency_id))))));

--
-- Name: artwork_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artwork_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: artwork_groups artwork_groups_anon_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artwork_groups_anon_select_visible ON public.artwork_groups FOR SELECT TO anon USING (public.artwork_group_is_visitor_visible(id));

--
-- Name: artwork_groups artwork_groups_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artwork_groups_select_authenticated ON public.artwork_groups FOR SELECT TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: artwork_groups artwork_groups_write_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artwork_groups_write_authenticated ON public.artwork_groups TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id))) WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: artworks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;

--
-- Name: artworks artworks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artworks_delete ON public.artworks FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: artworks artworks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artworks_insert ON public.artworks FOR INSERT TO authenticated WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(artwork_agency_id)));

--
-- Name: artworks artworks_public_anon_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artworks_public_anon_select_active ON public.artworks FOR SELECT TO anon USING ((artwork_deleted_at IS NULL));

--
-- Name: artworks artworks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artworks_select ON public.artworks FOR SELECT TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(artwork_agency_id)));

--
-- Name: artworks artworks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY artworks_update ON public.artworks FOR UPDATE TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(artwork_agency_id))) WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(artwork_agency_id)));

--
-- Name: audio_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;

--
-- Name: audio_files audio_files_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audio_files_delete ON public.audio_files FOR DELETE USING ((auth.role() = 'service_role'::text));

--
-- Name: audio_files audio_files_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audio_files_insert ON public.audio_files FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));

--
-- Name: audio_files audio_files_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audio_files_select ON public.audio_files FOR SELECT USING ((auth.role() = 'authenticated'::text));

--
-- Name: audio_files audio_files_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audio_files_update ON public.audio_files FOR UPDATE USING ((auth.role() = 'service_role'::text));

--
-- Name: avatar_adjective_lexicon; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatar_adjective_lexicon ENABLE ROW LEVEL SECURITY;

--
-- Name: avatar_noun_lexicon; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatar_noun_lexicon ENABLE ROW LEVEL SECURITY;

--
-- Name: avatar_noun_translation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatar_noun_translation ENABLE ROW LEVEL SECURITY;

--
-- Name: avatars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

--
-- Name: avatars avatars_visitor_public_select_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY avatars_visitor_public_select_catalog ON public.avatars FOR SELECT TO authenticated, anon USING (((adjective_en IS NOT NULL) AND (noun_en IS NOT NULL) AND (full_pseudo_en IS NOT NULL)));

--
-- Name: billing_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_alerts billing_alerts_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_alerts_admin_write ON public.billing_alerts TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: billing_alerts billing_alerts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_alerts_read ON public.billing_alerts FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(organisation_id)));

--
-- Name: connected_expo_quote_requests connected_expo_quote_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connected_expo_quote_insert_own ON public.connected_expo_quote_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

--
-- Name: connected_expo_quote_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connected_expo_quote_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: connected_expo_quote_requests connected_expo_quote_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY connected_expo_quote_select_own ON public.connected_expo_quote_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

--
-- Name: cost_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_providers cost_providers_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_providers_insert_authenticated ON public.cost_providers FOR INSERT TO authenticated WITH CHECK (true);

--
-- Name: cost_providers cost_providers_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_providers_select_authenticated ON public.cost_providers FOR SELECT TO authenticated USING (true);

--
-- Name: cost_providers cost_providers_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_providers_update_authenticated ON public.cost_providers FOR UPDATE TO authenticated USING (true);

--
-- Name: countries_phone; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.countries_phone ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_stats daily_stats_deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_stats_deny_all ON public.daily_stats TO authenticated, anon USING (false) WITH CHECK (false);

--
-- Name: emotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emotions ENABLE ROW LEVEL SECURITY;

--
-- Name: etincelle_notification_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.etincelle_notification_log ENABLE ROW LEVEL SECURITY;

--
-- Name: etincelle_notification_log etincelle_notification_log_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY etincelle_notification_log_service ON public.etincelle_notification_log TO service_role USING (true) WITH CHECK (true);

--
-- Name: expo_user_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expo_user_role ENABLE ROW LEVEL SECURITY;

--
-- Name: expo_user_role expo_user_role_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expo_user_role_delete ON public.expo_user_role FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: expo_user_role expo_user_role_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expo_user_role_insert ON public.expo_user_role FOR INSERT TO authenticated WITH CHECK ((public.rls_is_global_admin() OR (EXISTS ( SELECT 1
   FROM public.expos e
  WHERE ((e.id = e.expo_id) AND public.rls_is_agency_staff_for(e.agency_id))))));

--
-- Name: expo_user_role expo_user_role_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expo_user_role_select ON public.expo_user_role FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.rls_is_global_admin() OR (EXISTS ( SELECT 1
   FROM public.expos e
  WHERE ((e.id = expo_user_role.expo_id) AND public.rls_is_agency_staff_for(e.agency_id))))));

--
-- Name: expo_user_role expo_user_role_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expo_user_role_update ON public.expo_user_role FOR UPDATE TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: expos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expos ENABLE ROW LEVEL SECURITY;

--
-- Name: expos expos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expos_delete ON public.expos FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: expos expos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expos_insert ON public.expos FOR INSERT TO authenticated WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: expos expos_public_anon_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expos_public_anon_select_active ON public.expos FOR SELECT TO anon USING ((deleted_at IS NULL));

--
-- Name: expos expos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expos_select ON public.expos FOR SELECT TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: expos expos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expos_update ON public.expos FOR UPDATE TO authenticated USING ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id))) WITH CHECK ((public.rls_is_global_admin() OR public.rls_is_agency_staff_for(agency_id)));

--
-- Name: google_billing_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_billing_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_draft_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_draft_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_draft_items invoice_draft_items_finance_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_draft_items_finance_write ON public.invoice_draft_items TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: invoice_draft_items invoice_draft_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_draft_items_read ON public.invoice_draft_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.invoice_drafts d
  WHERE ((d.id = invoice_draft_items.invoice_draft_id) AND (public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(d.organisation_id))))));

--
-- Name: invoice_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_drafts invoice_drafts_finance_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_drafts_finance_write ON public.invoice_drafts TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: invoice_drafts invoice_drafts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_drafts_read ON public.invoice_drafts FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(organisation_id)));

--
-- Name: language_option_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.language_option_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: language_option_requests language_option_requests_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY language_option_requests_admin_update ON public.language_option_requests FOR UPDATE TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_admin_can_write(organisation_id))) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_admin_can_write(organisation_id)));

--
-- Name: language_option_requests language_option_requests_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY language_option_requests_org_insert ON public.language_option_requests FOR INSERT TO authenticated WITH CHECK ((public.pricing_organisation_admin_can_write(organisation_id) OR public.pricing_is_global_admin()));

--
-- Name: language_option_requests language_option_requests_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY language_option_requests_read ON public.language_option_requests FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(organisation_id)));

--
-- Name: ai_provider_limits limits_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY limits_admin_all ON public.ai_provider_limits TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: locales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locales ENABLE ROW LEVEL SECURITY;

--
-- Name: locales locales are readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "locales are readable by everyone" ON public.locales FOR SELECT TO authenticated, anon USING ((is_active = true));

--
-- Name: locales locales readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "locales readable by everyone" ON public.locales FOR SELECT TO authenticated, anon USING ((is_active = true));

--
-- Name: matrice_securite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matrice_securite ENABLE ROW LEVEL SECURITY;

--
-- Name: matrice_securite matrice_securite_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matrice_securite_select_staff ON public.matrice_securite FOR SELECT TO authenticated USING (public.rls_is_staff());

--
-- Name: matrice_securite matrice_securite_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matrice_securite_write_admin ON public.matrice_securite TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_recipient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_recipient ON public.notifications FOR SELECT TO authenticated USING (((recipient_user_id = auth.uid()) OR public.pricing_is_global_admin()));

--
-- Name: notifications notifications_recipient_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_recipient_update ON public.notifications FOR UPDATE TO authenticated USING ((recipient_user_id = auth.uid())) WITH CHECK ((recipient_user_id = auth.uid()));

--
-- Name: organisation_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organisation_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: organisation_subscriptions organisation_subscriptions_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organisation_subscriptions_admin_write ON public.organisation_subscriptions TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: organisation_subscriptions organisation_subscriptions_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organisation_subscriptions_org_read ON public.organisation_subscriptions FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(organisation_id)));

--
-- Name: organizer_error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_error_logs organizer_error_logs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizer_error_logs_select_admin ON public.organizer_error_logs FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: organizer_error_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_error_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_error_sessions organizer_error_sessions_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizer_error_sessions_delete_admin ON public.organizer_error_sessions FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: organizer_error_sessions organizer_error_sessions_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizer_error_sessions_select_admin ON public.organizer_error_sessions FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: postcode; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.postcode ENABLE ROW LEVEL SECURITY;

--
-- Name: postcode postcode_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY postcode_select_public ON public.postcode FOR SELECT TO authenticated, anon USING (true);

--
-- Name: pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing pricing_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_admin_write ON public.pricing TO authenticated USING (public.pricing_is_global_admin()) WITH CHECK (public.pricing_is_global_admin());

--
-- Name: pricing_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_audit_log pricing_audit_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_audit_log_read ON public.pricing_audit_log FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: pricing_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_options ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_options pricing_options_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_options_admin_write ON public.pricing_options TO authenticated USING (public.pricing_is_global_admin()) WITH CHECK (public.pricing_is_global_admin());

--
-- Name: pricing_options pricing_options_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_options_public_read ON public.pricing_options FOR SELECT TO authenticated, anon USING ((is_active = true));

--
-- Name: pricing_overage_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_overage_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_overage_rules pricing_overage_rules_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_overage_rules_admin ON public.pricing_overage_rules TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK (public.pricing_is_global_admin());

--
-- Name: pricing pricing_public_anon_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_public_anon_select ON public.pricing FOR SELECT TO authenticated, anon USING (true);

--
-- Name: pricing pricing_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_public_read ON public.pricing FOR SELECT TO authenticated, anon USING (((is_active = true) AND (archived_at IS NULL)));

--
-- Name: pricing pricing_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_select_staff ON public.pricing FOR SELECT TO authenticated USING (public.rls_is_staff());

--
-- Name: pricing pricing_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_write_admin ON public.pricing TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete_admin_only ON public.profiles FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: profiles profiles_insert_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own_or_admin ON public.profiles FOR INSERT TO authenticated WITH CHECK (((id = auth.uid()) OR public.rls_is_global_admin()));

--
-- Name: profiles profiles_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own_or_admin ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.rls_is_global_admin()));

--
-- Name: profiles profiles_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own_or_admin ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR public.rls_is_global_admin())) WITH CHECK (((id = auth.uid()) OR public.rls_is_global_admin()));

--
-- Name: prompt_style; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_style ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_style prompt_style_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_style_select_authenticated ON public.prompt_style FOR SELECT TO authenticated USING (true);

--
-- Name: prompt_style prompt_style_select_by_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_style_select_by_role ON public.prompt_style FOR SELECT TO authenticated USING ((public.current_role_id() = ANY (ARRAY[1, 2, 3, 4, 5, 6])));

--
-- Name: prompt_style prompt_style_update_by_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_style_update_by_role ON public.prompt_style FOR UPDATE TO authenticated USING ((public.current_role_id() = ANY (ARRAY[1, 2, 3, 4]))) WITH CHECK ((public.current_role_id() = ANY (ARRAY[1, 2, 3, 4])));

--
-- Name: provider_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_sync_runs provider_sync_runs_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_sync_runs_insert_authenticated ON public.provider_sync_runs FOR INSERT TO authenticated WITH CHECK (true);

--
-- Name: provider_sync_runs provider_sync_runs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_sync_runs_select_authenticated ON public.provider_sync_runs FOR SELECT TO authenticated USING (true);

--
-- Name: pseudo_pool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pseudo_pool ENABLE ROW LEVEL SECURITY;

--
-- Name: pseudo_pool pseudo_pool_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pseudo_pool_public_select ON public.pseudo_pool FOR SELECT TO authenticated, anon USING (true);

--
-- Name: emotions public read emotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read emotions" ON public.emotions FOR SELECT TO authenticated, anon USING (true);

--
-- Name: retention_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: retention_settings retention_settings_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retention_settings_delete_admin ON public.retention_settings FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: retention_settings retention_settings_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retention_settings_insert_admin ON public.retention_settings FOR INSERT TO authenticated WITH CHECK (public.rls_is_global_admin());

--
-- Name: retention_settings retention_settings_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retention_settings_select_admin ON public.retention_settings FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: retention_settings retention_settings_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retention_settings_update_admin ON public.retention_settings FOR UPDATE TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: roles_user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles_user ENABLE ROW LEVEL SECURITY;

--
-- Name: roles_user roles_user_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_user_select_authenticated ON public.roles_user FOR SELECT TO authenticated USING (true);

--
-- Name: google_billing_cache service_role_all_billing_cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all_billing_cache ON public.google_billing_cache TO service_role USING (true) WITH CHECK (true);

--
-- Name: ai_ratelimit_snapshots snapshots_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snapshots_admin_select ON public.ai_ratelimit_snapshots FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: social_link_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_link_types ENABLE ROW LEVEL SECURITY;

--
-- Name: social_link_types social_link_types_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_link_types_select_public ON public.social_link_types FOR SELECT TO authenticated, anon USING (true);

--
-- Name: social_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;

--
-- Name: social_links social_links_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_links_select_public ON public.social_links FOR SELECT TO authenticated, anon USING (true);

--
-- Name: sponsors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

--
-- Name: sponsors sponsors_select_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sponsors_select_v2 ON public.sponsors FOR SELECT TO authenticated USING (public.sponsors_user_can_access_row(id_expo));

--
-- Name: sponsors sponsors_write_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sponsors_write_v2 ON public.sponsors TO authenticated USING (public.sponsors_user_can_access_row(id_expo)) WITH CHECK (public.sponsors_user_can_access_row(id_expo));

--
-- Name: supabase_metrics_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supabase_metrics_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

--
-- Name: travel_diary_share_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.travel_diary_share_links ENABLE ROW LEVEL SECURITY;

--
-- Name: upgrade_recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upgrade_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: upgrade_recommendations upgrade_recommendations_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY upgrade_recommendations_admin_write ON public.upgrade_recommendations TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin())) WITH CHECK ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin()));

--
-- Name: upgrade_recommendations upgrade_recommendations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY upgrade_recommendations_read ON public.upgrade_recommendations FOR SELECT TO authenticated USING ((public.pricing_is_global_admin() OR public.pricing_is_finance_admin() OR public.pricing_organisation_user_can_read(organisation_id)));

--
-- Name: profiles users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can read own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));

--
-- Name: profiles users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

--
-- Name: users_legacy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: users_legacy users_legacy_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_legacy_delete ON public.users_legacy FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: users_legacy users_legacy_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_legacy_select ON public.users_legacy FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.rls_is_global_admin()));

--
-- Name: users_legacy users_legacy_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_legacy_update ON public.users_legacy FOR UPDATE TO authenticated USING (public.rls_is_global_admin()) WITH CHECK (public.rls_is_global_admin());

--
-- Name: vercel_metrics_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vercel_metrics_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_feedback vf_insert_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vf_insert_public ON public.visitor_feedback FOR INSERT TO authenticated, anon WITH CHECK (((artwork_id IS NOT NULL) AND (emotion_id IS NOT NULL) AND ((heart_rating >= 1) AND (heart_rating <= 5)) AND (COALESCE(visitor_id, ''::text) <> ''::text) AND (COALESCE(visitor_id, ''::text) ~* '^[0-9a-f-]{36}$'::text)));

--
-- Name: visitor_feedback vf_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vf_select_auth ON public.visitor_feedback FOR SELECT TO authenticated USING (true);

--
-- Name: visitor_feedback vf_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vf_select_public ON public.visitor_feedback FOR SELECT USING (true);

--
-- Name: visit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_logs visit_logs_deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visit_logs_deny_all ON public.visit_logs TO authenticated, anon USING (false) WITH CHECK (false);

--
-- Name: visitor_audio_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_audio_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_audio_presence visitor_audio_presence_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitor_audio_presence_select_admin ON public.visitor_audio_presence FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: visitor_error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_error_logs visitor_error_logs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitor_error_logs_select_admin ON public.visitor_error_logs FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: visitor_error_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_error_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_error_sessions visitor_error_sessions_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitor_error_sessions_delete_admin ON public.visitor_error_sessions FOR DELETE TO authenticated USING (public.rls_is_global_admin());

--
-- Name: visitor_error_sessions visitor_error_sessions_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitor_error_sessions_select_admin ON public.visitor_error_sessions FOR SELECT TO authenticated USING (public.rls_is_global_admin());

--
-- Name: visitor_expo_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_expo_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_expo_visits visitor_expo_visits_select_own_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitor_expo_visits_select_own_auth ON public.visitor_expo_visits FOR SELECT TO authenticated USING (((auth_user_id IS NOT NULL) AND (auth.uid() = auth_user_id)));

--
-- Name: visitor_expo_visits visitor_expo_visits_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitor_expo_visits_select_staff ON public.visitor_expo_visits FOR SELECT TO authenticated USING ((public.rls_is_global_admin() OR ((agency_id IS NOT NULL) AND public.rls_is_agency_staff_for(agency_id)) OR (EXISTS ( SELECT 1
   FROM public.expo_user_role eur
  WHERE ((eur.user_id = auth.uid()) AND (eur.expo_id = visitor_expo_visits.expo_id))))));

--
-- Name: visitor_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: visitors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

--
-- Name: visitors visitors_deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitors_deny_all ON public.visitors TO authenticated, anon USING (false) WITH CHECK (false);

--
-- Name: visitors visitors_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitors_select_authenticated ON public.visitors FOR SELECT TO authenticated USING (true);

--
-- Name: objects Accès public en lecture; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Accès public en lecture" ON storage.objects FOR SELECT USING ((bucket_id = 'qrcodes'::text));

--
-- Name: objects Authenticated users can upload images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = ANY (ARRAY['artwork-images'::text, 'qrcode'::text])));

--
-- Name: objects Autoriser l'upload enechz_1; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Autoriser l'upload enechz_1" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'artist-photos'::text));

--
-- Name: objects Autoriser l'upload enechz_2; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Autoriser l'upload enechz_2" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'artist-photos'::text));

--
-- Name: objects Autoriser l'upload enechz_3; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Autoriser l'upload enechz_3" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'artist-photos'::text));

--
-- Name: objects Autoriser upload selfie inscription wpqb63_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Autoriser upload selfie inscription wpqb63_0" ON storage.objects FOR INSERT WITH CHECK (true);

--
-- Name: objects Public Read Access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT USING ((bucket_id = ANY (ARRAY['artwork-images'::text, 'qrcode'::text])));

--
-- Name: objects aimediart_docs_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY aimediart_docs_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ANY (ARRAY['aimediart-legal'::text, 'aimediart-bp'::text, 'aimediart-marketing'::text, 'aimediart-ged'::text])) AND public.is_aimediart_admin()));

--
-- Name: objects aimediart_docs_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY aimediart_docs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ANY (ARRAY['aimediart-legal'::text, 'aimediart-bp'::text, 'aimediart-marketing'::text, 'aimediart-ged'::text])) AND public.is_aimediart_admin()));

--
-- Name: objects aimediart_docs_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY aimediart_docs_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = ANY (ARRAY['aimediart-legal'::text, 'aimediart-bp'::text, 'aimediart-marketing'::text, 'aimediart-ged'::text])) AND public.is_aimediart_admin()));

--
-- Name: objects aimediart_docs_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY aimediart_docs_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = ANY (ARRAY['aimediart-legal'::text, 'aimediart-bp'::text, 'aimediart-marketing'::text, 'aimediart-ged'::text])) AND public.is_aimediart_admin()));

--
-- Name: objects artist_photos_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artist_photos_public_read ON storage.objects FOR SELECT USING (((bucket_id = 'artist-photos'::text) AND ((name ~~ 'artist/%'::text) OR (name ~~ 'artists/%'::text))));

--
-- Name: objects artist_photos_staff_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artist_photos_staff_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'artist-photos'::text) AND ((name ~~ 'artist/%'::text) OR (name ~~ 'artists/%'::text)) AND public.rls_is_staff()));

--
-- Name: objects artist_photos_staff_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artist_photos_staff_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'artist-photos'::text) AND ((name ~~ 'artist/%'::text) OR (name ~~ 'artists/%'::text)) AND public.rls_is_staff()));

--
-- Name: objects artist_photos_staff_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artist_photos_staff_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'artist-photos'::text) AND ((name ~~ 'artist/%'::text) OR (name ~~ 'artists/%'::text)) AND public.rls_is_staff())) WITH CHECK (((bucket_id = 'artist-photos'::text) AND ((name ~~ 'artist/%'::text) OR (name ~~ 'artists/%'::text)) AND public.rls_is_staff()));

--
-- Name: objects artwork_images_admin_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artwork_images_admin_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'artwork-images'::text) AND (EXISTS ( SELECT 1
   FROM public.users_legacy u
  WHERE ((u.id = auth.uid()) AND (u.role_id = ANY (ARRAY[1, 2])))))));

--
-- Name: objects artwork_images_auth_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artwork_images_auth_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'artwork-images'::text));

--
-- Name: objects artwork_images_auth_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artwork_images_auth_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'artwork-images'::text)) WITH CHECK ((bucket_id = 'artwork-images'::text));

--
-- Name: objects artwork_images_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY artwork_images_public_read ON storage.objects FOR SELECT USING (((bucket_id = 'artwork-images'::text) AND (name ~~ 'artworks/%'::text)));

--
-- Name: objects audio_guides_anon_select_ready; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY audio_guides_anon_select_ready ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'audio-guides'::text) AND public.audio_file_is_ready(name)));

--
-- Name: objects audio_guides_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY audio_guides_delete ON storage.objects FOR DELETE USING (((bucket_id = 'audio-guides'::text) AND (auth.role() = 'service_role'::text)));

--
-- Name: objects audio_guides_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY audio_guides_insert ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'audio-guides'::text) AND (auth.role() = 'service_role'::text)));

--
-- Name: objects audio_guides_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY audio_guides_select ON storage.objects FOR SELECT USING (((bucket_id = 'audio-guides'::text) AND (auth.role() = 'authenticated'::text)));

--
-- Name: objects avatars_pool_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY avatars_pool_public_read ON storage.objects FOR SELECT USING (((bucket_id = 'avatars'::text) AND (name ~ '^[a-z0-9]+_[a-z0-9]+\.jpg$'::text)));

--
-- Name: objects cost_documents_admin_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cost_documents_admin_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'cost-documents'::text) AND public.is_cost_admin()));

--
-- Name: objects cost_documents_admin_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cost_documents_admin_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'cost-documents'::text) AND public.is_cost_admin()));

--
-- Name: objects cost_documents_admin_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cost_documents_admin_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'cost-documents'::text) AND public.is_cost_admin()));

--
-- Name: objects cost_documents_admin_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cost_documents_admin_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'cost-documents'::text) AND public.is_cost_admin()));

--
-- Name: objects exhibition_scans_authenticated_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY exhibition_scans_authenticated_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'exhibition-scans'::text));

--
-- Name: objects exhibition_scans_authenticated_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY exhibition_scans_authenticated_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'exhibition-scans'::text));

--
-- Name: objects exhibition_scans_authenticated_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY exhibition_scans_authenticated_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'exhibition-scans'::text));

--
-- Name: objects exhibition_scans_authenticated_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY exhibition_scans_authenticated_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'exhibition-scans'::text)) WITH CHECK ((bucket_id = 'exhibition-scans'::text));

--
-- Name: objects logos_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_public_read ON storage.objects FOR SELECT USING (((bucket_id = 'logos'::text) AND ((name ~~ 'agencies/%'::text) OR (name ~~ 'expos/%'::text))));

--
-- Name: objects logos_staff_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_staff_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'logos'::text) AND ((name ~~ 'agencies/%'::text) OR (name ~~ 'expos/%'::text)) AND public.rls_is_staff()));

--
-- Name: objects logos_staff_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_staff_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'logos'::text) AND ((name ~~ 'agencies/%'::text) OR (name ~~ 'expos/%'::text)) AND public.rls_is_staff()));

--
-- Name: objects logos_staff_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_staff_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'logos'::text) AND ((name ~~ 'agencies/%'::text) OR (name ~~ 'expos/%'::text)) AND public.rls_is_staff())) WITH CHECK (((bucket_id = 'logos'::text) AND ((name ~~ 'agencies/%'::text) OR (name ~~ 'expos/%'::text)) AND public.rls_is_staff()));

--
-- Name: objects photos_artists_staff_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_artists_staff_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'photos'::text) AND (name ~~ 'artists/%'::text) AND public.rls_is_staff()));

--
-- Name: objects photos_artists_staff_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_artists_staff_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'artists/%'::text) AND public.rls_is_staff()));

--
-- Name: objects photos_artists_staff_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_artists_staff_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'photos'::text) AND (name ~~ 'artists/%'::text) AND public.rls_is_staff())) WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'artists/%'::text) AND public.rls_is_staff()));

--
-- Name: objects photos_avatars_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_avatars_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'avatars/%'::text) AND public.storage_photos_path_is_own('avatars/'::text, name)));

--
-- Name: objects photos_avatars_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_avatars_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'photos'::text) AND (name ~~ 'avatars/%'::text) AND public.storage_photos_path_is_own('avatars/'::text, name))) WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'avatars/%'::text) AND public.storage_photos_path_is_own('avatars/'::text, name)));

--
-- Name: objects photos_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_public_read ON storage.objects FOR SELECT USING (((bucket_id = 'photos'::text) AND ((name ~~ 'artists/%'::text) OR (name ~~ 'users/%'::text) OR (name ~~ 'visitors/%'::text) OR (name ~~ 'avatars/%'::text))));

--
-- Name: objects photos_users_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_users_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'photos'::text) AND (name ~~ 'users/%'::text) AND (public.storage_photos_path_is_own('users/'::text, name) OR public.rls_is_staff())));

--
-- Name: objects photos_users_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_users_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'users/%'::text) AND (public.storage_photos_path_is_own('users/'::text, name) OR public.rls_is_staff())));

--
-- Name: objects photos_users_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_users_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'photos'::text) AND (name ~~ 'users/%'::text) AND (public.storage_photos_path_is_own('users/'::text, name) OR public.rls_is_staff()))) WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'users/%'::text) AND (public.storage_photos_path_is_own('users/'::text, name) OR public.rls_is_staff())));

--
-- Name: objects photos_visitors_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_visitors_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'visitors/%'::text) AND public.storage_photos_path_is_own('visitors/'::text, name)));

--
-- Name: objects photos_visitors_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY photos_visitors_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'photos'::text) AND (name ~~ 'visitors/%'::text) AND public.storage_photos_path_is_own('visitors/'::text, name))) WITH CHECK (((bucket_id = 'photos'::text) AND (name ~~ 'visitors/%'::text) AND public.storage_photos_path_is_own('visitors/'::text, name)));

--
-- Name: objects qrcode_authenticated_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY qrcode_authenticated_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'qrcode'::text) AND (name ~~ 'qrcodes/%'::text)));

--
-- Name: objects qrcode_authenticated_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY qrcode_authenticated_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'qrcode'::text) AND (name ~~ 'qrcodes/%'::text))) WITH CHECK (((bucket_id = 'qrcode'::text) AND (name ~~ 'qrcodes/%'::text)));

--
-- Name: objects qrcode_public_read_prefix; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY qrcode_public_read_prefix ON storage.objects FOR SELECT USING (((bucket_id = 'qrcode'::text) AND (name ~~ 'qrcodes/%'::text)));

--
-- Name: objects sponsors_logo_auth_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY sponsors_logo_auth_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'sponsors'::text));

--
-- Name: objects sponsors_logo_auth_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY sponsors_logo_auth_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'sponsors'::text)) WITH CHECK ((bucket_id = 'sponsors'::text));

--
-- Name: objects sponsors_logo_auth_write; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY sponsors_logo_auth_write ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'sponsors'::text));

--
-- Name: objects sponsors_logo_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY sponsors_logo_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'sponsors'::text));

COMMIT;
