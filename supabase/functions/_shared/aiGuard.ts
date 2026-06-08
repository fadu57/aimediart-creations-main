/**
 * Garde-fou préventif avant appel Groq / Gemini.
 * S'appuie sur la vue public.ai_usage_vs_limits (migration_64).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { CORS_HEADERS } from "./cors.ts";

export type AIGuardProvider = "groq" | "gemini";

export type AILimitStatus = "ok" | "warning" | "critical" | "blocked" | "unknown";

export type AILimitSource = "auto" | "manual" | "unknown";

export type AILimitViewRow = {
  limit_id: string;
  provider: string;
  model: string | null;
  limit_type: string;
  limit_value: number | null;
  limit_source: AILimitSource;
  current_usage: number;
  usage_pct: number;
  usage_ratio: number;
  status: AILimitStatus;
  alert_threshold_warning: number;
  alert_threshold_critical: number;
};

export type AIGuardCheckResult = {
  allowed: boolean;
  provider?: AIGuardProvider;
  model?: string;
  limit_type?: string;
  usage_pct?: number;
  status?: AILimitStatus;
  message?: string;
  /** Alias legacy — même contenu que `message`. */
  reason?: string;
  /** Alias legacy — même contenu que `limit_type`. */
  limitType?: string;
  /** Alias legacy — même contenu que `usage_pct`. */
  usagePct?: number;
};

const BLOCKING_STATUSES = new Set<AILimitStatus>(["critical", "blocked"]);

function matchesModel(limitModel: string | null, callModel: string): boolean {
  const m = callModel.trim();
  if (!limitModel) return true;
  const l = limitModel.trim();
  if (!m || !l) return false;
  return (
    m === l
    || m.toLowerCase().includes(l.toLowerCase())
    || l.toLowerCase().includes(m.toLowerCase())
  );
}

function parseLimitSource(raw: unknown): AILimitSource {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "auto" || s === "manual" || s === "unknown") return s;
  return "unknown";
}

function parseLimitStatus(raw: unknown): AILimitStatus {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "ok" || s === "warning" || s === "critical" || s === "blocked" || s === "unknown") {
    return s;
  }
  return "unknown";
}

function mapRow(raw: Record<string, unknown>): AILimitViewRow {
  const limitValueRaw = raw.limit_value;
  const limitValue = limitValueRaw == null ? null : Number(limitValueRaw);

  return {
    limit_id: String(raw.limit_id),
    provider: String(raw.provider),
    model: raw.model == null ? null : String(raw.model),
    limit_type: String(raw.limit_type),
    limit_value: Number.isFinite(limitValue) ? limitValue : null,
    limit_source: parseLimitSource(raw.limit_source),
    current_usage: Number(raw.current_usage ?? 0),
    usage_pct: Number(raw.usage_pct ?? 0),
    usage_ratio: Number(raw.usage_ratio ?? 0),
    status: parseLimitStatus(raw.status),
    alert_threshold_warning: Number(raw.alert_threshold_warning ?? 0.8),
    alert_threshold_critical: Number(raw.alert_threshold_critical ?? 0.95),
  };
}

function blockMessage(
  provider: AIGuardProvider,
  model: string,
  limitType: string,
  status: AILimitStatus,
): string {
  const modelLabel = model.trim() || "modèle inconnu";

  if (limitType === "TPD" || limitType === "RPD" || limitType === "ASD") {
    if (status === "blocked") {
      return `Limite journalière ${provider} atteinte pour ${modelLabel}. Réessaie dans quelques heures.`;
    }
    return `Limite journalière ${provider} quasi atteinte pour ${modelLabel}. Réessaie dans quelques heures.`;
  }

  if (limitType === "TPM" || limitType === "RPM") {
    if (status === "blocked") {
      return `Limite minute ${provider} atteinte pour ${modelLabel}. Réessaie dans une minute.`;
    }
    return `Limite minute ${provider} quasi atteinte pour ${modelLabel}. Réessaie dans une minute.`;
  }

  if (limitType === "ASH") {
    return `Limite horaire audio ${provider} atteinte pour ${modelLabel}. Réessaie plus tard.`;
  }

  return `Limite ${limitType} ${provider} atteinte pour ${modelLabel}. Réessaie plus tard.`;
}

async function fetchRelevantLimits(
  supabase: SupabaseClient,
  provider: AIGuardProvider,
  model: string,
): Promise<AILimitViewRow[]> {
  const { data, error } = await supabase
    .from("ai_usage_vs_limits")
    .select("*")
    .eq("provider", provider);

  if (error) {
    throw new Error(`ai_usage_vs_limits: ${error.message}`);
  }

  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r) => matchesModel(r.model, model));
}

function buildBlockedResult(
  provider: AIGuardProvider,
  model: string,
  row: AILimitViewRow,
): AIGuardCheckResult {
  const message = blockMessage(provider, model, row.limit_type, row.status);
  return {
    allowed: false,
    provider,
    model: model.trim(),
    limit_type: row.limit_type,
    usage_pct: row.usage_pct,
    status: row.status,
    message,
    reason: message,
    limitType: row.limit_type,
    usagePct: row.usage_pct,
  };
}

/**
 * Vérifie les plafonds avant un appel IA.
 * Bloque uniquement si au moins une limite du modèle est `critical` ou `blocked`.
 */
export async function checkAILimitBeforeCall(
  supabase: SupabaseClient,
  provider: AIGuardProvider,
  model: string,
  _estimatedTokens?: number,
): Promise<AIGuardCheckResult> {
  try {
    const modelUsed = model.trim();
    const limits = await fetchRelevantLimits(supabase, provider, modelUsed);

    if (!limits.length) {
      return { allowed: true };
    }

    for (const row of limits) {
      if (row.limit_source === "unknown") {
        const label = row.model ?? modelUsed;
        console.warn(
          `[aiGuard] Limite inconnue pour ${provider}/${label} (${row.limit_type}) — pas encore observée via headers`,
        );
      }
    }

    for (const row of limits) {
      if (row.status === "warning") {
        const label = row.model ?? modelUsed;
        console.warn(
          `[aiGuard] Consommation élevée ${provider}/${label} — ${row.limit_type} à ${row.usage_pct.toFixed(1)} %`,
        );
      }
    }

    const blockingRows = limits.filter((r) => BLOCKING_STATUSES.has(r.status));
    if (!blockingRows.length) {
      return { allowed: true };
    }

    const worst = blockingRows.reduce((a, b) => (b.usage_pct > a.usage_pct ? b : a));
    return buildBlockedResult(provider, modelUsed, worst);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[aiGuard] Vérification des limites ignorée (non bloquant): ${msg}`);
    return { allowed: true };
  }
}

/** Réponse HTTP 429 prête à renvoyer depuis une Edge Function. */
export function aiGuardBlockedResponse(result: AIGuardCheckResult): Response {
  const body = {
    error: "rate_limit_exceeded" as const,
    provider: result.provider ?? "unknown",
    model: result.model ?? "unknown",
    limit_type: result.limit_type ?? result.limitType ?? "unknown",
    usage_pct: result.usage_pct ?? result.usagePct ?? 0,
    status: result.status ?? "blocked",
    message: result.message ?? result.reason ?? "Limite IA atteinte.",
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "60",
    },
  });
}
