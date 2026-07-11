/**
 * get-cost-kpi — KPI coûts fiables (scan intégral service role, admin uniquement).
 *
 * POST /functions/v1/get-cost-kpi
 * Body : { filters?: CostKpiRequestFilters, usd_to_eur_rate?: number }
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient, getRequestUserId } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import {
  computeCostKpi,
  type CostKpiRequestFilters,
} from "../_shared/costKpiCompute.ts";

function parseFilters(raw: unknown): CostKpiRequestFilters {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const pick = (key: keyof CostKpiRequestFilters) => {
    const v = o[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    date_from: pick("date_from") ?? pick("dateFrom"),
    date_to: pick("date_to") ?? pick("dateTo"),
    tool_type: pick("tool_type") ?? pick("toolType"),
    provider: pick("provider"),
    api_name: pick("api_name") ?? pick("apiName"),
    model_name: pick("model_name") ?? pick("modelName"),
    operation_name: pick("operation_name") ?? pick("operationName"),
    status: pick("status"),
    currency: pick("currency"),
    artwork_id: pick("artwork_id") ?? pick("artworkId"),
    expo_id: pick("expo_id") ?? pick("expoId"),
    agency_id: pick("agency_id") ?? pick("agencyId"),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse({ error: "server_config", details: "Service role unavailable." }, 500);
  }

  const auth = await requireAdminUser(req, admin);
  if (!auth.authorized) {
    // Secours : app_metadata via Admin API (JWT décodé peut omettre role_id)
    const userId = await getRequestUserId(req);
    if (userId) {
      const { data: userRow } = await admin.auth.admin.getUserById(userId);
      const metaRole = Number(
        userRow?.user?.app_metadata?.role_id ??
          userRow?.user?.user_metadata?.role_id ??
          NaN,
      );
      if (Number.isFinite(metaRole) && metaRole < 4) {
        console.log(`[get-cost-kpi] Accès via app_metadata role_id=${metaRole}`);
      } else {
        return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
      }
    } else {
      return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filters = parseFilters(body.filters);
    const rateRaw = body.usd_to_eur_rate ?? body.usdToEurRate;
    const usdToEurRate =
      typeof rateRaw === "number" && Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : null;

    const result = await computeCostKpi(admin, filters, usdToEurRate);

    return jsonResponse({
      success: true,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[get-cost-kpi]", msg);
    return jsonResponse({ error: "compute_failed", details: msg }, 500);
  }
});
