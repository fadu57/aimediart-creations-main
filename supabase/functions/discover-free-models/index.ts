import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CachedAiModel = {
  id: string;
  provider: "gemini" | "groq";
  name: string;
  tpm_limit: number;
  /** Indice de qualité sur 10 (heuristique id + nom). */
  quality_score: number;
  /** Indice de vitesse perçue / 10 (UX). */
  speed_score: number;
  /** Résilience production / TPM & rate limits (0–10). */
  tpm_resilience_score: number;
  /** Compromis global (qualité, vitesse, résilience TPM). */
  balance_score: number;
  /** Playground officiel du fournisseur (lien direct depuis le tableau de bord). */
  playground_url: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, prefer, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_KEY = "available_models_cache";

const GROQ_URL = "https://api.groq.com/openai/v1/models";

const PLAYGROUND_GEMINI = "https://aistudio.google.com/";
const PLAYGROUND_GROQ = "https://console.groq.com/playground";

function playgroundUrlForProvider(provider: "gemini" | "groq"): string {
  return provider === "gemini" ? PLAYGROUND_GEMINI : PLAYGROUND_GROQ;
}

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/** TPM / minute indicative (les API ne renvoient pas toujours la limite ; valeurs cohérentes doc & gratuité). */
function defaultTpmGroq(modelId: string): number {
  const id = modelId.toLowerCase();
  if (id.includes("70b") || id.includes("llama-3.3")) return 12_000;
  if (id.includes("8b") || id.includes("3b")) return 30_000;
  return 20_000;
}

function defaultTpmGemini(modelId: string): number {
  const id = modelId.toLowerCase();
  if (id.includes("flash")) return 1_000_000;
  if (id.includes("pro")) return 4_000_000;
  return 500_000;
}

function isGroqTextModel(id: string): boolean {
  const x = id.toLowerCase();
  if (x.includes("whisper") || x.includes("distil-whisper")) return false;
  if (x.includes("playai-tts") || x.includes("tts")) return false;
  if (x.endsWith("-vision") && !x.includes("llama")) return false;
  return true;
}

function geminiListUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
}

function clamp10(n: number): number {
  return Math.min(10, Math.max(0, n));
}

/** Qualité seule — palier historique (aligné avec `src/lib/aiModelExperienceScores.ts`). */
function inferQualityScoreHeuristic(id: string, name: string): number {
  const hay = `${id} ${name}`.toLowerCase();

  const topTier =
    hay.includes("deep research") ||
    hay.includes("70b") ||
    /(^|[-._/\s])pro($|[-._/\s])/.test(hay) ||
    /\bpro\b/.test(hay);
  if (topTier) return 9.5;

  const lowTier =
    hay.includes("lite") ||
    hay.includes("mini") ||
    hay.includes("nano") ||
    /\b8b\b/.test(hay) ||
    /(^|[-._])8b($|[-._])/i.test(hay);
  if (lowTier) return 6.0;

  const hasFlash = hay.includes("flash");
  if (hasFlash && !hay.includes("lite") && !hay.includes("mini")) return 8.0;
  if (hay.includes("32b") || hay.includes("gemma 4") || hay.includes("gemma-4")) return 8.0;

  return 5.0;
}

function inferTpmResilienceDefault(id: string, name: string, provider: "gemini" | "groq"): number {
  const hay = `${id} ${name}`.toLowerCase();
  if (provider === "groq") {
    if (hay.includes("70b") || hay.includes("llama-3.3")) return 4;
    return 6.5;
  }
  if (hay.includes("flash") && !hay.includes("lite") && !hay.includes("mini")) return 9;
  if (/\bpro\b/.test(hay) || hay.includes("ultra")) return 8;
  return 7;
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Scores Qualité / Vitesse / Résilience TPM / Compromis global (aligné `src/lib/aiModelExperienceScores.ts`).
 */
function inferExperienceScores(
  id: string,
  name: string,
  provider: "gemini" | "groq",
): Pick<
  CachedAiModel,
  "quality_score" | "speed_score" | "tpm_resilience_score" | "balance_score"
> {
  const hay = `${id} ${name}`.toLowerCase();

  if (hay.includes("deep research") || hay.includes("deep-research")) {
    return { quality_score: 9.5, speed_score: 2, tpm_resilience_score: 9, balance_score: 6.5 };
  }

  if (provider === "groq" && (hay.includes("llama-3.3") || hay.includes("70b"))) {
    return { quality_score: 8, speed_score: 10, tpm_resilience_score: 4, balance_score: 7.5 };
  }

  if (
    provider === "gemini" &&
    hay.includes("flash") &&
    !hay.includes("lite") &&
    !hay.includes("mini")
  ) {
    return { quality_score: 7.5, speed_score: 9, tpm_resilience_score: 10, balance_score: 8.8 };
  }

  const quality = inferQualityScoreHeuristic(id, name);

  let speed = 5;
  if (provider === "groq") {
    speed = 10;
  } else if (hay.includes("flash")) {
    speed = 9;
  } else if (/\bpro\b/.test(hay) || hay.includes("ultra")) {
    speed = 4;
  } else {
    speed = 6;
  }

  const tpmResilience = inferTpmResilienceDefault(id, name, provider);
  const balance = clamp10(roundTenth((quality + speed + tpmResilience) / 3));

  return {
    quality_score: clamp10(quality),
    speed_score: clamp10(speed),
    tpm_resilience_score: clamp10(tpmResilience),
    balance_score: balance,
  };
}

async function fetchGroqModels(
  apiKey: string,
  errors: string[],
): Promise<CachedAiModel[]> {
  const res = await fetch(GROQ_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    errors.push(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return [];
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const rows = body.data ?? [];
  const out: CachedAiModel[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || !isGroqTextModel(id)) continue;
    const friendly = id
      .split("-")
      .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
      .join(" ");
    const scores = inferExperienceScores(id, friendly, "groq");
    out.push({
      id,
      provider: "groq",
      name: friendly,
      tpm_limit: defaultTpmGroq(id),
      quality_score: scores.quality_score,
      speed_score: scores.speed_score,
      tpm_resilience_score: scores.tpm_resilience_score,
      balance_score: scores.balance_score,
      playground_url: playgroundUrlForProvider("groq"),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function fetchGeminiModels(
  apiKey: string,
  errors: string[],
): Promise<CachedAiModel[]> {
  const res = await fetch(geminiListUrl(apiKey));
  if (!res.ok) {
    errors.push(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return [];
  }
  const body = (await res.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
      inputTokenLimit?: number;
    }>;
  };
  const models = body.models ?? [];
  const out: CachedAiModel[] = [];
  for (const m of models) {
    const name = typeof m.name === "string" ? m.name : "";
    if (!name.startsWith("models/")) continue;
    const methods = m.supportedGenerationMethods ?? [];
    if (!methods.includes("generateContent")) continue;
    const id = name.replace(/^models\//, "").trim();
    if (!id) continue;
    const display =
      typeof m.displayName === "string" && m.displayName.trim()
        ? m.displayName.trim()
        : id.replace(/-/g, " ");
    const tpmFromApi =
      typeof m.inputTokenLimit === "number" && m.inputTokenLimit > 0
        ? Math.min(m.inputTokenLimit, 10_000_000)
        : defaultTpmGemini(id);
    const scores = inferExperienceScores(id, display, "gemini");
    out.push({
      id,
      provider: "gemini",
      name: display,
      tpm_limit: tpmFromApi,
      quality_score: scores.quality_score,
      speed_score: scores.speed_score,
      tpm_resilience_score: scores.tpm_resilience_score,
      balance_score: scores.balance_score,
      playground_url: playgroundUrlForProvider("gemini"),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function mergeModels(gemini: CachedAiModel[], groq: CachedAiModel[]): CachedAiModel[] {
  const seen = new Set<string>();
  const merged: CachedAiModel[] = [];
  for (const m of [...gemini, ...groq]) {
    const k = `${m.provider}:${m.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(m);
  }
  return merged;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Configuration Supabase incomplète côté serveur." });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Authentification requise." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: "Session invalide." });
  }
  const roleId = userData.user.app_metadata?.role_id as number | undefined;
  if (typeof roleId !== "number" || roleId < 1 || roleId > 3) {
    return jsonResponse(403, { error: "Réservé aux administrateurs globaux (role_id 1–3)." });
  }

  const errors: string[] = [];
  const gemini = geminiKey.trim() ? await fetchGeminiModels(geminiKey.trim(), errors) : [];
  if (!geminiKey.trim()) {
    errors.push("GEMINI_API_KEY absente (secret Edge Function).");
  }

  const groq = groqKey.trim() ? await fetchGroqModels(groqKey.trim(), errors) : [];
  if (!groqKey.trim()) {
    errors.push("GROQ_API_KEY absente (secret Edge Function).");
  }

  const models = mergeModels(gemini, groq);
  if (models.length === 0) {
    return jsonResponse(502, {
      error: "Aucun modèle récupéré.",
      details: errors.join(" | ") || "Vérifiez les clés API.",
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const payload = JSON.stringify(models);
  const { error: upsertErr } = await admin.from("app_settings").upsert(
    { key: CACHE_KEY, value: payload },
    { onConflict: "key" },
  );

  if (upsertErr) {
    return jsonResponse(500, {
      error: "Écriture app_settings impossible.",
      details: upsertErr.message,
    });
  }

  return jsonResponse(200, {
    ok: true,
    count: models.length,
    warnings: errors.length ? errors : undefined,
  });
});
