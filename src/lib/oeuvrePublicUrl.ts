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

/** Origine utilisée pour les QR imprimés lorsqu’aucun override ni env public fiable (ex. localhost → prod). */
export const DEFAULT_QR_SITE_ORIGIN = "https://www.aimediart.com";

/**
 * Origine pour encoder un QR : préfixe explicite (Réglages, `public_site_origin`) si fourni,
 * sinon `VITE_PUBLIC_URL` / origine courante (hors localhost) puis `www.aimediart.com`.
 */
export function resolveQrSiteOrigin(originOverride?: string | null): string {
  const fromSettings = (originOverride ?? "").trim().replace(/\/+$/, "");
  if (fromSettings) return fromSettings;
  const fromEnv = getPublicSiteOrigin().replace(/\/+$/, "");
  if (fromEnv && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv)) {
    return fromEnv;
  }
  return DEFAULT_QR_SITE_ORIGIN;
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

  const parseFromUrl = (u: URL): string => {
      const fromQuery =
        u.searchParams.get("artwork_id")?.trim() ||
        u.searchParams.get("artworkId")?.trim() ||
        u.searchParams.get("id")?.trim() ||
        "";
      if (fromQuery && UUID_RE.test(fromQuery)) return fromQuery;

      const parts = u.pathname.split("/").filter(Boolean);
      const œuvreIdx = parts.findIndex((p) =>
        ["artwork", "artworks", "œuvre", "oeuvre"].includes(p.toLowerCase()),
      );
      if (œuvreIdx >= 0 && parts[œuvreIdx + 1]) {
        const seg = decodeURIComponent(parts[œuvreIdx + 1]);
        if (UUID_RE.test(seg)) return seg;
      }
      const last = parts[parts.length - 1];
      if (last && UUID_RE.test(decodeURIComponent(last))) return decodeURIComponent(last);
      return "";
  };

  if (t.startsWith("/")) {
    try {
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://local.invalid";
      const fromPath = parseFromUrl(new URL(t, base));
      if (fromPath) return fromPath;
    } catch {
      /* ignore */
    }
  }

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fromUrl = parseFromUrl(u);
      if (fromUrl) return fromUrl;
    } catch {
      /* ignore */
    }
  }

  const m = t.match(UUID_IN_TEXT_RE);
  return m ? m[0] : "";
}

export type QrScanTarget =
  | { kind: "artwork"; artworkId: string }
  | { kind: "artwork_group"; groupId: string }
  | { kind: "expo"; expoId: string };

/** Extrait l'UUID d'un regroupement depuis une URL ou un UUID seul. */
export function parseArtworkGroupIdFromInput(raw: string | null | undefined): string {
  let t = (raw ?? "").trim();
  if (!t) return "";
  try {
    t = decodeURIComponent(t);
  } catch {
    /* garder tel quel */
  }

  if (UUID_RE.test(t)) return t;

  const parseFromUrl = (u: URL): string => {
    const fromQuery =
      u.searchParams.get("group_id")?.trim() ||
      u.searchParams.get("groupId")?.trim() ||
      "";
    if (fromQuery && UUID_RE.test(fromQuery)) return fromQuery;

    const parts = u.pathname.split("/").filter(Boolean);
    const groupIdx = parts.findIndex((p) =>
      ["artwork-group", "artwork_group", "artworkgroup"].includes(p.toLowerCase()),
    );
    if (groupIdx >= 0 && parts[groupIdx + 1]) {
      const seg = decodeURIComponent(parts[groupIdx + 1]);
      if (UUID_RE.test(seg)) return seg;
    }
    return "";
  };

  if (t.startsWith("/")) {
    try {
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://local.invalid";
      const fromPath = parseFromUrl(new URL(t, base));
      if (fromPath) return fromPath;
    } catch {
      /* ignore */
    }
  }

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fromUrl = parseFromUrl(u);
      if (fromUrl) return fromUrl;
    } catch {
      /* ignore */
    }
  }

  const m = t.match(UUID_IN_TEXT_RE);
  return m ? m[0] : "";
}

/** Interprète le contenu d'un QR (œuvre, groupe, expo, UUID seul, URL absolue ou relative). */
export function resolveScanTargetFromQr(raw: string | null | undefined): QrScanTarget | null {
  let t = (raw ?? "").trim();
  if (!t) return null;

  let href = t;
  if (t.startsWith("/")) {
    try {
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://local.invalid";
      href = new URL(t, base).href;
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href);
      const groupId = parseArtworkGroupIdFromInput(u.href);
      if (groupId) return { kind: "artwork_group", groupId };

      const artworkId = parseArtworkIdFromInput(u.href);
      if (artworkId) return { kind: "artwork", artworkId };

      if (/\/scan(-work\d*)?(\/|$)/i.test(u.pathname)) {
        const ex = u.searchParams.get("expo_id")?.trim() || "";
        if (ex && UUID_RE.test(ex)) return { kind: "expo", expoId: ex };
      }
    } catch {
      return null;
    }
    return null;
  }

  const groupId = parseArtworkGroupIdFromInput(t);
  if (groupId && (/\/artwork-group\//i.test(t) || /group_id=/i.test(t))) {
    return { kind: "artwork_group", groupId };
  }

  const artworkId = parseArtworkIdFromInput(t);
  if (artworkId) return { kind: "artwork", artworkId };

  return null;
}

/**
 * URL absolue encodée dans les QR œuvre :
 * `{préfixe}/artwork/{artwork_id}` puis `?expo_id={uuid}` si `expoId` est un UUID valide
 * (typiquement `artworks.artwork_expo_id`).
 *
 * Le **préfixe** attendu est la valeur Réglages « préfixe QR » (`public_site_origin` dans
 * `settings_general_links_qr`) — obtenir via `fetchQrPublicSiteOriginFromSettings()`, passée en
 * `originOverride`. Si vide, repli : `resolveQrSiteOrigin` (env public / hors localhost / prod).
 * (Les anciens QR `/artworks/:id` sont encore pris en charge côté routage par redirection.)
 */
export function buildOeuvreQrUrl(
  artworkId: string | null | undefined,
  originOverride?: string | null,
  expoId?: string | null,
): string {
  const id = parseArtworkIdFromInput(artworkId);
  const origin = resolveQrSiteOrigin(originOverride);
  if (!id) return "";
  const base = `${origin}/artwork/${encodeURIComponent(id)}`;
  const ex = (expoId ?? "").trim();
  if (ex && UUID_RE.test(ex)) {
    return `${base}?expo_id=${encodeURIComponent(ex)}`;
  }
  return base;
}

/**
 * URL absolue encodée dans les QR regroupement :
 * `{préfixe}/artwork-group/{group_id}` puis `?expo_id={uuid}` si fourni.
 */
export function buildArtworkGroupQrUrl(
  groupId: string | null | undefined,
  originOverride?: string | null,
  expoId?: string | null,
): string {
  const id = parseArtworkGroupIdFromInput(groupId);
  const origin = resolveQrSiteOrigin(originOverride);
  if (!id) return "";
  const base = `${origin}/artwork-group/${encodeURIComponent(id)}`;
  const ex = (expoId ?? "").trim();
  if (ex && UUID_RE.test(ex)) {
    return `${base}?expo_id=${encodeURIComponent(ex)}`;
  }
  return base;
}
