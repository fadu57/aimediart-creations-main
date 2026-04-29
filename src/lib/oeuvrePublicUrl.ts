/**
 * Origine publique du site (schema + host + port), sans chemin parasite.
 * Evite VITE_PUBLIC_URL mal regle du type .../œuvre/... qui dupliquerait le segment.
 */
export function getPublicSiteOrigin(): string {
  const raw = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // Chaine non URL complete : on tente d'extraire l'origine
      const m = raw.match(/^(https?:\/\/[^/]+)/i);
      if (m) return m[1];
    }
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * A partir d'un UUID seul ou d'une URL complete vers une œuvre, retourne l'UUID.
 */
export function parseArtworkIdFromInput(raw: string | null | undefined): string {
  let t = (raw ?? "").trim();
  if (!t) return "";
  try {
    t = decodeURIComponent(t);
  } catch {
    /* garder tel quel */
  }

  if (UUID_RE.test(t)) return t;

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fromQuery =
        u.searchParams.get("artwork_id")?.trim() ||
        u.searchParams.get("artworkId")?.trim() ||
        u.searchParams.get("id")?.trim() ||
        "";
      if (fromQuery && UUID_RE.test(fromQuery)) return fromQuery;

      const parts = u.pathname.split("/").filter(Boolean);
      const œuvreIdx = parts.findIndex((p) => p.toLowerCase() === "œuvre");
      if (œuvreIdx >= 0 && parts[œuvreIdx + 1]) {
        const seg = decodeURIComponent(parts[œuvreIdx + 1]);
        if (UUID_RE.test(seg)) return seg;
      }
      const last = parts[parts.length - 1];
      if (last && UUID_RE.test(decodeURIComponent(last))) return decodeURIComponent(last);
    } catch {
      /* ignore */
    }
  }

  const m = t.match(UUID_IN_TEXT_RE);
  return m ? m[0] : "";
}

/** URL absolue a encoder dans un QR : une seule fois `/œuvre/<uuid>`. */
export function buildOeuvreQrUrl(artworkId: string | null | undefined, originOverride?: string | null): string {
  const id = parseArtworkIdFromInput(artworkId);
  const origin = (originOverride ?? getPublicSiteOrigin()).trim().replace(/\/+$/, "");
  if (!origin || !id) return "";
  return `${origin}/œuvre/${encodeURIComponent(id)}`;
}
