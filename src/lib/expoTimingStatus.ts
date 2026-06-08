/** Catégorie temporelle d'une exposition (dates `date_expo_du` / `date_expo_au`). */
export type ExpoTimingCategory = "upcoming" | "ongoing" | "finished" | "permanent";

export const EXPO_TIMING_CATEGORY_ORDER: ExpoTimingCategory[] = [
  "upcoming",
  "ongoing",
  "finished",
  "permanent",
];

/** Parse une date ISO `YYYY-MM-DD` (champs expos). */
export function parseExpoYmdDate(value: unknown): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * - À venir : date de début strictement après aujourd'hui
 * - Permanentes : pas de date de fin (`date_expo_au` vide), début absent ou déjà passé
 * - Terminées : date de fin strictement avant aujourd'hui
 * - En cours : date de fin renseignée, non dépassée, début absent ou déjà passé
 */
export function getExpoTimingCategory(
  dateDu: string | null | undefined,
  dateAu: string | null | undefined,
  now: Date = startOfToday(),
): ExpoTimingCategory {
  const du = parseExpoYmdDate(dateDu);
  const au = parseExpoYmdDate(dateAu);

  if (!au) {
    if (du && du > now) return "upcoming";
    return "permanent";
  }
  if (au < now) return "finished";
  if (du && du > now) return "upcoming";
  return "ongoing";
}

export function groupExposByTimingCategory<T extends { date_expo_du?: string | null; date_expo_au?: string | null }>(
  expos: T[],
): Record<ExpoTimingCategory, T[]> {
  const groups: Record<ExpoTimingCategory, T[]> = {
    upcoming: [],
    ongoing: [],
    finished: [],
    permanent: [],
  };
  for (const ex of expos) {
    groups[getExpoTimingCategory(ex.date_expo_du, ex.date_expo_au)].push(ex);
  }
  return groups;
}
