/**
 * Estimation des coûts Groq à partir de ai_usage_logs.
 *
 * Groq ne fournit pas d'API de facturation publique dans ce projet.
 * Les montants sont ESTIMÉS via la grille tarifaire codée ci-dessous.
 * Mettre à jour périodiquement depuis https://console.groq.com/docs/pricing
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

/** USD par million de tokens (input / output). */
type GroqModelRates = { inputPerM: number; outputPerM: number };

/**
 * Grille indicative — à maintenir manuellement.
 * Modèles inconnus : tarif fallback conservateur.
 */
const GROQ_MODEL_RATES: Record<string, GroqModelRates> = {
  "llama-3.3-70b-versatile": { inputPerM: 0.59, outputPerM: 0.79 },
  "llama-3.1-8b-instant": { inputPerM: 0.05, outputPerM: 0.08 },
  "llama3-70b-8192": { inputPerM: 0.59, outputPerM: 0.79 },
  "llama3-8b-8192": { inputPerM: 0.05, outputPerM: 0.08 },
  "mixtral-8x7b-32768": { inputPerM: 0.24, outputPerM: 0.24 },
  "gemma2-9b-it": { inputPerM: 0.20, outputPerM: 0.20 },
};

const GROQ_FALLBACK_RATES: GroqModelRates = { inputPerM: 0.50, outputPerM: 0.50 };

type AiUsageLogRow = {
  id: string;
  model_id: string;
  provider: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  artwork_id: string | null;
  created_at: string;
};

function normalizeModelId(raw: string): string {
  return raw.trim().toLowerCase().replace(/^models\//, "");
}

function getRatesForModel(modelId: string): { rates: GroqModelRates; known: boolean } {
  const norm = normalizeModelId(modelId);
  if (GROQ_MODEL_RATES[norm]) {
    return { rates: GROQ_MODEL_RATES[norm], known: true };
  }
  // Correspondance partielle (ex. llama-3.3-70b-versatile-xxx)
  for (const [key, rates] of Object.entries(GROQ_MODEL_RATES)) {
    if (norm.includes(key) || key.includes(norm)) {
      return { rates, known: true };
    }
  }
  return { rates: GROQ_FALLBACK_RATES, known: false };
}

/** Coût USD estimé pour une ligne de log. */
export function estimateGroqCostUsd(
  promptTokens: number,
  completionTokens: number,
  modelId: string,
): { cost: number; rates: GroqModelRates; pricingKnown: boolean } {
  const { rates, known } = getRatesForModel(modelId);
  const cost =
    (promptTokens / 1_000_000) * rates.inputPerM +
    (completionTokens / 1_000_000) * rates.outputPerM;
  return { cost: Math.round(cost * 1_000_000) / 1_000_000, rates, pricingKnown: known };
}

function logToCostEvent(log: AiUsageLogRow): CostEventInsert {
  const pt = Math.max(0, Number(log.prompt_tokens ?? 0));
  const ct = Math.max(0, Number(log.completion_tokens ?? 0));
  const { cost, rates, pricingKnown } = estimateGroqCostUsd(pt, ct, log.model_id);

  return {
    import_hash: `groq_log:${log.id}`,
    created_at: log.created_at,
    tool_type: "chat",
    provider: "groq",
    api_name: "groq_chat_completions",
    model_name: log.model_id,
    operation_name: "ai_usage_log_backfill",
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
      artwork_id: log.artwork_id,
      total_tokens: log.total_tokens,
      disclaimer: "Coût estimé — pas de facturation Groq directe. Vérifier sur console.groq.com.",
    },
  };
}

/**
 * Backfill / sync incrémentale Groq depuis ai_usage_logs → ai_usage_events.
 */
export async function syncGroqEstimatedCosts(
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
    .select("id, model_id, provider, prompt_tokens, completion_tokens, total_tokens, artwork_id, created_at")
    .eq("provider", "groq")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      status: "error",
      message: "Lecture ai_usage_logs impossible.",
      error: error.message,
    };
  }

  const rows = (logs ?? []) as AiUsageLogRow[];
  if (rows.length === 0) {
    return {
      status: "success",
      message: `Aucun log Groq sur la période ${dateRange.from} → ${dateRange.to}.`,
      rawData: { logs: 0, inserted: 0, skipped: 0 },
    };
  }

  const events = rows.map(logToCostEvent);
  const insertResult = await insertCostEventsIdempotent(ctx.admin, events);

  const stats = {
    logs: rows.length,
    inserted: insertResult.inserted,
    skipped: insertResult.skipped,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  };

  if (insertResult.errors.length) {
    return {
      status: "partial",
      message: `${rows.length} log(s) traité(s), ${insertResult.inserted} inséré(s).`,
      error: insertResult.errors.slice(0, 3).join("; "),
      rawData: stats,
    };
  }

  return {
    status: "success",
    message:
      `${rows.length} log(s) Groq → ${insertResult.inserted} événement(s) estimé(s), ` +
      `${insertResult.skipped} doublon(s). Période ${dateRange.from} → ${dateRange.to}. ` +
      "Montants estimés (USD) — pas de facturation Groq directe.",
    rawData: stats,
  };
}

export async function updateGroqProviderSyncStatus(
  admin: SupabaseClient,
  result: ProviderSyncResult,
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("cost_providers").update({
    last_synced_at: now,
    last_sync_status: result.status,
    last_sync_error: result.error ?? null,
    sync_supported: true,
    cost_import_supported: true,
    notes: "Coûts estimés depuis ai_usage_logs + grille tarifaire Groq (USD). Pas d'API billing Groq.",
    metadata: {
      billing_mode: "estimated_from_logs",
      pricing_source: "https://console.groq.com/docs/pricing",
      disclaimer: "Montants indicatifs — vérifier sur le dashboard Groq.",
      last_stats: result.rawData ?? null,
    },
  }).eq("provider_key", "groq");
}
