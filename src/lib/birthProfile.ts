/** Années de naissance proposées dans les formulaires profil (1920–2010). */
export const BIRTH_YEARS = Array.from({ length: 2010 - 1920 + 1 }, (_, i) => String(2010 - i));

export function birthMonthOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: 12 }, (_, idx) => {
    const value = String(idx + 1).padStart(2, "0");
    const raw = new Intl.DateTimeFormat("fr", { month: "long" }).format(new Date(2000, idx, 1));
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    return { value, label };
  });
}

export function readBirthMonthFromMeta(meta: Record<string, unknown> | undefined | null): string {
  if (!meta) return "";
  const raw = meta.birth_month;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? String(n).padStart(2, "0") : raw.trim();
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 12) {
    return String(raw).padStart(2, "0");
  }
  return "";
}

export function readBirthYearFromSources(
  profileBirthYear: number | null | undefined,
  meta: Record<string, unknown> | undefined | null,
): string {
  if (typeof profileBirthYear === "number" && Number.isFinite(profileBirthYear)) {
    return String(profileBirthYear);
  }
  const raw = meta?.birth_year;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}
