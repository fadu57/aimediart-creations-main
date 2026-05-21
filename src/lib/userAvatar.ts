import type { User } from "@supabase/supabase-js";

import { readAvatarFromMeta } from "@/lib/supabaseStorage";
import { supabase } from "@/lib/supabase";
import { fetchUserEditDetails } from "@/lib/userEditDetails";

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
  return trimmed || null;
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

  const hintCandidates = [hints?.seedAvatarUrl, hints?.profileAvatarUrl];
  for (const hint of hintCandidates) {
    const fromHint = normalizeAvatarCandidate(hint);
    if (fromHint) {
      await maybePersistAvatarToProfile(uid, fromHint, null);
      return fromHint;
    }
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
  if (fromProfile) return fromProfile;

  const details = await fetchUserEditDetails(uid);
  const fromDetails = normalizeAvatarCandidate(details?.avatar_url);
  if (fromDetails) {
    await maybePersistAvatarToProfile(uid, fromDetails, fromProfile);
    return fromDetails;
  }

  const isSelf = sessionUser?.id === uid;
  if (isSelf) {
    const fromFreshAuth = await readFreshAuthAvatar(uid);
    if (fromFreshAuth) {
      await maybePersistAvatarToProfile(uid, fromFreshAuth, fromProfile);
      return fromFreshAuth;
    }

    const fromMeta = readAvatarFromMeta(sessionUser?.user_metadata as Record<string, unknown> | undefined);
    if (fromMeta) {
      await maybePersistAvatarToProfile(uid, fromMeta, fromProfile);
      return fromMeta;
    }
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
  if (!rpcErr && Array.isArray(rpcData)) {
    const row = (rpcData as RpcAvatarRow[]).find((entry) => rpcRowUserId(entry) === uid);
    const fromTeamRpc = readAvatarFromRpcRow(row);
    if (fromTeamRpc) {
      await maybePersistAvatarToProfile(uid, fromTeamRpc, fromProfile);
      return fromTeamRpc;
    }
  }

  return null;
}

/** Copie l'URL trouvée ailleurs dans profiles.avatar_url pour les prochains chargements. */
async function maybePersistAvatarToProfile(
  userId: string,
  avatarUrl: string,
  existingProfileUrl: string | null,
): Promise<void> {
  const next = avatarUrl.trim();
  if (!next || existingProfileUrl?.trim()) return;
  const { error } = await supabase.from("profiles").update({ avatar_url: next }).eq("id", userId);
  if (error && import.meta.env.DEV) {
    console.warn("[userAvatar] sync profiles.avatar_url :", error.message);
  }
}
