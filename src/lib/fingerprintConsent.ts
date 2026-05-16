const FP_STORAGE_KEY = "aimediart_fpjs_visitor_id";
const CONSENT_KEY = "aimediart_anonymous_tracking_consent";

export type TrackingConsentState = "granted" | "denied";

export function getAnonymousTrackingConsent(): TrackingConsentState | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(CONSENT_KEY)?.trim();
  if (v === "granted" || v === "denied") return v;
  return null;
}

export function setAnonymousTrackingConsent(value: TrackingConsentState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, value);
  if (value === "denied") {
    window.localStorage.removeItem(FP_STORAGE_KEY);
  }
}

export function getStoredFingerprintJsId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(FP_STORAGE_KEY)?.trim() || null;
}

/**
 * Identifiant FingerprintJS (bibliothèque @fingerprintjs/fingerprintjs), uniquement si consentement explicite.
 * Stocké en local ; aucun appel réseau vers un service tiers autre que le script de la lib côté navigateur.
 */
export async function loadOrCreateFingerprintJsId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (getAnonymousTrackingConsent() !== "granted") return null;
  const existing = getStoredFingerprintJsId();
  if (existing) return existing;
  try {
    const { default: FingerprintJS } = await import("@fingerprintjs/fingerprintjs");
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const id = result.visitorId?.trim();
    if (id) window.localStorage.setItem(FP_STORAGE_KEY, id);
    return id || null;
  } catch {
    return null;
  }
}
