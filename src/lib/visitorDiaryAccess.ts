/** Accès au carnet réservé à la fin de visite + profil complet. */
const DIARY_UNLOCK_PREFIX = "aimediart_diary_unlocked:";

export type DiaryProfileSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  zipCode: string;
  city: string;
  countryCode: string;
};

export function diaryUnlockStorageKey(expoId?: string | null): string {
  const expo = expoId?.trim();
  return expo ? `${DIARY_UNLOCK_PREFIX}${expo}` : `${DIARY_UNLOCK_PREFIX}global`;
}

export function markDiaryUnlocked(expoId?: string | null): void {
  try {
    sessionStorage.setItem(diaryUnlockStorageKey(expoId), "1");
  } catch {
    /* quota */
  }
}

export function isDiaryUnlocked(expoId?: string | null): boolean {
  try {
    return sessionStorage.getItem(diaryUnlockStorageKey(expoId)) === "1";
  } catch {
    return false;
  }
}

export function clearDiaryUnlock(expoId?: string | null): void {
  try {
    sessionStorage.removeItem(diaryUnlockStorageKey(expoId));
  } catch {
    /* ignore */
  }
}

export function isDiaryProfileComplete(
  profile: {
    first_name?: string | null;
    last_name?: string | null;
    zip_code?: string | null;
    city?: string | null;
    country_code?: string | null;
  } | null | undefined,
  email?: string | null,
): boolean {
  const first = profile?.first_name?.trim() ?? "";
  const last = profile?.last_name?.trim() ?? "";
  const zip = profile?.zip_code?.trim() ?? "";
  const city = profile?.city?.trim() ?? "";
  const countryCode = profile?.country_code?.trim() ?? "";
  const mail = email?.trim() ?? "";
  return Boolean(first && last && mail && zip && city && countryCode);
}
