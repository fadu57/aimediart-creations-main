import { supabase } from "@/lib/supabase";

export type OrganisationStandbyState = {
  authenticated: boolean;
  role_id: number | null;
  agency_id: string | null;
  has_subscription: boolean;
  plan_code: string | null;
  billing_cycle: string | null;
  status: string | null;
  standby_status: string | null;
  standby_requested_at: string | null;
  standby_cancel_deadline_at: string | null;
  standby_effective_at: string | null;
  next_renewal_at: string | null;
  is_nav_restricted: boolean;
  can_request_standby: boolean;
  can_cancel_standby_request: boolean;
};

const EMPTY_STATE: OrganisationStandbyState = {
  authenticated: false,
  role_id: null,
  agency_id: null,
  has_subscription: false,
  plan_code: null,
  billing_cycle: null,
  status: null,
  standby_status: null,
  standby_requested_at: null,
  standby_cancel_deadline_at: null,
  standby_effective_at: null,
  next_renewal_at: null,
  is_nav_restricted: false,
  can_request_standby: false,
  can_cancel_standby_request: false,
};

function normalizeStandbyState(raw: unknown): OrganisationStandbyState {
  if (!raw || typeof raw !== "object") return EMPTY_STATE;
  const o = raw as Record<string, unknown>;
  return {
    authenticated: o.authenticated === true,
    role_id: typeof o.role_id === "number" ? o.role_id : null,
    agency_id: typeof o.agency_id === "string" ? o.agency_id : null,
    has_subscription: o.has_subscription === true,
    plan_code: typeof o.plan_code === "string" ? o.plan_code : null,
    billing_cycle: typeof o.billing_cycle === "string" ? o.billing_cycle : null,
    status: typeof o.status === "string" ? o.status : null,
    standby_status: typeof o.standby_status === "string" ? o.standby_status : null,
    standby_requested_at: typeof o.standby_requested_at === "string" ? o.standby_requested_at : null,
    standby_cancel_deadline_at:
      typeof o.standby_cancel_deadline_at === "string" ? o.standby_cancel_deadline_at : null,
    standby_effective_at: typeof o.standby_effective_at === "string" ? o.standby_effective_at : null,
    next_renewal_at: typeof o.next_renewal_at === "string" ? o.next_renewal_at : null,
    is_nav_restricted: o.is_nav_restricted === true,
    can_request_standby: o.can_request_standby === true,
    can_cancel_standby_request: o.can_cancel_standby_request === true,
  };
}

export function canUseStandbyPlanFeatures(roleId: number | null | undefined): boolean {
  return typeof roleId === "number" && roleId > 0 && roleId < 6;
}

export async function fetchOrganisationStandbyState(): Promise<OrganisationStandbyState> {
  const { data, error } = await supabase.rpc("get_my_organisation_standby_state");
  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[standby] get_my_organisation_standby_state:", error.message);
    }
    return EMPTY_STATE;
  }
  return normalizeStandbyState(data);
}

export async function requestOrganisationStandby(): Promise<OrganisationStandbyState> {
  const { data, error } = await supabase.rpc("request_my_organisation_standby");
  if (error) throw new Error(error.message);
  return normalizeStandbyState(data);
}

export async function cancelOrganisationStandbyRequest(): Promise<OrganisationStandbyState> {
  const { data, error } = await supabase.rpc("cancel_my_organisation_standby_request");
  if (error) throw new Error(error.message);
  return normalizeStandbyState(data);
}
