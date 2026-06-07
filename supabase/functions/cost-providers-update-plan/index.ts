/**
 * cost-providers-update-plan
 * PATCH /functions/v1/cost-providers-update-plan
 * Body: { provider_key: "cursor"|"supabase"|"vercel", plan: ... }
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import {
  cursorPlanAmount,
  isCursorPlanName,
  type CursorPlanName,
} from "../_shared/cursorPlan.ts";
import {
  isSupabasePlanName,
  supabasePlanAmount,
  type SupabasePlanName,
} from "../_shared/supabasePlan.ts";
import {
  isVercelPlanName,
  vercelPlanAmount,
  type VercelPlanName,
} from "../_shared/vercelPlan.ts";

type UpdatePlanBody = {
  provider_key?: string;
  plan?: string;
};

const SUPPORTED_PROVIDERS = new Set(["cursor", "supabase", "vercel"]);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "PATCH" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse({ error: "server_config", details: "Service role client unavailable." }, 500);
  }

  const auth = await requireAdminUser(req, admin);
  if (!auth.authorized) {
    return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
  }

  let body: UpdatePlanBody = {};
  try {
    body = (await req.json()) as UpdatePlanBody;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const providerKey = typeof body.provider_key === "string" ? body.provider_key.trim() : "";
  if (!SUPPORTED_PROVIDERS.has(providerKey)) {
    return jsonResponse({
      error: "invalid_provider",
      details: "provider_key doit être 'cursor', 'supabase' ou 'vercel'.",
    }, 400);
  }

  let amountUsd: number;
  let planLabel: string;

  if (providerKey === "cursor") {
    if (!isCursorPlanName(body.plan)) {
      return jsonResponse({
        error: "invalid_plan",
        details: "plan doit être 'Pro' ou 'Pro+'.",
      }, 400);
    }
    const plan: CursorPlanName = body.plan;
    amountUsd = cursorPlanAmount(plan);
    planLabel = plan;
  } else if (providerKey === "supabase") {
    if (!isSupabasePlanName(body.plan)) {
      return jsonResponse({
        error: "invalid_plan",
        details: "plan doit être 'Free' ou 'Pro'.",
      }, 400);
    }
    const plan: SupabasePlanName = body.plan;
    amountUsd = supabasePlanAmount(plan);
    planLabel = plan;
  } else {
    if (!isVercelPlanName(body.plan)) {
      return jsonResponse({
        error: "invalid_plan",
        details: "plan doit être 'Hobby' ou 'Pro'.",
      }, 400);
    }
    const plan: VercelPlanName = body.plan;
    amountUsd = vercelPlanAmount(plan);
    planLabel = plan;
  }

  const { data: existing, error: readErr } = await admin
    .from("cost_providers")
    .select("id, metadata")
    .eq("provider_key", providerKey)
    .maybeSingle();

  if (readErr) {
    return jsonResponse({ error: "read_failed", details: readErr.message }, 500);
  }
  if (!existing) {
    return jsonResponse({ error: "not_found", details: `Provider ${providerKey} introuvable.` }, 404);
  }

  const currentMeta = (existing.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata = {
    ...currentMeta,
    plan: planLabel,
    amount_usd: amountUsd,
  };

  const { error: updateErr } = await admin
    .from("cost_providers")
    .update({
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_key", providerKey);

  if (updateErr) {
    return jsonResponse({ error: "update_failed", details: updateErr.message }, 500);
  }

  return jsonResponse({
    success: true,
    provider_key: providerKey,
    new_plan: planLabel,
    new_amount: amountUsd,
  });
});
