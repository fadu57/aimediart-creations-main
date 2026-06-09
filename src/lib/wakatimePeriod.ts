/** Plages temporelles pour le suivi WakaTime (/suivi_temps). */

export type WakaPeriod = "day" | "week" | "month" | "quarter" | "year";

export const WAKA_PERIODS: WakaPeriod[] = ["day", "week", "month", "quarter", "year"];

export type WakaPeriodRange = {
  dateFrom: string;
  dateTo: string;
  offset: number;
  canGoNext: boolean;
};

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDateLocal(d);
}

function quarterStart(ref: Date, offset: number): Date {
  const d = startOfLocalDay(ref);
  const q = Math.floor(d.getMonth() / 3);
  const totalMonths = d.getFullYear() * 12 + q * 3 + offset * 3;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return new Date(year, month, 1);
}

/**
 * Plage [dateFrom, dateTo] inclusive (YYYY-MM-DD, fuseau local).
 * offset 0 = période courante ; négatif = passé.
 */
export function getWakaPeriodRange(
  period: WakaPeriod,
  offset = 0,
  ref = new Date(),
): WakaPeriodRange {
  const today = isoDateLocal(startOfLocalDay(ref));

  if (period === "day") {
    const anchor = addDaysIso(today, offset);
    return {
      dateFrom: anchor,
      dateTo: anchor,
      offset,
      canGoNext: offset < 0,
    };
  }

  if (period === "week") {
    const weekEnd = addDaysIso(today, offset * 7);
    const dateTo = weekEnd > today ? today : weekEnd;
    const dateFrom = addDaysIso(dateTo, -6);
    return {
      dateFrom,
      dateTo,
      offset,
      canGoNext: offset < 0,
    };
  }

  if (period === "month") {
    const refDay = startOfLocalDay(ref);
    const monthStart = new Date(refDay.getFullYear(), refDay.getMonth() + offset, 1);
    const dateFrom = isoDateLocal(monthStart);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    let dateTo = isoDateLocal(monthEnd);
    if (offset === 0 && dateTo > today) dateTo = today;
    return {
      dateFrom,
      dateTo,
      offset,
      canGoNext: offset < 0,
    };
  }

  if (period === "quarter") {
    const start = quarterStart(ref, offset);
    const dateFrom = isoDateLocal(start);
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    let dateTo = isoDateLocal(end);
    if (offset === 0 && dateTo > today) dateTo = today;
    return {
      dateFrom,
      dateTo,
      offset,
      canGoNext: offset < 0,
    };
  }

  const year = startOfLocalDay(ref).getFullYear() + offset;
  const dateFrom = `${year}-01-01`;
  let dateTo = `${year}-12-31`;
  if (offset === 0 && dateTo > today) dateTo = today;

  return {
    dateFrom,
    dateTo,
    offset,
    canGoNext: offset < 0,
  };
}

/** ISO YYYY-MM-DD → dd mmm yyyy (ex. 08 juin 2026). */
export function formatWakaPeriodDate(iso: string, locale = "fr-FR"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleDateString(locale, { month: "short" }).replace(/\./g, "").trim();
  return `${m[3]} ${month} ${m[1]}`;
}
