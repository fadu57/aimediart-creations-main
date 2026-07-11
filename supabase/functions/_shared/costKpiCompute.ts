/**
 * Agrégation KPI coûts — scan complet via service role (aucune limite client 1000).
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { costAmountInUsd } from "./openAiTtsCost.ts";

const PAGE_SIZE = 1000;

export type CostKpiRequestFilters = {
  date_from?: string;
  date_to?: string;
  tool_type?: string;
  provider?: string;
  api_name?: string;
  model_name?: string;
  operation_name?: string;
  status?: string;
  currency?: string;
  artwork_id?: string;
  expo_id?: string;
  agency_id?: string;
};

export type CostKpiBreakdownItem = {
  label: string;
  total_cost: number;
  call_count: number;
};

export type CostKpiResult = {
  summary: {
    total_cost_usd: number;
    call_count: number;
    avg_cost_per_call: number;
    total_input_units: number;
    total_output_units: number;
    top_provider: string | null;
    top_tool: string | null;
    currency: "USD";
  };
  by_provider: CostKpiBreakdownItem[];
  integrity: {
    rows_scanned: number;
    cursor_total_usd: number;
    openai_total_usd: number;
    computed_at: string;
    source: "service_role_full_scan";
  };
};

type EventRow = {
  id: string;
  created_at: string;
  tool_type: string;
  provider: string;
  cost_estimated: number;
  currency: string;
  input_units: number | null;
  output_units: number | null;
  metadata: Record<string, unknown> | null;
};

async function artworkIdsForExpo(admin: SupabaseClient, expoId: string): Promise<string[]> {
  const { data: expoRow } = await admin
    .from("expos")
    .select("id, expo_id")
    .eq("id", expoId)
    .maybeSingle();

  const expoRefs = new Set<string>([expoId]);
  const legacy = (expoRow as { expo_id?: string | null } | null)?.expo_id?.trim();
  if (legacy) expoRefs.add(legacy);

  const { data } = await admin
    .from("artworks")
    .select("artwork_id")
    .in("artwork_expo_id", [...expoRefs])
    .is("artwork_deleted_at", null);

  return ((data ?? []) as Array<{ artwork_id?: string | null }>)
    .map((r) => r.artwork_id?.trim())
    .filter((id): id is string => Boolean(id));
}

async function artworkIdsForAgency(admin: SupabaseClient, agencyId: string): Promise<string[]> {
  const { data } = await admin
    .from("artworks")
    .select("artwork_id")
    .eq("artwork_agency_id", agencyId)
    .is("artwork_deleted_at", null);

  return ((data ?? []) as Array<{ artwork_id?: string | null }>)
    .map((r) => r.artwork_id?.trim())
    .filter((id): id is string => Boolean(id));
}

function eventMatchesArtworkFilter(row: EventRow, artworkIds: Set<string>): boolean {
  const meta = row.metadata ?? {};
  const artworkId = typeof meta.artwork_id === "string" ? meta.artwork_id.trim() : "";
  const textId = typeof meta.text_id === "string" ? meta.text_id.trim() : "";
  if (artworkId && artworkIds.has(artworkId)) return true;
  if (textId && artworkIds.has(textId)) return true;
  return false;
}

function applyScalarFilters(
  q: ReturnType<SupabaseClient["from"]>,
  filters: CostKpiRequestFilters,
) {
  if (filters.date_from) q = q.gte("created_at", `${filters.date_from}T00:00:00.000Z`);
  if (filters.date_to) q = q.lte("created_at", `${filters.date_to}T23:59:59.999Z`);
  if (filters.tool_type) q = q.eq("tool_type", filters.tool_type);
  if (filters.provider) q = q.eq("provider", filters.provider);
  if (filters.api_name) q = q.eq("api_name", filters.api_name);
  if (filters.model_name) q = q.eq("model_name", filters.model_name);
  if (filters.operation_name) q = q.eq("operation_name", filters.operation_name);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.currency) q = q.eq("currency", filters.currency);
  return q;
}

async function fetchAllCostEvents(
  admin: SupabaseClient,
  filters: CostKpiRequestFilters,
): Promise<EventRow[]> {
  let artworkFilter: Set<string> | null = null;
  const artworkId = filters.artwork_id?.trim();
  if (artworkId) {
    artworkFilter = new Set([artworkId]);
  } else if (filters.expo_id?.trim()) {
    const ids = await artworkIdsForExpo(admin, filters.expo_id.trim());
    artworkFilter = new Set(ids);
    if (artworkFilter.size === 0) return [];
  } else if (filters.agency_id?.trim()) {
    const ids = await artworkIdsForAgency(admin, filters.agency_id.trim());
    artworkFilter = new Set(ids);
    if (artworkFilter.size === 0) return [];
  }

  const rows: EventRow[] = [];
  let from = 0;

  while (true) {
    let q = admin
      .from("ai_usage_events")
      .select("id, created_at, tool_type, provider, cost_estimated, currency, input_units, output_units, metadata")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    q = applyScalarFilters(q, filters);

    const { data, error } = await q;
    if (error) throw new Error(`Lecture ai_usage_events: ${error.message}`);

    const page = (data ?? []) as EventRow[];
    for (const row of page) {
      if (artworkFilter && !eventMatchesArtworkFilter(row, artworkFilter)) continue;
      rows.push(row);
    }

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/** Calcule les KPI coûts de façon fiable (service role, scan intégral). */
export async function computeCostKpi(
  admin: SupabaseClient,
  filters: CostKpiRequestFilters = {},
  usdToEurRate: number | null = null,
): Promise<CostKpiResult> {
  const rows = await fetchAllCostEvents(admin, filters);

  let totalCostUsd = 0;
  let totalInputUnits = 0;
  let totalOutputUnits = 0;
  let cursorTotalUsd = 0;
  let openaiTotalUsd = 0;
  const providerCost = new Map<string, number>();
  const providerCount = new Map<string, number>();
  const toolCount = new Map<string, number>();

  for (const row of rows) {
    const cost = costAmountInUsd(row, usdToEurRate);
    totalCostUsd += cost;
    providerCost.set(row.provider, (providerCost.get(row.provider) ?? 0) + cost);
    providerCount.set(row.provider, (providerCount.get(row.provider) ?? 0) + 1);
    toolCount.set(row.tool_type, (toolCount.get(row.tool_type) ?? 0) + 1);
    if (row.provider === "cursor") cursorTotalUsd += cost;
    if (row.provider === "openai") openaiTotalUsd += cost;
    if (row.input_units != null) totalInputUnits += Number(row.input_units) || 0;
    if (row.output_units != null) totalOutputUnits += Number(row.output_units) || 0;
  }

  const callCount = rows.length;
  const topProvider = [...providerCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topTool = [...toolCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const by_provider = [...providerCost.entries()]
    .map(([label, total_cost]) => ({
      label,
      total_cost,
      call_count: providerCount.get(label) ?? 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost);

  return {
    summary: {
      total_cost_usd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      call_count: callCount,
      avg_cost_per_call: callCount > 0 ? totalCostUsd / callCount : 0,
      total_input_units: totalInputUnits,
      total_output_units: totalOutputUnits,
      top_provider: topProvider,
      top_tool: topTool,
      currency: "USD",
    },
    by_provider,
    integrity: {
      rows_scanned: rows.length,
      cursor_total_usd: Math.round(cursorTotalUsd * 100) / 100,
      openai_total_usd: Math.round(openaiTotalUsd * 100) / 100,
      computed_at: new Date().toISOString(),
      source: "service_role_full_scan",
    },
  };
}
