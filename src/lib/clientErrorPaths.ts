/** Préfixes normalisés (sans accents, minuscules). */
function normalizePath(pathname: string): string {
  return decodeURIComponent(pathname || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe");
}

const VISITOR_PATH_PREFIXES = [
  "/visitor",
  "/register",
  "/register_visitor",
  "/scan",
  "/summary",
  "/artwork",
  "/artworks",
  "/oeuvre",
  "/oeuvres_artiste",
  "/artworks_artist",
] as const;

const ORGANIZER_PATH_PREFIXES = [
  "/dashboard",
  "/artistes",
  "/catalogue",
  "/agencies",
  "/user",
  "/utilisateurs",
  "/expos",
  "/prompts",
  "/statistiques",
  "/settings",
  "/suivi_temps",
  "/suivi_tokens",
  "/suivi_erreurs_visiteurs",
  "/suivi_erreurs_organisateurs",
  "/visiteurs-corbeille",
  "/expos-corbeille",
  "/catalogue-corbeille",
  "/agencies-corbeille",
  "/artistes-corbeille",
  "/utilisateurs-corbeille",
] as const;

function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Parcours visiteur (VisitorShell + QR / œuvre / inscription). */
export function isVisitorFacingPath(pathname: string): boolean {
  return matchesPrefix(normalizePath(pathname), VISITOR_PATH_PREFIXES);
}

/** Backoffice organisateur (RequireBackoffice + login staff). */
export function isOrganizerFacingPath(pathname: string): boolean {
  return matchesPrefix(normalizePath(pathname), ORGANIZER_PATH_PREFIXES);
}
