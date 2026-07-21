/**
 * Hiérarchie des rôles : role_id plus bas = privilège plus élevé (1 = admin général, 7 = visiteur).
 * Un utilisateur peut créer / assigner uniquement des rôles de niveau égal ou inférieur au sien.
 */

import { normalizeRoleName } from "@/lib/authUser";

const ROLE_NAME_TO_ID: Record<string, number> = {
  admin_general: 1,
  super_admin: 2,
  developpeur: 3,
  admin_agency: 4,
  curator_expo: 5,
  equipe_expo: 6,
  visiteur: 7,
};

export function parseNumericRoleId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Privilège le plus élevé = role_id le plus bas (1 avant 4). */
export function pickLowestRoleId(...candidates: (number | null | undefined)[]): number | null {
  const nums = candidates.map((c) => parseNumericRoleId(c)).filter((n): n is number => n != null);
  return nums.length ? Math.min(...nums) : null;
}

/** role_id DB/JWT, sinon déduction depuis role_name (ex. admin_agency → 4). */
export function resolveEffectiveRoleId(
  roleId: number | null | undefined,
  roleName: string | null | undefined,
): number | null {
  const parsed = parseNumericRoleId(roleId);
  if (parsed != null) return parsed;
  const normalized = normalizeRoleName(roleName);
  if (normalized && ROLE_NAME_TO_ID[normalized] != null) {
    return ROLE_NAME_TO_ID[normalized];
  }
  return null;
}

/** Rôles autorisés à créer des utilisateurs : admins SaaS (1–3) et admin organisation (4). */
export function canCreateUsers(roleId: number | null | undefined): boolean {
  const id = parseNumericRoleId(roleId);
  return id != null && ((id >= 1 && id <= 3) || id === 4);
}

/** Admin organisation (4) : peut modifier les membres de rôles 4, 5 et 6. Admins globaux (1–3) : tous. */
export function canManageTeamMember(
  callerRoleId: number | null | undefined,
  targetRoleId: number | null | undefined,
): boolean {
  const caller = parseNumericRoleId(callerRoleId);
  const target = parseNumericRoleId(targetRoleId);
  if (caller == null) return false;
  if (caller >= 1 && caller <= 3) return true;
  if (caller === 4) {
    return target != null && target >= 4 && target <= 6;
  }
  return false;
}

/** Corbeille utilisateur : rôles 1, 2 et 4 (aligné page Utilisateurs). */
export function canDeleteTeamMember(
  callerRoleId: number | null | undefined,
  targetRoleId: number | null | undefined,
  callerUserId?: string | null,
  targetUserId?: string | null,
): boolean {
  const caller = parseNumericRoleId(callerRoleId);
  const target = parseNumericRoleId(targetRoleId);
  const targetId = targetUserId?.trim() || "";
  if (caller == null || !targetId) return false;
  if (callerUserId?.trim() && callerUserId.trim() === targetId) return false;
  if (target === 1) return false;
  if (caller === 2 && target === 1) return false;
  if (caller === 1 || caller === 2) return true;
  if (caller === 4) {
    return target != null && target >= 4 && target <= 6;
  }
  return false;
}

/** Rôles 1–4 : peuvent affecter une expo aux membres curateur / équipe expo. */
export function callerCanAssignExpo(callerRoleId: number | null | undefined): boolean {
  const id = parseNumericRoleId(callerRoleId);
  return id != null && id >= 1 && id < 5;
}

export function targetRoleUsesExpo(targetRoleId: number | null | undefined): boolean {
  const id = parseNumericRoleId(targetRoleId);
  return id === 5 || id === 6;
}

export function canAssignExpoToMember(
  callerRoleId: number | null | undefined,
  targetRoleId: number | null | undefined,
): boolean {
  return callerCanAssignExpo(callerRoleId) && targetRoleUsesExpo(targetRoleId);
}

/** Filtre les rôles assignables : role_id >= roleId appelant (même niveau ou inférieur en privilège). */
export function isRoleAssignableBy(callerRoleId: number, targetRoleId: number): boolean {
  return targetRoleId >= callerRoleId && targetRoleId <= 7;
}

/** Libellé court pour l'UI. */
export function roleLevelHint(roleId: number | null | undefined): string {
  if (typeof roleId !== "number" || !Number.isFinite(roleId)) return "";
  return `Vous pouvez créer des utilisateurs avec un rôle de niveau ${roleId} à 7.`;
}
