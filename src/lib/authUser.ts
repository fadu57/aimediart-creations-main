import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

// Circuit breaker: si la table `public.users` est protégée (403/permission denied),
// on évite de spammer des requêtes identiques et on bascule sur le rôle JWT.
let USERS_TABLE_FORBIDDEN = false;
const USERS_PROFILE_INFLIGHT = new Map<string, Promise<UserProfileRow | null>>();

/** Rôles avec accès à toutes les données (mock + futur back-office global). */
export const ROLE_ADMIN_GENERAL = "admin_general";
export const ROLE_SUPER_ADMIN = "super_admin";
export const ROLE_DEVELOPPEUR = "developpeur";
export const ROLE_ADMIN_AGENCY = "admin_agency";
export const ROLE_CURATOR_EXPO = "curator_expo";
export const ROLE_EQUIPE_EXPO = "equipe_expo";
export const ROLE_VISITEUR = "visiteur";

export const ROLES_FULL_DATA_ACCESS = new Set<string>([
  ROLE_ADMIN_GENERAL,
  ROLE_SUPER_ADMIN,
  ROLE_DEVELOPPEUR,
]);

/** Toutes les expos de l’organisation (nécessite `agency_id` sur le profil). */
export const ROLES_AGENCY_SCOPE = new Set<string>([ROLE_ADMIN_AGENCY]);

/** Une seule exposition (nécessite `agency_id` + `expo_id`, ou `expo_id` seul pour résoudre l’agence). */
export const ROLES_SINGLE_EXPO = new Set<string>([ROLE_CURATOR_EXPO, ROLE_EQUIPE_EXPO]);

/** Rôles autorisés à créer un artiste (bouton « Nouvel artiste »). */
export const ROLES_CAN_CREATE_ARTIST = new Set([
  ROLE_ADMIN_GENERAL,
  ROLE_SUPER_ADMIN,
  ROLE_DEVELOPPEUR,
  ROLE_ADMIN_AGENCY,
]);

/**
 * Forme canonique pour comparer aux constantes (`admin_general`, etc.).
 * Gère espaces, tirets, casse (ex. « Admin General », `Admin-General`).
 */
export function normalizeRoleName(role: string | null | undefined): string | null {
  if (role == null || typeof role !== "string") return null;
  const t = role
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
  return t || null;
}

function hasRoleInSet(role_name: string | null | undefined, set: Set<string>): boolean {
  const n = normalizeRoleName(role_name);
  return n != null && set.has(n);
}

export function hasFullDataAccess(role_name: string | null | undefined): boolean {
  return hasRoleInSet(role_name, ROLES_FULL_DATA_ACCESS);
}

/** Accès aux pages Accueil, Artistes, Catalogue, etc. (hors page « Œuvre » publique). */
export function isBackofficeRole(role_name: string | null | undefined): boolean {
  const n = normalizeRoleName(role_name);
  if (n == null || n === normalizeRoleName(ROLE_VISITEUR)) {
    return false;
  }
  return (
    hasRoleInSet(role_name, ROLES_FULL_DATA_ACCESS) ||
    hasRoleInSet(role_name, ROLES_AGENCY_SCOPE) ||
    hasRoleInSet(role_name, ROLES_SINGLE_EXPO)
  );
}

/**
 * Niveau 7 / rôle visiteur : accès principal à la page publique « Œuvre ».
 * Utilise `role_id` en priorité (source de vérité en base), puis le nom de rôle normalisé.
 */
export function isVisitorRole(
  role_name: string | null | undefined,
  role_id: number | null | undefined,
): boolean {
  if (role_id === 7) return true;
  return normalizeRoleName(role_name) === normalizeRoleName(ROLE_VISITEUR);
}

export function canCreateArtist(role_name: string | null | undefined): boolean {
  return hasRoleInSet(role_name, ROLES_CAN_CREATE_ARTIST);
}

/**
 * Si le rôle n’est pas en base, Supabase Auth peut le porter dans les métadonnées utilisateur.
 */
export function getRoleNameFromJwt(user: User | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const app = user.app_metadata as Record<string, unknown> | undefined;
  const raw =
    (typeof meta?.role_name === "string" && meta.role_name) ||
    (typeof meta?.role === "string" && meta.role) ||
    (typeof meta?.user_role === "string" && meta.user_role) ||
    (typeof app?.role_name === "string" && app.role_name) ||
    (typeof app?.role === "string" && app.role) ||
    (typeof app?.user_role === "string" && app.user_role);
  const s = typeof raw === "string" ? raw.trim() : "";
  return s || null;
}

export function getRoleIdFromJwt(user: User | null): number | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const app = user.app_metadata as Record<string, unknown> | undefined;
  const raw = meta?.role_id ?? meta?.roleId ?? app?.role_id ?? app?.roleId ?? null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Rôle affiché pour l’app : priorité à la base, sinon métadonnées JWT (souvent renseignées quand `public.user` manque ou RLS bloque).
 */
export function mergeRoleFromDbAndJwt(
  user: User,
  dbRoleName: string | null,
  dbRoleLabel: string | null,
): { role_name: string | null; role_label: string | null } {
  const fromDb = normalizeRoleName(dbRoleName);
  const fromJwt = normalizeRoleName(getRoleNameFromJwt(user));
  const role_name = fromDb ?? fromJwt ?? null;
  return {
    role_name,
    role_label: dbRoleLabel?.trim() || null,
  };
}

type UserProfileRow = {
  role_id?: number | string | null;
  user_roles?: number | string | null;
  agency_id?: string | null;
  user_expo_id?: string | null;
  user_prenom?: string | null;
  prenom?: string | null;
  expo_id?: string | null;
};

function parseRoleId(row: UserProfileRow | null): number | null {
  if (!row) return null;
  // `role_id` est la source de vérité (schéma public.users).
  // `user_roles` existe en compat legacy et peut être incohérent.
  const raw = row.role_id ?? row.user_roles ?? null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchProfileFromUsers(authUserId: string): Promise<UserProfileRow | null> {
  if (USERS_TABLE_FORBIDDEN) return null;
  const inflight = USERS_PROFILE_INFLIGHT.get(authUserId);
  if (inflight) return await inflight;
  try {
    const p = (async (): Promise<UserProfileRow | null> => {
    // Schéma attendu: users.user_roles (role_id) -> roles_user.role_id -> roles_user.role_name
    // Requête volontairement simple (sans embed) pour éviter les ambiguïtés PostgREST (PGRST201).
    let { data, error } = await supabase
      .from("users")
      .select("user_roles, role_id, agency_id, user_expo_id, user_prenom")
      .eq("id", authUserId)
      .maybeSingle();

    // Fallback schéma legacy: users.role_id au lieu de users.user_roles.
    if (error && /user_roles/i.test(error.message)) {
      const legacy = await supabase
        .from("users")
        .select("role_id, agency_id, user_expo_id, user_prenom")
        .eq("id", authUserId)
        .maybeSingle();
      data = legacy.data;
      error = legacy.error;
    }

    // Certains schémas exposent `prenom` au lieu de `user_prenom`.
    if (error && /user_prenom/i.test(error.message)) {
      const retry = await supabase
        .from("users")
        .select("user_roles, role_id, agency_id, user_expo_id, prenom")
        .eq("id", authUserId)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      // Cas fréquent: RLS sur `public.users` => 403. On ne bloque pas l'app.
      const code = (error as unknown as { code?: string }).code ?? null;
      if (code === "42501" || /permission denied|forbidden/i.test(error.message)) {
        USERS_TABLE_FORBIDDEN = true;
      }
      if (import.meta.env.DEV) {
        console.warn("[auth] lecture table users refusée, fallback JWT :", {
          message: error.message,
          code,
        });
      }
      return null;
    }

    const row = (data as UserProfileRow | null) ?? null;
    if (!row) return null;

    const mapped = { ...row, expo_id: row.user_expo_id } as UserProfileRow & { expo_id?: string | null };
    return mapped;
    })();
    USERS_PROFILE_INFLIGHT.set(authUserId, p);
    const result = await p;
    return result;
  } catch (e) {
    // Défense en profondeur : aucune exception ne doit bloquer l'auth state.
    if (import.meta.env.DEV) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[auth] exception lecture table users, fallback JWT :", msg);
    }
    return null;
  } finally {
    USERS_PROFILE_INFLIGHT.delete(authUserId);
  }
}

function mapRoleNameFromRoleId(roleId: number | null): string | null {
  switch (roleId) {
    case 1:
      return ROLE_ADMIN_GENERAL;
    case 2:
      return ROLE_SUPER_ADMIN;
    case 3:
      return ROLE_DEVELOPPEUR;
    case 4:
      return ROLE_ADMIN_AGENCY;
    case 5:
      return ROLE_CURATOR_EXPO;
    case 6:
      return ROLE_EQUIPE_EXPO;
    case 7:
      return ROLE_VISITEUR;
    default:
      return null;
  }
}

/** Charge le profil d'accès depuis `public.users` (role_id, agency_id, user_expo_id). */
export async function fetchUserRoleFromDb(
  authUserId: string,
): Promise<{
  role_name: string | null;
  role_label: string | null;
  role_id: number | null;
  user_prenom: string | null;
  agency_id: string | null;
  expo_id: string | null;
}> {
  const profile = await fetchProfileFromUsers(authUserId);
  if (!profile) {
    return { role_name: null, role_label: null, role_id: null, user_prenom: null, agency_id: null, expo_id: null };
  }

  const role_id = parseRoleId(profile);
  // On résout le nom de rôle via roles_user (lookup direct, évite PGRST201).
  let role_name = normalizeRoleName(mapRoleNameFromRoleId(role_id));
  let role_label: string | null = null;

  if (role_id != null) {
    const { data: roleRow, error: roleErr } = await supabase
      .from("roles_user")
      .select("role_name, role_name_clair, label")
      .eq("role_id", role_id)
      .maybeSingle();
    if (!roleErr && roleRow) {
      const rr = roleRow as { role_name?: string | null; role_name_clair?: string | null; label?: string | null };
      role_name = normalizeRoleName(rr.role_name) ?? role_name;
      role_label =
        (typeof rr.role_name_clair === "string" && rr.role_name_clair.trim()) ||
        (typeof rr.label === "string" && rr.label.trim()) ||
        null;
    }
  }
  const user_prenom =
    (typeof profile.user_prenom === "string" && profile.user_prenom.trim()) ||
    (typeof profile.prenom === "string" && profile.prenom.trim()) ||
    null;
  const agency_id = typeof profile.agency_id === "string" ? profile.agency_id.trim() || null : null;
  // Mapping volontaire: on conserve `expo_id` côté app, alimenté depuis `user_expo_id` en base.
  const mapped = profile as UserProfileRow & { expo_id?: string | null };
  const expo_id = typeof mapped.expo_id === "string" ? mapped.expo_id.trim() || null : null;
  return {
    role_name,
    role_label,
    role_id,
    user_prenom,
    agency_id,
    expo_id,
  };
}
