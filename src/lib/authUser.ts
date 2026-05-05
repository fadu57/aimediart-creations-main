import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

// Circuit breaker: si la table `public.profiles` est protegee (403/permission denied),
// on evite de spammer des requetes identiques et on bascule sur le role JWT.
let USERS_TABLE_FORBIDDEN = false;
const USERS_PROFILE_INFLIGHT = new Map<string, Promise<UserProfileRow | null>>();

/** Roles avec acces a toutes les donnees (mock + futur back-office global). */
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

/** Toutes les expos de l'organisation (necessite agency_id dans agency_users). */
export const ROLES_AGENCY_SCOPE = new Set<string>([ROLE_ADMIN_AGENCY]);

/** Une seule exposition (necessite agency_id + expo_id via expo_user_role). */
export const ROLES_SINGLE_EXPO = new Set<string>([ROLE_CURATOR_EXPO, ROLE_EQUIPE_EXPO]);

/** Roles autorises a creer un artiste (bouton "Nouvel artiste"). */
export const ROLES_CAN_CREATE_ARTIST = new Set([
  ROLE_ADMIN_GENERAL,
  ROLE_SUPER_ADMIN,
  ROLE_DEVELOPPEUR,
  ROLE_ADMIN_AGENCY,
]);

/**
 * Forme canonique pour comparer aux constantes (admin_general, etc.).
 * Gere espaces, tirets, casse (ex. "Admin General", "Admin-General").
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

/** Acces aux pages Accueil, Artistes, Catalogue, etc. (hors page Oeuvre publique). */
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
 * Niveau 7 / role visiteur : acces principal a la page publique Oeuvre.
 * Utilise role_id en priorite (source de verite en base), puis le nom de role normalise.
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
 * Si le role n'est pas en base, Supabase Auth peut le porter dans les metadonnees utilisateur.
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
 * Role affiche pour l'app : priorite a la base (agency_users), sinon metadonnees JWT
 * (fallback si profiles/RLS inaccessible).
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
  agency_id?: string | null;
  expo_id?: string | null;
  first_name?: string | null;
};

function parseRoleId(row: UserProfileRow | null): number | null {
  if (!row) return null;
  // role_id vient de agency_users.role_id -> roles_user.role_id (source de verite)
  const raw = row.role_id ?? null;
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
      // Lecture du prenom depuis profiles (lie 1:1 a auth.users)
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", authUserId)
        .maybeSingle();

      if (profileErr) {
        // Cas frequent: RLS sur public.profiles => 403. On ne bloque pas l'app.
        const code = (profileErr as unknown as { code?: string }).code ?? null;
        if (code === "42501" || /permission denied|forbidden/i.test(profileErr.message)) {
          USERS_TABLE_FORBIDDEN = true;
        }
        if (import.meta.env.DEV) {
          console.warn("[auth] lecture profiles refusee, fallback JWT :", { message: profileErr.message, code });
        }
        return null;
      }

      // Rattachement agence + role : prend la ligne de plus haut rang (role_id le plus bas = admin)
      const { data: agencyData } = await supabase
        .from("agency_users")
        .select("agency_id, role_id")
        .eq("user_id", authUserId)
        .order("role_id", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Rattachement expo : prend le plus recent
      const { data: expoData } = await supabase
        .from("expo_user_role")
        .select("expo_id")
        .eq("user_id", authUserId)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        first_name: profileData?.first_name ?? null,
        role_id: agencyData?.role_id ?? null,
        agency_id: agencyData?.agency_id ?? null,
        expo_id: expoData?.expo_id ?? null,
      };
    })();
    USERS_PROFILE_INFLIGHT.set(authUserId, p);
    const result = await p;
    return result;
  } catch (e) {
    if (import.meta.env.DEV) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[auth] exception lecture profiles, fallback JWT :", msg);
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

/** Charge le profil d'acces depuis public.profiles, agency_users et expo_user_role. */
export async function fetchUserRoleFromDb(
  authUserId: string,
): Promise<{
  role_name: string | null;
  role_label: string | null;
  role_id: number | null;
  first_name: string | null;
  agency_id: string | null;
  expo_id: string | null;
}> {
  const profile = await fetchProfileFromUsers(authUserId);
  if (!profile) {
    return { role_name: null, role_label: null, role_id: null, first_name: null, agency_id: null, expo_id: null };
  }

  const role_id = parseRoleId(profile);
  // On resout le nom de role via roles_user (lookup direct, evite PGRST201).
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

  const first_name = typeof profile.first_name === "string" ? profile.first_name.trim() || null : null;
  const agency_id = typeof profile.agency_id === "string" ? profile.agency_id.trim() || null : null;
  const expo_id = typeof profile.expo_id === "string" ? profile.expo_id.trim() || null : null;

  return { role_name, role_label, role_id, first_name, agency_id, expo_id };
}
