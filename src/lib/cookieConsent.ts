import { loadOrCreateFingerprintJsId, setAnonymousTrackingConsent } from "@/lib/fingerprintConsent";

const BANNER_STORAGE_KEY = "aimediart_cookie_banner_v1";
const COOKIE_NAME = "aimediart_cookie_consent";
const COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

export type CookieBannerChoice = "accepted" | "refused";

export function getCookieBannerChoice(): CookieBannerChoice | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(BANNER_STORAGE_KEY)?.trim();
  if (v === "accepted" || v === "refused") return v;
  return null;
}

function writeBrowserCookie(value: CookieBannerChoice): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

/**
 * Enregistre le choix bannière (localStorage + cookie HTTP), synchronise le consentement traceur anonyme.
 */
export function applyCookieBannerChoice(choice: CookieBannerChoice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BANNER_STORAGE_KEY, choice);
  writeBrowserCookie(choice);
  if (choice === "accepted") {
    setAnonymousTrackingConsent("granted");
    void loadOrCreateFingerprintJsId();
  } else {
    setAnonymousTrackingConsent("denied");
  }
}
