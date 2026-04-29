const EXPO_ID_STORAGE_KEY = "current_expo_id";

export function setCurrentExpoId(expoId: string): void {
  if (typeof window === "undefined") return;
  const normalized = expoId.trim();
  if (!normalized) return;
  window.localStorage.setItem(EXPO_ID_STORAGE_KEY, normalized);
}

export function getCurrentExpoId(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(EXPO_ID_STORAGE_KEY)?.trim();
  return v || null;
}

