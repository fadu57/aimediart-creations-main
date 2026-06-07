/**
 * ovh-sync-invoices
 * Importe les factures OVH via API /me/bill (à partir du 01/04/2026).
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { syncOvhInvoicesFromApi } from "../_shared/ovhInvoiceSync.ts";

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
    const result = await syncOvhInvoicesFromApi(admin);
    return jsonResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ovh-sync-invoices]", msg);
    return jsonResponse({ error: "sync_failed", details: msg }, 500);
  }
});
