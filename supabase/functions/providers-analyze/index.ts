/**
 * providers-analyze/index.ts
 * Analyse les fournisseurs connus, détecte leur configuration ET leur usage réel,
 * puis upsert dans cost_providers.
 *
 * POST /functions/v1/providers-analyze
 * Authorization: Bearer <user_jwt>   — requis, role_id < 4
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { detectAllProviders, getActiveProviderKeys } from "../_shared/providerRegistry.ts";
import { isGoogleBillingConfigured } from "../_shared/googleBilling.ts";
import { isOvhApiConfigured } from "../_shared/ovhApiClient.ts";
import { ACTIVE_COST_SYNC_PROVIDER_KEYS } from "../_shared/providerSyncContext.ts";

const FIXED_MONTHLY_PROVIDER_KEYS = new Set(["cursor", "supabase", "vercel"]);
const PRESERVE_METADATA_KEYS = [
  "plan",
  "amount_usd",
  "amount_eur",
  "label",
  "currency",
  "cost_mode",
  "billing_mode",
  "project_ref",
  "billing_day",
] as const;

function mergeProviderMetadata(
  providerKey: string,
  detectionMeta: Record<string, unknown>,
  existingMeta: Record<string, unknown> | undefined,
  stats: {
    eventsCount: number;
    logsCount: number;
    googleBillingReady: boolean;
  },
): Record<string, unknown> {
  let base: Record<string, unknown> = { ...(detectionMeta ?? {}) };
  if (FIXED_MONTHLY_PROVIDER_KEYS.has(providerKey) && existingMeta) {
    for (const key of PRESERVE_METADATA_KEYS) {
      if (existingMeta[key] !== undefined) base[key] = existingMeta[key];
    }
  }
  return {
    ...base,
    recent_events_count: stats.eventsCount,
    recent_logs_count: stats.logsCount,
    ...(providerKey.startsWith("google_")
      ? { billing_configured: stats.googleBillingReady }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Détection de l'usage réel dans les logs de consommation
// ---------------------------------------------------------------------------

/**
 * Vérifie si un fournisseur a des événements récents (30 jours) dans ai_usage_events.
 * Retourne le nombre d'événements trouvés.
 */
async function countRecentEvents(
  admin: ReturnType<typeof getServiceRoleClient>,
  providerKey: string,
): Promise<number> {
  if (!admin) return 0;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await admin
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("provider", providerKey)
    .gte("created_at", since);

  if (error) {
    console.warn(`[providers-analyze] countRecentEvents error for ${providerKey}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Vérifie l'usage dans ai_usage_logs (table legacy Groq/Gemini).
 * La colonne "provider" est présente si la migration correspondante a été jouée.
 */
async function countRecentUsageLogs(
  admin: ReturnType<typeof getServiceRoleClient>,
  providerKey: string,
): Promise<number> {
  if (!admin) return 0;
  // Mapping entre provider_key du registre et valeurs provider dans ai_usage_logs
  const providerMap: Record<string, string> = {
    groq: "groq",
    google_gemini: "gemini",
    google_tts: "gemini",
  };
  const logProvider = providerMap[providerKey];
  if (!logProvider) return 0;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await admin
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("provider", logProvider)
    .gte("created_at", since);

  if (error) return 0; // table peut ne pas exister ou ne pas avoir la colonne provider
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[providers-analyze]", req.method);

  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST")    return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse({ error: "server_config", details: "Service role client unavailable." }, 500);
  }

  // --- Contrôle d'accès métier (role_id < 4) ---
  const auth = await requireAdminUser(req, admin);
  if (!auth.authorized) {
    console.warn("[providers-analyze] Accès refusé:", auth.reason);
    return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
  }

  const startedAt = Date.now();
  const now = new Date().toISOString();

  const results: Array<{
    provider_key: string;
    configured: boolean;
    actively_used: boolean;
    status: string;
  }> = [];

  try {
    const detections = detectAllProviders();

    const { data: existingProviderRows } = await admin
      .from("cost_providers")
      .select("provider_key, metadata")
      .in("provider_key", detections.map(({ definition }) => definition.key));

    const existingMetaByKey = new Map<string, Record<string, unknown>>(
      (existingProviderRows ?? []).map((row) => [
        (row as { provider_key: string }).provider_key,
        ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>,
      ]),
    );

    // Construire les lignes d'upsert en parallèle (détection usage)
    const upsertRows = await Promise.all(
      detections.map(async ({ definition, detection }) => {
        const configured = detection.configured;
        const isInfraProvider = FIXED_MONTHLY_PROVIDER_KEYS.has(definition.key);

        // Vérifier l'usage réel dans les logs
        const [eventsCount, logsCount] = await Promise.all([
          countRecentEvents(admin, definition.key),
          countRecentUsageLogs(admin, definition.key),
        ]);
        const activelyUsed = isInfraProvider || eventsCount > 0 || logsCount > 0;

        // Calcul du statut :
        // - active              = configuré ET utilisé
        // - configured_not_used = configuré MAIS pas détecté dans les logs
        // - detected_not_configured = connu du registre mais clé absente
        let status: string;
        if (configured && activelyUsed) {
          status = "active";
        } else if (configured && !activelyUsed) {
          status = "configured_not_used";
        } else {
          status = "detected_not_configured";
        }

        results.push({
          provider_key: definition.key,
          configured,
          actively_used: activelyUsed,
          status,
        });

        const isCostSyncProvider = (ACTIVE_COST_SYNC_PROVIDER_KEYS as readonly string[])
          .includes(definition.key);
        const googleBillingReady = isGoogleBillingConfigured();
        const costImportSupported = definition.key === "groq"
          ? true
          : definition.key === "google_gemini"
          ? googleBillingReady
          : definition.key === "google_tts"
          ? false
          : definition.key === "ovh"
          ? isOvhApiConfigured()
          : false;

        return {
          provider_key: definition.key,
          provider_name: definition.name,
          category: definition.category,
          detected_in_code: true,
          configured,
          actively_used: activelyUsed,
          sync_supported: definition.key === "ovh"
            ? isOvhApiConfigured()
            : isCostSyncProvider && definition.supportsCostSync,
          cost_import_supported: costImportSupported,
          status,
          last_detected_at: now,
          notes: definition.key === "google_tts"
            ? "TTS visiteur = Web Speech API (navigateur). Aucun coût GCP côté serveur dans cette app."
            : definition.key === "groq"
            ? "Coûts estimés depuis ai_usage_logs (pas d'API billing Groq)."
            : definition.key === "google_gemini"
            ? "Coûts réels via export billing BigQuery si configuré."
            : definition.key === "huggingface"
            ? "Inférence HF (HF_TOKEN). Coûts = crédits HuggingFace — pas de sync billing automatique."
            : definition.key === "cursor"
            ? "Abonnement Cursor (Pro / Pro+). Coût mensuel fixe — sync via sync-cursor-costs."
            : definition.key === "supabase"
            ? "Hébergement Supabase (Free / Pro). Coût mensuel fixe — sync via sync-supabase-costs."
            : definition.key === "vercel"
            ? "Hébergement frontend Vercel (Hobby / Pro). Coût mensuel fixe — sync via sync-vercel-costs."
            : definition.key === "ovh"
            ? "Factures OVH via API /me/bill (≥ 2026-04-01). Sync auto hebdo + bouton manuel ovh-sync-invoices."
            : null,
          metadata: mergeProviderMetadata(
            definition.key,
            (detection.meta ?? {}) as Record<string, unknown>,
            existingMetaByKey.get(definition.key),
            {
              eventsCount,
              logsCount,
              googleBillingReady,
            },
          ),
        };
      }),
    );

    // Upsert sur provider_key (UNIQUE)
    const { error: upsertError } = await admin
      .from("cost_providers")
      .upsert(upsertRows, { onConflict: "provider_key" });

    if (upsertError) {
      console.error("[providers-analyze] upsert error:", upsertError);
      return jsonResponse({ error: "upsert_failed", details: upsertError.message }, 500);
    }

    // Marquer inactifs les fournisseurs retirés du registre actif (ex. legacy HuggingFace)
    const activeKeySet = new Set(getActiveProviderKeys());
    const { data: allRows } = await admin.from("cost_providers").select("provider_key");
    const staleKeys = (allRows ?? [])
      .map((r) => (r as { provider_key: string }).provider_key)
      .filter((k) => !activeKeySet.has(k));

    if (staleKeys.length) {
      await admin
        .from("cost_providers")
        .update({
          status: "inactive",
          detected_in_code: false,
          configured: false,
          actively_used: false,
          sync_supported: false,
          cost_import_supported: false,
          notes: "Retiré du registre actif (legacy / abandonné).",
          metadata: { legacy: true, deactivated_at: now },
        })
        .in("provider_key", staleKeys);
      console.log(`[providers-analyze] ${staleKeys.length} fournisseur(s) legacy marqué(s) inactive.`);
    }

    const duration = Date.now() - startedAt;

    // Log dans provider_sync_runs
    await admin.from("provider_sync_runs").insert({
      run_type: "analyze",
      status: "success",
      message: `${upsertRows.length} fournisseurs analysés.`,
      details: { results },
      triggered_by: auth.userId,
      duration_ms: duration,
    });

    console.log(`[providers-analyze] Done in ${duration}ms — ${upsertRows.length} providers.`);

    return jsonResponse({ success: true, analyzed: upsertRows.length, results, duration_ms: duration });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[providers-analyze] unexpected error:", msg);

    await admin.from("provider_sync_runs").insert({
      run_type: "analyze",
      status: "error",
      message: msg,
      details: {},
      triggered_by: auth.userId,
      duration_ms: Date.now() - startedAt,
    }).catch(() => {});

    return jsonResponse({ error: "unexpected", details: msg }, 500);
  }
});
