const VISITOR_UUID_STORAGE_KEY = "visitor_uuid";

/** Génère/récupère un identifiant anonyme persistant côté navigateur. */
export function getOrCreateVisitorUuid(): string {
  if (typeof window === "undefined") return "";
  const current = window.localStorage.getItem(VISITOR_UUID_STORAGE_KEY)?.trim();
  if (current) return current;

  const created =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(VISITOR_UUID_STORAGE_KEY, created);
  return created;
}

/** Lit l'identifiant existant sans le créer. */
export function getStoredVisitorUuid(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(VISITOR_UUID_STORAGE_KEY)?.trim();
  return v || null;
}

/** Données minimales non matérielles pour suivi anonyme. */
export function getVisitorLocaleMetadata(): { language: string | null; timezone: string | null } {
  const language = typeof navigator !== "undefined" ? navigator.language?.trim() || null : null;
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    timezone = null;
  }
  return { language, timezone };
}

