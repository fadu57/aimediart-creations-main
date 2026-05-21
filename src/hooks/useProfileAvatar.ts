import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { resolveProfileAvatarSource } from "@/components/ProfileAvatarImage";
import { resolveUserAvatarUrl } from "@/lib/userAvatar";

/** Charge l'avatar avec la même logique que la fiche utilisateur (Users.tsx). */
export function useProfileAvatar(
  userId: string | null | undefined,
  sessionUser: User | null | undefined,
  refreshKey = 0,
  profileAvatarUrl?: string | null,
): string | null {
  const syncFallback = resolveProfileAvatarSource(profileAvatarUrl, sessionUser?.user_metadata);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(syncFallback);

  useEffect(() => {
    const immediate = resolveProfileAvatarSource(profileAvatarUrl, sessionUser?.user_metadata);
    setAvatarUrl(immediate);

    if (!userId?.trim()) {
      setAvatarUrl(null);
      return;
    }

    let cancelled = false;
    void resolveUserAvatarUrl(userId, sessionUser, { profileAvatarUrl }).then((url) => {
      if (!cancelled) setAvatarUrl(url || immediate);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, sessionUser?.id, refreshKey, profileAvatarUrl]);

  return avatarUrl;
}
