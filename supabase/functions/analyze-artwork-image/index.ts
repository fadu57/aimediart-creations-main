import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai@0.14.1";

type RequestBody = {
  image_url?: string | null;
  image_base64?: string | null;
  image_mime_type?: string | null;
  artist_name?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

const DEFAULT_ANALYSIS_PROMPT = [
  "Analyse l'image de façon factuelle, concise et structurée. Pas de préambule.",
  "Artiste (si connu) : {{artist_name}}.",
  "",
  "Format attendu (répondre en français, en listes courtes) :",
  "- Sujet :",
  "- Couleurs dominantes :",
  "- Style artistique :",
  "- Technique probable :",
  "- Ambiance / émotion :",
  "",
  "Contraintes :",
  "- Ne commence pas par « En tant que… » ou une introduction.",
  "- Ne fais pas d'hypothèses gratuites : si incertain, indique-le.",
].join("\n");

function renderPrompt(template: string, vars: { artist_name: string }): string {
  return template.replaceAll("{{artist_name}}", vars.artist_name || "inconnu");
}

function normalizePromptStyleName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Même logique que `isImageAnalysisPromptStyleName` côté app (ligne Prompts IA « Analyse de l'image »). */
function isImageAnalysisPromptStyleRow(name: string | null | undefined): boolean {
  const n = normalizePromptStyleName(name ?? "");
  if (!n) return false;
  if (n === "analyse de l'image" || n === "analyse de l image") return true;
  return n.includes("analyse") && n.includes("image");
}

function clampGeminiMaxOutputTokens(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n <= 0) return 2200;
  return Math.min(4096, Math.max(256, Math.round(n)));
}

type LoadAnalysisPromptResult = { template: string; maxOutputTokens: number };

/**
 * Ordre de résolution du texte envoyé à Gemini (première source non vide gagne) :
 * 1. `app_settings.key` = "Analyse de l'image" (libellé métier, valeur = texte du prompt brut)
 * 2. `app_settings.key` = "analysis_prompt" (clé historique / page Paramètres dédiée)
 * 3. Ligne `prompt_style` dont le name correspond à « Analyse de l'image »
 *    (persona_identity + style_rules + system_instruction concaténés)
 * 4. Constante DEFAULT_ANALYSIS_PROMPT dans ce fichier
 */
async function loadAnalysisPrompt(): Promise<LoadAnalysisPromptResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const fallback: LoadAnalysisPromptResult = {
    template: DEFAULT_ANALYSIS_PROMPT,
    maxOutputTokens: 1200,
  };
  if (!supabaseUrl || !serviceRoleKey) {
    return fallback;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const APP_SETTINGS_PROMPT_KEYS = ["Analyse de l'image", "analysis_prompt"] as const;
  const { data: appRows, error: appErr } = await admin
    .from("app_settings")
    .select("key, value, max_tokens")
    .in("key", [...APP_SETTINGS_PROMPT_KEYS]);

  if (!appErr && Array.isArray(appRows)) {
    type AppPromptRow = {
      key?: string | null;
      value?: string | null;
      max_tokens?: number | null;
    };
    const list = appRows as AppPromptRow[];
    for (const k of APP_SETTINGS_PROMPT_KEYS) {
      const row = list.find((r) => r.key === k);
      const trimmed = (typeof row?.value === "string" ? row.value : "").trim();
      if (!trimmed) continue;
      const mt = row?.max_tokens;
      const tokens =
        typeof mt === "number" && Number.isFinite(mt) && mt > 0
          ? clampGeminiMaxOutputTokens(mt)
          : 1200;
      return { template: trimmed, maxOutputTokens: tokens };
    }
  }

  const { data: psRows, error: psErr } = await admin
    .from("prompt_style")
    .select("name, persona_identity, style_rules, system_instruction, max_tokens");

  if (!psErr && Array.isArray(psRows)) {
    const hit = (psRows as {
      name?: string | null;
      persona_identity?: string | null;
      style_rules?: string | null;
      system_instruction?: string | null;
      max_tokens?: number | null;
    }[]).find((r) => isImageAnalysisPromptStyleRow(r?.name ?? null));
    if (hit) {
      const parts = [hit.persona_identity, hit.style_rules, hit.system_instruction]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean);
      const combined = parts.join("\n\n");
      if (combined) {
        return {
          template: combined,
          maxOutputTokens: clampGeminiMaxOutputTokens(hit.max_tokens ?? null),
        };
      }
    }
  }

  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return jsonResponse(500, { error: "Variable d'environnement GEMINI_API_KEY manquante." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Body JSON invalide." });
  }

  const imageUrl = body.image_url?.trim() ?? "";
  const inlineBase64 = body.image_base64?.trim() ?? "";
  const inlineMime = body.image_mime_type?.trim() ?? "";
  const artistName = body.artist_name?.trim() ?? "";
  if (!imageUrl && !inlineBase64) return jsonResponse(400, { error: "image_url ou image_base64 est requis." });

  // Garde-fou payload: évite de saturer l'Edge Function avec un base64 trop volumineux.
  const MAX_INLINE_BASE64_CHARS = 8_000_000; // ~6 MB binaire approximatif
  if (inlineBase64 && inlineBase64.length > MAX_INLINE_BASE64_CHARS) {
    return jsonResponse(413, {
      error: "image_base64 trop volumineux pour la Edge Function.",
      max_chars: MAX_INLINE_BASE64_CHARS,
      received_chars: inlineBase64.length,
    });
  }

  const TIMEOUT_IMAGE_FETCH_MS = 12_000;
  const TIMEOUT_GEMINI_MS = 55_000;

  let mimeType = inlineMime || "image/jpeg";
  let b64 = inlineBase64;
  if (!b64) {
    const imgCtrl = new AbortController();
    const imgTimer = setTimeout(() => imgCtrl.abort(), TIMEOUT_IMAGE_FETCH_MS);
    try {
      const imgResp = await fetch(imageUrl, { signal: imgCtrl.signal });
      if (!imgResp.ok) {
        return jsonResponse(502, { error: "Impossible de télécharger l'image depuis image_url." });
      }
      mimeType = imgResp.headers.get("content-type") ?? "image/jpeg";
      const ab = await imgResp.arrayBuffer();
      b64 = encodeBase64(new Uint8Array(ab));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "timeout";
      return jsonResponse(504, { error: "Timeout lors du téléchargement de l'image.", details: msg });
    } finally {
      clearTimeout(imgTimer);
    }
  }

  const { template: promptTemplate, maxOutputTokens } = await loadAnalysisPrompt();
  const prompt = renderPrompt(promptTemplate, { artist_name: artistName || "inconnu" });

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: b64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens,
    },
  };

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const preferredModels = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];
  let lastErrorMessage = "";
  let modelUsed = preferredModels[0];
  let geminiJson: unknown = null;

  // Non-streaming explicite : generateContent renvoie un bloc unique.
  const RETRYABLE_ERROR_MARKERS = [
    "503",
    "UNAVAILABLE",
    "429",
    "RESOURCE_EXHAUSTED",
    "deadline",
    "timeout",
  ];
  const MAX_RETRIES = 3;

  modelLoop:
  for (const model of preferredModels) {
    modelUsed = model;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_GEMINI_MS);
      try {
        const response = await ai.models.generateContent({
          model,
          contents: requestBody.contents,
          config: requestBody.generationConfig,
          // @ts-expect-error - certains builds du SDK exposent signal, d'autres non.
          signal: ctrl.signal,
        });
        geminiJson = response as unknown;
        clearTimeout(t);
        break modelLoop;
      } catch (e) {
        clearTimeout(t);
        const msg = e instanceof Error ? e.message : String(e);
        lastErrorMessage = msg;
        const retryable = RETRYABLE_ERROR_MARKERS.some((m) => msg.toUpperCase().includes(m.toUpperCase()));
        if (retryable && attempt < MAX_RETRIES) {
          await sleep(350 * attempt);
          continue;
        }
        if (retryable) {
          // on tente le modèle suivant
          break;
        }
        return jsonResponse(502, {
          error: "Erreur Gemini.",
          details: msg,
          model_used: model,
          attempt,
        });
      }
    }
  }

  if (!geminiJson) {
    return jsonResponse(502, {
      error: "Erreur Gemini.",
      details: lastErrorMessage || "Aucune réponse du SDK Gemini.",
      model_used: modelUsed,
    });
  }

  const text =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (geminiJson as any)?.text?.trim?.() ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (geminiJson as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("")?.trim() ||
    "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finishReason = (geminiJson as any)?.candidates?.[0]?.finishReason ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usageMetadata = (geminiJson as any)?.usageMetadata ?? null;
  const truncated = finishReason === "MAX_TOKENS";

  if (!text) {
    return jsonResponse(502, {
      error: "Réponse texte Gemini vide.",
      finish_reason: finishReason,
      usage_metadata: usageMetadata,
      model_used: modelUsed,
    });
  }

  return jsonResponse(200, {
    notes: text,
    model_used: modelUsed,
    finish_reason: finishReason,
    usage_metadata: usageMetadata,
    truncated,
  });
});

