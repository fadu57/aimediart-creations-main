/** Rôles globaux SaaS (1–3) et rôles métier agence/expo (4–6). */

export const GLOBAL_ROLE_IDS = [1, 2, 3] as const;
export const AGENCY_ROLE_IDS = [4, 5, 6] as const;

export function derivePrimaryRoleId(roleIds: number[]): number | null {
  if (!roleIds.length) return null;
  return Math.min(...roleIds);
}

export function deriveGlobalRoleId(roleIds: number[]): number | null {
  const globals = roleIds.filter((id) => id >= 1 && id <= 3);
  return globals.length ? Math.min(...globals) : null;
}

export function deriveAgencyRoleIds(roleIds: number[]): number[] {
  return roleIds.filter((id) => id >= 4 && id <= 6).sort((a, b) => a - b);
}

/** Rôle stocké dans agency_users (le plus élevé en privilège = id le plus bas). */
export function deriveAgencyRoleIdForStorage(roleIds: number[]): number | null {
  const agency = deriveAgencyRoleIds(roleIds);
  return agency.length ? Math.min(...agency) : null;
}

export function roleIdsNeedOrganisation(roleIds: number[]): boolean {
  return deriveAgencyRoleIds(roleIds).length > 0;
}

export function roleIdsNeedExpos(roleIds: number[]): boolean {
  return roleIds.some((id) => id === 5 || id === 6);
}

export function getAdditionalAgencyRoles(primaryRoleId: number): number[] {
  if (primaryRoleId >= 1 && primaryRoleId <= 3) return [...AGENCY_ROLE_IDS];
  if (primaryRoleId === 4) return [5, 6];
  if (primaryRoleId === 5) return [6];
  return [];
}

export function buildRoleIdsFromStorage(
  profileRoleId: number | null,
  agencyRoleId: number | null,
): number[] {
  const ids: number[] = [];
  if (profileRoleId != null && profileRoleId >= 1 && profileRoleId <= 3) ids.push(profileRoleId);
  if (agencyRoleId != null && agencyRoleId >= 4 && agencyRoleId <= 6) {
    if (!ids.includes(agencyRoleId)) ids.push(agencyRoleId);
  }
  return ids.sort((a, b) => a - b);
}

export function normalizeUserRoleIds(roleIds: number[] | null | undefined): number[] {
  const unique = [...new Set((roleIds ?? []).filter((id) => Number.isFinite(id) && id >= 1 && id <= 7))];
  return unique.sort((a, b) => a - b);
}

export function isGlobalRole(roleId: number): boolean {
  return roleId >= 1 && roleId <= 3;
}

export function isAgencyRole(roleId: number): boolean {
  return roleId >= 4 && roleId <= 6;
}

/** Rôles agence cochables selon le rôle principal (le plus privilégié). */
export function selectableAgencyRoles(primaryRoleId: number | null, allRoleIds: number[]): number[] {
  if (primaryRoleId == null) return [...AGENCY_ROLE_IDS];
  if (primaryRoleId >= 1 && primaryRoleId <= 3) return [...AGENCY_ROLE_IDS];
  if (primaryRoleId === 4) return [4, 5, 6];
  if (primaryRoleId === 5) return [5, 6];
  if (primaryRoleId === 6) return [6];
  return [];
}

export function isAgencyRoleEnabled(
  roleId: number,
  primaryRoleId: number | null,
  selectedRoleIds: number[],
  callerRoleId: number | null,
): boolean {
  if (!isAgencyRole(roleId)) return false;
  if (callerRoleId != null && roleId < callerRoleId) return false;
  const allowed = selectableAgencyRoles(primaryRoleId, selectedRoleIds);
  return allowed.includes(roleId) || selectedRoleIds.includes(roleId);
}

/**
 * Bascule un rôle dans la sélection.
 * - Rôles 1–3 : exclusifs entre eux, conservent les rôles agence.
 * - Rôles 4–6 : cumulables selon le rôle principal.
 */
export function toggleUserRole(
  current: number[],
  roleId: number,
  callerRoleId: number | null,
): number[] {
  if (callerRoleId != null && roleId < callerRoleId) return current;

  const selected = normalizeUserRoleIds(current);
  const isChecked = selected.includes(roleId);

  if (isGlobalRole(roleId)) {
    const agency = deriveAgencyRoleIds(selected);
    if (isChecked) {
      return agency.length ? agency : [];
    }
    return normalizeUserRoleIds([roleId, ...agency]);
  }

  if (isAgencyRole(roleId)) {
    const globals = selected.filter(isGlobalRole);
    const primary = globals.length
      ? Math.min(...globals)
      : selected.length
        ? Math.min(...selected)
        : roleId;

    let agency = deriveAgencyRoleIds(selected);
    if (isChecked) {
      agency = agency.filter((id) => id !== roleId);
    } else {
      agency = normalizeUserRoleIds([...agency, roleId]);
      const allowed = selectableAgencyRoles(
        globals.length ? Math.min(...globals) : derivePrimaryRoleId(agency),
        [...globals, ...agency],
      );
      agency = agency.filter((id) => allowed.includes(id));
    }

    if (!globals.length && agency.length === 0 && !isChecked) {
      return [roleId];
    }

    return normalizeUserRoleIds([...globals, ...agency]);
  }

  return selected;
}

export function ensureUserRowRoleFields<T extends {
  role_id?: number | null;
  role_ids?: number[] | null;
  expo_id?: string | null;
  expo_ids?: string[] | null;
}>(row: T): T & { role_ids: number[]; expo_ids: string[]; role_id: number | null } {
  const profileGlobal =
    row.role_id != null && row.role_id >= 1 && row.role_id <= 3 ? row.role_id : null;
  const agencyRole = row.role_id != null && row.role_id >= 4 && row.role_id <= 6 ? row.role_id : null;
  const role_ids = row.role_ids?.length
    ? normalizeUserRoleIds(row.role_ids)
    : buildRoleIdsFromStorage(profileGlobal, agencyRole);
  const expo_ids = row.expo_ids?.length
    ? [...new Set(row.expo_ids.map((id) => id.trim()).filter(Boolean))]
    : row.expo_id?.trim()
      ? [row.expo_id.trim()]
      : [];
  return {
    ...row,
    role_ids,
    expo_ids,
    role_id: derivePrimaryRoleId(role_ids),
  };
}
