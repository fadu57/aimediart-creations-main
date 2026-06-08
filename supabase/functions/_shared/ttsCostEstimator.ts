/**
 * Estimation des coûts Google Cloud TTS (Neural2) depuis ai_usage_logs.
 *
 * Tarif : 16 USD / million de caractères.
 * Quota gratuit : 1 000 000 caractères / mois calendaire.
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

export const GOOGLE_TTS_USD_PER_MILLION_CHARS = 16;
export const GOOGLE_TTS_FREE_CHARS_PER_MONTH = 1_000_000;

export type GoogleTtsCostEstimate = {
  costUsd: number;
  billableChars: number;
  freeCharsApplied: number;
};

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

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function estimateGoogleTtsCostUsd(
  characterCount: number,
  monthCharsAlreadyUsed = 0,
): GoogleTtsCostEstimate {
  const chars = Math.max(0, Math.round(characterCount));
  const used = Math.max(0, Math.round(monthCharsAlreadyUsed));
  const freeRemaining = Math.max(0, GOOGLE_TTS_FREE_CHARS_PER_MONTH - used);
  const freeCharsApplied = Math.min(chars, freeRemaining);
  const billableChars = chars - freeCharsApplied;
  const costUsd =
    Math.round((billableChars / 1_000_000) * GOOGLE_TTS_USD_PER_MILLION_CHARS * 1_000_000) /
    1_000_000;

  return { costUsd, billableChars, freeCharsApplied };
}

function characterCountFromLog(log: AiUsageLogRow): number {
  const ct = Math.max(0, Number(log.completion_tokens ?? 0));
  if (ct > 0) return ct;
  return Math.max(0, Number(log.total_tokens ?? 0));
}

function operationNameFromLog(log: AiUsageLogRow): string {
  const op = log.metadata?.operation;
  if (typeof op === "string" && op.trim()) return op.trim();
  return "tts_synthesize";
}

/** Applique le quota mensuel chronologiquement et produit les événements coût. */
export function buildGoogleTtsCostEvents(logs: AiUsageLogRow[]): CostEventInsert[] {
  const sorted = [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const monthCharsUsed = new Map<string, number>();
  const events: CostEventInsert[] = [];

  for (const log of sorted) {
    const chars = characterCountFromLog(log);
    if (chars <= 0) continue;

    const month = monthKey(log.created_at);
    const already = monthCharsUsed.get(month) ?? 0;
    const { costUsd, billableChars, freeCharsApplied } = estimateGoogleTtsCostUsd(chars, already);
    monthCharsUsed.set(month, already + freeCharsApplied + billableChars);

    events.push({
      import_hash: `google_tts_log:${log.id}`,
      created_at: log.created_at,
      tool_type: "tts",
      provider: "google_tts",
      api_name: "google_cloud_text_to_speech",
      model_name: log.model_id,
      operation_name: operationNameFromLog(log),
      input_units: 0,
      output_units: chars,
      unit_type: "characters",
      cost_estimated: costUsd,
      currency: "USD",
      status: "success",
      source: "ai_usage_logs",
      metadata: {
        billing_mode: "estimated_from_logs",
        pricing_usd_per_million_chars: GOOGLE_TTS_USD_PER_MILLION_CHARS,
        free_chars_per_month: GOOGLE_TTS_FREE_CHARS_PER_MONTH,
        billable_chars: billableChars,
        free_chars_applied: freeCharsApplied,
        ai_usage_log_id: log.id,
        artwork_id: log.artwork_id,
        disclaimer:
          "Coût estimé Neural2 — quota gratuit 1 M car./mois appliqué. Vérifier sur console.cloud.google.com.",
      },
    });
  }

  return events;
}

export async function syncGoogleTtsEstimatedCosts(
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
    .eq("provider", "google_tts")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      status: "error",
      message: "Lecture ai_usage_logs impossible (google_tts).",
      error: error.message,
    };
  }

  const rows = (logs ?? []) as AiUsageLogRow[];
  if (rows.length === 0) {
    return {
      status: "success",
      message: `Aucun log google_tts sur la période ${dateRange.from} → ${dateRange.to}.`,
      rawData: { logs: 0, inserted: 0, skipped: 0 },
    };
  }

  const events = buildGoogleTtsCostEvents(rows);
  const insertResult = await insertCostEventsIdempotent(ctx.admin, events);

  const stats = {
    logs: rows.length,
    events: events.length,
    inserted: insertResult.inserted,
    skipped: insertResult.skipped,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  };

  if (insertResult.errors.length) {
    return {
      status: "partial",
      message: `${rows.length} log(s) google_tts traité(s), ${insertResult.inserted} inséré(s).`,
      error: insertResult.errors.slice(0, 3).join("; "),
      rawData: stats,
    };
  }

  return {
    status: "success",
    message:
      `${rows.length} log(s) google_tts → ${insertResult.inserted} événement(s) estimé(s), ` +
      `${insertResult.skipped} doublon(s). Période ${dateRange.from} → ${dateRange.to}. ` +
      "Montants estimés Neural2 (USD) — quota 1 M car./mois appliqué.",
    rawData: stats,
  };
}

export async function updateGoogleTtsProviderSyncStatus(
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
    status: result.status === "success" ? "active" : "error",
    notes:
      "Coûts estimés depuis ai_usage_logs — Neural2, 16 USD/M car., quota gratuit 1 M car./mois.",
    metadata: {
      billing_mode: "api_per_character",
      app_tts_engine: "google_cloud_tts",
      pricing_usd_per_million_chars: GOOGLE_TTS_USD_PER_MILLION_CHARS,
      free_chars_per_month: GOOGLE_TTS_FREE_CHARS_PER_MONTH,
      pricing_source: "https://cloud.google.com/text-to-speech/pricing",
      disclaimer: "Montants indicatifs — vérifier sur la console GCP.",
      last_stats: result.rawData ?? null,
    },
  }).eq("provider_key", "google_tts");
}
