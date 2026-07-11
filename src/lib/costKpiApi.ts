/**
 * KPI coûts vérifiés via Edge Function get-cost-kpi (service role, scan intégral).
 */
import { supabase } from "./supabase";
import type { CostBreakdownItem, CostFilters, CostSummary } from "./costs";

export type VerifiedCostKpi = {
  summary: CostSummary;
  byProvider: CostBreakdownItem[];
  integrity: {
    rows_scanned: number;
    cursor_total_usd: number;
    openai_total_usd: number;
    computed_at: string;
    source: string;
  };
};

function mapFiltersToApi(filters: CostFilters): Record<string, string | undefined> {
  return {
    date_from: filters.dateFrom?.trim() || undefined,
    date_to: filters.dateTo?.trim() || undefined,
    tool_type: filters.toolType?.trim() || undefined,
    provider: filters.provider?.trim() || undefined,
    api_name: filters.apiName?.trim() || undefined,
    model_name: filters.modelName?.trim() || undefined,
    operation_name: filters.operationName?.trim() || undefined,
    status: filters.status?.trim() || undefined,
    currency: filters.currency?.trim() || undefined,
    artwork_id: filters.artworkId?.trim() || undefined,
    expo_id: filters.expoId?.trim() || undefined,
    agency_id: filters.agencyId?.trim() || undefined,
  };
}

export async function fetchVerifiedCostKpi(
  filters: CostFilters,
  usdToEurRate: number | null = null,
): Promise<{ data: VerifiedCostKpi | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("get-cost-kpi", {
    body: {
      filters: mapFiltersToApi(filters),
      usd_to_eur_rate: usdToEurRate,
    },
  });

  if (error) {
    let detail = error.message ?? "Erreur get-cost-kpi";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx?.json) {
        const body = await ctx.json() as Record<string, string>;
        detail = body.details || body.error || detail;
      }
    } catch { /* ignore */ }
    return { data: null, error: detail };
  }

  const payload = (typeof data === "string" ? JSON.parse(data) : data) as {
    success?: boolean;
    summary?: {
      total_cost_usd: number;
      call_count: number;
      avg_cost_per_call: number;
      total_input_units?: number;
      total_output_units?: number;
      top_provider: string | null;
      top_tool: string | null;
      currency: "USD";
    };
    by_provider?: Array<{ label: string; total_cost: number; call_count: number }>;
    integrity?: VerifiedCostKpi["integrity"];
    error?: string;
    details?: string;
  };

  if (!payload?.success || !payload.summary) {
    return {
      data: null,
      error: payload?.details || payload?.error || "Réponse get-cost-kpi invalide.",
    };
  }

  return {
    data: {
      summary: {
        totalCost: payload.summary.total_cost_usd,
        callCount: payload.summary.call_count,
        avgCostPerCall: payload.summary.avg_cost_per_call,
        totalInputUnits: payload.summary.total_input_units ?? 0,
        totalOutputUnits: payload.summary.total_output_units ?? 0,
        topProvider: payload.summary.top_provider,
        topTool: payload.summary.top_tool,
        currency: payload.summary.currency,
      },
      byProvider: (payload.by_provider ?? []).map((row) => ({
        label: row.label,
        totalCost: row.total_cost,
        callCount: row.call_count,
      })),
      integrity: payload.integrity ?? {
        rows_scanned: payload.summary.call_count,
        cursor_total_usd: 0,
        openai_total_usd: 0,
        computed_at: new Date().toISOString(),
        source: "service_role_full_scan",
      },
    },
    error: null,
  };
}
