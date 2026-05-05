import type { User } from "@supabase/supabase-js";

import type { Artwork, Expo } from "@/data/mockData";
import {
  hasFullDataAccess,
  normalizeRoleName,
  ROLE_ADMIN_AGENCY,
  ROLE_CURATOR_EXPO,
  ROLE_EQUIPE_EXPO,
  ROLE_VISITEUR,
  ROLES_AGENCY_SCOPE,
  ROLES_SINGLE_EXPO,
} from "@/lib/authUser";
import { supabase } from "@/lib/supabase";

/** Périmètre des données mockées / futures requêtes selon le rôle. */
export type DataScope =
  | { mode: "all" }
  | { mode: "agency"; agencyId: string }
  | { mode: "expo"; agencyId: string; expoId: string }
  | { mode: "error"; message: string }
  | { mode: "none" };

function resolveAccessLevel(role_name: string | null | undefined, role_id: number | null | undefined): number | null {
  if (typeof role_id === "number" && Number.isFinite(role_id)) return role_id;
  const n = normalizeRoleName(role_name);
  if (!n) return null;
  if (n === ROLE_VISITEUR) return 7;
  if (n === ROLE_ADMIN_AGENCY) return 4;
  if (n === ROLE_CURATOR_EXPO || n === ROLE_EQUIPE_EXPO) return 5;
  if (hasFullDataAccess(n)) return 1;
  return null;
}

/**
 * Lit agency_id / expo_id depuis les métadonnées JWT et les variables d’environnement de secours (dev).
 */
export function resolveAgencyExpoFromJwt(user: User | null): {
  agency_id: string | null;
  expo_id: string | null;
} {
  if (!user) {
    return { agency_id: null, expo_id: null };
  }
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const app = user.app_metadata as Record<string, unknown> | undefined;

  const agencyRaw =
    (typeof meta?.agency_id === "string" && meta.agency_id.trim()) ||
    (typeof app?.agency_id === "string" && app.agency_id.trim()) ||
    (import.meta.env.VITE_DEFAULT_AGENCY_ID as string | undefined)?.trim() ||
    "";

  const expoRaw =
    (typeof meta?.expo_id === "string" && meta.expo_id.trim()) ||
    (typeof app?.expo_id === "string" && app.expo_id.trim()) ||
    (import.meta.env.VITE_DEFAULT_EXPO_ID as string | undefined)?.trim() ||
    "";

  return {
    agency_id: agencyRaw || null,
    expo_id: expoRaw || null,
  };
}

/**
 * Complete avec agency_users.agency_id et expo_user_role.expo_id si disponibles
 * (sinon erreur ignoree, on garde le JWT).
 */
export async function mergeAgencyExpoFromUserTable(
  authUserId: string,
  fromJwt: { agency_id: string | null; expo_id: string | null },
): Promise<{ agency_id: string | null; expo_id: string | null }> {
  const { data: agencyData, error: agencyErr } = await supabase
    .from("agency_users")
    .select("agency_id")
    .eq("user_id", authUserId)
    .order("role_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (agencyErr) {
    if (import.meta.env.DEV) {
      console.warn("[auth] agency_id (agency_users) :", agencyErr.message);
    }
    return fromJwt;
  }

  const { data: expoData } = await supabase
    .from("expo_user_role")
    .select("expo_id")
    .eq("user_id", authUserId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agencyDb = agencyData?.agency_id?.trim() ?? "";
  const expoDb = expoData?.expo_id?.trim() ?? "";

  return {
    agency_id: agencyDb || fromJwt.agency_id,
    expo_id: expoDb || fromJwt.expo_id,
  };
}

/** Expositions visibles pour l’utilisateur (agence, puis filtre expo optionnel). */
export function getScopedExpos(
  allExpos: Expo[],
  agencyId: string | null,
  expoId: string | null,
): Expo[] {
  if (!agencyId) return [];
  const forAgency = allExpos.filter((e) => e.agency_id === agencyId);
  if (!expoId) return forAgency;
  return forAgency.filter((e) => e.id === expoId);
}

/** Œuvres dont l’exposition est dans le périmètre agence (+ expo si renseignée). */
export function getScopedArtworks(
  allArtworks: Artwork[],
  allExpos: Expo[],
  agencyId: string | null,
  expoId: string | null,
): Artwork[] {
  const allowed = new Set(getScopedExpos(allExpos, agencyId, expoId).map((e) => e.id));
  return allArtworks.filter((a) => {
    // Compat schémas mock/historique:
    // - ancien: expoId
    // - actuel: artwork_expo_id (schéma public.artworks)
    const aExpoId =
      (a as unknown as { expoId?: string | null }).expoId ??
      (a as unknown as { artwork_expo_id?: string | null }).artwork_expo_id ??
      null;
    return Boolean(aExpoId && allowed.has(aExpoId));
  });
}

/**
 * Règles : admin_general, super_admin, developpeur → tout ;
 * admin_agency → toutes les expos de l’agence ; curator_expo, equipe_expo → une expo ;
 * visiteur / sans rôle → aucune donnée.
 */
export function resolveDataScope(
  role_name: string | null | undefined,
  role_id: number | null | undefined,
  agency_id: string | null,
  expo_id: string | null,
  allExpos: Expo[],
): DataScope {
  const accessLevel = resolveAccessLevel(role_name, role_id);

  // Niveaux 1, 2, 3: accès total sans restriction.
  if (accessLevel != null && accessLevel >= 1 && accessLevel <= 3) {
    return { mode: "all" };
  }

  // Niveau 4: filtrage agence.
  if (accessLevel === 4 || (role_name && ROLES_AGENCY_SCOPE.has(role_name))) {
    if (!agency_id) return { mode: "none" };
    return { mode: "agency", agencyId: agency_id };
  }

  // Niveaux 5 et 6: filtrage strict expo.
  if (accessLevel === 5 || accessLevel === 6 || (role_name && ROLES_SINGLE_EXPO.has(role_name))) {
    let agencyId = agency_id;
    const expoId = expo_id;
    if (expoId && !agencyId) {
      agencyId = allExpos.find((e) => e.id === expoId)?.agency_id ?? null;
    }
    if (!expoId) {
      return { mode: "error", message: "Aucune exposition assignée" };
    }
    if (!agencyId) return { mode: "none" };
    return { mode: "expo", agencyId, expoId };
  }

  // Niveau 7: visiteur.
  if (accessLevel === 7) {
    return { mode: "none" };
  }

  return { mode: "none" };
}

export function getArtworksForDataScope(
  allArtworks: Artwork[],
  allExpos: Expo[],
  scope: DataScope,
): Artwork[] {
  switch (scope.mode) {
    case "all":
      return allArtworks;
    case "agency":
      return getScopedArtworks(allArtworks, allExpos, scope.agencyId, null);
    case "expo":
      return getScopedArtworks(allArtworks, allExpos, scope.agencyId, scope.expoId);
    case "none":
      return [];
    case "error":
      return [];
  }
}

export function getExposForDataScope(allExpos: Expo[], scope: DataScope): Expo[] {
  switch (scope.mode) {
    case "all":
      return allExpos;
    case "agency":
      return allExpos.filter((e) => e.agency_id === scope.agencyId);
    case "expo":
      return allExpos.filter((e) => e.id === scope.expoId && e.agency_id === scope.agencyId);
    case "none":
      return [];
    case "error":
      return [];
  }
}
