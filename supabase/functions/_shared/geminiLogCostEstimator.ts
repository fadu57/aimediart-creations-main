/**
 * Estimation des coûts Gemini (médiation) depuis ai_usage_logs → ai_usage_events.
 * Complète l'export BigQuery (coûts projet) par les coûts rattachables aux œuvres.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  insertCostEventsIdempotent,
  type CostEventInsert,
} from "./usageEventsInsert.ts";
import {
  resolveSyncDateRange,
  type ProviderSyncContext,
} from "./providerSyncContext.ts";
import type { ProviderSyncResult } from "./providerRegistry.ts";
import {
  artworkIdFromUsageLogRow,
  isMediationUsageLog,
} from "./usageLogArtwork.ts";

/** USD par million de tokens (input / output) — grille indicative. */
type GeminiModelRates = { inputPerM: number; outputPerM: number };

const GEMINI_MODEL_RATES: Record<string, GeminiModelRates> = {
  "gemini-2.5-flash": { inputPerM: 0.15, outputPerM: 0.6 },
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10 },
  "gemini-2.0-flash": { inputPerM: 0.1, outputPerM: 0.4 },
  "gemini-2.5-pro-preview-05-06": { inputPerM: 1.25, outputPerM: 10 },
};

const GEMINI_FALLBACK_RATES: GeminiModelRates = { inputPerM: 0.35, outputPerM: 1.05 };

type AiUsageLogRow = {
  id: string;
  model_id: string;
  provider: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  artwork_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function normalizeModelId(raw: string): string {
  return raw.trim().toLowerCase().replace(/^models\//, "");
}

function getRatesForModel(modelId: string): { rates: GeminiModelRates; known: boolean } {
  const norm = normalizeModelId(modelId);
  if (GEMINI_MODEL_RATES[norm]) {
    return { rates: GEMINI_MODEL_RATES[norm], known: true };
  }
  for (const [key, rates] of Object.entries(GEMINI_MODEL_RATES)) {
    if (norm.includes(key) || key.includes(norm)) {
      return { rates, known: true };
    }
  }
  return { rates: GEMINI_FALLBACK_RATES, known: false };
}

export function estimateGeminiLogCostUsd(
  promptTokens: number,
  completionTokens: number,
  modelId: string,
): { cost: number; rates: GeminiModelRates; pricingKnown: boolean } {
  const { rates, known } = getRatesForModel(modelId);
  const cost =
    (promptTokens / 1_000_000) * rates.inputPerM +
    (completionTokens / 1_000_000) * rates.outputPerM;
  return { cost: Math.round(cost * 1_000_000) / 1_000_000, rates, pricingKnown: known };
}

function logToCostEvent(log: AiUsageLogRow): CostEventInsert {
  const pt = Math.max(0, Number(log.prompt_tokens ?? 0));
  const ct = Math.max(0, Number(log.completion_tokens ?? 0));
  const { cost, rates, pricingKnown } = estimateGeminiLogCostUsd(pt, ct, log.model_id);
  const artworkId = artworkIdFromUsageLogRow(log);
  const mediation = isMediationUsageLog(log);

  return {
    import_hash: `gemini_log:${log.id}`,
    created_at: log.created_at,
    tool_type: "llm",
    provider: "google_gemini",
    api_name: "gemini_generate_content",
    model_name: log.model_id,
    operation_name: mediation ? "mediation" : "ai_usage_log_backfill",
    input_units: pt,
    output_units: ct,
    unit_type: "tokens",
    cost_estimated: cost,
    currency: "USD",
    status: "success",
    source: "ai_usage_logs",
    metadata: {
      billing_mode: "estimated_from_logs",
      pricing_known: pricingKnown,
      rates_input_per_m: rates.inputPerM,
      rates_output_per_m: rates.outputPerM,
      ai_usage_log_id: log.id,
      artwork_id: artworkId,
      ...(artworkId ? { text_id: artworkId } : {}),
      total_tokens: log.total_tokens,
      disclaimer: "Coût Gemini estimé depuis ai_usage_logs — pas la facture BigQuery.",
      ...(log.metadata ?? {}),
    },
  };
}

/** Sync des logs Gemini (médiation) vers ai_usage_events. */
export async function syncGeminiLogEstimatedCosts(
  ctx: ProviderSyncContext,
): Promise<ProviderSyncResult & { stats?: Record<string, number> }> {
  let dateRange: { from: string; to: string };
  try {
    dateRange = resolveSyncDateRange(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "error", message: msg, error: msg };
  }

  const fromIso = `${dateRange.from}T00:00:00.000Z`;
  const toIso = `${dateRange.to}T23:59:59.999Z`;

  const { data: logs, error } = await ctx.admin
    .from("ai_usage_logs")
    .select(
      "id, model_id, provider, prompt_tokens, completion_tokens, total_tokens, artwork_id, created_at, metadata",
    )
    .eq("provider", "gemini")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      status: "error",
      message: "Lecture ai_usage_logs impossible (gemini).",
      error: error.message,
    };
  }

  const rows = (logs ?? []) as AiUsageLogRow[];
  if (rows.length === 0) {
    return {
      status: "success",
      message: `Aucun log Gemini sur la période ${dateRange.from} → ${dateRange.to}.`,
      rawData: { logs: 0, inserted: 0, skipped: 0 },
    };
  }

  const events = rows.map(logToCostEvent);
  const insertResult = await insertCostEventsIdempotent(ctx.admin, events);

  const withoutArtwork = rows.filter((r) => !artworkIdFromUsageLogRow(r)).length;

  const stats = {
    logs: rows.length,
    inserted: insertResult.inserted,
    skipped: insertResult.skipped,
    without_artwork_id: withoutArtwork,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  };

  if (insertResult.errors.length) {
    return {
      status: "partial",
      message: `${rows.length} log(s) Gemini traité(s), ${insertResult.inserted} inséré(s).`,
      error: insertResult.errors.slice(0, 3).join("; "),
      rawData: stats,
    };
  }

  const artworkWarn = withoutArtwork > 0
    ? ` ${withoutArtwork} log(s) sans artwork_id (non filtrables par expo).`
    : "";

  return {
    status: "success",
    message:
      `${rows.length} log(s) Gemini → ${insertResult.inserted} événement(s) estimé(s), ` +
      `${insertResult.skipped} doublon(s). Période ${dateRange.from} → ${dateRange.to}.${artworkWarn}`,
    rawData: stats,
  };
}

export async function updateGeminiLogProviderSyncNotes(
  admin: SupabaseClient,
  logSyncResult: ProviderSyncResult,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from("cost_providers")
    .select("metadata, notes")
    .eq("provider_key", "google_gemini")
    .maybeSingle();

  const prevMeta = (row as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
  await admin.from("cost_providers").update({
    last_synced_at: now,
    metadata: {
      ...prevMeta,
      logs_sync_last_at: now,
      logs_sync_last_status: logSyncResult.status,
      logs_sync_last_stats: logSyncResult.rawData ?? null,
    },
  }).eq("provider_key", "google_gemini");
}
