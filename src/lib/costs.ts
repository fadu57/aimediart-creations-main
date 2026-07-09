/**
 * costs.ts
 * Module dédié au suivi des coûts IA / outils (table ai_usage_events).
 */

import { supabase } from "./supabase";
import { effectiveCostEstimatedUsd } from "./openAiTtsCost";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostEvent = {
  id: string;
  created_at: string;
  workspace_id: string | null;
  user_id: string | null;
  project_id: string | null;
  tool_type: string;
  provider: string;
  api_name: string | null;
  model_name: string | null;
  operation_name: string | null;
  input_units: number | null;
  output_units: number | null;
  unit_type: string | null;
  cost_estimated: number;
  currency: string;
  status: string;
  request_id: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
};

export type CostFilters = {
  dateFrom?: string;   // YYYY-MM-DD
  dateTo?: string;     // YYYY-MM-DD
  toolType?: string;
  provider?: string;
  apiName?: string;
  modelName?: string;
  operationName?: string;
  status?: string;
  currency?: string;
  artworkId?: string;
  expoId?: string;
  agencyId?: string;
};

export type CostEntityOption = {
  id: string;
  label: string;
};

export type CostEntityFilterOptions = {
  artworks: CostEntityOption[];
  expos: CostEntityOption[];
  agencies: CostEntityOption[];
};

export type CostEventsTotals = {
  totalCost: number;
  totalInputUnits: number;
  totalOutputUnits: number;
  currency: string;
};

export type CostSummary = {
  totalCost: number;
  callCount: number;
  avgCostPerCall: number;
  topProvider: string | null;
  topTool: string | null;
  currency: string;
};

export type CostBreakdownItem = {
  label: string;
  totalCost: number;
  callCount: number;
};

export type CostTimeSeriesPoint = {
  date: string;
  totalCost: number;
  callCount: number;
};

export type CostSelectOptions = {
  toolTypes: string[];
  providers: string[];
  apiNames: string[];
  modelNames: string[];
  operationNames: string[];
  statuses: string[];
  currencies: string[];
};

export type CostSortColumn =
  | "created_at"
  | "tool_type"
  | "provider"
  | "model_name"
  | "operation_name"
  | "cost_estimated"
  | "status";

export type CostSort = {
  column: CostSortColumn;
  ascending: boolean;
};

export const DEFAULT_COST_SORT: CostSort = {
  column: "created_at",
  ascending: false,
};

/** Fournisseurs connus de la page coûts (toujours proposés dans les filtres). */
export const KNOWN_COST_PROVIDER_KEYS = [
  "groq",
  "google_gemini",
  "google_tts",
  "openai",
  "cursor",
  "huggingface",
  "supabase",
  "vercel",
  "ovh",
] as const;

export type KnownCostProviderKey = (typeof KNOWN_COST_PROVIDER_KEYS)[number];

export const COST_PROVIDER_DISPLAY_NAMES: Record<KnownCostProviderKey, string> = {
  groq: "Groq",
  google_gemini: "Google Gemini",
  google_tts: "Google Cloud TTS Neural2",
  openai: "OpenAI TTS",
  cursor: "Cursor",
  huggingface: "HuggingFace",
  supabase: "Supabase",
  vercel: "Vercel",
  ovh: "OVH",
};

export function costProviderDisplayName(providerKey: string): string {
  return (
    COST_PROVIDER_DISPLAY_NAMES[providerKey as KnownCostProviderKey] ??
    providerKey
  );
}

/** Couleurs distinctes par fournisseur dans les graphiques coûts. */
export const COST_PROVIDER_CHART_COLORS: Record<string, string> = {
  groq: "#8b5cf6",
  google_gemini: "#3b82f6",
  google_tts: "#f59e0b",
  openai: "#10b981",
  cursor: "#6366f1",
  huggingface: "#ec4899",
  supabase: "#14b8a6",
  vercel: "#64748b",
  ovh: "#E63946",
};

export function costProviderChartColor(providerKey: string, index = 0): string {
  const known = COST_PROVIDER_CHART_COLORS[providerKey];
  if (known) return known;
  const palette = ["#94a3b8", "#a78bfa", "#fb923c", "#2dd4bf", "#f472b6"];
  return palette[index % palette.length];
}

/** Types d'outil toujours proposés dans les filtres coûts. */
export const KNOWN_COST_TOOL_TYPES = ["llm", "tts", "image", "embedding", "other"] as const;

type SupabaseQuery = ReturnType<typeof supabase.from>;

function applyScalarFilters(q: SupabaseQuery, filters: CostFilters): SupabaseQuery {
  if (filters.dateFrom) {
    q = q.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    q = q.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  }
  if (filters.toolType) q = q.eq("tool_type", filters.toolType);
  if (filters.provider)  q = q.eq("provider",  filters.provider);
  if (filters.apiName)   q = q.eq("api_name",   filters.apiName);
  if (filters.modelName) q = q.eq("model_name", filters.modelName);
  if (filters.operationName) q = q.eq("operation_name", filters.operationName);
  if (filters.status)    q = q.eq("status",     filters.status);
  if (filters.currency)  q = q.eq("currency",   filters.currency);
  return q;
}

async function artworkIdsForExpoFilter(expoId: string): Promise<string[]> {
  const { data: expoRow } = await supabase
    .from("expos")
    .select("id, expo_id")
    .eq("id", expoId)
    .maybeSingle();

  const expoRefs = new Set<string>([expoId]);
  const legacyExpoId = (expoRow as { expo_id?: string | null } | null)?.expo_id?.trim();
  if (legacyExpoId) expoRefs.add(legacyExpoId);

  const { data } = await supabase
    .from("artworks")
    .select("artwork_id")
    .in("artwork_expo_id", [...expoRefs])
    .is("artwork_deleted_at", null);

  return ((data ?? []) as Array<{ artwork_id?: string | null }>)
    .map((row) => row.artwork_id?.trim())
    .filter((id): id is string => Boolean(id));
}

async function artworkIdsForEntityFilters(filters: CostFilters): Promise<string[] | null> {
  const artworkId = filters.artworkId?.trim();
  if (artworkId) return [artworkId];

  const expoId = filters.expoId?.trim();
  if (expoId) return artworkIdsForExpoFilter(expoId);

  const agencyId = filters.agencyId?.trim();
  if (agencyId) {
    const { data } = await supabase
      .from("artworks")
      .select("artwork_id")
      .eq("artwork_agency_id", agencyId)
      .is("artwork_deleted_at", null);
    return ((data ?? []) as Array<{ artwork_id?: string | null }>)
      .map((row) => row.artwork_id?.trim())
      .filter((id): id is string => Boolean(id));
  }

  return null;
}

type EntityFilterResult =
  | { kind: "query"; query: SupabaseQuery }
  | { kind: "empty" };

function quoteUuidInList(ids: string[]): string {
  return `(${ids.map((id) => `"${id}"`).join(",")})`;
}

/** Clause PostgREST : artwork_id, text_id (TTS médiation) et ai_usage_log_id (sync logs). */
function buildArtworkEntityOrClause(artworkIds: string[], usageLogIds: string[]): string {
  const parts: string[] = [];

  if (artworkIds.length === 1) {
    const id = artworkIds[0];
    parts.push(`metadata->>artwork_id.eq.${id}`);
    parts.push(`metadata->>text_id.eq.${id}`);
    parts.push(`and(operation_name.eq.mediation,metadata->>text_id.eq.${id})`);
  } else if (artworkIds.length > 1) {
    const inList = quoteUuidInList(artworkIds);
    parts.push(`metadata->>artwork_id.in.${inList}`);
    parts.push(`metadata->>text_id.in.${inList}`);
    parts.push(`and(operation_name.eq.mediation,metadata->>text_id.in.${inList})`);
  }

  if (usageLogIds.length === 1) {
    parts.push(`metadata->>ai_usage_log_id.eq.${usageLogIds[0]}`);
  } else if (usageLogIds.length > 1) {
    parts.push(`metadata->>ai_usage_log_id.in.${quoteUuidInList(usageLogIds)}`);
  }

  return parts.join(",");
}

function applyScalarFiltersToUsageLogs(
  q: ReturnType<typeof supabase.from>,
  filters: CostFilters,
): ReturnType<typeof supabase.from> {
  if (filters.dateFrom) {
    q = q.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    q = q.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  }
  return q;
}

async function usageLogIdsForArtworks(artworkIds: string[], filters: CostFilters): Promise<string[]> {
  let q = supabase.from("ai_usage_logs").select("id").in("artwork_id", artworkIds);
  q = applyScalarFiltersToUsageLogs(q, filters);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as Array<{ id?: string | null }>)
    .map((row) => row.id?.trim())
    .filter((id): id is string => Boolean(id));
}

function applyArtworkEntityOrFilter(
  q: SupabaseQuery,
  artworkIds: string[],
  usageLogIds: string[],
): SupabaseQuery {
  const orClause = buildArtworkEntityOrClause(artworkIds, usageLogIds);
  if (!orClause) return q;
  return q.or(orClause);
}

async function applyEntityFilters(q: SupabaseQuery, filters: CostFilters): Promise<EntityFilterResult> {
  const ids = await artworkIdsForEntityFilters(filters);
  if (ids === null) return { kind: "query", query: q };
  if (ids.length === 0) return { kind: "empty" };
  const logIds = await usageLogIdsForArtworks(ids, filters);
  return { kind: "query", query: applyArtworkEntityOrFilter(q, ids, logIds) };
}

type AiUsageLogRow = {
  id: string;
  model_id: string;
  provider: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  artwork_id: string | null;
  created_at: string | null;
  metadata?: Record<string, unknown> | null;
};

const GROQ_LOG_RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "llama-3.3-70b-versatile": { inputPerM: 0.59, outputPerM: 0.79 },
  "llama-3.1-8b-instant": { inputPerM: 0.05, outputPerM: 0.08 },
};

function estimateLogCostUsd(log: AiUsageLogRow): number {
  const pt = Math.max(0, Number(log.prompt_tokens ?? 0));
  const ct = Math.max(0, Number(log.completion_tokens ?? 0));

  if (log.provider === "google_tts") {
    const chars = Math.max(0, Number(log.completion_tokens ?? log.total_tokens ?? 0));
    return Math.round((chars / 1_000_000) * 16 * 1_000_000) / 1_000_000;
  }

  const norm = log.model_id.trim().toLowerCase().replace(/^models\//, "");
  const rates =
    GROQ_LOG_RATES[norm] ??
    Object.entries(GROQ_LOG_RATES).find(([key]) => norm.includes(key))?.[1] ??
    { inputPerM: 0.5, outputPerM: 0.5 };
  const cost = (pt / 1_000_000) * rates.inputPerM + (ct / 1_000_000) * rates.outputPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

function mapUsageLogToCostEvent(log: AiUsageLogRow): CostEvent {
  const pt = Math.max(0, Number(log.prompt_tokens ?? 0));
  const ct = Math.max(0, Number(log.completion_tokens ?? 0));
  const isTts = log.provider === "google_tts";
  const provider =
    log.provider === "gemini" ? "google_gemini" : log.provider === "groq" ? "groq" : log.provider;

  return {
    id: `usage_log:${log.id}`,
    created_at: log.created_at ?? new Date().toISOString(),
    workspace_id: null,
    user_id: null,
    project_id: null,
    tool_type: isTts ? "tts" : "chat",
    provider,
    api_name: isTts ? "google_cloud_text_to_speech" : null,
    model_name: log.model_id,
    operation_name: isTts ? "tts_synthesize" : "ai_usage_log",
    input_units: pt,
    output_units: isTts ? Math.max(ct, Number(log.total_tokens ?? 0)) : ct,
    unit_type: isTts ? "characters" : "tokens",
    cost_estimated: estimateLogCostUsd(log),
    currency: "USD",
    status: "success",
    request_id: null,
    source: "ai_usage_logs",
    metadata: {
      ...(log.metadata ?? {}),
      artwork_id: log.artwork_id,
      ai_usage_log_id: log.id,
      from_usage_log: true,
      billing_mode: "estimated_from_logs",
    },
  };
}

async function fetchSyncedUsageLogIds(logIds: string[]): Promise<Set<string>> {
  const synced = new Set<string>();
  if (logIds.length === 0) return synced;

  const orParts = logIds.flatMap((id) => [
    `import_hash.eq.groq_log:${id}`,
    `import_hash.eq.google_tts_log:${id}`,
    `metadata->>ai_usage_log_id.eq.${id}`,
  ]);
  const { data } = await supabase
    .from("ai_usage_events")
    .select("import_hash, metadata")
    .or(orParts.join(","));

  for (const row of (data ?? []) as Array<{
    import_hash?: string | null;
    metadata?: Record<string, unknown> | null;
  }>) {
    const hash = row.import_hash?.trim() ?? "";
    if (hash.startsWith("groq_log:")) synced.add(hash.slice("groq_log:".length));
    if (hash.startsWith("google_tts_log:")) synced.add(hash.slice("google_tts_log:".length));
    const metaId = row.metadata?.ai_usage_log_id;
    if (typeof metaId === "string" && metaId.trim()) synced.add(metaId.trim());
  }
  return synced;
}

async function fetchUnsyncedUsageLogsAsEvents(
  artworkIds: string[],
  filters: CostFilters,
): Promise<CostEvent[]> {
  let q = supabase
    .from("ai_usage_logs")
    .select("id, model_id, provider, prompt_tokens, completion_tokens, total_tokens, artwork_id, created_at, metadata")
    .in("artwork_id", artworkIds);
  q = applyScalarFiltersToUsageLogs(q, filters);

  const { data, error } = await q;
  if (error || !Array.isArray(data) || data.length === 0) return [];

  const logs = data as AiUsageLogRow[];
  const synced = await fetchSyncedUsageLogIds(logs.map((l) => l.id));
  return logs.filter((log) => !synced.has(log.id)).map(mapUsageLogToCostEvent);
}

function sortCostEvents(events: CostEvent[], sort: CostSort): CostEvent[] {
  const dir = sort.ascending ? 1 : -1;
  return [...events].sort((a, b) => {
    const col = sort.column;
    const av = a[col];
    const bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

async function fetchEntityFilteredCostEvents(
  artworkIds: string[],
  filters: CostFilters,
): Promise<CostEvent[]> {
  const logIds = await usageLogIdsForArtworks(artworkIds, filters);
  let q = supabase.from("ai_usage_events").select("*");
  q = applyScalarFilters(q, filters);
  q = applyArtworkEntityOrFilter(q, artworkIds, logIds);

  const [eventsRes, logEvents] = await Promise.all([
    q,
    fetchUnsyncedUsageLogsAsEvents(artworkIds, filters),
  ]);

  if (eventsRes.error) return logEvents;

  const byId = new Map<string, CostEvent>();
  for (const ev of [...((eventsRes.data ?? []) as CostEvent[]), ...logEvents]) {
    byId.set(ev.id, ev);
  }
  return [...byId.values()];
}

async function entityArtworkIdsFromFilters(filters: CostFilters): Promise<string[] | null> {
  return artworkIdsForEntityFilters(filters);
}

async function applyAllFilters(q: SupabaseQuery, filters: CostFilters): Promise<EntityFilterResult> {
  return applyEntityFilters(applyScalarFilters(q, filters), filters);
}

// ---------------------------------------------------------------------------
// Requêtes principales
// ---------------------------------------------------------------------------

/** Récupère les événements paginés selon les filtres. */
export async function getCostEvents(
  filters: CostFilters,
  page = 0,
  pageSize = 50,
  sort: CostSort = DEFAULT_COST_SORT,
): Promise<{ data: CostEvent[]; count: number; error: string | null }> {
  const artworkIds = await entityArtworkIdsFromFilters(filters);
  if (artworkIds !== null) {
    if (artworkIds.length === 0) return { data: [], count: 0, error: null };
    const merged = sortCostEvents(await fetchEntityFilteredCostEvents(artworkIds, filters), sort);
    return {
      data: merged.slice(page * pageSize, (page + 1) * pageSize),
      count: merged.length,
      error: null,
    };
  }

  let q = supabase
    .from("ai_usage_events")
    .select("*", { count: "exact" })
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  const filtered = await applyAllFilters(q, filters);
  if (filtered.kind === "empty") return { data: [], count: 0, error: null };
  q = filtered.query;

  const { data, error, count } = await q;
  if (error) return { data: [], count: 0, error: error.message };
  return { data: (data ?? []) as CostEvent[], count: count ?? 0, error: null };
}

/** Totaux filtrés (coût + unités) pour la ligne de synthèse du tableau. */
export async function getCostEventsTotals(filters: CostFilters): Promise<CostEventsTotals> {
  const artworkIds = await entityArtworkIdsFromFilters(filters);
  if (artworkIds !== null && artworkIds.length === 0) {
    return { totalCost: 0, totalInputUnits: 0, totalOutputUnits: 0, currency: "EUR" };
  }

  let rows: Array<{
    cost_estimated: number;
    input_units: number | null;
    output_units: number | null;
    currency: string;
    provider: string;
    tool_type: string;
    metadata: Record<string, unknown> | null;
  }>;

  if (artworkIds !== null) {
    rows = await fetchEntityFilteredCostEvents(artworkIds, filters);
  } else {
    let q = supabase
      .from("ai_usage_events")
      .select("cost_estimated, input_units, output_units, currency, provider, tool_type, metadata");

    const filtered = await applyAllFilters(q, filters);
    if (filtered.kind === "empty") {
      return { totalCost: 0, totalInputUnits: 0, totalOutputUnits: 0, currency: "EUR" };
    }
    q = filtered.query;

    const { data, error } = await q;
    if (error || !Array.isArray(data)) {
      return { totalCost: 0, totalInputUnits: 0, totalOutputUnits: 0, currency: "EUR" };
    }
    rows = data as typeof rows;
  }

  let totalCost = 0;
  let totalInputUnits = 0;
  let totalOutputUnits = 0;
  let currency = "EUR";

  for (const r of rows) {
    totalCost += effectiveCostEstimatedUsd(r);
    if (r.input_units != null) totalInputUnits += Number(r.input_units) || 0;
    if (r.output_units != null) totalOutputUnits += Number(r.output_units) || 0;
    if (r.currency) currency = r.currency;
  }

  return { totalCost, totalInputUnits, totalOutputUnits, currency };
}

/** Calcule les indicateurs synthétiques (KPIs). */
export async function getCostSummary(filters: CostFilters): Promise<CostSummary> {
  const artworkIds = await entityArtworkIdsFromFilters(filters);
  if (artworkIds !== null && artworkIds.length === 0) {
    return { totalCost: 0, callCount: 0, avgCostPerCall: 0, topProvider: null, topTool: null, currency: "EUR" };
  }

  let rows: Array<{
    cost_estimated: number;
    currency: string;
    provider: string;
    tool_type: string;
    input_units: number | null;
    metadata: Record<string, unknown> | null;
  }>;

  if (artworkIds !== null) {
    rows = await fetchEntityFilteredCostEvents(artworkIds, filters);
  } else {
    let q = supabase
      .from("ai_usage_events")
      .select("cost_estimated, currency, provider, tool_type, input_units, metadata");

    const filtered = await applyAllFilters(q, filters);
    if (filtered.kind === "empty") {
      return { totalCost: 0, callCount: 0, avgCostPerCall: 0, topProvider: null, topTool: null, currency: "EUR" };
    }
    q = filtered.query;

    const { data, error } = await q;
    if (error || !Array.isArray(data)) {
      return { totalCost: 0, callCount: 0, avgCostPerCall: 0, topProvider: null, topTool: null, currency: "EUR" };
    }
    rows = data as typeof rows;
  }

  let totalCost = 0;
  const providerCount = new Map<string, number>();
  const toolCount = new Map<string, number>();
  let currency = "EUR";

  for (const r of rows) {
    totalCost += effectiveCostEstimatedUsd(r);
    providerCount.set(r.provider, (providerCount.get(r.provider) ?? 0) + 1);
    toolCount.set(r.tool_type, (toolCount.get(r.tool_type) ?? 0) + 1);
    if (r.currency) currency = r.currency;
  }

  const callCount = rows.length;
  const avgCostPerCall = callCount > 0 ? totalCost / callCount : 0;
  const topProvider = [...providerCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topTool     = [...toolCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { totalCost, callCount, avgCostPerCall, topProvider, topTool, currency };
}

/** Répartition des coûts par fournisseur. */
export async function getCostBreakdownByProvider(filters: CostFilters): Promise<CostBreakdownItem[]> {
  const artworkIds = await entityArtworkIdsFromFilters(filters);
  if (artworkIds !== null && artworkIds.length === 0) return [];

  let data: Array<{
    provider: string;
    tool_type: string;
    cost_estimated: number;
    input_units: number | null;
    metadata: Record<string, unknown> | null;
  }>;

  if (artworkIds !== null) {
    data = await fetchEntityFilteredCostEvents(artworkIds, filters);
  } else {
    let q = supabase
      .from("ai_usage_events")
      .select("provider, tool_type, cost_estimated, input_units, metadata");

    const filtered = await applyAllFilters(q, filters);
    if (filtered.kind === "empty") return [];
    q = filtered.query;

    const res = await q;
    if (res.error || !Array.isArray(res.data)) return [];
    data = res.data as typeof data;
  }

  const by = new Map<string, { cost: number; count: number }>();
  for (const r of data) {
    const cur = by.get(r.provider) ?? { cost: 0, count: 0 };
    cur.cost += effectiveCostEstimatedUsd(r);
    cur.count += 1;
    by.set(r.provider, cur);
  }

  return [...by.entries()]
    .map(([label, { cost, count }]) => ({ label, totalCost: cost, callCount: count }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/** Répartition des coûts par type d'outil. */
export async function getCostBreakdownByTool(filters: CostFilters): Promise<CostBreakdownItem[]> {
  const artworkIds = await entityArtworkIdsFromFilters(filters);
  if (artworkIds !== null && artworkIds.length === 0) return [];

  let data: Array<{
    tool_type: string;
    provider: string;
    cost_estimated: number;
    input_units: number | null;
    metadata: Record<string, unknown> | null;
  }>;

  if (artworkIds !== null) {
    data = await fetchEntityFilteredCostEvents(artworkIds, filters);
  } else {
    let q = supabase
      .from("ai_usage_events")
      .select("tool_type, provider, cost_estimated, input_units, metadata");

    const filtered = await applyAllFilters(q, filters);
    if (filtered.kind === "empty") return [];
    q = filtered.query;

    const res = await q;
    if (res.error || !Array.isArray(res.data)) return [];
    data = res.data as typeof data;
  }

  const by = new Map<string, { cost: number; count: number }>();
  for (const r of data) {
    const cur = by.get(r.tool_type) ?? { cost: 0, count: 0 };
    cur.cost += effectiveCostEstimatedUsd(r);
    cur.count += 1;
    by.set(r.tool_type, cur);
  }

  return [...by.entries()]
    .map(([label, { cost, count }]) => ({ label, totalCost: cost, callCount: count }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/** Série temporelle journalière des coûts. */
export async function getCostTimeSeries(filters: CostFilters): Promise<CostTimeSeriesPoint[]> {
  const artworkIds = await entityArtworkIdsFromFilters(filters);
  if (artworkIds !== null && artworkIds.length === 0) return [];

  let data: Array<{
    created_at: string;
    cost_estimated: number;
    provider: string;
    tool_type: string;
    input_units: number | null;
    metadata: Record<string, unknown> | null;
  }>;

  if (artworkIds !== null) {
    const events = await fetchEntityFilteredCostEvents(artworkIds, filters);
    data = events;
  } else {
    let q = supabase
      .from("ai_usage_events")
      .select("created_at, cost_estimated, provider, tool_type, input_units, metadata")
      .order("created_at", { ascending: true });

    const filtered = await applyAllFilters(q, filters);
    if (filtered.kind === "empty") return [];
    q = filtered.query;

    const res = await q;
    if (res.error || !Array.isArray(res.data)) return [];
    data = res.data as typeof data;
  }

  const byDate = new Map<string, { cost: number; count: number }>();
  for (const r of data) {
    const date = r.created_at.slice(0, 10);
    const cur = byDate.get(date) ?? { cost: 0, count: 0 };
    cur.cost += effectiveCostEstimatedUsd(r);
    cur.count += 1;
    byDate.set(date, cur);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { cost, count }]) => ({ date, totalCost: cost, callCount: count }));
}

/**
 * Récupère les valeurs distinctes pour alimenter les selects de filtre.
 * Limite à 200 lignes pour performance.
 */
export async function getCostSelectOptions(): Promise<CostSelectOptions> {
  const { data, error } = await supabase
    .from("ai_usage_events")
    .select("tool_type, provider, api_name, model_name, operation_name, status, currency")
    .limit(500);

  if (error || !Array.isArray(data)) {
    return {
      toolTypes: [],
      providers: [],
      apiNames: [],
      modelNames: [],
      operationNames: [],
      statuses: [],
      currencies: [],
    };
  }

  type Row = {
    tool_type: string; provider: string; api_name: string | null;
    model_name: string | null; operation_name: string | null; status: string; currency: string;
  };
  const rows = data as Row[];

  const uniq = <T>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((x): x is T => x != null && String(x).trim() !== ""))].sort() as T[];

  return {
    toolTypes:  uniq([...KNOWN_COST_TOOL_TYPES, ...rows.map((r) => r.tool_type)]),
    providers:  uniq([...KNOWN_COST_PROVIDER_KEYS, ...rows.map((r) => r.provider)]),
    apiNames:   uniq(rows.map((r) => r.api_name)),
    modelNames: uniq(rows.map((r) => r.model_name)),
    operationNames: uniq(rows.map((r) => r.operation_name)),
    statuses:   uniq(rows.map((r) => r.status)),
    currencies: uniq(rows.map((r) => r.currency)),
  };
}

/** Listes œuvre / expo / agence pour les filtres du tableau des coûts. */
export async function getCostEntityFilterOptions(): Promise<CostEntityFilterOptions> {
  const [agenciesRes, exposRes, artworksRes] = await Promise.all([
    supabase.from("agencies").select("id, name_agency").order("name_agency"),
    supabase.from("expos").select("id, expo_name").order("expo_name").limit(500),
    supabase
      .from("artworks")
      .select("artwork_id, artwork_title")
      .is("artwork_deleted_at", null)
      .order("artwork_title")
      .limit(500),
  ]);

  const agencies = ((agenciesRes.data ?? []) as Array<{ id?: string; name_agency?: string | null }>)
    .map((row) => {
      const id = row.id?.trim();
      if (!id) return null;
      const label = row.name_agency?.trim() || id.slice(0, 8);
      return { id, label };
    })
    .filter((row): row is CostEntityOption => row != null);

  const expos = ((exposRes.data ?? []) as Array<{ id?: string; expo_name?: string | null }>)
    .map((row) => {
      const id = row.id?.trim();
      if (!id) return null;
      const label = row.expo_name?.trim() || id.slice(0, 8);
      return { id, label };
    })
    .filter((row): row is CostEntityOption => row != null);

  const artworks = ((artworksRes.data ?? []) as Array<{ artwork_id?: string; artwork_title?: string | null }>)
    .map((row) => {
      const id = row.artwork_id?.trim();
      if (!id) return null;
      const label = row.artwork_title?.trim() || id.slice(0, 8);
      return { id, label };
    })
    .filter((row): row is CostEntityOption => row != null);

  return { artworks, expos, agencies };
}

// ---------------------------------------------------------------------------
// Agrégats par entité (catalogue / expos)
// ---------------------------------------------------------------------------

async function buildUsageLogArtworkMap(artworkIds: string[]): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select("id, artwork_id")
    .in("artwork_id", artworkIds);
  if (error) return {};
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ id?: string | null; artwork_id?: string | null }>) {
    const logId = row.id?.trim();
    const artworkId = row.artwork_id?.trim();
    if (logId && artworkId) map[logId] = artworkId;
  }
  return map;
}

function resolveArtworkIdFromCostEvent(
  event: CostEvent,
  logToArtwork: Record<string, string>,
): string | null {
  const meta = event.metadata ?? {};
  const direct =
    typeof meta.artwork_id === "string"
      ? meta.artwork_id.trim()
      : typeof event.metadata?.artwork_id === "string"
        ? String(event.metadata.artwork_id).trim()
        : "";
  if (direct) return direct;

  const textId = typeof meta.text_id === "string" ? meta.text_id.trim() : "";
  if (textId) return textId;

  const logId = typeof meta.ai_usage_log_id === "string" ? meta.ai_usage_log_id.trim() : "";
  if (logId && logToArtwork[logId]) return logToArtwork[logId];

  return null;
}

/** Coûts cumulés par œuvre (admins globaux). */
export async function getCostTotalsByArtworkIds(
  artworkIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(artworkIds.map((id) => id.trim()).filter(Boolean))];
  const totals: Record<string, number> = {};
  for (const id of ids) totals[id] = 0;
  if (ids.length === 0) return totals;

  const [events, logToArtwork] = await Promise.all([
    fetchEntityFilteredCostEvents(ids, {}),
    buildUsageLogArtworkMap(ids),
  ]);

  for (const event of events) {
    const artworkId = resolveArtworkIdFromCostEvent(event, logToArtwork);
    if (!artworkId || totals[artworkId] === undefined) continue;
    totals[artworkId] += effectiveCostEstimatedUsd(event);
  }

  return totals;
}

async function buildExpoArtworkMap(
  expoIds: string[],
): Promise<{ artworkToExpo: Record<string, string>; artworkIds: string[] }> {
  const canonicalIds = [...new Set(expoIds.map((id) => id.trim()).filter(Boolean))];
  if (canonicalIds.length === 0) return { artworkToExpo: {}, artworkIds: [] };

  const { data: expoRows } = await supabase
    .from("expos")
    .select("id, expo_id")
    .in("id", canonicalIds);

  const expoRefToCanonical: Record<string, string> = {};
  for (const row of (expoRows ?? []) as Array<{ id?: string | null; expo_id?: string | null }>) {
    const id = row.id?.trim();
    if (!id) continue;
    expoRefToCanonical[id] = id;
    const legacy = row.expo_id?.trim();
    if (legacy) expoRefToCanonical[legacy] = id;
  }

  const expoRefs = Object.keys(expoRefToCanonical);
  if (expoRefs.length === 0) return { artworkToExpo: {}, artworkIds: [] };

  const { data: artworkRows } = await supabase
    .from("artworks")
    .select("artwork_id, artwork_expo_id")
    .in("artwork_expo_id", expoRefs)
    .is("artwork_deleted_at", null);

  const artworkToExpo: Record<string, string> = {};
  const artworkIds: string[] = [];
  for (const row of (artworkRows ?? []) as Array<{
    artwork_id?: string | null;
    artwork_expo_id?: string | null;
  }>) {
    const artworkId = row.artwork_id?.trim();
    const expoRef = row.artwork_expo_id?.trim();
    if (!artworkId || !expoRef) continue;
    const expoId = expoRefToCanonical[expoRef];
    if (!expoId) continue;
    artworkToExpo[artworkId] = expoId;
    artworkIds.push(artworkId);
  }

  return { artworkToExpo, artworkIds };
}

/** Coûts cumulés par exposition (somme des œuvres rattachées). */
export async function getCostTotalsByExpoIds(expoIds: string[]): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  for (const id of expoIds) totals[id] = 0;

  const { artworkToExpo, artworkIds } = await buildExpoArtworkMap(expoIds);
  if (artworkIds.length === 0) return totals;

  const byArtwork = await getCostTotalsByArtworkIds(artworkIds);
  for (const [artworkId, cost] of Object.entries(byArtwork)) {
    const expoId = artworkToExpo[artworkId];
    if (expoId) totals[expoId] = (totals[expoId] ?? 0) + cost;
  }

  return totals;
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

/** Exporte les événements courants vers un fichier CSV (BOM UTF-8). */
export function exportCostsCsv(events: CostEvent[]): void {
  const headers = [
    "date", "tool_type", "provider", "api_name", "model_name",
    "operation_name", "cost_estimated", "currency", "status",
    "input_units", "output_units", "unit_type", "source", "request_id",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = events.map((e) => [
    e.created_at.slice(0, 19).replace("T", " "),
    e.tool_type, e.provider,
    e.api_name ?? "", e.model_name ?? "", e.operation_name ?? "",
    effectiveCostEstimatedUsd(e).toFixed(8), e.currency, e.status,
    e.input_units ?? "", e.output_units ?? "", e.unit_type ?? "",
    e.source ?? "", e.request_id ?? "",
  ].map(esc).join(","));

  const csv = [headers.map(esc).join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `couts_ia_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export { effectiveCostEstimatedUsd };

export function formatCost(value: number, currency = "EUR", decimals = 4): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${value.toFixed(decimals)} ${sym}`;
}

export type EntityCostDisplay =
  | { status: "unavailable" }
  | { status: "ready"; usdFormatted: string; eurFormatted: string | null };

export function resolveEntityCostDisplay(
  costUsd: number | undefined,
  isReady: boolean,
  usdToEurRate: number | null,
  decimals = 2,
): EntityCostDisplay {
  if (!isReady || costUsd === undefined || !Number.isFinite(costUsd) || costUsd <= 0) {
    return { status: "unavailable" };
  }
  const usdFormatted = formatCost(costUsd, "USD", decimals);
  const eurFormatted =
    usdToEurRate && usdToEurRate > 0
      ? formatCost(costUsd * usdToEurRate, "EUR", decimals)
      : null;
  return { status: "ready", usdFormatted, eurFormatted };
}

/** Affiche l'équivalent EUR pour un montant USD (ex. « ≈ 0,0793 € »). */
export function formatUsdToEurHint(usd: number, usdToEurRate: number, decimals = 4): string {
  return `≈ ${(usd * usdToEurRate).toFixed(decimals)} €`;
}
