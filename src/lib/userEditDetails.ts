import { supabase } from "@/lib/supabase";

export type UserEditDetails = {
  email?: string | null;
  avatar_url?: string | null;
  birth_year?: number | null;
  birth_month?: string | null;
};

/** Même source que la fiche utilisateur (profiles + auth.users metadata). */
export async function fetchUserEditDetails(userId: string): Promise<UserEditDetails | null> {
  const trimmed = userId.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.rpc("get_user_edit_details", { p_user_id: trimmed });
  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[userEditDetails] RPC get_user_edit_details :", error.message);
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  return data as UserEditDetails;
}

export function mergeAvatarFromEditDetails(
  profileAvatarUrl: string | null | undefined,
  details: UserEditDetails | null | undefined,
): string | null {
  const fromProfile = profileAvatarUrl?.trim();
  if (fromProfile) return fromProfile;
  const fromRpc = details?.avatar_url?.trim();
  return fromRpc || null;
}
