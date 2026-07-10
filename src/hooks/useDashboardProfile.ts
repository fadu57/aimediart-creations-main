import { useCallback, useEffect, useState } from "react";

import { parseGlobalRoleId, resolveMergedAuthRoleId } from "@/lib/authUser";
import {
  sortDashboardTeamMembers,
  resolveTeamScopeFlags,
  shouldIncludeInTeamScope,
  fetchDashboardTeamMemberUserIds,
  fetchSiteTeamMemberUserIds,
  loadProfileGlobalRole,
  isGlobalStaffRole,
} from "@/lib/dashboardTeamScope";
import { fetchOrganisationStandbyState } from "@/lib/organisationStandby";
import { isEtincellePlanCode } from "@/lib/organisation/planLimits";
import { countAgencyArtworks } from "@/lib/organisation/countAgencyArtworks";
import { resolveExpoStorageIds } from "@/lib/expoStorageIds";
import { parseNumericRoleId, pickLowestRoleId } from "@/lib/roleHierarchy";
import { supabase } from "@/lib/supabase";
import { readAvatarFromRpcRow } from "@/lib/userAvatar";
import { filterActiveProfileUserIds } from "@/lib/userSoftDelete";

/** Évite de rappeler Supabase si la table legacy n'existe pas encore (404 / PGRST205). */
const AGENCY_SUBSCRIPTIONS_CACHE_KEY = "aimediart.agency_subscriptions_unavailable.v2";

function readAgencySubscriptionsUnavailable(): boolean {
  try {
    return sessionStorage.getItem(AGENCY_SUBSCRIPTIONS_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

function markAgencySubscriptionsUnavailable(): void {
  AGENCY_SUBSCRIPTIONS_UNAVAILABLE = true;
  try {
    sessionStorage.setItem(AGENCY_SUBSCRIPTIONS_CACHE_KEY, "1");
  } catch {
    /* sessionStorage indisponible */
  }
}

let AGENCY_SUBSCRIPTIONS_UNAVAILABLE = readAgencySubscriptionsUnavailable();

export type DashboardProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  zip_code: string | null;
  city: string | null;
  country_code: string | null;
  timezone: string | null;
  language: string | null;
  birth_year: number | null;
  created_at: string | null;
  last_sign_in_at?: string | null;
};

export type DashboardAgency = {
  id: string;
  name_agency: string | null;
  logo_agency: string | null;
  discount_percent?: number | null;
  discount_amount_eur?: number | null;
  commercial_kind?: string | null;
  commercial_plan_code?: string | null;
  commercial_notes?: string | null;
  sponsor_valid_until?: string | null;
  adresse_agency?: string | null;
  zip_agency?: string | null;
  city_agency?: string | null;
  siret?: string | null;
  legal_rep_firstname?: string | null;
  legal_rep_lastname?: string | null;
  legal_rep_role?: string | null;
};

export type DashboardExpo = {
  id: string;
  expo_name: string | null;
};

export type DashboardSubscription = {
  source: "organisation" | "legacy";
  subscription_id: string | null;
  plan_code: string | null;
  pricing_plan: string | null;
  pricing_label: string | null;
  display_name: string | null;
  billing_cycle: "monthly" | "annual" | null;
  started_at: string | null;
  expires_at: string | null;
  next_renewal_at: string | null;
  is_active: boolean;
  is_trial: boolean;
  days_remaining: number | null;
  max_oeuvres: number | null;
  max_visitors: number | null;
  is_unlimited: boolean | null;
  monthly_price_eur: number | null;
  standby_monthly_price_eur: number | null;
  standby_status: string | null;
  standby_requested_at: string | null;
  standby_cancel_deadline_at: string | null;
  standby_started_at: string | null;
  included_mediation_langs_min: number | null;
  included_mediation_langs_max: number | null;
  included_audio_langs: number | null;
  org_status: string | null;
  status: "active" | "trial" | "standby" | "expired" | "cancelled" | "none" | "unknown";
  list_price_eur: number | null;
  discount_percent: number | null;
  discount_amount_eur: number | null;
  net_price_eur: number | null;
  commercial_kind: string | null;
  sponsor_valid_until: string | null;
};

export type DashboardTeamStats = {
  members_count: number;
  expos_count: number;
  artworks_count: number;
  visitors_this_month: number;
};

export type DashboardTeamMember = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  /** Rôle fusionné (permissions). */
  role_id: number | null;
  role_label: string | null;
  /** Rôle métier agence (agency_users). */
  agency_role_id: number | null;
  agency_role_label: string | null;
  /** Identifiants expo (expos.id) — plusieurs affectations possibles. */
  expo_ids: string[];
};

export type DashboardAgencyExpoOption = {
  id: string;
  value: string;
  label: string;
};

export type DashboardData = {
  profile: DashboardProfile | null;
  agency: DashboardAgency | null;
  expo: DashboardExpo | null;
  subscription: DashboardSubscription | null;
  teamStats: DashboardTeamStats;
  teamMembers: DashboardTeamMember[];
  /** Tous les profils (admins globaux 1–3) ou équipe sinon. */
  profilePickerMembers: DashboardTeamMember[];
  agencyExpos: DashboardAgencyExpoOption[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function addDaysToIso(iso: string, days: number): string | null {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + days);
  return end.toISOString();
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const end = new Date(isoDate);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function resolveSubscriptionEndDate(
  row: {
    started_at?: string | null;
    ends_at?: string | null;
    trial_ends_at?: string | null;
    next_renewal_at?: string | null;
  },
  planCode: string | null,
  trialDurationDays: number | null,
): string | null {
  if (isEtincellePlanCode(planCode)) {
    const fromDb = row.trial_ends_at ?? row.ends_at ?? null;
    if (fromDb) return fromDb;
    if (row.started_at) return addDaysToIso(row.started_at, trialDurationDays ?? 30);
    return null;
  }
  return row.next_renewal_at ?? row.ends_at ?? row.trial_ends_at ?? null;
}

function subscriptionStatus(
  isActive: boolean,
  expiresAt: string | null,
): DashboardSubscription["status"] {
  if (!isActive) return "expired";
  const days = daysUntil(expiresAt);
  if (days !== null && days < 0) return "expired";
  if (expiresAt) return "active";
  return "active";
}

async function fetchPricingForPlan(plan: string | null): Promise<{
  pricing_label: string | null;
  max_oeuvres: number | null;
  max_visitors: number | null;
  is_unlimited: boolean | null;
  monthly_price_eur: number | null;
}> {
  const trimmed = plan?.trim();
  if (!trimmed) {
    return {
      pricing_label: null,
      max_oeuvres: null,
      max_visitors: null,
      is_unlimited: null,
      monthly_price_eur: null,
    };
  }
  const pricingSelectTiers = [
    "pricing_label,pricing_max_oeuvres,pricing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur",
    "pricing_label,pricing_max_oeuvres,princing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur",
  ] as const;

  let row: {
    pricing_label?: string | null;
    pricing_max_oeuvres?: number | null;
    pricing_max_visitors?: number | null;
    princing_max_visitors?: number | null;
    pricing_is_unlimited?: boolean | null;
    pricing_monthly_ttc_eur?: number | null;
  } | null = null;

  for (const select of pricingSelectTiers) {
    const { data, error } = await supabase
      .from("pricing")
      .select(select)
      .eq("pricing_plan", trimmed)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      row = data as typeof row;
      break;
    }
  }

  return {
    pricing_label: row?.pricing_label ?? null,
    max_oeuvres: row?.pricing_max_oeuvres ?? null,
    max_visitors: row?.pricing_max_visitors ?? row?.princing_max_visitors ?? null,
    is_unlimited: row?.pricing_is_unlimited ?? null,
    monthly_price_eur: row?.pricing_monthly_ttc_eur ?? null,
  };
}

function subscriptionPlaceholder(status: DashboardSubscription["status"]): DashboardSubscription {
  return {
    source: "legacy",
    subscription_id: null,
    plan_code: null,
    pricing_plan: null,
    pricing_label: null,
    display_name: null,
    billing_cycle: null,
    started_at: null,
    expires_at: null,
    next_renewal_at: null,
    is_active: false,
    is_trial: false,
    days_remaining: null,
    max_oeuvres: null,
    max_visitors: null,
    is_unlimited: null,
    monthly_price_eur: null,
    standby_monthly_price_eur: null,
    standby_status: null,
    standby_requested_at: null,
    standby_cancel_deadline_at: null,
    standby_started_at: null,
    included_mediation_langs_min: null,
    included_mediation_langs_max: null,
    included_audio_langs: null,
    org_status: null,
    status,
    list_price_eur: null,
    discount_percent: null,
    discount_amount_eur: null,
    net_price_eur: null,
    commercial_kind: null,
    sponsor_valid_until: null,
  };
}

function mapOrganisationSubscriptionStatus(
  orgStatus: string | null | undefined,
  standbyStatus: string | null | undefined,
): DashboardSubscription["status"] {
  const status = (orgStatus ?? "").toLowerCase();
  if (status === "trial") return "trial";
  if (status === "standby" || standbyStatus === "active") return "standby";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "active") return "active";
  return "unknown";
}

type PricingJoinRow = {
  pricing_label?: string | null;
  display_name?: string | null;
  plan_code?: string | null;
  pricing_monthly_ttc_eur?: number | null;
  pricing_max_oeuvres?: number | null;
  pricing_max_visitors?: number | null;
  princing_max_visitors?: number | null;
  pricing_is_unlimited?: boolean | null;
  standby_monthly_price_ttc_eur?: number | null;
  included_mediation_langs_min?: number | null;
  included_mediation_langs_max?: number | null;
  included_audio_langs?: number | null;
  trial_duration_days?: number | null;
};

const PRICING_JOIN_SELECTS = [
  "pricing_label, display_name, plan_code, pricing_monthly_ttc_eur, pricing_max_oeuvres, pricing_max_visitors, pricing_is_unlimited, standby_monthly_price_ttc_eur, included_mediation_langs_min, included_mediation_langs_max, included_audio_langs, trial_duration_days",
  "pricing_label, display_name, plan_code, pricing_monthly_ttc_eur, pricing_max_oeuvres, princing_max_visitors, pricing_is_unlimited, standby_monthly_price_ttc_eur, included_mediation_langs_min, included_mediation_langs_max, included_audio_langs, trial_duration_days",
  "pricing_label, pricing_plan, plan_code, pricing_max_oeuvres, pricing_max_visitors, pricing_is_unlimited, trial_duration_days",
  "pricing_label, pricing_plan, plan_code, pricing_max_oeuvres, princing_max_visitors, pricing_is_unlimited, trial_duration_days",
] as const;

async function fetchPricingJoinByPlanCode(planCode: string | null): Promise<PricingJoinRow | null> {
  const code = planCode?.trim();
  if (!code) return null;
  for (const select of PRICING_JOIN_SELECTS) {
    const { data, error } = await supabase.from("pricing").select(select).eq("plan_code", code).limit(1).maybeSingle();
    if (!error && data) return data as PricingJoinRow;
  }
  return null;
}

async function fetchPricingJoinById(pricingId: string | null): Promise<PricingJoinRow | null> {
  const id = pricingId?.trim();
  if (!id) return null;
  for (const select of PRICING_JOIN_SELECTS) {
    const { data, error } = await supabase.from("pricing").select(select).eq("pricing_id", id).limit(1).maybeSingle();
    if (!error && data) return data as PricingJoinRow;
  }
  return null;
}

function buildDashboardSubscriptionFromOrgRow(
  row: {
    id?: string;
    plan_code?: string | null;
    billing_cycle?: string | null;
    status?: string | null;
    standby_status?: string | null;
    is_trial?: boolean | null;
    started_at?: string | null;
    ends_at?: string | null;
    trial_ends_at?: string | null;
    next_renewal_at?: string | null;
    standby_started_at?: string | null;
    standby_requested_at?: string | null;
    standby_cancel_deadline_at?: string | null;
    list_price_eur?: number | null;
    discount_percent?: number | null;
    discount_amount_eur?: number | null;
    net_price_eur?: number | null;
    commercial_kind?: string | null;
    sponsor_valid_until?: string | null;
  },
  pricing: PricingJoinRow | null,
): DashboardSubscription {
  const planCode = row.plan_code ?? pricing?.plan_code ?? null;
  const isEtincelle = isEtincellePlanCode(planCode);
  const renewalOrEnd = resolveSubscriptionEndDate(row, planCode, pricing?.trial_duration_days ?? null);
  const mappedStatus = mapOrganisationSubscriptionStatus(row.status, row.standby_status);
  const isActive = mappedStatus === "active" || mappedStatus === "trial" || mappedStatus === "standby";

  return {
    source: "organisation",
    subscription_id: row.id ?? null,
    plan_code: planCode,
    pricing_plan: pricing?.pricing_label ?? row.plan_code ?? null,
    pricing_label: pricing?.pricing_label ?? null,
    display_name: pricing?.display_name ?? pricing?.pricing_label ?? row.plan_code ?? null,
    billing_cycle:
      row.billing_cycle === "annual" || row.billing_cycle === "monthly" ? row.billing_cycle : null,
    started_at: row.started_at ?? null,
    expires_at: renewalOrEnd,
    next_renewal_at: isEtincelle ? null : row.next_renewal_at ?? null,
    is_active: isActive,
    is_trial: row.is_trial === true || mappedStatus === "trial" || isEtincelle,
    days_remaining: daysUntil(renewalOrEnd),
    max_oeuvres: pricing?.pricing_max_oeuvres ?? null,
    max_visitors: pricing?.pricing_max_visitors ?? pricing?.princing_max_visitors ?? null,
    is_unlimited: pricing?.pricing_is_unlimited ?? null,
    monthly_price_eur: pricing?.pricing_monthly_ttc_eur ?? null,
    standby_monthly_price_eur: pricing?.standby_monthly_price_ttc_eur ?? null,
    standby_status: row.standby_status ?? null,
    standby_requested_at: row.standby_requested_at ?? null,
    standby_cancel_deadline_at: row.standby_cancel_deadline_at ?? null,
    standby_started_at: row.standby_started_at ?? null,
    included_mediation_langs_min: pricing?.included_mediation_langs_min ?? null,
    included_mediation_langs_max: pricing?.included_mediation_langs_max ?? null,
    included_audio_langs: pricing?.included_audio_langs ?? null,
    org_status: row.status ?? null,
    status: mappedStatus === "unknown" ? "active" : mappedStatus,
    list_price_eur: row.list_price_eur ?? null,
    discount_percent: row.discount_percent ?? null,
    discount_amount_eur: row.discount_amount_eur ?? null,
    net_price_eur: row.net_price_eur ?? null,
    commercial_kind: row.commercial_kind ?? null,
    sponsor_valid_until: row.sponsor_valid_until ?? null,
  };
}

async function buildSubscriptionFromStandbyState(agencyId: string): Promise<DashboardSubscription | null> {
  const state = await fetchOrganisationStandbyState();
  if (!state.has_subscription || !state.plan_code) return null;
  if (state.agency_id && state.agency_id !== agencyId) return null;

  const pricing = await fetchPricingJoinByPlanCode(state.plan_code);
  return buildDashboardSubscriptionFromOrgRow(
    {
      plan_code: state.plan_code,
      billing_cycle: state.billing_cycle,
      status: state.status,
      standby_status: state.standby_status,
      is_trial: state.status === "trial",
      next_renewal_at: state.next_renewal_at,
      standby_requested_at: state.standby_requested_at,
      standby_cancel_deadline_at: state.standby_cancel_deadline_at,
      standby_started_at: state.standby_effective_at,
    },
    pricing,
  );
}

async function resolveProfileLastSignInAt(
  profileUserId: string | null,
  isSelf: boolean,
): Promise<string | null> {
  const uid = profileUserId?.trim();
  if (!uid) return null;
  if (isSelf) {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id === uid) return data.user.last_sign_in_at ?? null;
  }
  const { data: rpcData, error } = await supabase.rpc("get_all_users_with_roles");
  if (error || !rpcData) return null;
  const row = (rpcData as Array<{ id?: string | null; last_sign_in_at?: string | null }>).find(
    (entry) => entry.id === uid,
  );
  return typeof row?.last_sign_in_at === "string" ? row.last_sign_in_at : null;
}

async function resolveAgencyIdFromAgencyUsers(profileUserId: string): Promise<string | null> {
  const uid = profileUserId.trim();
  if (!uid) return null;
  const { data } = await supabase
    .from("agency_users")
    .select("agency_id, role_id")
    .eq("user_id", uid)
    .order("role_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  const agencyId = (data as { agency_id?: string | null } | null)?.agency_id?.trim();
  return agencyId || null;
}

async function resolveExpoIdFromUser(profileUserId: string): Promise<string | null> {
  const uid = profileUserId.trim();
  if (!uid) return null;
  const { data } = await supabase
    .from("expo_user_role")
    .select("expo_id")
    .eq("user_id", uid)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const expoId = (data as { expo_id?: string | null } | null)?.expo_id?.trim();
  return expoId || null;
}

async function resolveAgencyIdFromStandbyRpc(): Promise<string | null> {
  const { data } = await supabase.rpc("get_my_organisation_standby_state");
  if (data && typeof data === "object" && typeof (data as { agency_id?: unknown }).agency_id === "string") {
    const resolved = (data as { agency_id: string }).agency_id.trim();
    return resolved || null;
  }
  return null;
}

async function resolveDashboardAgencyId(
  profileUserId: string | null,
  viewerUserId: string | null,
  viewerAgencyId: string | null,
): Promise<string | null> {
  const uid = profileUserId?.trim() || null;
  const vid = viewerUserId?.trim() || null;
  const isSelf = Boolean(uid && vid && uid === vid);

  if (uid) {
    const fromProfile = await resolveAgencyIdFromAgencyUsers(uid);
    if (fromProfile) return fromProfile;
  }

  if (!isSelf) return null;

  if (viewerAgencyId?.trim()) return viewerAgencyId.trim();
  return resolveAgencyIdFromStandbyRpc();
}

async function fetchOrganisationSubscription(
  agencyId: string,
): Promise<{ kind: "data"; subscription: DashboardSubscription } | { kind: "none" } | { kind: "missing_table" }> {
  const { data, error, status } = await supabase
    .from("organisation_subscriptions")
    .select(
      `id, plan_code, billing_cycle, status, standby_status, is_trial, started_at, ends_at, trial_ends_at,
       next_renewal_at, standby_started_at, standby_requested_at, standby_cancel_deadline_at, pricing_id,
       list_price_eur, discount_percent, discount_amount_eur, net_price_eur, commercial_kind, sponsor_valid_until`,
    )
    .eq("organisation_id", agencyId)
    .in("status", ["trial", "active", "standby"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (status === 404 || isAgencySubscriptionsTableMissing(error)) {
    return { kind: "missing_table" };
  }

  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[dashboard] organisation_subscriptions:", error.message);
    }
    return { kind: "none" };
  }

  if (!data) return { kind: "none" };

  const row = data as {
    id?: string;
    plan_code?: string | null;
    billing_cycle?: string | null;
    status?: string | null;
    standby_status?: string | null;
    is_trial?: boolean | null;
    started_at?: string | null;
    ends_at?: string | null;
    trial_ends_at?: string | null;
    next_renewal_at?: string | null;
    standby_started_at?: string | null;
    standby_requested_at?: string | null;
    standby_cancel_deadline_at?: string | null;
    pricing_id?: string | number | null;
  };

  const pricing =
    (await fetchPricingJoinById(row.pricing_id != null ? String(row.pricing_id) : null)) ??
    (await fetchPricingJoinByPlanCode(row.plan_code ?? null));

  return {
    kind: "data",
    subscription: buildDashboardSubscriptionFromOrgRow(row, pricing),
  };
}

async function fetchLegacyAgencySubscription(agencyId: string): Promise<DashboardSubscription | null> {
  if (AGENCY_SUBSCRIPTIONS_UNAVAILABLE) return subscriptionPlaceholder("unknown");

  const { data, error, status } = await supabase
    .from("agency_subscriptions")
    .select("pricing_plan,billing_cycle,started_at,expires_at,is_active")
    .eq("agency_id", agencyId.trim())
    .eq("is_active", true)
    .order("expires_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (status === 404 || isAgencySubscriptionsTableMissing(error)) {
    markAgencySubscriptionsUnavailable();
    return subscriptionPlaceholder("unknown");
  }

  if (error) {
    if (/permission|forbidden/i.test(error.message ?? "")) {
      return subscriptionPlaceholder("unknown");
    }
    return null;
  }

  if (!data) {
    return subscriptionPlaceholder("none");
  }

  const row = data as {
    pricing_plan?: string | null;
    billing_cycle?: string | null;
    started_at?: string | null;
    expires_at?: string | null;
    is_active?: boolean | null;
  };

  const pricingPlan = row.pricing_plan ?? null;
  const pricingDetails = await fetchPricingForPlan(pricingPlan);
  const isEtincelle = isEtincellePlanCode(pricingPlan);
  let expiresAt = row.expires_at ?? null;
  if (isEtincelle && !expiresAt && row.started_at) {
    expiresAt = addDaysToIso(row.started_at, 30);
  }
  const isActive = row.is_active !== false;
  const legacyStatus = subscriptionStatus(isActive, expiresAt);

  return {
    source: "legacy",
    subscription_id: null,
    plan_code: isEtincelle ? "ETINCELLE" : null,
    pricing_plan: pricingPlan,
    pricing_label: pricingDetails.pricing_label,
    display_name: pricingDetails.pricing_label,
    billing_cycle:
      row.billing_cycle === "annual" || row.billing_cycle === "monthly" ? row.billing_cycle : null,
    started_at: row.started_at ?? null,
    expires_at: expiresAt,
    next_renewal_at: null,
    is_active: isActive,
    is_trial: isEtincelle,
    days_remaining: daysUntil(expiresAt),
    max_oeuvres: pricingDetails.max_oeuvres,
    max_visitors: pricingDetails.max_visitors,
    is_unlimited: pricingDetails.is_unlimited,
    monthly_price_eur: pricingDetails.monthly_price_eur,
    standby_monthly_price_eur: null,
    standby_status: null,
    standby_requested_at: null,
    standby_cancel_deadline_at: null,
    standby_started_at: null,
    included_mediation_langs_min: null,
    included_mediation_langs_max: null,
    included_audio_langs: null,
    org_status: null,
    status:
      isEtincelle && legacyStatus !== "expired"
        ? "trial"
        : legacyStatus === "expired"
          ? "expired"
          : legacyStatus === "none"
            ? "none"
            : "active",
    list_price_eur: pricingDetails.monthly_price_eur,
    discount_percent: 0,
    discount_amount_eur: 0,
    net_price_eur: pricingDetails.monthly_price_eur,
    commercial_kind: "standard",
    sponsor_valid_until: null,
  };
}

function isAgencySubscriptionsTableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toUpperCase();
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("could not find") ||
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("schema cache")
  );
}

async function fetchSubscription(
  resolvedAgencyId: string | null,
  allowStandbyFallback = false,
): Promise<DashboardSubscription | null> {
  if (!resolvedAgencyId) return null;

  const orgResult = await fetchOrganisationSubscription(resolvedAgencyId);
  if (orgResult.kind === "data") return orgResult.subscription;

  if (allowStandbyFallback) {
    const standbySub = await buildSubscriptionFromStandbyState(resolvedAgencyId);
    if (standbySub) return standbySub;
  }

  if (orgResult.kind === "missing_table") {
    const legacy = await fetchLegacyAgencySubscription(resolvedAgencyId);
    return legacy ?? subscriptionPlaceholder("unknown");
  }

  return subscriptionPlaceholder("none");
}

async function fetchSiteTeamMembers(): Promise<{
  members: DashboardTeamMember[];
  agencyExpos: DashboardAgencyExpoOption[];
}> {
  const [{ data: rpcData, error: rpcErr }, { data: roleRows }] = await Promise.all([
    supabase.rpc("get_all_users_with_roles"),
    supabase.from("roles_user").select("role_id, role_name_clair, label, role_name"),
  ]);

  const roleLabelById = new Map<number, string>();
  for (const row of (roleRows as Array<{
    role_id?: number | null;
    role_name_clair?: string | null;
    label?: string | null;
    role_name?: string | null;
  }> | null) ?? []) {
    if (typeof row.role_id !== "number") continue;
    const raw =
      row.role_name_clair?.trim() || row.label?.trim() || row.role_name?.trim() || `Rôle ${row.role_id}`;
    roleLabelById.set(row.role_id, raw);
  }

  const teamScopeFlags = resolveTeamScopeFlags(null, null, null, new Map());
  const emptyAgencyRoles = new Map<string, number>();

  type RpcUserRow = {
    id?: string | null;
    role_id?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    user_photo_url?: string | null;
    phone?: string | null;
  };

  if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
    let members: DashboardTeamMember[] = (rpcData as RpcUserRow[])
      .filter((r) => {
        const uid = typeof r.id === "string" ? r.id.trim() : "";
        if (!uid) return false;
        return shouldIncludeInTeamScope(
          uid,
          teamScopeFlags,
          emptyAgencyRoles,
          parseNumericRoleId(r.role_id),
        );
      })
      .map((r) => {
        const uid = String(r.id).trim();
        const mergedRoleId = parseNumericRoleId(r.role_id);
        return {
          user_id: uid,
          first_name: r.first_name ?? null,
          last_name: r.last_name ?? null,
          username: r.username ?? null,
          avatar_url: readAvatarFromRpcRow(r) ?? r.avatar_url ?? null,
          phone: r.phone ?? null,
          role_id: mergedRoleId,
          role_label: mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : null,
          agency_role_id: null,
          agency_role_label: null,
          expo_ids: [] as string[],
        };
      });

    members = sortDashboardTeamMembers(members);
    const activeIds = await filterActiveProfileUserIds(members.map((m) => m.user_id));
    members = members.filter((m) => activeIds.has(m.user_id));
    return { members, agencyExpos: [] };
  }

  const memberIdSet = await fetchSiteTeamMemberUserIds();
  const userIds = [...memberIdSet];
  if (userIds.length === 0) return { members: [], agencyExpos: [] };

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, username, avatar_url, phone, role_id")
    .in("id", userIds);

  let members: DashboardTeamMember[] = (
    (profileRows as Array<{
      id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      phone?: string | null;
      role_id?: unknown;
    }> | null) ?? []
  )
    .filter((row) => typeof row.id === "string" && row.id.trim())
    .map((row) => {
      const uid = String(row.id).trim();
      const mergedRoleId = parseGlobalRoleId(row.role_id);
      return {
        user_id: uid,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        username: row.username ?? null,
        avatar_url: row.avatar_url ?? null,
        phone: row.phone ?? null,
        role_id: mergedRoleId,
        role_label: mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : null,
        agency_role_id: null,
        agency_role_label: null,
        expo_ids: [] as string[],
      };
    });

  members = sortDashboardTeamMembers(members);
  const activeIds = await filterActiveProfileUserIds(members.map((m) => m.user_id));
  members = members.filter((m) => activeIds.has(m.user_id));
  return { members, agencyExpos: [] };
}

async function fetchTeamMembers(
  agencyId: string | null,
  profileUserId: string | null,
): Promise<{
  members: DashboardTeamMember[];
  agencyExpos: DashboardAgencyExpoOption[];
}> {
  if (!agencyId?.trim()) return fetchSiteTeamMembers();
  const aid = agencyId.trim();
  const pid = profileUserId?.trim() || null;

  const [{ data: rpcData, error: rpcErr }, { data: roleRows }, { data: expoRows }, { data: agencyRoleRows }, profileGlobalRole] =
    await Promise.all([
      supabase.rpc("get_all_users_with_roles"),
      supabase.from("roles_user").select("role_id, role_name_clair, label, role_name"),
      supabase.from("expos").select("id, expo_id, expo_name").eq("agency_id", aid).is("deleted_at", null),
      supabase.from("agency_users").select("user_id, role_id").eq("agency_id", aid),
      loadProfileGlobalRole(pid),
    ]);

  const agencyRoleByUser = new Map<string, number>();
  for (const row of (agencyRoleRows as Array<{ user_id?: string | null; role_id?: unknown }> | null) ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const rid = parseNumericRoleId(row.role_id);
    if (uid && rid != null) agencyRoleByUser.set(uid, rid);
  }

  let effectiveProfileGlobal = profileGlobalRole;
  if (pid && !isGlobalStaffRole(effectiveProfileGlobal) && Array.isArray(rpcData)) {
    const profileRpcRow = (rpcData as Array<{ id?: string | null; role_id?: number | null }>).find(
      (row) => row.id?.trim() === pid,
    );
    const merged = parseNumericRoleId(profileRpcRow?.role_id);
    if (isGlobalStaffRole(merged)) effectiveProfileGlobal = merged;
  }

  const teamScopeFlags = resolveTeamScopeFlags(aid, pid, effectiveProfileGlobal, agencyRoleByUser);

  const agencyExpos: DashboardAgencyExpoOption[] = (
    (expoRows as Array<{ id?: string | null; expo_id?: string | null; expo_name?: string | null }> | null) ?? []
  )
    .filter((row) => typeof row.id === "string" && row.id.trim())
    .map((row) => {
      const id = String(row.id).trim();
      return {
        id,
        value: id,
        label: row.expo_name?.trim() || row.expo_id?.trim() || id,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const roleLabelById = new Map<number, string>();
  for (const row of (roleRows as Array<{
    role_id?: number | null;
    role_name_clair?: string | null;
    label?: string | null;
    role_name?: string | null;
  }> | null) ?? []) {
    if (typeof row.role_id !== "number") continue;
    const raw =
      row.role_name_clair?.trim() || row.label?.trim() || row.role_name?.trim() || `Rôle ${row.role_id}`;
    const label = row.role_id === 4 && raw.toLowerCase() === "admin agence" ? "Admin organisation" : raw;
    roleLabelById.set(row.role_id, label);
  }

  const buildMember = (
    uid: string,
    base: Omit<DashboardTeamMember, "user_id" | "agency_role_id" | "agency_role_label"> & {
      agency_role_id?: number | null;
    },
  ): DashboardTeamMember => {
    const agencyRoleId = base.agency_role_id ?? agencyRoleByUser.get(uid) ?? null;
    return {
      user_id: uid,
      first_name: base.first_name ?? null,
      last_name: base.last_name ?? null,
      username: base.username ?? null,
      avatar_url: base.avatar_url ?? null,
      phone: base.phone ?? null,
      role_id: base.role_id ?? null,
      role_label: base.role_label ?? null,
      agency_role_id: agencyRoleId,
      agency_role_label:
        agencyRoleId != null ? roleLabelById.get(agencyRoleId) ?? `Rôle ${agencyRoleId}` : null,
      expo_ids: base.expo_ids ?? [],
    };
  };

  const enrichTeamMembersMergedRoles = async (members: DashboardTeamMember[]): Promise<DashboardTeamMember[]> => {
    if (!members.length) return members;
    return members.map((member) => {
      const mergedRoleId = pickLowestRoleId(member.role_id, member.agency_role_id);
      return {
        ...member,
        role_id: mergedRoleId,
        role_label:
          mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : member.role_label,
      };
    });
  };

  const attachExpoAssignments = async (members: DashboardTeamMember[]): Promise<DashboardTeamMember[]> => {
    const memberIds = members.map((m) => m.user_id);
    if (memberIds.length === 0) return members;

    const { data: assignRows } = await supabase
      .from("expo_user_role")
      .select("user_id, expo_id")
      .in("user_id", memberIds);

    const rawByUser = new Map<string, string[]>();
    for (const row of (assignRows as Array<{ user_id?: string | null; expo_id?: string | null }> | null) ?? []) {
      const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
      const eid = typeof row.expo_id === "string" ? row.expo_id.trim() : "";
      if (!uid || !eid) continue;
      const list = rawByUser.get(uid) ?? [];
      if (!list.includes(eid)) list.push(eid);
      rawByUser.set(uid, list);
    }

    const updated = await Promise.all(
      members.map(async (member) => {
        const raws = rawByUser.get(member.user_id) ?? [];
        if (!raws.length) return { ...member, expo_ids: [] as string[] };
        const storageIds = await resolveExpoStorageIds(raws);
        const ids = storageIds.filter((id) => agencyExpos.some((o) => o.id === id));
        return { ...member, expo_ids: [...new Set(ids)] };
      }),
    );

    return updated;
  };

  type RpcUserRow = {
    id?: string | null;
    role_id?: number | null;
    agency_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    user_photo_url?: string | null;
    photo_url?: string | null;
    picture?: string | null;
    phone?: string | null;
  };

  const includeRpcUser = (r: RpcUserRow): boolean => {
    const uid = typeof r.id === "string" ? r.id.trim() : "";
    if (!uid) return false;
    return shouldIncludeInTeamScope(
      uid,
      teamScopeFlags,
      agencyRoleByUser,
      parseNumericRoleId(r.role_id),
    );
  };

  if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
    let members: DashboardTeamMember[] = (rpcData as RpcUserRow[])
      .filter(includeRpcUser)
      .map((r) => {
        const uid = String(r.id).trim();
        const mergedRoleId = parseNumericRoleId(r.role_id);
        return buildMember(uid, {
          first_name: r.first_name ?? null,
          last_name: r.last_name ?? null,
          username: r.username ?? null,
          avatar_url: readAvatarFromRpcRow(r) ?? r.avatar_url ?? null,
          phone: r.phone ?? null,
          role_id: mergedRoleId,
          role_label: mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : null,
          expo_ids: [],
        });
      });

    const uniqueById = new Map<string, DashboardTeamMember>();
    for (const member of members) uniqueById.set(member.user_id, member);
    members = [...uniqueById.values()];

    members = await attachExpoAssignments(members);
    members = await enrichTeamMembersMergedRoles(members);
    members = sortDashboardTeamMembers(members);

    const activeIds = await filterActiveProfileUserIds(members.map((m) => m.user_id));
    members = members.filter((m) => activeIds.has(m.user_id));

    return { members, agencyExpos };
  }

  if (import.meta.env.DEV && rpcErr) {
    console.warn("[dashboard] RPC get_all_users_with_roles indisponible, repli agency_users :", rpcErr.message);
  }

  // Repli : agency_users de l'organisation uniquement.
  const memberIdSet = await fetchDashboardTeamMemberUserIds(aid, pid);
  const userIds = [...memberIdSet];

  if (userIds.length === 0) return { members: [], agencyExpos };

  const [{ data: profileRows }, { data: expoAssignRows }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, username, avatar_url, phone, role_id").in("id", userIds),
    supabase
      .from("expo_user_role")
      .select("user_id, expo_id")
      .in("user_id", userIds)
      .order("assigned_at", { ascending: false }),
  ]);

  const rawExpoByUser = new Map<string, string[]>();
  for (const row of (expoAssignRows as Array<{ user_id?: string | null; expo_id?: string | null }> | null) ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const eid = typeof row.expo_id === "string" ? row.expo_id.trim() : "";
    if (!uid || !eid) continue;
    const list = rawExpoByUser.get(uid) ?? [];
    if (!list.includes(eid)) list.push(eid);
    rawExpoByUser.set(uid, list);
  }

  const allRawExpo = [...new Set([...rawExpoByUser.values()].flat())];
  const resolvedExpo = allRawExpo.length > 0 ? await resolveExpoStorageIds(allRawExpo) : [];
  const resolvedSet = new Set(resolvedExpo);
  const expoPkByRaw = new Map<string, string>();
  for (const raw of allRawExpo) {
    if (resolvedSet.has(raw)) expoPkByRaw.set(raw, raw);
  }
  if (resolvedExpo.length > 0) {
    const { data: expoLookup } = await supabase.from("expos").select("id, expo_id").in("id", resolvedExpo);
    for (const row of (expoLookup as Array<{ id?: string | null; expo_id?: string | null }> | null) ?? []) {
      const pk = row.id?.trim();
      if (!pk) continue;
      expoPkByRaw.set(pk, pk);
      const alt = row.expo_id?.trim();
      if (alt) expoPkByRaw.set(alt, pk);
    }
  }

  const profileById = new Map<
    string,
    {
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      phone?: string | null;
      role_id?: number | null;
    }
  >();
  for (const row of (profileRows as Array<{ id?: string | null; role_id?: number | null }> | null) ?? []) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id) profileById.set(id, row);
  }

  const roleByUser = new Map<string, number | null>();
  for (const [uid, roleId] of agencyRoleByUser) {
    roleByUser.set(uid, roleId);
  }

  let members: DashboardTeamMember[] = userIds.map((uid) => {
    const p = profileById.get(uid);
    const agencyRoleId = roleByUser.get(uid) ?? null;
    const globalRoleId = parseNumericRoleId(p?.role_id);
    const mergedRoleId =
      globalRoleId != null && agencyRoleId != null
        ? Math.min(globalRoleId, agencyRoleId)
        : globalRoleId ?? agencyRoleId;
    const expoIds = (rawExpoByUser.get(uid) ?? [])
      .map((raw) => expoPkByRaw.get(raw) ?? raw)
      .filter((id) => agencyExpos.some((o) => o.id === id));

    return buildMember(uid, {
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      phone: p?.phone ?? null,
      role_id: mergedRoleId,
      role_label: mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : null,
      agency_role_id: agencyRoleId,
      expo_ids: [...new Set(expoIds)],
    });
  });

  members = await enrichTeamMembersMergedRoles(members);
  members = sortDashboardTeamMembers(members);

  const activeIds = await filterActiveProfileUserIds(members.map((m) => m.user_id));
  members = members.filter((m) => activeIds.has(m.user_id));

  return { members, agencyExpos };
}

async function fetchAllUsersForProfilePicker(): Promise<DashboardTeamMember[]> {
  const [{ data: rpcData, error: rpcErr }, { data: roleRows }, { data: agencyRoleRows }] = await Promise.all([
    supabase.rpc("get_all_users_with_roles"),
    supabase.from("roles_user").select("role_id, role_name_clair, label, role_name"),
    supabase.from("agency_users").select("user_id, agency_id, role_id"),
  ]);

  const roleLabelById = new Map<number, string>();
  for (const row of (roleRows as Array<{
    role_id?: number | null;
    role_name_clair?: string | null;
    label?: string | null;
    role_name?: string | null;
  }> | null) ?? []) {
    if (typeof row.role_id !== "number") continue;
    const raw =
      row.role_name_clair?.trim() || row.label?.trim() || row.role_name?.trim() || `Rôle ${row.role_id}`;
    const label = row.role_id === 4 && raw.toLowerCase() === "admin agence" ? "Admin organisation" : raw;
    roleLabelById.set(row.role_id, label);
  }

  const agencyRoleByUser = new Map<string, { agency_id: string | null; role_id: number | null }>();
  for (const row of (agencyRoleRows as Array<{
    user_id?: string | null;
    agency_id?: string | null;
    role_id?: unknown;
  }> | null) ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || agencyRoleByUser.has(uid)) continue;
    agencyRoleByUser.set(uid, {
      agency_id: row.agency_id?.trim() || null,
      role_id: parseNumericRoleId(row.role_id),
    });
  }

  if (rpcErr || !Array.isArray(rpcData) || rpcData.length === 0) return [];

  type RpcUserRow = {
    id?: string | null;
    role_id?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    user_photo_url?: string | null;
    phone?: string | null;
  };

  let members: DashboardTeamMember[] = (rpcData as RpcUserRow[])
    .filter((r) => typeof r.id === "string" && r.id.trim())
    .map((r) => {
      const uid = String(r.id).trim();
      const agencyRec = agencyRoleByUser.get(uid);
      const agencyRoleId = agencyRec?.role_id ?? null;
      const mergedRoleId = parseNumericRoleId(r.role_id);
      return {
        user_id: uid,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        username: r.username ?? null,
        avatar_url: readAvatarFromRpcRow(r) ?? r.avatar_url ?? null,
        phone: r.phone ?? null,
        role_id: mergedRoleId,
        role_label: mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : null,
        agency_role_id: agencyRoleId,
        agency_role_label:
          agencyRoleId != null ? roleLabelById.get(agencyRoleId) ?? `Rôle ${agencyRoleId}` : null,
        expo_ids: [] as string[],
      };
    });

  const { data: profileRows } = await supabase.from("profiles").select("id, role_id").in("id", members.map((m) => m.user_id));
  const globalByUser = new Map<string, number | null>();
  for (const row of (profileRows as Array<{ id?: string | null; role_id?: unknown }> | null) ?? []) {
    const uid = typeof row.id === "string" ? row.id.trim() : "";
    if (uid) globalByUser.set(uid, parseGlobalRoleId(row.role_id));
  }
  members = members.map((member) => {
    const globalRoleId = globalByUser.get(member.user_id) ?? null;
    const mergedRoleId = pickLowestRoleId(
      member.role_id,
      resolveMergedAuthRoleId(null, globalRoleId, member.agency_role_id),
    );
    return {
      ...member,
      role_id: mergedRoleId,
      role_label:
        mergedRoleId != null ? roleLabelById.get(mergedRoleId) ?? `Rôle ${mergedRoleId}` : member.role_label,
    };
  });

  members = sortDashboardTeamMembers(members);
  const activeIds = await filterActiveProfileUserIds(members.map((m) => m.user_id));
  return members.filter((m) => activeIds.has(m.user_id));
}

async function fetchTeamStats(
  agencyId: string | null,
  membersCount: number,
): Promise<DashboardTeamStats> {
  const base: DashboardTeamStats = {
    members_count: membersCount,
    expos_count: 0,
    artworks_count: 0,
    visitors_this_month: 0,
  };
  if (!agencyId?.trim()) return base;

  const aid = agencyId.trim();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [exposRes, artworksCount, statsRes] = await Promise.all([
    supabase.from("expos").select("id", { count: "exact", head: true }).eq("agency_id", aid).is("deleted_at", null),
    countAgencyArtworks(aid),
    supabase.from("daily_stats").select("visits_count").eq("agency_id", aid).gte("day", monthStart),
  ]);

  let visitorsThisMonth = 0;
  for (const row of (statsRes.data as Array<{ visits_count?: number | null }> | null) ?? []) {
    visitorsThisMonth += Number(row.visits_count) || 0;
  }

  return {
    members_count: membersCount,
    expos_count: exposRes.count ?? 0,
    artworks_count: artworksCount,
    visitors_this_month: visitorsThisMonth,
  };
}

export function useDashboardProfile(
  userId: string | null | undefined,
  agencyId: string | null | undefined,
  expoId: string | null | undefined,
  viewerRoleId?: number | null,
  viewerUserId?: string | null,
): DashboardData {
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [agency, setAgency] = useState<DashboardAgency | null>(null);
  const [expo, setExpo] = useState<DashboardExpo | null>(null);
  const [subscription, setSubscription] = useState<DashboardSubscription | null>(null);
  const [teamStats, setTeamStats] = useState<DashboardTeamStats>({
    members_count: 0,
    expos_count: 0,
    artworks_count: 0,
    visitors_this_month: 0,
  });
  const [teamMembers, setTeamMembers] = useState<DashboardTeamMember[]>([]);
  const [profilePickerMembers, setProfilePickerMembers] = useState<DashboardTeamMember[]>([]);
  const [agencyExpos, setAgencyExpos] = useState<DashboardAgencyExpoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!userId?.trim() && !agencyId?.trim()) {
      setProfile(null);
      setAgency(null);
      setExpo(null);
      setSubscription(null);
      setTeamStats({ members_count: 0, expos_count: 0, artworks_count: 0, visitors_this_month: 0 });
      setTeamMembers([]);
      setProfilePickerMembers([]);
      setAgencyExpos([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const viewerRole = parseNumericRoleId(viewerRoleId);
        const uid = userId?.trim() || null;
        const vid = viewerUserId?.trim() || null;
        const isSelf = Boolean(uid && vid && uid === vid);

        const resolvedAgencyId = await resolveDashboardAgencyId(uid, vid, agencyId ?? null);
        const profileExpoId = uid ? await resolveExpoIdFromUser(uid) : null;
        const effectiveExpoId = profileExpoId ?? (isSelf ? expoId?.trim() || null : null);

        const teamData = resolvedAgencyId
          ? await fetchTeamMembers(resolvedAgencyId, uid)
          : await fetchSiteTeamMembers();
        const stats = await fetchTeamStats(resolvedAgencyId, teamData.members.length);
        const pickerMembers =
          viewerRole != null && viewerRole >= 1 && viewerRole <= 3
            ? await fetchAllUsersForProfilePicker()
            : teamData.members;

        const [profileRes, agencyRes, expoRes, sub] = await Promise.all([
          uid
            ? supabase
                .from("profiles")
                .select(
                  "id,first_name,last_name,username,avatar_url,phone,zip_code,city,country_code,timezone,language,birth_year,created_at",
                )
                .eq("id", uid)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          resolvedAgencyId
            ? supabase
                .from("agencies")
                .select(
                  "id,name_agency,logo_agency,discount_percent,discount_amount_eur,commercial_kind,commercial_plan_code,commercial_notes,sponsor_valid_until,adresse_agency,zip_agency,city_agency,siret,legal_rep_firstname,legal_rep_lastname,legal_rep_role",
                )
                .eq("id", resolvedAgencyId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          effectiveExpoId
            ? supabase
                .from("expos")
                .select("id,expo_name")
                .or(`id.eq.${effectiveExpoId},expo_id.eq.${effectiveExpoId}`)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          fetchSubscription(resolvedAgencyId, isSelf),
        ]);

        if (cancelled) return;

        if (profileRes.error) {
          setError(profileRes.error.message);
          setProfile(null);
        } else if (profileRes.data) {
          const lastSignInAt = await resolveProfileLastSignInAt(uid, isSelf);
          if (cancelled) return;
          setProfile({
            ...(profileRes.data as DashboardProfile),
            last_sign_in_at: lastSignInAt,
          });
        } else if (uid) {
          // Compte auth sans ligne profiles (trigger manquant / migration legacy)
          const { data: authSession } = await supabase.auth.getUser();
          const authUser = authSession.user;
          if (authUser?.id === uid) {
            const meta = (authUser.user_metadata as Record<string, unknown> | undefined) ?? {};
            const readMeta = (...keys: string[]): string | null => {
              for (const key of keys) {
                const value = meta[key];
                if (typeof value === "string" && value.trim()) return value.trim();
              }
              return null;
            };
            setProfile({
              id: uid,
              first_name: readMeta("first_name", "prenom", "user_prenom"),
              last_name: readMeta("last_name", "nom"),
              username: readMeta("username"),
              avatar_url: readMeta("avatar_url", "user_photo_url", "picture", "photo_url"),
              phone: readMeta("phone"),
              zip_code: null,
              city: null,
              country_code: "FR",
              timezone: readMeta("timezone"),
              language: readMeta("language") ?? "fr",
              birth_year: null,
              created_at: authUser.created_at ?? null,
              last_sign_in_at: authUser.last_sign_in_at ?? null,
            });
          } else {
            setProfile(null);
          }
        }

        if (agencyRes.data) {
          setAgency(agencyRes.data as DashboardAgency);
        } else {
          setAgency(null);
        }

        if (expoRes.data) {
          const e = expoRes.data as DashboardExpo;
          setExpo({ id: e.id, expo_name: e.expo_name ?? null });
        } else {
          setExpo(null);
        }

        setSubscription(sub);
        setTeamStats(stats);
        setTeamMembers(teamData.members);
        setProfilePickerMembers(pickerMembers);
        setAgencyExpos(teamData.agencyExpos);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur de chargement");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, agencyId, expoId, viewerRoleId, viewerUserId, tick]);

  return {
    profile,
    agency,
    expo,
    subscription,
    teamStats,
    teamMembers,
    profilePickerMembers,
    agencyExpos,
    loading,
    error,
    refresh,
    refreshKey: tick,
  };
}
