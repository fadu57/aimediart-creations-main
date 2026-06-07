/**
 * adminAuth.ts
 * Contrôle d'accès métier pour les Edge Functions réservées aux admins.
 *
 * Stratégie (identique à admin-create-user) :
 * 1. Vérifier le JWT via Supabase Auth (getRequestUserId).
 * 2. Lire role_id depuis public.users via le service-role client (contourne RLS).
 * 3. Fallback JWT metadata si la ligne users est absente (ex. premier login).
 *
 * Rôles admins valides : 1 (admin_general), 2 (super_admin), 3 (developpeur).
 * Rôle 4 (admin_agency) et au-delà = refus.
 */

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getRequestUserId } from "./supabaseAdmin.ts";

export type AdminCheckResult =
  | { authorized: true; userId: string; roleId: number | null }
  | { authorized: false; reason: string };

/**
 * Vérifie que l'utilisateur courant est un admin (role_id < 4).
 * Retourne { authorized: true, userId } ou { authorized: false, reason }.
 */
export async function requireAdminUser(
  req: Request,
  admin: SupabaseClient,
): Promise<AdminCheckResult> {
  // 1. Valider le JWT et récupérer l'userId
  const userId = await getRequestUserId(req);
  if (!userId) {
    return { authorized: false, reason: "JWT manquant ou invalide." };
  }

  // Même logique que le frontend (authUser.ts → fetchUserRoleFromDb) :
  // Source de vérité = public.profiles.role_id pour les admins globaux (1-3)
  // puis agency_users.role_id (plus bas = plus haut rang) en fallback.

  // 2a. public.profiles.role_id — admins globaux sans ligne agency_users
  const { data: profileRow } = await admin
    .from("profiles")
    .select("role_id")
    .eq("id", userId)
    .maybeSingle();

  const profileRoleId = profileRow
    ? Number((profileRow as { role_id?: number | string | null }).role_id ?? NaN)
    : NaN;

  if (Number.isFinite(profileRoleId) && profileRoleId < 4) {
    console.log(`[adminAuth] Accès autorisé via profiles — userId=${userId} role_id=${profileRoleId}`);
    return { authorized: true, userId, roleId: profileRoleId };
  }

  // 2b. agency_users — rang le plus élevé (role_id le plus bas) pour cet utilisateur
  const { data: agencyRow } = await admin
    .from("agency_users")
    .select("role_id")
    .eq("user_id", userId)
    .order("role_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const agencyRoleId = agencyRow
    ? Number((agencyRow as { role_id: number }).role_id)
    : NaN;

  if (Number.isFinite(agencyRoleId) && agencyRoleId < 4) {
    console.log(`[adminAuth] Accès autorisé via agency_users — userId=${userId} role_id=${agencyRoleId}`);
    return { authorized: true, userId, roleId: agencyRoleId };
  }

  // 3. Fallback JWT (user_metadata.role_id ou app_metadata.role_id)
  const jwtRoleId = extractRoleIdFromJwt(req);
  if (jwtRoleId !== null && jwtRoleId < 4) {
    console.log(`[adminAuth] Accès autorisé via JWT metadata — userId=${userId} role_id=${jwtRoleId}`);
    return { authorized: true, userId, roleId: jwtRoleId };
  }

  console.warn(
    `[adminAuth] Accès refusé — userId=${userId}` +
    ` profiles=${profileRoleId} agency=${agencyRoleId} jwt=${jwtRoleId ?? "absent"}`,
  );
  return {
    authorized: false,
    reason: `Accès refusé. role_id requis < 4. profiles: ${profileRoleId}, agency: ${agencyRoleId}, JWT: ${jwtRoleId ?? "inconnu"}.`,
  };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Décode le payload JWT (sans vérification de signature — déjà validée par getRequestUserId).
 * Lit role_id dans user_metadata ou app_metadata.
 */
function extractRoleIdFromJwt(req: Request): number | null {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7).trim();
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Décodage base64url → JSON
    const pad = (s: string) => s + "=".repeat((4 - s.length % 4) % 4);
    const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/"))));

    // Chercher role_id dans user_metadata puis app_metadata
    const fromUserMeta = payload?.user_metadata?.role_id;
    const fromAppMeta  = payload?.app_metadata?.role_id;
    const raw = fromUserMeta ?? fromAppMeta;

    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}
