/**
 * costs.ts
 * Module dédié au suivi des coûts IA / outils (table ai_usage_events).
 */

import { supabase } from "./supabase";

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
  status?: string;
  currency?: string;
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
  statuses: string[];
  currencies: string[];
};

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

type SupabaseQuery = ReturnType<typeof supabase.from>;

function applyFilters(q: SupabaseQuery, filters: CostFilters): SupabaseQuery {
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
  if (filters.status)    q = q.eq("status",     filters.status);
  if (filters.currency)  q = q.eq("currency",   filters.currency);
  return q;
}

// ---------------------------------------------------------------------------
// Requêtes principales
// ---------------------------------------------------------------------------

/** Récupère les événements paginés selon les filtres. */
export async function getCostEvents(
  filters: CostFilters,
  page = 0,
  pageSize = 50,
): Promise<{ data: CostEvent[]; count: number; error: string | null }> {
  let q = supabase
    .from("ai_usage_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  q = applyFilters(q, filters);

  const { data, error, count } = await q;
  if (error) return { data: [], count: 0, error: error.message };
  return { data: (data ?? []) as CostEvent[], count: count ?? 0, error: null };
}

/** Calcule les indicateurs synthétiques (KPIs). */
export async function getCostSummary(filters: CostFilters): Promise<CostSummary> {
  let q = supabase
    .from("ai_usage_events")
    .select("cost_estimated, currency, provider, tool_type");

  q = applyFilters(q, filters);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) {
    return { totalCost: 0, callCount: 0, avgCostPerCall: 0, topProvider: null, topTool: null, currency: "EUR" };
  }

  type Row = { cost_estimated: number; currency: string; provider: string; tool_type: string };
  const rows = data as Row[];

  let totalCost = 0;
  const providerCount = new Map<string, number>();
  const toolCount = new Map<string, number>();
  let currency = "EUR";

  for (const r of rows) {
    totalCost += Number(r.cost_estimated) || 0;
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
  let q = supabase.from("ai_usage_events").select("provider, cost_estimated");
  q = applyFilters(q, filters);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];

  type Row = { provider: string; cost_estimated: number };
  const by = new Map<string, { cost: number; count: number }>();
  for (const r of data as Row[]) {
    const cur = by.get(r.provider) ?? { cost: 0, count: 0 };
    cur.cost += Number(r.cost_estimated) || 0;
    cur.count += 1;
    by.set(r.provider, cur);
  }

  return [...by.entries()]
    .map(([label, { cost, count }]) => ({ label, totalCost: cost, callCount: count }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/** Répartition des coûts par type d'outil. */
export async function getCostBreakdownByTool(filters: CostFilters): Promise<CostBreakdownItem[]> {
  let q = supabase.from("ai_usage_events").select("tool_type, cost_estimated");
  q = applyFilters(q, filters);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];

  type Row = { tool_type: string; cost_estimated: number };
  const by = new Map<string, { cost: number; count: number }>();
  for (const r of data as Row[]) {
    const cur = by.get(r.tool_type) ?? { cost: 0, count: 0 };
    cur.cost += Number(r.cost_estimated) || 0;
    cur.count += 1;
    by.set(r.tool_type, cur);
  }

  return [...by.entries()]
    .map(([label, { cost, count }]) => ({ label, totalCost: cost, callCount: count }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/** Série temporelle journalière des coûts. */
export async function getCostTimeSeries(filters: CostFilters): Promise<CostTimeSeriesPoint[]> {
  let q = supabase
    .from("ai_usage_events")
    .select("created_at, cost_estimated")
    .order("created_at", { ascending: true });

  q = applyFilters(q, filters);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];

  type Row = { created_at: string; cost_estimated: number };
  const byDate = new Map<string, { cost: number; count: number }>();
  for (const r of data as Row[]) {
    const date = r.created_at.slice(0, 10);
    const cur = byDate.get(date) ?? { cost: 0, count: 0 };
    cur.cost += Number(r.cost_estimated) || 0;
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
    .select("tool_type, provider, api_name, model_name, status, currency")
    .limit(500);

  if (error || !Array.isArray(data)) {
    return { toolTypes: [], providers: [], apiNames: [], modelNames: [], statuses: [], currencies: [] };
  }

  type Row = {
    tool_type: string; provider: string; api_name: string | null;
    model_name: string | null; status: string; currency: string;
  };
  const rows = data as Row[];

  const uniq = <T>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((x): x is T => x != null && String(x).trim() !== ""))].sort() as T[];

  return {
    toolTypes:  uniq(rows.map((r) => r.tool_type)),
    providers:  uniq(rows.map((r) => r.provider)),
    apiNames:   uniq(rows.map((r) => r.api_name)),
    modelNames: uniq(rows.map((r) => r.model_name)),
    statuses:   uniq(rows.map((r) => r.status)),
    currencies: uniq(rows.map((r) => r.currency)),
  };
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
    e.cost_estimated.toFixed(8), e.currency, e.status,
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

export function formatCost(value: number, currency = "EUR", decimals = 4): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${value.toFixed(decimals)} ${sym}`;
}

/** Affiche l'équivalent EUR pour un montant USD (ex. « ≈ 0,0793 € »). */
export function formatUsdToEurHint(usd: number, usdToEurRate: number, decimals = 4): string {
  return `≈ ${(usd * usdToEurRate).toFixed(decimals)} €`;
}
