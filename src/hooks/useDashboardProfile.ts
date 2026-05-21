import { useCallback, useEffect, useState } from "react";

import { parseNumericRoleId } from "@/lib/roleHierarchy";
import { supabase } from "@/lib/supabase";
import { readAvatarFromRpcRow } from "@/lib/userAvatar";

/** Évite de rappeler Supabase si la table n'existe pas encore (404 / PGRST205). */
const AGENCY_SUBSCRIPTIONS_CACHE_KEY = "aimediart.agency_subscriptions_unavailable";

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
};

export type DashboardAgency = {
  id: string;
  name_agency: string | null;
  logo_agency: string | null;
};

export type DashboardExpo = {
  id: string;
  expo_name: string | null;
};

export type DashboardSubscription = {
  pricing_plan: string | null;
  pricing_label: string | null;
  billing_cycle: "monthly" | "annual" | null;
  started_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  days_remaining: number | null;
  max_oeuvres: number | null;
  max_visitors: number | null;
  is_unlimited: boolean | null;
  monthly_price_eur: number | null;
  status: "active" | "expired" | "none" | "unknown";
};

export type DashboardTeamStats = {
  members_count: number;
  expos_count: number;
  artworks_count: number;
};

export type DashboardTeamMember = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  role_id: number | null;
  role_label: string | null;
  /** Identifiants expo (expo_id ou id expos) — plusieurs affectations possibles. */
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
  agencyExpos: DashboardAgencyExpoOption[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const end = new Date(isoDate);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
  const { data } = await supabase
    .from("pricing")
    .select(
      "pricing_label,pricing_max_oeuvres,princing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur",
    )
    .eq("pricing_plan", trimmed)
    .limit(1)
    .maybeSingle();

  const row = data as {
    pricing_label?: string | null;
    pricing_max_oeuvres?: number | null;
    princing_max_visitors?: number | null;
    pricing_is_unlimited?: boolean | null;
    pricing_monthly_ttc_eur?: number | null;
  } | null;

  return {
    pricing_label: row?.pricing_label ?? null,
    max_oeuvres: row?.pricing_max_oeuvres ?? null,
    max_visitors: row?.princing_max_visitors ?? null,
    is_unlimited: row?.pricing_is_unlimited ?? null,
    monthly_price_eur: row?.pricing_monthly_ttc_eur ?? null,
  };
}

function subscriptionPlaceholder(status: DashboardSubscription["status"]): DashboardSubscription {
  return {
    pricing_plan: null,
    pricing_label: null,
    billing_cycle: null,
    started_at: null,
    expires_at: null,
    is_active: false,
    days_remaining: null,
    max_oeuvres: null,
    max_visitors: null,
    is_unlimited: null,
    monthly_price_eur: null,
    status,
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

async function fetchSubscription(agencyId: string | null): Promise<DashboardSubscription | null> {
  if (!agencyId?.trim()) return null;
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
  const expiresAt = row.expires_at ?? null;
  const isActive = row.is_active !== false;
  const daysRemaining = daysUntil(expiresAt);

  return {
    pricing_plan: pricingPlan,
    pricing_label: pricingDetails.pricing_label,
    billing_cycle:
      row.billing_cycle === "annual" || row.billing_cycle === "monthly"
        ? row.billing_cycle
        : null,
    started_at: row.started_at ?? null,
    expires_at: expiresAt,
    is_active: isActive,
    days_remaining: daysRemaining,
    max_oeuvres: pricingDetails.max_oeuvres,
    max_visitors: pricingDetails.max_visitors,
    is_unlimited: pricingDetails.is_unlimited,
    monthly_price_eur: pricingDetails.monthly_price_eur,
    status: subscriptionStatus(isActive, expiresAt),
  };
}

async function fetchTeamMembers(agencyId: string | null): Promise<{
  members: DashboardTeamMember[];
  agencyExpos: DashboardAgencyExpoOption[];
}> {
  if (!agencyId?.trim()) return { members: [], agencyExpos: [] };
  const aid = agencyId.trim();

  const [{ data: rpcData, error: rpcErr }, { data: roleRows }, { data: expoRows }, { data: agencyRoleRows }] =
    await Promise.all([
      supabase.rpc("get_all_users_with_roles"),
      supabase.from("roles_user").select("role_id, role_name_clair, label, role_name"),
      supabase.from("expos").select("id, expo_id, expo_name").eq("agency_id", aid).is("deleted_at", null),
      supabase.from("agency_users").select("user_id, role_id").eq("agency_id", aid),
    ]);

  const agencyExpos: DashboardAgencyExpoOption[] = (
    (expoRows as Array<{ id?: string | null; expo_id?: string | null; expo_name?: string | null }> | null) ?? []
  )
    .filter((row) => typeof row.id === "string" && row.id.trim())
    .map((row) => {
      const id = String(row.id).trim();
      const value = row.expo_id?.trim() || id;
      return {
        id,
        value,
        label: row.expo_name?.trim() || value,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const normalizeStoredExpoId = (raw: string): string => {
    const t = raw.trim();
    if (!t) return "";
    const match = agencyExpos.find((o) => o.value === t || o.id === t);
    return match?.value ?? t;
  };

  const agencyRoleByUser = new Map<string, number>();
  for (const row of (agencyRoleRows as Array<{ user_id?: string | null; role_id?: unknown }> | null) ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const rid = parseNumericRoleId(row.role_id);
    if (uid && rid != null) agencyRoleByUser.set(uid, rid);
  }

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

  type RpcUserRow = {
    id?: string | null;
    role_id?: number | null;
    agency_id?: string | null;
    expo_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    user_photo_url?: string | null;
    photo_url?: string | null;
    picture?: string | null;
    phone?: string | null;
  };

  if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
    let members: DashboardTeamMember[] = (rpcData as RpcUserRow[])
      .filter((r) => typeof r.id === "string" && r.id.trim() && r.agency_id?.trim() === aid)
      .map((r) => {
        const uid = String(r.id).trim();
        const roleId = parseNumericRoleId(r.role_id) ?? agencyRoleByUser.get(uid) ?? null;
        return {
          user_id: uid,
          first_name: r.first_name ?? null,
          last_name: r.last_name ?? null,
          username: r.username ?? null,
          avatar_url: readAvatarFromRpcRow(r) ?? r.avatar_url ?? null,
          phone: r.phone ?? null,
          role_id: roleId,
          role_label: roleId != null ? roleLabelById.get(roleId) ?? `Rôle ${roleId}` : null,
          expo_ids: [] as string[],
        };
      });

    const memberIds = members.map((m) => m.user_id);
    if (memberIds.length > 0) {
      const { data: assignRows } = await supabase
        .from("expo_user_role")
        .select("user_id, expo_id")
        .in("user_id", memberIds);
      const expoIdsByUser = new Map<string, string[]>();
      for (const row of (assignRows as Array<{ user_id?: string | null; expo_id?: string | null }> | null) ?? []) {
        const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
        const eid = typeof row.expo_id === "string" ? normalizeStoredExpoId(row.expo_id) : "";
        if (!uid || !eid) continue;
        const list = expoIdsByUser.get(uid) ?? [];
        if (!list.includes(eid)) list.push(eid);
        expoIdsByUser.set(uid, list);
      }
      members = members.map((m) => ({
        ...m,
        expo_ids: expoIdsByUser.get(m.user_id) ?? [],
      }));
    }

    members.sort((a, b) => {
      const ln = (a.last_name ?? "").localeCompare(b.last_name ?? "", "fr", { sensitivity: "base" });
      if (ln !== 0) return ln;
      return (a.first_name ?? "").localeCompare(b.first_name ?? "", "fr", { sensitivity: "base" });
    });

    return { members, agencyExpos };
  }

  if (import.meta.env.DEV && rpcErr) {
    console.warn("[dashboard] RPC get_all_users_with_roles indisponible, repli agency_users :", rpcErr.message);
  }

  // Repli : agency_users visible, profiles souvent bloqués par RLS (noms vides).
  const { data: agencyRows, error: agencyErr } = await supabase
    .from("agency_users")
    .select("user_id, role_id")
    .eq("agency_id", aid)
    .order("role_id", { ascending: true });

  if (agencyErr || !agencyRows?.length) return { members: [], agencyExpos };

  const userIds = [
    ...new Set(
      (agencyRows as Array<{ user_id?: string | null }>)
        .map((r) => (typeof r.user_id === "string" ? r.user_id.trim() : ""))
        .filter(Boolean),
    ),
  ];
  if (userIds.length === 0) return { members: [], agencyExpos };

  const [{ data: profileRows }, { data: expoAssignRows }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, username, avatar_url, phone").in("id", userIds),
    supabase
      .from("expo_user_role")
      .select("user_id, expo_id")
      .in("user_id", userIds)
      .order("assigned_at", { ascending: false }),
  ]);

  const expoIdsByUser = new Map<string, string[]>();
  for (const row of (expoAssignRows as Array<{ user_id?: string | null; expo_id?: string | null }> | null) ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const eid = typeof row.expo_id === "string" ? normalizeStoredExpoId(row.expo_id) : "";
    if (!uid || !eid) continue;
    const list = expoIdsByUser.get(uid) ?? [];
    if (!list.includes(eid)) list.push(eid);
    expoIdsByUser.set(uid, list);
  }

  const profileById = new Map<
    string,
    {
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      phone?: string | null;
    }
  >();
  for (const row of (profileRows as Array<{ id?: string | null; avatar_url?: string | null }> | null) ?? []) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id) profileById.set(id, row);
  }

  const roleByUser = new Map<string, number | null>();
  for (const row of agencyRows as Array<{ user_id?: string | null; role_id?: number | null }>) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || roleByUser.has(uid)) continue;
    roleByUser.set(uid, parseNumericRoleId(row.role_id));
  }

  const members: DashboardTeamMember[] = userIds.map((uid) => {
    const p = profileById.get(uid);
    const roleId = roleByUser.get(uid) ?? null;
    return {
      user_id: uid,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      phone: p?.phone ?? null,
      role_id: roleId,
      role_label: roleId != null ? roleLabelById.get(roleId) ?? `Rôle ${roleId}` : null,
      expo_ids: expoIdsByUser.get(uid) ?? [],
    };
  });

  members.sort((a, b) => {
    const ln = (a.last_name ?? "").localeCompare(b.last_name ?? "", "fr", { sensitivity: "base" });
    if (ln !== 0) return ln;
    return (a.first_name ?? "").localeCompare(b.first_name ?? "", "fr", { sensitivity: "base" });
  });

  return { members, agencyExpos };
}

async function fetchTeamStats(agencyId: string | null): Promise<DashboardTeamStats> {
  const empty: DashboardTeamStats = { members_count: 0, expos_count: 0, artworks_count: 0 };
  if (!agencyId?.trim()) return empty;

  const aid = agencyId.trim();

  const [membersRes, exposRes, artworksRes] = await Promise.all([
    supabase.from("agency_users").select("user_id", { count: "exact", head: true }).eq("agency_id", aid),
    supabase.from("expos").select("id", { count: "exact", head: true }).eq("agency_id", aid).is("deleted_at", null),
    supabase
      .from("artworks")
      .select("artwork_id", { count: "exact", head: true })
      .eq("artwork_agency_id", aid)
      .is("deleted_at", null),
  ]);

  return {
    members_count: membersRes.count ?? 0,
    expos_count: exposRes.count ?? 0,
    artworks_count: artworksRes.count ?? 0,
  };
}

export function useDashboardProfile(
  userId: string | null | undefined,
  agencyId: string | null | undefined,
  expoId: string | null | undefined,
): DashboardData {
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [agency, setAgency] = useState<DashboardAgency | null>(null);
  const [expo, setExpo] = useState<DashboardExpo | null>(null);
  const [subscription, setSubscription] = useState<DashboardSubscription | null>(null);
  const [teamStats, setTeamStats] = useState<DashboardTeamStats>({
    members_count: 0,
    expos_count: 0,
    artworks_count: 0,
  });
  const [teamMembers, setTeamMembers] = useState<DashboardTeamMember[]>([]);
  const [agencyExpos, setAgencyExpos] = useState<DashboardAgencyExpoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!userId?.trim()) {
      setProfile(null);
      setAgency(null);
      setExpo(null);
      setSubscription(null);
      setTeamStats({ members_count: 0, expos_count: 0, artworks_count: 0 });
      setTeamMembers([]);
      setAgencyExpos([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const uid = userId.trim();

        const [profileRes, agencyRes, expoRes, sub, stats, teamData] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id,first_name,last_name,username,avatar_url,phone,zip_code,city,country_code,timezone,language,birth_year,created_at",
            )
            .eq("id", uid)
            .maybeSingle(),
          agencyId?.trim()
            ? supabase
                .from("agencies")
                .select("id,name_agency,logo_agency")
                .eq("id", agencyId.trim())
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          expoId?.trim()
            ? supabase
                .from("expos")
                .select("id,expo_name")
                .or(`id.eq.${expoId.trim()},expo_id.eq.${expoId.trim()}`)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          fetchSubscription(agencyId ?? null),
          fetchTeamStats(agencyId ?? null),
          fetchTeamMembers(agencyId ?? null),
        ]);

        if (cancelled) return;

        if (profileRes.error) {
          setError(profileRes.error.message);
          setProfile(null);
        } else if (profileRes.data) {
          setProfile(profileRes.data as DashboardProfile);
        } else {
          setProfile(null);
        }

        if (agencyRes.data) {
          const a = agencyRes.data as DashboardAgency;
          setAgency({ id: a.id, name_agency: a.name_agency ?? null, logo_agency: a.logo_agency ?? null });
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
  }, [userId, agencyId, expoId, tick]);

  return { profile, agency, expo, subscription, teamStats, teamMembers, agencyExpos, loading, error, refresh, refreshKey: tick };
}
