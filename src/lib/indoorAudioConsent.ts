/**
 * Consentement visiteur pour l'usage audio en exposition intérieure.
 * Persisté en localStorage + cookie HTTP (même pattern que cookieConsent).
 */

const STORAGE_KEY = "aimediart_indoor_audio_consent_v1";
const COOKIE_NAME = "aimediart_indoor_audio_ack";
const COOKIE_MAX_AGE_SEC = 12 * 60 * 60; // durée typique d'une visite

export type IndoorAudioConsentRecord = {
  expoId: string;
  visitorClientId: string;
  acceptedAt: string;
};

function readStorage(): IndoorAudioConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IndoorAudioConsentRecord;
    if (!parsed?.expoId?.trim() || !parsed?.visitorClientId?.trim() || !parsed?.acceptedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeBrowserCookie(expoId: string, visitorClientId: string): void {
  if (typeof document === "undefined") return;
  const payload = encodeURIComponent(`${expoId}:${visitorClientId}`);
  document.cookie = `${COOKIE_NAME}=${payload}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

/** True si le visiteur a déjà accepté les règles audio pour cette expo et cette session navigateur. */
export function hasIndoorAudioConsent(expoId: string, visitorClientId: string): boolean {
  const record = readStorage();
  if (!record) return false;
  return record.expoId === expoId.trim() && record.visitorClientId === visitorClientId.trim();
}

/** Enregistre le consentement après clic sur « J'ai compris et j'accepte ». */
export function saveIndoorAudioConsent(expoId: string, visitorClientId: string): void {
  if (typeof window === "undefined") return;
  const record: IndoorAudioConsentRecord = {
    expoId: expoId.trim(),
    visitorClientId: visitorClientId.trim(),
    acceptedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  writeBrowserCookie(record.expoId, record.visitorClientId);
}

export function clearIndoorAudioConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  if (typeof document !== "undefined") {
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}
