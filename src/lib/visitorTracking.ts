/**
 * Capture silencieuse géoloc (ipapi.co, HTTPS) + empreinte navigateur + détails device (JSONB).
 * Clé sessionStorage partagée avec la page /login lorsque `from=home-tarifs`.
 */
export const SESSION_LOGIN_TRACKER_KEY = "aimediart_login_tracker";

const IPAPI_URL = "https://ipapi.co/json/";

const DEFAULT_COUNTRY = "FR";
/** Repli si `navigator.language` est absent (navigateur minimal, SSR). */
const DEFAULT_LANG = "fr";

export type VisitorDeviceDetails = {
  os: string;
  browser: string;
  resolution: string;
  language: string;
  /** Tronqué pour limiter la taille du JSONB */
  userAgentSnippet?: string;
};

export type VisitorCaptureResult = {
  ip: string;
  city: string;
  zip: string;
  countryCode: string;
  timezone: string;
  /** Langue navigateur (ex. `fr-FR`), pour URL `lang=` et colonne `user_language`. */
  browserLanguage: string;
  fingerprint: string;
  deviceDetails: VisitorDeviceDetails;
};

type IpApiPayload = {
  ip?: string | null;
  city?: string | null;
  postal?: string | null;
  country_code?: string | null;
  timezone?: string | null;
  error?: boolean | null;
  reason?: string | null;
};

function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseUaHints(ua: string): { os: string; browser: string } {
  const u = ua || "";
  let os = "Inconnu";
  if (/Windows NT 10/.test(u)) os = "Windows 10/11";
  else if (/Windows NT/.test(u)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(u)) os = "macOS";
  else if (/Android/.test(u)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(u)) os = "iOS";
  else if (/Linux/.test(u)) os = "Linux";

  let browser = "Inconnu";
  if (/Edg\//.test(u)) browser = "Edge";
  else if (/OPR\//.test(u) || /Opera/.test(u)) browser = "Opera";
  else if (/Firefox\//.test(u)) browser = "Firefox";
  else if (/Chrome\//.test(u) && !/Edg\//.test(u)) browser = "Chrome";
  else if (/Safari\//.test(u) && !/Chrome\//.test(u)) browser = "Safari";

  return { os, browser };
}

/** Langue UI navigateur ; repli `fr` si indisponible. */
export function resolveNavigatorLanguage(): string {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  const primary = navigator.language?.trim();
  if (primary) return primary;
  const fallback = navigator.languages?.map((l) => l?.trim()).find(Boolean);
  if (fallback) return fallback;
  return DEFAULT_LANG;
}

function collectDeviceDetails(): VisitorDeviceDetails {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const { os, browser } = parseUaHints(ua);
  const w = typeof screen !== "undefined" ? screen.width : 0;
  const h = typeof screen !== "undefined" ? screen.height : 0;
  const language = resolveNavigatorLanguage();
  const snippet = ua.length > 400 ? `${ua.slice(0, 400)}…` : ua;
  return {
    os,
    browser,
    resolution: w && h ? `${w}x${h}` : "0x0",
    language,
    userAgentSnippet: snippet || undefined,
  };
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
      h = (h * 33) ^ text.charCodeAt(i);
    }
    return `djb2_${(h >>> 0).toString(16)}`;
  }
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildFingerprint(device: VisitorDeviceDetails, ua: string): Promise<string> {
  const tz = resolveLocalTimezone();
  const raw = [ua, device.resolution, device.language, tz, device.os, device.browser].join("|");
  return sha256Hex(raw);
}

/**
 * Récupère géoloc (ipapi.co, HTTPS), fingerprint (hash SHA-256 UA + résolution + langue + fuseau),
 * et détails device pour `user_device_details` (JSONB).
 */
export async function getVisitorData(): Promise<VisitorCaptureResult> {
  const deviceDetails = collectDeviceDetails();
  const browserLanguage = deviceDetails.language || DEFAULT_LANG;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const fingerprint = await buildFingerprint(deviceDetails, ua);
  const localTz = resolveLocalTimezone();

  let ip = "";
  let city = "";
  let zip = "";
  let countryCode = DEFAULT_COUNTRY;
  let timezone = localTz;

  try {
    const res = await fetch(IPAPI_URL, {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as IpApiPayload;
      if (!data.error && data.reason == null) {
        ip = (data.ip ?? "").trim();
        city = (data.city ?? "").trim();
        zip = (data.postal ?? "").trim();
        const cc = (data.country_code ?? "").trim().toUpperCase();
        if (cc.length === 2) countryCode = cc;
        const apiTz = (data.timezone ?? "").trim();
        if (apiTz) timezone = apiTz;
      }
    }
  } catch {
    /* réseau, AdBlock, CORS rare : défauts ci-dessous */
  }

  return {
    ip,
    city,
    zip,
    countryCode: countryCode || DEFAULT_COUNTRY,
    timezone: timezone || localTz,
    browserLanguage,
    fingerprint,
    deviceDetails,
  };
}

export type LoginTrackerSessionPayload = {
  ip: string | null;
  deviceDetails: VisitorDeviceDetails;
  fingerprint: string;
};

/** Sérialise IP, device et fingerprint (secours si l’URL est tronquée ou chargée trop tôt). */
export function persistLoginTrackerSession(payload: LoginTrackerSessionPayload): void {
  try {
    sessionStorage.setItem(SESSION_LOGIN_TRACKER_KEY, JSON.stringify(payload));
  } catch {
    /* quota / navigation privée */
  }
}

export function readLoginTrackerSession(): {
  ip: string | null;
  deviceDetails: VisitorDeviceDetails | null;
  fingerprint: string | null;
} {
  try {
    const raw = sessionStorage.getItem(SESSION_LOGIN_TRACKER_KEY);
    if (!raw) return { ip: null, deviceDetails: null, fingerprint: null };
    const parsed = JSON.parse(raw) as Partial<LoginTrackerSessionPayload>;
    return {
      ip: typeof parsed.ip === "string" ? parsed.ip : null,
      deviceDetails: parsed.deviceDetails ?? null,
      fingerprint: typeof parsed.fingerprint === "string" ? parsed.fingerprint : null,
    };
  } catch {
    return { ip: null, deviceDetails: null, fingerprint: null };
  }
}

export function clearLoginTrackerSession(): void {
  try {
    sessionStorage.removeItem(SESSION_LOGIN_TRACKER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Construit l’URL /login avec `from=home-tarifs`, le plan optionnel, et les paramètres geo/fp courts.
 */
export function buildLoginHrefFromVisitor(
  extra: Record<string, string>,
  visitor: VisitorCaptureResult | null,
): string {
  const p = new URLSearchParams({ from: "home-tarifs", ...extra });
  const lang = (visitor?.browserLanguage || DEFAULT_LANG).slice(0, 48);
  p.set("lang", lang);
  if (visitor) {
    if (visitor.city) p.set("city", visitor.city);
    if (visitor.zip) p.set("zip", visitor.zip);
    p.set("country", (visitor.countryCode || DEFAULT_COUNTRY).slice(0, 2).toUpperCase());
    if (visitor.fingerprint) p.set("fp", visitor.fingerprint);
    if (visitor.timezone) p.set("tz", visitor.timezone);
  } else {
    p.set("country", DEFAULT_COUNTRY);
    p.set("tz", resolveLocalTimezone());
  }
  return `/login?${p.toString()}`;
}
