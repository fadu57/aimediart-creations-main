export const SUPPORTED_LANGS = ["fr", "en", "de", "es", "it"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Namespaces chargés au premier paint sur /organisation (léger). */
export const VITRINE_CORE_NAMESPACES = ["header", "home", "landing"] as const;

/** Pages légales publiques — chargés à la demande. */
export const VITRINE_LEGAL_NAMESPACES = [
  "cgv",
  "cookies",
  "privacy",
  "terms",
  "ai_policy",
  "legal_pack",
] as const;

/** Backoffice + visiteur — chargés hors vitrine marketing. */
export const APP_NAMESPACES = [
  "catalogue",
  "artists",
  "statistiques",
  "agencies",
  "expos",
  "utilisateurs",
  "artwork_modal",
  "visitor",
  "auth",
  "trash",
  "settings",
  "sponsors",
] as const;

export const ALL_I18N_NAMESPACES = [
  ...VITRINE_CORE_NAMESPACES,
  ...VITRINE_LEGAL_NAMESPACES,
  ...APP_NAMESPACES,
] as const;

const LEGAL_PATH_TO_NAMESPACE: Record<string, (typeof VITRINE_LEGAL_NAMESPACES)[number]> = {
  "/cgv": "cgv",
  "/cookies": "cookies",
  "/privacy": "privacy",
  "/terms": "terms",
  "/ai-policy": "ai_policy",
};

export function isPublicMarketingPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/organisation" || path.startsWith("/organisation/")) return true;
  if (path in LEGAL_PATH_TO_NAMESPACE) return true;
  if (path === "/expo") return true;
  return false;
}

export function legalNamespaceForPath(pathname: string): (typeof VITRINE_LEGAL_NAMESPACES)[number] | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return LEGAL_PATH_TO_NAMESPACE[path] ?? null;
}

/** Vitrine /organisation et pages légales publiques (CGV, cookies, etc.). */
export function isOrganisationVitrineAreaPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/organisation" || path.startsWith("/organisation/")) return true;
  return path in LEGAL_PATH_TO_NAMESPACE;
}

export function getInitialLanguage(): SupportedLang {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem("ui_language");
  return (SUPPORTED_LANGS as readonly string[]).includes(stored ?? "")
    ? (stored as SupportedLang)
    : "fr";
}
