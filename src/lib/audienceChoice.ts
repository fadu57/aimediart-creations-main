const STORAGE_KEY = "aimediart_audience_choice";

export type AudienceChoice = "organizer" | "visitor";

export function getAudienceChoice(): AudienceChoice | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY)?.trim();
  if (v === "organizer" || v === "visitor") return v;
  return null;
}

export function setAudienceChoice(value: AudienceChoice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
}

export function clearAudienceChoice(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
