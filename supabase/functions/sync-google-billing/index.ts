/**
 * sync-google-billing — cache budgets GCP (Cloud Billing Budget API).
 * Cron : 06:00 UTC / manuel depuis l'UI admin.
 *
 * Secrets : GOOGLE_BILLING_SERVICE_ACCOUNT_JSON
 * Optionnel : GOOGLE_BILLING_ACCOUNT_ID (défaut 01EC18-4C4AFF-602C34)
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { syncGoogleBillingBudgets } from "../_shared/googleBillingBudgets.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";

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
    console.warn("[sync-google-billing] Service role client unavailable");
    return jsonResponse({ error: "server_config" }, 500);
  }

  if (!isServiceRoleRequest(req)) {
    const auth = await requireAdminUser(req, admin);
    if (!auth.authorized) {
      return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
    }
  }

  const saJson = Deno.env.get("GOOGLE_BILLING_SERVICE_ACCOUNT_JSON")?.trim();
  if (!saJson) {
    console.warn("[sync-google-billing] secret manquant: GOOGLE_BILLING_SERVICE_ACCOUNT_JSON");
    return jsonResponse({
      success: false,
      error: "secret_missing",
      details: "GOOGLE_BILLING_SERVICE_ACCOUNT_JSON",
    });
  }

  try {
    const { budgets, errors } = await syncGoogleBillingBudgets(admin, {
      serviceAccountJson: saJson,
    });

    if (budgets.length === 0 && errors.length > 0) {
      return jsonResponse({
        success: false,
        error: "sync_partial",
        details: errors.join(" — "),
        errors,
      });
    }

    return jsonResponse({
      success: true,
      budgets: budgets.map((b) => ({
        budget_id: b.budget_id,
        budget_name: b.budget_name,
        budget_amount: b.budget_amount,
        budget_currency: b.budget_currency,
        cost_amount: b.cost_amount,
        usage_pct: b.usage_pct,
        period_start: b.period_start,
        period_end: b.period_end,
      })),
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[sync-google-billing] sync failed:", msg);
    let hint: string | undefined;
    if (msg.includes("PERMISSION_DENIED") || msg.includes("does not have permission")) {
      hint =
        "Le rôle doit être accordé au compte de service (client_email du JSON), pas à votre email personnel. " +
        "Console GCP → Facturation → compte 01EC18-4C4AFF-602C34 → Autorisations du compte → Ajouter le principal " +
        "indiqué ci-dessus (ex. xxx@yyy.iam.gserviceaccount.com) avec « Visualiseur du compte de facturation ». " +
        "Activez aussi « Cloud Billing Budget API » sur le projet du compte de service.";
    }
    return jsonResponse({
      success: false,
      error: "sync_failed",
      details: msg,
      hint,
    });
  }
});
