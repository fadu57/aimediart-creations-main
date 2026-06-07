import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Même logique que le front (`aiUsageModelId.ts`) pour jointure avec `available_models_cache`. */
export function normalizeUsageModelIdForLog(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("models/")) {
    s = s.slice("models/".length).trim();
  }
  return s;
}

export type AiUsageProvider = "gemini" | "groq";

export type InsertAiUsageLogInput = {
  model_id: string;
  provider: AiUsageProvider;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  artwork_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function looksLikeGeminiUsageMetadataShape(o: Record<string, unknown>): boolean {
  const keys = [
    "promptTokenCount",
    "prompt_token_count",
    "candidatesTokenCount",
    "candidates_token_count",
    "responseTokenCount",
    "response_token_count",
    "totalTokenCount",
    "total_token_count",
    "outputTokenCount",
    "output_token_count",
  ];
  return keys.some((k) => {
    const v = o[k];
    return v != null && Number.isFinite(Number(v));
  });
}

/** Parcours superficiel (profondeur limitée) pour retrouver un bloc type usageMetadata. */
function findGeminiUsageMetadataShape(obj: unknown, depth: number): unknown {
  if (depth > 8 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const f = findGeminiUsageMetadataShape(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  if (looksLikeGeminiUsageMetadataShape(o)) return obj;
  for (const v of Object.values(o)) {
    const f = findGeminiUsageMetadataShape(v, depth + 1);
    if (f) return f;
  }
  return null;
}

/**
 * Extrait `usageMetadata` depuis la réponse du SDK `@google/genai` (emplacements variables selon versions / transport).
 */
export function extractGeminiUsageMetadataFromResponse(resp: unknown): unknown {
  if (resp == null || typeof resp !== "object") return null;
  const r = resp as Record<string, unknown>;
  const direct = r.usageMetadata ?? r.usage_metadata;
  if (direct && typeof direct === "object") return direct;

  const inner = r.response;
  if (inner && typeof inner === "object") {
    const ir = inner as Record<string, unknown>;
    const u = ir.usageMetadata ?? ir.usage_metadata;
    if (u && typeof u === "object") return u;
  }

  const sdk = r.sdkHttpResponse;
  if (sdk && typeof sdk === "object") {
    const body = (sdk as Record<string, unknown>).body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const jo = body as Record<string, unknown>;
      const uo = jo.usageMetadata ?? jo.usage_metadata;
      if (uo && typeof uo === "object") return uo;
      if (looksLikeGeminiUsageMetadataShape(jo)) return body;
    }
    if (typeof body === "string" && body.trim()) {
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        const u = j.usageMetadata ?? j.usage_metadata;
        if (u && typeof u === "object") return u;
        if (looksLikeGeminiUsageMetadataShape(j)) return j;
      } catch {
        /* corps non JSON */
      }
    }
  }

  const nested = findGeminiUsageMetadataShape(resp, 0);
  return nested ?? null;
}

/** usageMetadata renvoyé par Gemini (SDK @google/genai : UsageMetadata — notamment responseTokenCount). */
export function tokensFromGeminiUsageMetadata(um: unknown): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  if (!um || typeof um !== "object") {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  const o = um as Record<string, unknown>;
  const prompt = Number(o.promptTokenCount ?? o.prompt_token_count ?? 0);
  /** Sortie : le SDK moderne expose surtout `responseTokenCount` ; l’ancien REST utilisait souvent `candidatesTokenCount`. */
  const completion = Number(
    o.responseTokenCount ??
      o.response_token_count ??
      o.candidatesTokenCount ??
      o.candidates_token_count ??
      o.outputTokenCount ??
      o.output_token_count ??
      0,
  );
  const totalRaw = o.totalTokenCount ?? o.total_token_count;
  let total = totalRaw != null && Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : NaN;
  if (!Number.isFinite(total)) {
    total = Number.isFinite(prompt) && Number.isFinite(completion) ? prompt + completion : 0;
  }
  let p = Math.max(0, Math.round(prompt));
  let c = Math.max(0, Math.round(completion));
  let t = Math.max(0, Math.round(total));
  // Si le total agrégé est cohérent mais qu’un seul détail manque (champs renommés côté API).
  if (t > 0 && p > 0 && c === 0 && t >= p) c = t - p;
  if (t > 0 && c > 0 && p === 0 && t >= c) p = t - c;
  if (t === 0 && p + c > 0) t = p + c;
  return {
    prompt_tokens: p,
    completion_tokens: c,
    total_tokens: t,
  };
}

/** Objet `usage` renvoyé par l’API Groq (format OpenAI + variantes camelCase). */
export function tokensFromGroqOpenAiUsage(usage: unknown): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  if (!usage || typeof usage !== "object") {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  const u0 = usage as Record<string, unknown>;
  let u = u0;
  const hasDirect =
    u.prompt_tokens != null ||
    u.promptTokens != null ||
    u.completion_tokens != null ||
    u.completionTokens != null ||
    u.input_tokens != null ||
    u.inputTokens != null ||
    u.output_tokens != null ||
    u.outputTokens != null;
  if (!hasDirect) {
    const inner = u.usage;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      u = inner as Record<string, unknown>;
    }
  }
  const ptRaw = u.prompt_tokens ?? u.promptTokens ?? u.input_tokens ?? u.inputTokens;
  const ctRaw = u.completion_tokens ?? u.completionTokens ?? u.output_tokens ?? u.outputTokens;
  let pt = Math.max(0, Math.round(Number(ptRaw ?? 0)));
  let ct = Math.max(0, Math.round(Number(ctRaw ?? 0)));
  const ttRaw = u.total_tokens ?? u.totalTokens;
  let tt = ttRaw != null && Number.isFinite(Number(ttRaw)) ? Math.round(Number(ttRaw)) : pt + ct;
  tt = Math.max(0, tt);
  if (tt > 0 && pt > 0 && ct === 0 && tt >= pt) ct = tt - pt;
  if (tt > 0 && ct > 0 && pt === 0 && tt >= ct) pt = tt - ct;
  if (tt === 0 && pt + ct > 0) tt = pt + ct;
  return {
    prompt_tokens: pt,
    completion_tokens: ct,
    total_tokens: tt,
  };
}

/** Usage Interactions API (Deep Research, etc.) — parfois vide sur le premier poll « completed ». */
export function tokensFromGeminiInteractionUsage(usage: unknown): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  if (!usage || typeof usage !== "object") {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  const u = usage as Record<string, unknown>;
  const pt = Math.max(
    0,
    Math.round(
      Number(
        u.total_input_tokens ??
          u.totalInputTokens ??
          u.input_tokens ??
          u.inputTokens ??
          u.prompt_token_count ??
          u.promptTokenCount ??
          0,
      ),
    ),
  );
  const out = Math.max(
    0,
    Math.round(
      Number(
        u.total_output_tokens ??
          u.totalOutputTokens ??
          u.output_tokens ??
          u.outputTokens ??
          u.candidates_token_count ??
          u.candidatesTokenCount ??
          u.response_token_count ??
          u.responseTokenCount ??
          0,
      ),
    ),
  );
  const thought = Math.max(
    0,
    Math.round(Number(u.total_thought_tokens ?? u.totalThoughtTokens ?? 0)),
  );
  const ttRaw = u.total_tokens ?? u.totalTokens;
  let total = ttRaw != null && Number.isFinite(Number(ttRaw)) ? Math.max(0, Math.round(Number(ttRaw))) : 0;
  const completion = out + thought;
  if (total === 0) total = pt + completion;
  return {
    prompt_tokens: pt,
    completion_tokens: completion,
    total_tokens: total,
  };
}

export function interactionUsageIsEffectivelyEmpty(usage: unknown): boolean {
  const t = tokensFromGeminiInteractionUsage(usage);
  if (t.total_tokens > 0 || t.prompt_tokens > 0 || t.completion_tokens > 0) return false;
  const alt = tokensFromGeminiUsageMetadata(usage);
  return alt.total_tokens === 0 && alt.prompt_tokens === 0 && alt.completion_tokens === 0;
}

/**
 * Agrège l’usage Gemini : schéma Interactions API et/ou usageMetadata generateContent.
 * Quand les deux donnent des totaux, on retient le plus informatif (total non nul maximal).
 */
export function tokensFromAnyGeminiUsageLike(usage: unknown): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  const a = tokensFromGeminiInteractionUsage(usage);
  const b = tokensFromGeminiUsageMetadata(usage);
  const score = (x: { total_tokens: number; prompt_tokens: number; completion_tokens: number }) =>
    x.total_tokens > 0 ? x.total_tokens : x.prompt_tokens + x.completion_tokens;
  if (score(a) === 0) return b;
  if (score(b) === 0) return a;
  return score(a) >= score(b) ? a : b;
}

/**
 * Insère une ligne de consommation (service role recommandé).
 * Les erreurs sont loguées sans faire échouer la réponse HTTP de la fonction principale.
 */
export async function insertAiUsageLog(
  admin: SupabaseClient,
  row: InsertAiUsageLogInput,
): Promise<void> {
  const modelId = normalizeUsageModelIdForLog(row.model_id);
  if (!modelId) return;

  const pt = row.prompt_tokens ?? 0;
  const ct = row.completion_tokens ?? 0;
  let total = row.total_tokens;
  if (total == null || !Number.isFinite(Number(total))) {
    total = pt + ct;
  }
  const totalTokens = Math.max(0, Math.round(Number(total)));

  const payload: Record<string, unknown> = {
    model_id: modelId,
    provider: row.provider,
    prompt_tokens: Math.max(0, Math.round(pt)),
    completion_tokens: Math.max(0, Math.round(ct)),
    total_tokens: totalTokens,
    artwork_id: row.artwork_id ?? null,
  };
  if (row.metadata && Object.keys(row.metadata).length > 0) {
    payload.metadata = row.metadata;
  }

  const { error } = await admin.from("ai_usage_logs").insert(payload);

  if (error) {
    console.error("[insertAiUsageLog] échec INSERT", {
      message: error.message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
      payload,
    });
  } else if (totalTokens === 0) {
    console.warn("[insertAiUsageLog] ligne insérée avec total_tokens = 0 — vérifiez le parsing usage côté fournisseur.");
  }
}
