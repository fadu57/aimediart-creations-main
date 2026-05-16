/**
 * URLs des documents légaux. En production, préférez définir VITE_LEGAL_CGV_URL et VITE_LEGAL_RGPD_URL ;
 * à défaut, renvoie des pages internes de substitution (`/cgv`, `/legal/rgpd`).
 */
export function getLegalCgvHref(): string {
  const fromEnv = typeof import.meta.env.VITE_LEGAL_CGV_URL === "string" ? import.meta.env.VITE_LEGAL_CGV_URL.trim() : "";
  return fromEnv || "/cgv";
}

export function getLegalRgpdHref(): string {
  const fromEnv = typeof import.meta.env.VITE_LEGAL_RGPD_URL === "string" ? import.meta.env.VITE_LEGAL_RGPD_URL.trim() : "";
  return fromEnv || "/legal/rgpd";
}

/** Lien externe si l’URL commence par http(s), sinon route interne. */
export function isExternalLegalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
