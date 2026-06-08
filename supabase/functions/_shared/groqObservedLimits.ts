/**
 * Ingestion non bloquante des headers de rate limit Groq → RPC ai_upsert_observed_limit.
 * À appeler après chaque réponse Groq réussie (fetch ou Response brute).
 *
 * Ne fait jamais échouer l'appel IA principal : fire-and-forget + catch interne.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type GroqRateLimitHeaders = {
  rpm_limit: string | null;
  rpm_remaining: string | null;
  tpm_limit: string | null;
  tpm_remaining: string | null;
  reset_requests: string | null;
  reset_tokens: string | null;
};

/** Extrait les headers x-ratelimit-* d'une Response fetch Groq. */
export function readGroqRateLimitHeaders(response: Response): GroqRateLimitHeaders {
  return {
    rpm_limit: response.headers.get("x-ratelimit-limit-requests"),
    rpm_remaining: response.headers.get("x-ratelimit-remaining-requests"),
    tpm_limit: response.headers.get("x-ratelimit-limit-tokens"),
    tpm_remaining: response.headers.get("x-ratelimit-remaining-tokens"),
    reset_requests: response.headers.get("x-ratelimit-reset-requests"),
    reset_tokens: response.headers.get("x-ratelimit-reset-tokens"),
  };
}

function parsePositiveInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegativeInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Groq renvoie parfois une durée ("1.5s") ou un horodatage — on tente les deux.
 * Retourne ISO string ou null si non interprétable.
 */
function parseGroqResetAt(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 0) {
    const ms = asNum > 1e12 ? asNum : asNum * 1000;
    return new Date(ms).toISOString();
  }

  const secMatch = /^(\d+(?:\.\d+)?)s$/i.exec(s);
  if (secMatch) {
    const sec = Number.parseFloat(secMatch[1]);
    if (Number.isFinite(sec) && sec >= 0) {
      return new Date(Date.now() + sec * 1000).toISOString();
    }
  }

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }

  return null;
}

async function upsertOneObservedLimit(
  supabase: SupabaseClient,
  params: {
    model: string;
    limitType: "RPM" | "TPM";
    limitValue: number;
    remaining: number | null;
    resetAt: string | null;
  },
): Promise<void> {
  const { error } = await supabase.rpc("ai_upsert_observed_limit", {
    p_provider: "groq",
    p_model: params.model,
    p_limit_type: params.limitType,
    p_limit_value: params.limitValue,
    p_remaining: params.remaining,
    p_reset_at: params.resetAt,
  });

  if (error) {
    console.warn(
      `[groqObservedLimits] ai_upsert_observed_limit ${params.limitType} failed:`,
      error.message,
    );
  }
}

/**
 * Enregistre RPM/TPM observés depuis les headers (await interne, à lancer en fire-and-forget).
 */
export async function persistGroqObservedLimitsFromHeaders(
  supabase: SupabaseClient,
  model: string,
  headers: GroqRateLimitHeaders,
): Promise<void> {
  const modelUsed = model.trim();
  if (!modelUsed) return;

  const resetAt = parseGroqResetAt(headers.reset_requests)
    ?? parseGroqResetAt(headers.reset_tokens);

  const rpmLimit = parsePositiveInt(headers.rpm_limit);
  if (rpmLimit != null) {
    await upsertOneObservedLimit(supabase, {
      model: modelUsed,
      limitType: "RPM",
      limitValue: rpmLimit,
      remaining: parseNonNegativeInt(headers.rpm_remaining),
      resetAt,
    });
  }

  const tpmLimit = parsePositiveInt(headers.tpm_limit);
  if (tpmLimit != null) {
    await upsertOneObservedLimit(supabase, {
      model: modelUsed,
      limitType: "TPM",
      limitValue: tpmLimit,
      remaining: parseNonNegativeInt(headers.tpm_remaining),
      resetAt,
    });
  }
}

/**
 * Fire-and-forget : ne bloque pas la réponse Edge Function principale.
 */
export function ingestGroqRateLimitHeaders(
  supabase: SupabaseClient,
  model: string,
  response: Response,
): void {
  const headers = readGroqRateLimitHeaders(response);
  void persistGroqObservedLimitsFromHeaders(supabase, model, headers).catch((err: unknown) => {
    console.warn(
      "[groqObservedLimits] ingest failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
  });
}
