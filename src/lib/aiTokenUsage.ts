/**
 * Suivi de consommation de tokens IA — table `ai_usage_logs`.
 */

import i18n from "@/i18n/config";
import { supabase } from "@/lib/supabase";
import { usageAggregationKey } from "@/lib/aiUsageModelId";

export type TokenPeriod = "day" | "week" | "month";

export type AiUsageLogRow = {
  id: string;
  model_id: string;
  provider: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  artwork_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type TokenUsageFilters = {
  dateFrom: string;
  dateTo: string;
  provider?: string;
  modelId?: string;
};

export type TokenUsageSummary = {
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type TokenBreakdownItem = {
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
};

export type TokenTimeSeriesPoint = {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
};

const PAGE_SIZE = 1000;

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function todayIsoLocal(): string {
  return isoDateLocal(startOfLocalDay(new Date()));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDateLocal(d);
}

const DAY_CHART_LOOKBACK = 3;

/** ISO YYYY-MM-DD → dd mmm yyyy (ex. 08 juin 2026). */
export function formatTokenUsageDate(iso: string, locale = "fr-FR"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleDateString(locale, { month: "short" }).replace(/\./g, "").trim();
  return `${m[3]} ${month} ${m[1]}`;
}

/** Axe graphique évolution tokens : jj/mm. */
export function formatTokenChartDayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

/** Plage de chargement : en mode jour, inclut J-3…J pour le graphique. */
export function getTokenFetchRange(
  period: TokenPeriod,
  range: Pick<TokenPeriodRange, "dateFrom" | "dateTo">,
): TokenUsageFilters {
  if (period === "day") {
    return {
      dateFrom: addDaysIso(range.dateTo, -DAY_CHART_LOOKBACK),
      dateTo: range.dateTo,
    };
  }
  return { dateFrom: range.dateFrom, dateTo: range.dateTo };
}

/** Plage affichée sur le graphique temporel. */
export function getTokenChartRange(
  period: TokenPeriod,
  range: Pick<TokenPeriodRange, "dateFrom" | "dateTo">,
): { dateFrom: string; dateTo: string } {
  if (period === "day") {
    return {
      dateFrom: addDaysIso(range.dateTo, -DAY_CHART_LOOKBACK),
      dateTo: range.dateTo,
    };
  }
  return { dateFrom: range.dateFrom, dateTo: range.dateTo };
}

/** Filtre les lignes sur le jour sélectionné (mode jour). */
export function filterTokenRowsToAnchorDay(
  rows: AiUsageLogRow[],
  anchorDay: string,
): AiUsageLogRow[] {
  return rows.filter((r) => (r.created_at?.slice(0, 10) ?? "") === anchorDay);
}

/** Filtre les lignes par fournisseur (identité exacte sur `provider`). */
export function filterTokenRowsByProvider(
  rows: AiUsageLogRow[],
  provider?: string,
): AiUsageLogRow[] {
  const key = (provider ?? "").trim();
  if (!key) return rows;
  return rows.filter((r) => (r.provider ?? "").trim() === key);
}

/** Liste triée des fournisseurs distincts présents dans les lignes. */
export function listDistinctProviders(rows: AiUsageLogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const p = (r.provider ?? "").trim();
    if (p) set.add(p);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

export type TokenPeriodRange = {
  dateFrom: string;
  dateTo: string;
  /** 0 = période courante (ancrée sur aujourd'hui), négatif = passé. */
  offset: number;
  canGoNext: boolean;
};

/**
 * Plage [dateFrom, dateTo] inclusive (YYYY-MM-DD, fuseau local).
 * offset 0 = jour / semaine glissante / mois courant ; -1 = période précédente, etc.
 */
export function getTokenPeriodRange(
  period: TokenPeriod,
  offset = 0,
  ref = new Date(),
): TokenPeriodRange {
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

/** Première et dernière date avec des lignes dans `ai_usage_logs`. */
export async function fetchTokenUsageDateBounds(): Promise<{
  earliest: string | null;
  latest: string | null;
  error: string | null;
}> {
  const { data: earliestRow, error: errEarliest } = await supabase
    .from("ai_usage_logs")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (errEarliest) {
    return { earliest: null, latest: null, error: errEarliest.message };
  }

  const { data: latestRow, error: errLatest } = await supabase
    .from("ai_usage_logs")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errLatest) {
    return { earliest: null, latest: null, error: errLatest.message };
  }

  return {
    earliest: earliestRow?.created_at?.slice(0, 10) ?? null,
    latest: latestRow?.created_at?.slice(0, 10) ?? null,
    error: null,
  };
}

function rowTokens(r: AiUsageLogRow): {
  prompt: number;
  completion: number;
  total: number;
} {
  const prompt = Math.max(0, Number(r.prompt_tokens ?? 0));
  const completion = Math.max(0, Number(r.completion_tokens ?? 0));
  const totalRaw = Number(r.total_tokens ?? 0);
  const total = totalRaw > 0 ? totalRaw : prompt + completion;
  return { prompt, completion, total };
}

function applyDateFilters<T extends ReturnType<typeof supabase.from>>(
  q: T,
  filters: TokenUsageFilters,
): T {
  let query = q.gte("created_at", `${filters.dateFrom}T00:00:00.000`) as T;
  query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`) as T;
  if (filters.provider) query = query.eq("provider", filters.provider) as T;
  if (filters.modelId) query = query.eq("model_id", filters.modelId) as T;
  return query;
}

/** Charge toutes les lignes de la période (pagination PostgREST). */
export async function fetchTokenUsageLogs(
  filters: TokenUsageFilters,
): Promise<{ data: AiUsageLogRow[]; error: string | null }> {
  const all: AiUsageLogRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from("ai_usage_logs")
      .select("id, model_id, provider, prompt_tokens, completion_tokens, total_tokens, artwork_id, created_at, metadata")
      .order("created_at", { ascending: false })
      .range(from, to);

    q = applyDateFilters(q, filters);

    const { data, error } = await q;
    if (error) return { data: [], error: error.message };

    const batch = (data ?? []) as AiUsageLogRow[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return { data: all, error: null };
}

export function summarizeTokenUsage(rows: AiUsageLogRow[]): TokenUsageSummary {
  let callCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const r of rows) {
    const t = rowTokens(r);
    if (t.total <= 0 && t.prompt <= 0 && t.completion <= 0) continue;
    callCount += 1;
    promptTokens += t.prompt;
    completionTokens += t.completion;
    totalTokens += t.total;
  }

  return { callCount, promptTokens, completionTokens, totalTokens };
}

export function breakdownByProvider(rows: AiUsageLogRow[]): TokenBreakdownItem[] {
  const map = new Map<string, TokenBreakdownItem>();

  for (const r of rows) {
    const t = rowTokens(r);
    if (t.total <= 0 && t.prompt <= 0 && t.completion <= 0) continue;
    const label = (r.provider ?? "—").trim() || "—";
    const cur = map.get(label) ?? {
      label,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      callCount: 0,
    };
    cur.callCount += 1;
    cur.promptTokens += t.prompt;
    cur.completionTokens += t.completion;
    cur.totalTokens += t.total;
    map.set(label, cur);
  }

  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

export function breakdownByModel(rows: AiUsageLogRow[]): TokenBreakdownItem[] {
  const map = new Map<string, TokenBreakdownItem>();

  for (const r of rows) {
    const t = rowTokens(r);
    if (t.total <= 0 && t.prompt <= 0 && t.completion <= 0) continue;
    const label = (r.model_id ?? "—").trim() || "—";
    const key = usageAggregationKey(label) || label;
    const cur = map.get(key) ?? {
      label,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      callCount: 0,
    };
    cur.callCount += 1;
    cur.promptTokens += t.prompt;
    cur.completionTokens += t.completion;
    cur.totalTokens += t.total;
    map.set(key, cur);
  }

  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

function enumerateDatesInclusive(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let cur = dateFrom;
  while (cur <= dateTo) {
    dates.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return dates;
}

const EMPTY_SERIES_POINT = (date: string): TokenTimeSeriesPoint => ({
  date,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  callCount: 0,
});

/** Agrège par jour ; si `range` est fourni, remplit chaque jour de la période (zéros inclus). */
export function tokenTimeSeries(
  rows: AiUsageLogRow[],
  range?: { dateFrom: string; dateTo: string },
): TokenTimeSeriesPoint[] {
  const byDate = new Map<string, TokenTimeSeriesPoint>();

  for (const r of rows) {
    const t = rowTokens(r);
    if (t.total <= 0 && t.prompt <= 0 && t.completion <= 0) continue;
    const date = r.created_at?.slice(0, 10) ?? "";
    if (!date) continue;
    const cur = byDate.get(date) ?? EMPTY_SERIES_POINT(date);
    cur.callCount += 1;
    cur.promptTokens += t.prompt;
    cur.completionTokens += t.completion;
    cur.totalTokens += t.total;
    byDate.set(date, cur);
  }

  if (!range) {
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  return enumerateDatesInclusive(range.dateFrom, range.dateTo).map(
    (date) => byDate.get(date) ?? EMPTY_SERIES_POINT(date),
  );
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 10_000) return `${Math.round(n / 1000)} k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k`;
  return String(Math.round(n));
}

export type UsageTableColumn = "prompt" | "completion" | "total";

/** Affichage colonnes Entrée / Sortie / Total du tableau Derniers appels (aware google_tts). */
export function formatUsageTableCell(
  provider: string,
  column: UsageTableColumn,
  value: number,
): string {
  if ((provider ?? "").trim() === "google_tts" || (provider ?? "").trim() === "openai") {
    if (column === "prompt") return "—";
    return `${formatTokenCount(Math.max(0, value))} car.`;
  }
  return formatTokenCount(Math.max(0, value));
}

export function jobTypeLabel(metadata: Record<string, unknown> | null): string {
  const jt = metadata?.job_type;
  if (typeof jt === "string" && jt.trim()) return jt.trim();

  const op = metadata?.operation;
  if (typeof op === "string" && op.trim()) {
    const key = op.trim();
    return i18n.t(`tokens.operation_${key}`, { ns: "settings", defaultValue: key });
  }

  return "—";
}
