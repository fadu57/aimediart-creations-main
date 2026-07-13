const STORAGE_KEY = "aimediart_visitor_age";

export const MIN_VISITOR_AGE = 1;
export const MAX_VISITOR_AGE = 120;

export function parseVisitorAge(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < MIN_VISITOR_AGE || n > MAX_VISITOR_AGE) return null;
  return n;
}

export function setStoredVisitorAge(age: number): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(age));
  } catch {
    /* quota */
  }
}

export function getStoredVisitorAge(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseVisitorAge(raw);
  } catch {
    return null;
  }
}

export function getStoredVisitorAgeInput(): string {
  const age = getStoredVisitorAge();
  return age != null ? String(age) : "";
}
