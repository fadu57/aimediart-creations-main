/**
 * Suivi de consommation de tokens IA — table `ai_usage_logs`.
 */

import i18n from "@/i18n/config";
import { supabase } from "@/lib/supabase";
import { usageAggregationKey } from "@/lib/aiUsageModelId";
import { effectiveCostEstimatedUsd } from "@/lib/openAiTtsCost";
import {
  getCostArtworkDisplayMetaByIds,
  type CostFilters,
} from "@/lib/costs";
import { getWakaPeriodRange, type WakaPeriod } from "@/lib/wakatimePeriod";

export type TokenPeriod = WakaPeriod;

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
  /** Présent pour les lignes issues de ai_usage_events (ex. OpenAI TTS). */
  tool_type?: string | null;
  cost_estimated?: number | null;
};

/** Fournisseurs toujours proposés dans le filtre suivi tokens. */
export const KNOWN_USAGE_PROVIDERS = [
  "groq",
  "gemini",
  "google_gemini",
  "google_tts",
  "openai",
] as const;

export type TokenEntityFilters = {
  artworkId?: string;
  expoId?: string;
  agencyId?: string;
  toolType?: string;
  mediationLangCount?: string;
};

export type TokenArtworkContext = {
  artworkId: string;
  expoId: string | null;
  agencyId: string | null;
  title: string | null;
  mediationLangCount: number;
};

export const EMPTY_TOKEN_ENTITY_FILTERS: TokenEntityFilters = {
  artworkId: "",
  expoId: "",
  agencyId: "",
  toolType: "",
  mediationLangCount: "",
};

export type TokenUsageFilters = {
  dateFrom: string;
  dateTo: string;
  provider?: string;
  modelId?: string;
};

/** Contexte œuvre (titre, expo, agence) pour filtres et tableau tokens. */
export async function getTokenArtworkContextByIds(
  artworkIds: string[],
): Promise<Record<string, TokenArtworkContext>> {
  const ids = [...new Set(artworkIds.map((id) => id.trim()).filter(Boolean))];
  const result: Record<string, TokenArtworkContext> = {};
  if (ids.length === 0) return result;

  const [meta, refsRes] = await Promise.all([
    getCostArtworkDisplayMetaByIds(ids),
    supabase
      .from("artworks")
      .select("artwork_id, artwork_expo_id, artwork_agency_id")
      .in("artwork_id", ids)
      .is("artwork_deleted_at", null),
  ]);

  for (const row of (refsRes.data ?? []) as Array<{
    artwork_id?: string | null;
    artwork_expo_id?: string | null;
    artwork_agency_id?: string | null;
  }>) {
    const id = row.artwork_id?.trim();
    if (!id) continue;
    const display = meta[id];
    result[id] = {
      artworkId: id,
      expoId: row.artwork_expo_id?.trim() || null,
      agencyId: row.artwork_agency_id?.trim() || null,
      title: display?.title ?? null,
      mediationLangCount: display?.mediationLangCount ?? 0,
    };
  }

  return result;
}

export function getTokenRowToolType(row: AiUsageLogRow): string {
  const tool = (row.tool_type ?? row.metadata?.tool_type ?? "").toString().trim();
  if (tool) return tool;
  const job = (row.metadata?.job_type ?? "").toString().trim();
  if (job) return job;
  return "";
}

export function filterTokenRowsByEntity(
  rows: AiUsageLogRow[],
  filters: TokenEntityFilters,
  artworkCtx: Record<string, TokenArtworkContext>,
): AiUsageLogRow[] {
  const artworkId = filters.artworkId?.trim() ?? "";
  const expoId = filters.expoId?.trim() ?? "";
  const agencyId = filters.agencyId?.trim() ?? "";
  const toolType = filters.toolType?.trim() ?? "";
  const langRaw = filters.mediationLangCount?.trim() ?? "";
  const langCount = langRaw ? Number.parseInt(langRaw, 10) : null;

  return rows.filter((row) => {
    const rowArtworkId = row.artwork_id?.trim() ?? "";
    const ctx = rowArtworkId ? artworkCtx[rowArtworkId] : undefined;

    if (artworkId && rowArtworkId !== artworkId) return false;
    if (expoId && ctx?.expoId !== expoId) return false;
    if (agencyId && ctx?.agencyId !== agencyId) return false;
    if (toolType && getTokenRowToolType(row) !== toolType) return false;
    if (langCount != null && Number.isFinite(langCount) && ctx?.mediationLangCount !== langCount) {
      return false;
    }
    return true;
  });
}

export function tokenEntityFiltersToCostFilters(filters: TokenEntityFilters): CostFilters {
  return {
    dateFrom: "",
    dateTo: "",
    artworkId: filters.artworkId ?? "",
    expoId: filters.expoId ?? "",
    agencyId: filters.agencyId ?? "",
    toolType: filters.toolType ?? "",
    mediationLangCount: filters.mediationLangCount ?? "",
    provider: "",
    apiName: "",
    modelName: "",
    operationName: "",
    status: "",
    currency: "",
  };
}

export function costFiltersToTokenEntity(filters: CostFilters): TokenEntityFilters {
  return {
    artworkId: filters.artworkId ?? "",
    expoId: filters.expoId ?? "",
    agencyId: filters.agencyId ?? "",
    toolType: filters.toolType ?? "",
    mediationLangCount: filters.mediationLangCount ?? "",
  };
}

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
  const set = new Set<string>(KNOWN_USAGE_PROVIDERS);
  for (const r of rows) {
    const p = (r.provider ?? "").trim();
    if (p) set.add(p);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

export type TtsUsageRecapItem = {
  provider: string;
  tool: string;
  inputUnits: number;
  costUsd: number;
  callCount: number;
};

function isTtsCharactersRow(r: AiUsageLogRow): boolean {
  const provider = (r.provider ?? "").trim();
  const unitType = String(r.metadata?.unit_type ?? "").trim();
  if (unitType === "tokens") return false;
  if (unitType === "characters") return true;
  if (provider === "google_tts") return true;
  return false;
}

function artworkIdFromTtsEvent(
  metadata: Record<string, unknown> | null | undefined,
  operationName: string | null,
): string | null {
  const meta = metadata ?? {};
  const artworkId = typeof meta.artwork_id === "string" ? meta.artwork_id.trim() : "";
  if (artworkId) return artworkId;
  const textId = typeof meta.text_id === "string" ? meta.text_id.trim() : "";
  if (textId && (operationName === "mediation" || meta.text_type === "mediation")) {
    return textId;
  }
  return null;
}

/** Lignes TTS depuis ai_usage_events (OpenAI, etc.). */
export async function fetchTtsUsageEvents(
  filters: TokenUsageFilters,
): Promise<{ data: AiUsageLogRow[]; error: string | null }> {
  const all: AiUsageLogRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from("ai_usage_events")
      .select(
        "id, provider, tool_type, model_name, input_units, output_units, unit_type, cost_estimated, created_at, metadata, operation_name",
      )
      .eq("tool_type", "tts")
      .order("created_at", { ascending: false })
      .range(from, to);

    q = applyDateFilters(q, filters) as typeof q;
    if (filters.provider) q = q.eq("provider", filters.provider) as typeof q;

    const { data, error } = await q;
    if (error) return { data: [], error: error.message };

    const batch = (data ?? []) as Array<{
      id: string;
      provider: string;
      tool_type: string;
      model_name: string | null;
      input_units: number | null;
      output_units: number | null;
      unit_type: string | null;
      cost_estimated: number | null;
      created_at: string;
      metadata: Record<string, unknown> | null;
      operation_name: string | null;
    }>;

    for (const e of batch) {
      const inputUnits = Math.max(0, Number(e.input_units ?? 0));
      const outputUnits = Math.max(0, Number(e.output_units ?? 0));
      const unitType = (e.unit_type ?? "").trim() || (e.provider === "google_tts" ? "characters" : "tokens");
      const isCharUnits = unitType === "characters";

      all.push({
        id: e.id,
        model_id: (e.model_name ?? "tts").trim() || "tts",
        provider: e.provider,
        prompt_tokens: inputUnits,
        completion_tokens: outputUnits,
        total_tokens: isCharUnits
          ? (outputUnits > 0 ? outputUnits : inputUnits)
          : inputUnits + outputUnits,
        artwork_id: artworkIdFromTtsEvent(e.metadata, e.operation_name),
        created_at: e.created_at,
        metadata: {
          ...(e.metadata ?? {}),
          tool_type: e.tool_type,
          operation: e.operation_name,
          cost_estimated: e.cost_estimated,
          unit_type: unitType,
        },
        tool_type: e.tool_type,
        cost_estimated: e.cost_estimated,
      });
    }

    if (batch.length < PAGE_SIZE) break;
  }

  return { data: all, error: null };
}

export function mergeUsageRows(
  logs: AiUsageLogRow[],
  events: AiUsageLogRow[],
): AiUsageLogRow[] {
  return [...logs, ...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Récapitulatif TTS par fournisseur / outil (période filtrée). */
export function summarizeTtsUsageRecap(rows: AiUsageLogRow[]): TtsUsageRecapItem[] {
  const map = new Map<string, TtsUsageRecapItem>();

  for (const r of rows) {
    if (!isTtsCharactersRow(r)) continue;
    const provider = (r.provider ?? "—").trim() || "—";
    const tool = (r.tool_type ?? r.metadata?.tool_type ?? "tts").toString().trim() || "tts";
    const key = `${provider}::${tool}`;
    const inputUnits = isTtsCharactersRow(r)
      ? Math.max(0, Number(r.completion_tokens ?? r.total_tokens ?? 0))
      : Math.max(0, Number(r.prompt_tokens ?? 0));
    const cost = effectiveCostEstimatedUsd({
      provider,
      tool_type: tool,
      cost_estimated: r.cost_estimated,
      input_units: inputUnits,
      metadata: r.metadata,
    });
    const cur = map.get(key) ?? { provider, tool, inputUnits: 0, costUsd: 0, callCount: 0 };
    cur.inputUnits += inputUnits;
    cur.costUsd += cost;
    cur.callCount += 1;
    map.set(key, cur);
  }

  return [...map.values()].sort((a, b) => b.inputUnits - a.inputUnits);
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
  return getWakaPeriodRange(period, offset, ref);
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

/** Valeur entière sans abréviation (k / M) — pour le tableau détaillé. */
export function formatTokenCountExact(n: number, locale = "fr-FR"): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return Math.round(n).toLocaleString(locale);
}

export type UsageTableColumn = "prompt" | "completion" | "total";

/** Affichage colonnes Entrée / Sortie / Total du tableau Derniers appels. */
export function formatUsageTableCell(
  provider: string,
  column: UsageTableColumn,
  value: number,
  row?: Pick<AiUsageLogRow, "provider" | "tool_type" | "metadata">,
): string {
  const isCharBased = row ? isTtsCharactersRow(row as AiUsageLogRow) : false;

  if (isCharBased) {
    if (column === "prompt") return "—";
    return `${formatTokenCountExact(Math.max(0, value))} ${i18n.t("tokens.unit_characters", { ns: "settings", defaultValue: "car." })}`;
  }
  return formatTokenCountExact(Math.max(0, value));
}

export function usageProviderLabel(provider: string): string {
  const key = (provider ?? "").trim();
  const labels: Record<string, string> = {
    groq: "Groq",
    gemini: "Google Gemini",
    google_gemini: "Google Gemini",
    google_tts: "Google Cloud TTS",
    openai: "OpenAI",
  };
  return labels[key] ?? key;
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

function tokenRowOperationRaw(metadata: Record<string, unknown> | null): string {
  const jt = metadata?.job_type;
  if (typeof jt === "string" && jt.trim()) return jt.trim();
  const op = metadata?.operation;
  if (typeof op === "string" && op.trim()) return op.trim();
  return "";
}

function tokenRowUnitsLabel(row: AiUsageLogRow): "characters" | "tokens" {
  return isTtsCharactersRow(row) ? "characters" : "tokens";
}

/** Exporte toutes les lignes filtrées vers un CSV (BOM UTF-8). */
export function exportTokenUsageCsv(
  rows: AiUsageLogRow[],
  artworkCtx: Record<string, TokenArtworkContext>,
): void {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "created_at",
    "provider",
    "model_id",
    "operation",
    "artwork_id",
    "artwork_title",
    "tool_type",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "units",
  ];

  const csvRows = rows.map((r) => {
    const prompt = Math.max(0, Number(r.prompt_tokens ?? 0));
    const completion = Math.max(0, Number(r.completion_tokens ?? 0));
    const total = Number(r.total_tokens ?? 0) > 0 ? Number(r.total_tokens) : prompt + completion;
    const artworkId = r.artwork_id?.trim() ?? "";
    const ctx = artworkId ? artworkCtx[artworkId] : undefined;

    return [
      r.created_at.slice(0, 19).replace("T", " "),
      r.provider ?? "",
      r.model_id ?? "",
      tokenRowOperationRaw(r.metadata),
      artworkId,
      ctx?.title ?? "",
      getTokenRowToolType(r),
      prompt,
      completion,
      total,
      tokenRowUnitsLabel(r),
    ].map(esc).join(",");
  });

  const csv = [headers.map(esc).join(","), ...csvRows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tokens_ia_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type TokenTableSortColumn =
  | "created_at"
  | "provider"
  | "model_id"
  | "operation"
  | "artwork_title"
  | "tool_type"
  | "prompt_tokens"
  | "completion_tokens"
  | "total_tokens";

export type TokenTableSort = {
  column: TokenTableSortColumn;
  ascending: boolean;
};

export const DEFAULT_TOKEN_TABLE_SORT: TokenTableSort = {
  column: "created_at",
  ascending: false,
};

export function nextTokenTableSort(column: TokenTableSortColumn, current: TokenTableSort): TokenTableSort {
  if (current.column === column) {
    return { column, ascending: !current.ascending };
  }
  const descFirst =
    column === "created_at" ||
    column === "prompt_tokens" ||
    column === "completion_tokens" ||
    column === "total_tokens";
  return { column, ascending: !descFirst };
}

function tokenRowArtworkTitle(
  row: AiUsageLogRow,
  artworkCtx?: Record<string, TokenArtworkContext>,
): string {
  const artworkId = row.artwork_id?.trim() ?? "";
  if (!artworkId) return "";
  return artworkCtx?.[artworkId]?.title?.trim() ?? "";
}

/** Tri client du tableau Derniers appels (toutes les lignes filtrées). */
export function sortTokenUsageRows(
  rows: AiUsageLogRow[],
  sort: TokenTableSort,
  artworkCtx?: Record<string, TokenArtworkContext>,
): AiUsageLogRow[] {
  const dir = sort.ascending ? 1 : -1;

  return [...rows].sort((a, b) => {
    switch (sort.column) {
      case "created_at":
        return a.created_at.localeCompare(b.created_at) * dir;
      case "provider":
        return (a.provider ?? "").localeCompare(b.provider ?? "", "fr", { sensitivity: "base" }) * dir;
      case "model_id":
        return (a.model_id ?? "").localeCompare(b.model_id ?? "", "fr", { sensitivity: "base" }) * dir;
      case "operation":
        return tokenRowOperationRaw(a.metadata).localeCompare(
          tokenRowOperationRaw(b.metadata),
          "fr",
          { sensitivity: "base" },
        ) * dir;
      case "artwork_title":
        return tokenRowArtworkTitle(a, artworkCtx).localeCompare(
          tokenRowArtworkTitle(b, artworkCtx),
          "fr",
          { sensitivity: "base" },
        ) * dir;
      case "tool_type":
        return getTokenRowToolType(a).localeCompare(getTokenRowToolType(b), "fr", { sensitivity: "base" }) * dir;
      case "prompt_tokens":
        return (rowTokens(a).prompt - rowTokens(b).prompt) * dir;
      case "completion_tokens":
        return (rowTokens(a).completion - rowTokens(b).completion) * dir;
      case "total_tokens":
        return (rowTokens(a).total - rowTokens(b).total) * dir;
      default:
        return 0;
    }
  });
}
