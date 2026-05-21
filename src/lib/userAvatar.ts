import type { User } from "@supabase/supabase-js";

import { readAvatarFromMeta } from "@/lib/supabaseStorage";
import { supabase } from "@/lib/supabase";
import { fetchUserEditDetails } from "@/lib/userEditDetails";
import {
  findCanonicalUserPhotoPublicUrl,
  isArtistCatalogPhotoUrl,
  isCanonicalUserPhotoUrl,
} from "@/lib/userPhotoUrl";

export type ResolveUserAvatarHints = {
  /** Valeur déjà connue (ex. profiles.avatar_url chargé par le dashboard). */
  profileAvatarUrl?: string | null;
  /** Valeur transmise par une liste RPC / seed UI. */
  seedAvatarUrl?: string | null;
};

type RpcAvatarRow = {
  id?: string | null;
  user_id?: string | null;
  avatar_url?: string | null;
  user_photo_url?: string | null;
  photo_url?: string | null;
  picture?: string | null;
};

function rpcRowUserId(row: RpcAvatarRow): string {
  const raw = row.id ?? row.user_id;
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeAvatarCandidate(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || isArtistCatalogPhotoUrl(trimmed)) return null;
  return trimmed;
}

/** Préfère une URL canonique photos/users/{userId}.* quand plusieurs candidats existent. */
function pickUserAvatarUrl(userId: string, ...candidates: Array<string | null | undefined>): string | null {
  const uid = userId.trim();
  const normalized = candidates
    .map((candidate) => normalizeAvatarCandidate(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  const canonical = normalized.find((candidate) => isCanonicalUserPhotoUrl(uid, candidate));
  if (canonical) return canonical;
  return normalized[0] ?? null;
}

/** Extrait une URL photo depuis une ligne RPC (noms de colonnes hétérogènes). */
export function readAvatarFromRpcRow(row: RpcAvatarRow | null | undefined): string | null {
  if (!row) return null;
  for (const key of ["avatar_url", "user_photo_url", "photo_url", "picture"] as const) {
    const candidate = normalizeAvatarCandidate(row[key]);
    if (candidate) return candidate;
  }
  return null;
}

async function readFreshAuthAvatar(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== userId) return null;
  return readAvatarFromMeta(data.user.user_metadata as Record<string, unknown> | undefined) || null;
}

/**
 * Résout l'URL photo — même chaîne que enrichUserRowForEdit (Users.tsx).
 * Ordre : hints → profiles → get_user_edit_details → auth → RPC (URLs en base uniquement)
 */
export async function resolveUserAvatarUrl(
  userId: string,
  sessionUser?: User | null,
  hints?: ResolveUserAvatarHints,
): Promise<string | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const canonicalExisting = await findCanonicalUserPhotoPublicUrl(uid);
  if (canonicalExisting) {
    return canonicalExisting;
  }

  const fromHint = pickUserAvatarUrl(uid, hints?.seedAvatarUrl, hints?.profileAvatarUrl);
  if (fromHint) {
    return fromHint;
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", uid)
    .maybeSingle();

  if (profileErr && import.meta.env.DEV) {
    console.warn("[userAvatar] lecture profiles.avatar_url :", profileErr.message);
  }

  const fromProfile = normalizeAvatarCandidate(
    (profile as { avatar_url?: string | null } | null)?.avatar_url,
  );
  if (fromProfile) {
    if (import.meta.env.DEV && !isCanonicalUserPhotoUrl(uid, fromProfile)) {
      console.warn(
        "[userAvatar] avatar_url non canonique (legacy user/artiste mélangé ?) :",
        uid,
        fromProfile,
      );
    }
    return fromProfile;
  }

  const details = await fetchUserEditDetails(uid);
  const fromDetails = normalizeAvatarCandidate(details?.avatar_url);
  if (fromDetails) return fromDetails;

  const isSelf = sessionUser?.id === uid;
  if (isSelf) {
    const fromFreshAuth = await readFreshAuthAvatar(uid);
    if (fromFreshAuth) return fromFreshAuth;

    const fromMeta = readAvatarFromMeta(sessionUser?.user_metadata as Record<string, unknown> | undefined);
    if (fromMeta) return fromMeta;
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
  if (!rpcErr && Array.isArray(rpcData)) {
    const row = (rpcData as RpcAvatarRow[]).find((entry) => rpcRowUserId(entry) === uid);
    const fromTeamRpc = readAvatarFromRpcRow(row);
    if (fromTeamRpc) return fromTeamRpc;
  }

  return null;
}
