/**
 * Helpers côté React pour les erreurs 429 des Edge Functions (garde-fou aiGuard).
 */

export type AIRateLimitPayload = {
  error: "rate_limit_exceeded";
  provider: string;
  limit_type: string;
  usage_pct: number;
  retry_after: string;
  message: string;
};

const DEFAULT_USER_MESSAGE =
  "Limite IA atteinte pour aujourd'hui. Réessaie demain ou contacte l'admin.";

export function isAIRateLimitPayload(value: unknown): value is AIRateLimitPayload {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return o.error === "rate_limit_exceeded" && typeof o.message === "string";
}

export function parseAIRateLimitPayload(raw: unknown): AIRateLimitPayload | null {
  if (isAIRateLimitPayload(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isAIRateLimitPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getAIRateLimitUserMessage(payload: AIRateLimitPayload | null): string {
  if (!payload?.message?.trim()) return DEFAULT_USER_MESSAGE;
  return payload.message.trim();
}

/** Extrait un payload 429 depuis le corps d'une FunctionsHttpError. */
export function extractAIRateLimitFromBody(body: unknown): AIRateLimitPayload | null {
  if (isAIRateLimitPayload(body)) return body;
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.message === "string") {
    const nested = parseAIRateLimitPayload(o.message);
    if (nested) return nested;
  }
  if (typeof o.error === "string" && o.error.includes("rate_limit")) {
    return {
      error: "rate_limit_exceeded",
      provider: String(o.provider ?? ""),
      limit_type: String(o.limit_type ?? ""),
      usage_pct: Number(o.usage_pct ?? 0),
      retry_after: String(o.retry_after ?? ""),
      message: typeof o.message === "string" ? o.message : DEFAULT_USER_MESSAGE,
    };
  }
  return null;
}
