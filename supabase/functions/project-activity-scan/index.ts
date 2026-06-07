/**
 * project-activity-scan
 * Scan created_at / updated_at du schéma public (RPC scan_project_activity_timestamps).
 *
 * POST /functions/v1/project-activity-scan
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = getServiceRoleClient();
    const auth = await requireAdminUser(req, admin);
    if (!auth.authorized) {
      return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
    }

    const { data, error } = await admin.rpc("scan_project_activity_timestamps");
    if (error) {
      console.error("[project-activity-scan]", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse(data ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[project-activity-scan]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
