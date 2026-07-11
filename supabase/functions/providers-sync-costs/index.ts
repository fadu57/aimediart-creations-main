/**
 * providers-sync-costs/index.ts
 * Synchronise les coûts pour groq, google_gemini, google_tts.
 *
 * POST /functions/v1/providers-sync-costs
 * Body :
 *   {
 *     "provider_key"?: "groq" | "google_gemini" | "google_tts",
 *     "mode"?: "incremental" | "backfill",
 *     "date_from"?: "YYYY-MM-DD",   // requis si mode=backfill
 *     "date_to"?: "YYYY-MM-DD",
 *     "days"?: number               // incremental, défaut 7
 *   }
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import {
  ACTIVE_COST_SYNC_PROVIDER_KEYS,
  parseProviderSyncBody,
  type CostSyncMode,
  type ProviderSyncContext,
} from "../_shared/providerSyncContext.ts";
import {
  syncGoogleBillingCosts,
  updateGoogleProviderSyncStatus,
} from "../_shared/googleBilling.ts";
import {
  syncGroqEstimatedCosts,
  updateGroqProviderSyncStatus,
} from "../_shared/groqCostEstimator.ts";
import {
  syncGeminiLogEstimatedCosts,
  updateGeminiLogProviderSyncNotes,
} from "../_shared/geminiLogCostEstimator.ts";
import {
  syncGoogleTtsEstimatedCosts,
  updateGoogleTtsProviderSyncStatus,
} from "../_shared/ttsCostEstimator.ts";

const GOOGLE_GEMINI_PROVIDER_KEY = "google_gemini";

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[providers-sync-costs]", req.method);

  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse({ error: "server_config", details: "Service role client unavailable." }, 500);
  }

  const auth = await requireAdminUser(req, admin);
  if (!auth.authorized) {
    return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
  }

  const startedAt = Date.now();
  const body = parseProviderSyncBody(await req.json().catch(() => ({})));

  const mode: CostSyncMode = body.mode ?? "incremental";
  const ctx: ProviderSyncContext = {
    admin,
    mode,
    dateFrom: body.date_from,
    dateTo: body.date_to,
    days: body.days,
    providerKey: body.provider_key,
  };

  // Fournisseurs ciblés
  let keysToSync: string[];
  if (body.provider_key) {
    if (!ACTIVE_COST_SYNC_PROVIDER_KEYS.includes(body.provider_key as typeof ACTIVE_COST_SYNC_PROVIDER_KEYS[number])) {
      return jsonResponse({
        error: "invalid_provider",
        details: `provider_key doit être l'un de : ${ACTIVE_COST_SYNC_PROVIDER_KEYS.join(", ")}`,
      }, 400);
    }
    keysToSync = [body.provider_key];
  } else {
    keysToSync = [...ACTIVE_COST_SYNC_PROVIDER_KEYS];
  }

  const syncResults: Array<{ provider_key: string; status: string; message: string }> = [];

  try {
    // --- Google Gemini (export billing BigQuery + logs médiation par œuvre) ---
    if (keysToSync.includes(GOOGLE_GEMINI_PROVIDER_KEY)) {
      const googleResult = await syncGoogleBillingCosts(ctx, [GOOGLE_GEMINI_PROVIDER_KEY]);
      await updateGoogleProviderSyncStatus(admin, googleResult, googleResult.stats);

      syncResults.push({
        provider_key: GOOGLE_GEMINI_PROVIDER_KEY,
        status: googleResult.status,
        message: googleResult.message,
      });

      const geminiLogsResult = await syncGeminiLogEstimatedCosts(ctx);
      await updateGeminiLogProviderSyncNotes(admin, geminiLogsResult);
      syncResults.push({
        provider_key: "google_gemini_logs",
        status: geminiLogsResult.status,
        message: geminiLogsResult.message,
      });
    }

    // --- Google TTS (estimation depuis ai_usage_logs) ---
    if (keysToSync.includes("google_tts")) {
      const ttsResult = await syncGoogleTtsEstimatedCosts(ctx);
      await updateGoogleTtsProviderSyncStatus(admin, ttsResult);
      syncResults.push({
        provider_key: "google_tts",
        status: ttsResult.status,
        message: ttsResult.message,
      });
    }

    // --- Groq (estimation depuis ai_usage_logs) ---
    if (keysToSync.includes("groq")) {
      const groqResult = await syncGroqEstimatedCosts(ctx);
      await updateGroqProviderSyncStatus(admin, groqResult);
      syncResults.push({
        provider_key: "groq",
        status: groqResult.status,
        message: groqResult.message,
      });
    }

    if (syncResults.length === 0) {
      return jsonResponse({
        success: true,
        synced: 0,
        results: [],
        message: "Aucun fournisseur éligible à synchroniser.",
      });
    }

    const hasError = syncResults.some((r) => r.status === "error");
    const duration = Date.now() - startedAt;

    await admin.from("provider_sync_runs").insert({
      run_type: "sync_costs",
      provider_key: body.provider_key ?? null,
      status: hasError ? "partial" : "success",
      message: `${syncResults.length} fournisseur(s) traité(s) (mode=${mode}).`,
      details: { results: syncResults, mode, date_from: body.date_from, date_to: body.date_to, days: body.days },
      triggered_by: auth.userId,
      duration_ms: duration,
    });

    return jsonResponse({
      success: true,
      synced: syncResults.length,
      mode,
      results: syncResults,
      duration_ms: duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("provider_sync_runs").insert({
      run_type: "sync_costs",
      status: "error",
      message: msg,
      details: {},
      triggered_by: auth.userId,
      duration_ms: Date.now() - startedAt,
    }).catch(() => {});
    return jsonResponse({ error: "unexpected", details: msg }, 500);
  }
});
