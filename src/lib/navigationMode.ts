export type NavigationMode = "global" | "organisation";

const STORAGE_PREFIX = "aimediart.navigation_mode.v1";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}.${userId.trim()}`;
}

export function readNavigationMode(userId: string | null | undefined): NavigationMode | null {
  if (typeof window === "undefined" || !userId?.trim()) return null;
  const raw = window.localStorage.getItem(storageKey(userId))?.trim();
  if (raw === "global" || raw === "organisation") return raw;
  return null;
}

export function writeNavigationMode(userId: string, mode: NavigationMode): void {
  if (typeof window === "undefined" || !userId.trim()) return;
  window.localStorage.setItem(storageKey(userId.trim()), mode);
}

export function clearNavigationMode(userId: string): void {
  if (typeof window === "undefined" || !userId.trim()) return;
  window.localStorage.removeItem(storageKey(userId.trim()));
}
