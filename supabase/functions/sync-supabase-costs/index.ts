/**
 * sync-supabase-costs
 * Insère le coût mensuel fixe Supabase (metadata cost_providers) dans ai_usage_events.
 * Plan Free → ignoré (0 $). Plan Pro → 25 $/mois.
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { syncSupabaseMonthlyCosts } from "../_shared/supabaseCostSync.ts";

function isServiceRoleRequest(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!expected) return false;
  const auth = req.headers.get("Authorization")?.trim();
  return auth === `Bearer ${expected}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse({ error: "server_config", details: "Service role client unavailable." }, 500);
  }

  if (!isServiceRoleRequest(req)) {
    const auth = await requireAdminUser(req, admin);
    if (!auth.authorized) {
      return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
    }
  }

  try {
    const result = await syncSupabaseMonthlyCosts(admin);

    if (result.status === "skipped" || result.status === "already_synced") {
      return jsonResponse({
        message: result.message,
        ...(result.status === "already_synced" ? { period: result.period, already_synced: true } : {}),
      });
    }

    return jsonResponse({
      message: result.message,
      period: result.period,
      amount: result.amount,
      currency: result.currency,
      id: result.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-supabase-costs]", msg);
    return jsonResponse({ error: "sync_failed", details: msg }, 500);
  }
});
