import { parseGlobalRoleId } from "@/lib/authUser";
import { parseNumericRoleId } from "@/lib/roleHierarchy";
import { supabase } from "@/lib/supabase";

export type DashboardTeamScopeRow = {
  id?: string;
  role_id?: number | null;
  agency_id?: string | null;
};

export type TeamScopeFlags = {
  includeGlobalStaff: boolean;
  includeOrganisationMembers: boolean;
};

export function isGlobalStaffRole(roleId: number | null | undefined): boolean {
  const role = parseNumericRoleId(roleId);
  return role != null && role >= 1 && role <= 3;
}

export function isAgencyMetierRole(roleId: number | null | undefined): boolean {
  const role = parseNumericRoleId(roleId);
  return role != null && role >= 4 && role <= 6;
}

/**
 * Périmètre équipe :
 * - profil consulté niveau 1–3 : tous les users 1–3 (+ membres org si rôle métier 4–6 dans l'org) ;
 * - profil consulté niveau 4–6 seul : membres org uniquement ;
 * - sans org (équipe site) : tous les users 1–3.
 */
export function resolveTeamScopeFlags(
  agencyId: string | null | undefined,
  profileUserId: string | null | undefined,
  profileGlobalRoleId: number | null | undefined,
  agencyRoleByUser: ReadonlyMap<string, number>,
): TeamScopeFlags {
  const aid = agencyId?.trim() || null;
  const pid = profileUserId?.trim() || null;
  const profileIsGlobalStaff = isGlobalStaffRole(profileGlobalRoleId);
  const profileAgencyRole = pid ? agencyRoleByUser.get(pid) : undefined;

  if (!aid) {
    return { includeGlobalStaff: true, includeOrganisationMembers: false };
  }

  if (profileIsGlobalStaff) {
    return {
      includeGlobalStaff: true,
      includeOrganisationMembers: isAgencyMetierRole(profileAgencyRole),
    };
  }

  return {
    includeGlobalStaff: false,
    includeOrganisationMembers: true,
  };
}

export function shouldIncludeInTeamScope(
  userId: string,
  flags: TeamScopeFlags,
  agencyRoleByUser: ReadonlyMap<string, number>,
  mergedRoleId: number | null | undefined,
): boolean {
  const uid = userId.trim();
  if (!uid) return false;

  if (flags.includeGlobalStaff && isGlobalStaffRole(mergedRoleId)) return true;
  if (flags.includeOrganisationMembers && agencyRoleByUser.has(uid)) return true;
  return false;
}

export function isOrganisationMember(row: DashboardTeamScopeRow, agencyId: string): boolean {
  const aid = agencyId.trim();
  if (!aid) return false;
  return row.agency_id?.trim() === aid;
}

export async function loadAgencyRoleMap(agencyId: string): Promise<Map<string, number>> {
  const aid = agencyId.trim();
  const map = new Map<string, number>();
  if (!aid) return map;

  const { data } = await supabase.from("agency_users").select("user_id, role_id").eq("agency_id", aid);
  for (const row of (data as Array<{ user_id?: string | null; role_id?: unknown }> | null) ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const rid = parseNumericRoleId(row.role_id);
    if (uid && rid != null) map.set(uid, rid);
  }
  return map;
}

export async function loadGlobalRoleMap(userIds?: string[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();

  if (userIds?.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < userIds.length; i += 100) {
      chunks.push(userIds.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      const { data } = await supabase.from("profiles").select("id, role_id").in("id", chunk);
      for (const row of (data as Array<{ id?: string | null; role_id?: unknown }> | null) ?? []) {
        const uid = typeof row.id === "string" ? row.id.trim() : "";
        if (uid) map.set(uid, parseGlobalRoleId(row.role_id));
      }
    }
    return map;
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, role_id")
    .in("role_id", [1, 2, 3])
    .is("deleted_at", null);
  for (const row of (data as Array<{ id?: string | null; role_id?: unknown }> | null) ?? []) {
    const uid = typeof row.id === "string" ? row.id.trim() : "";
    if (uid) map.set(uid, parseGlobalRoleId(row.role_id));
  }
  return map;
}

export async function loadProfileGlobalRole(profileUserId: string | null | undefined): Promise<number | null> {
  const pid = profileUserId?.trim();
  if (!pid) return null;
  const { data } = await supabase.from("profiles").select("role_id").eq("id", pid).maybeSingle();
  return parseGlobalRoleId((data as { role_id?: unknown } | null)?.role_id);
}

/** Liste org seule (lien depuis page Organisations, sans profil consulté). */
export async function fetchOrganisationTeamMemberUserIds(agencyId: string): Promise<Set<string>> {
  const agencyRoleByUser = await loadAgencyRoleMap(agencyId);
  return new Set(agencyRoleByUser.keys());
}

/** Équipe dashboard selon profil consulté + organisation. */
export async function fetchDashboardTeamMemberUserIds(
  agencyId: string,
  profileUserId?: string | null,
): Promise<Set<string>> {
  const aid = agencyId.trim();
  const agencyRoleByUser = await loadAgencyRoleMap(aid);
  const profileGlobalRole = await loadProfileGlobalRole(profileUserId);
  const flags = resolveTeamScopeFlags(aid, profileUserId, profileGlobalRole, agencyRoleByUser);

  const ids = new Set<string>();
  if (flags.includeOrganisationMembers) {
    for (const uid of agencyRoleByUser.keys()) ids.add(uid);
  }
  if (flags.includeGlobalStaff) {
    const siteIds = await fetchSiteTeamMemberUserIds();
    for (const uid of siteIds) ids.add(uid);
  }
  return ids;
}

/** Équipe « site » : tous les utilisateurs niveaux 1–3. */
export async function fetchSiteTeamMemberUserIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("get_all_users_with_roles");
  const ids = new Set<string>();

  if (!error && Array.isArray(data)) {
    for (const row of data as Array<{ id?: string | null; role_id?: number | null }>) {
      const uid = typeof row.id === "string" ? row.id.trim() : "";
      if (!uid) continue;
      if (isGlobalStaffRole(row.role_id)) ids.add(uid);
    }
    return ids;
  }

  const globalStaffMap = await loadGlobalRoleMap();
  for (const [uid, globalRole] of globalStaffMap) {
    if (isGlobalStaffRole(globalRole)) ids.add(uid);
  }
  return ids;
}

/** @deprecated Utiliser fetchOrganisationTeamMemberUserIds */
export async function fetchOrganisationMemberUserIds(agencyId: string): Promise<Set<string>> {
  return fetchOrganisationTeamMemberUserIds(agencyId);
}

export function sortDashboardTeamMembers<
  T extends {
    role_id?: number | null;
    agency_role_id?: number | null;
    last_name?: string | null;
    first_name?: string | null;
  },
>(members: T[]): T[] {
  const rank = (m: T): number => {
    const merged = parseNumericRoleId(m.role_id);
    const agency = parseNumericRoleId(m.agency_role_id);
    if (merged != null && merged <= 3) return merged;
    if (merged != null && agency != null) return Math.min(merged, agency);
    return merged ?? agency ?? 99;
  };
  return [...members].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ln = (a.last_name ?? "").localeCompare(b.last_name ?? "", "fr", { sensitivity: "base" });
    if (ln !== 0) return ln;
    return (a.first_name ?? "").localeCompare(b.first_name ?? "", "fr", { sensitivity: "base" });
  });
}
