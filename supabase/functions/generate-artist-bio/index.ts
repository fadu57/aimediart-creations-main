import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai@0.14.1";
import {
  extractGeminiUsageMetadataFromResponse,
  insertAiUsageLog,
  tokensFromAnyGeminiUsageLike,
  tokensFromGroqOpenAiUsage,
} from "../_shared/ai_usage_log.ts";

const SELECTED_MODEL_KEY = "selected_ai_model";

/** Même clé que le tableau de bord IA (`AiModelControlPanel`). */
async function resolveSelectedModelId(
  admin: ReturnType<typeof createClient>,
): Promise<string> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", SELECTED_MODEL_KEY)
    .maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  const fromDb = typeof raw === "string" ? raw.trim() : raw != null ? String(raw).trim() : "";
  if (fromDb) return fromDb;
  return Deno.env.get("GROQ_DEFAULT_BIO_MODEL")?.trim() || "llama-3.3-70b-versatile";
}

/** Routage Gemini (Google Gen AI) vs Groq selon l’identifiant en base. */
function shouldUseGemini(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (id.startsWith("gemini")) return true;
  const relaxed = id.replace(/[-_]/g, " ");
  if (relaxed.includes("deep research")) return true;
  if (id.includes("deep-research")) return true;
  return false;
}

function extractGeminiText(geminiJson: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geminiJson as any;
  const t = g?.text?.trim?.();
  if (typeof t === "string" && t) return t;
  const parts = g?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
  }
  return "";
}

type RequestBody = {
  prenom?: string;
  nom?: string;
  art_types?: string[];
  /** Code de langue BCP-47 court (fr, en, de, es, it). Optionnel — sans valeur, le comportement par défaut (français) est conservé. */
  lang?: string;
};

const LANG_NAMES: Record<string, string> = {
  fr: "français",
  en: "English",
  de: "Deutsch",
  es: "español",
  it: "italiano",
};

/** Retourne une instruction de langue à appendre au prompt, ou null si langue inconnue/non fournie. */
function buildLangInstruction(lang: string | undefined): string | null {
  if (!lang) return null;
  const name = LANG_NAMES[lang.toLowerCase().slice(0, 2)];
  if (!name) return null;
  return `IMPORTANT: Tu dois rédiger la biographie UNIQUEMENT en ${name}. N'utilise aucune autre langue.`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_PROMPT_TEMPLATE = [
  "Tu es rédacteur culturel.",
  "Rédige une biographie courte en français (4 à 6 phrases, maximum 550 caractères).",
  "Artiste: {{prenom}} {{nom}}.",
  "Type(s) d'art: {{art_types}}.",
  "Contraintes:",
  "- style clair, professionnel, fluide",
  "- ne pas inventer de faits précis (dates, lieux, prix, expositions)",
  "- si une information est inconnue, rester générique",
  "- ne pas utiliser de liste à puces",
  "Retourne uniquement le paragraphe final.",
].join("\n");

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

function renderTemplate(template: string, vars: { prenom: string; nom: string; art_types: string }) {
  return template
    .replaceAll("{{prenom}}", vars.prenom)
    .replaceAll("{{nom}}", vars.nom)
    .replaceAll("{{art_types}}", vars.art_types);
}

async function loadPromptTemplate(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return DEFAULT_PROMPT_TEMPLATE;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "artist_bio_prompt")
    .maybeSingle();
  if (error) return DEFAULT_PROMPT_TEMPLATE;
  const value = (data as { value?: string } | null)?.value ?? "";
  return value.trim() || DEFAULT_PROMPT_TEMPLATE;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Body JSON invalide." });
  }

  const prenom = body.prenom?.trim() ?? "";
  const nom = body.nom?.trim() ?? "";
  const artTypes = Array.isArray(body.art_types) ? body.art_types.map((t) => t?.trim() ?? "").filter(Boolean) : [];
  if (!prenom || !nom || artTypes.length === 0) {
    return jsonResponse(400, { error: "prenom, nom et art_types sont requis." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Configuration Supabase incomplète (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) pour lire selected_ai_model.",
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const modelId = await resolveSelectedModelId(admin);

  const promptTemplate = await loadPromptTemplate();
  const renderedPrompt = renderTemplate(promptTemplate, {
    prenom,
    nom,
    art_types: artTypes.join(", "),
  });

  const langName = body.lang ? (LANG_NAMES[body.lang.toLowerCase().slice(0, 2)] ?? null) : null;
  const langInstruction = buildLangInstruction(body.lang);

  const adjustedPrompt = langName
    ? renderedPrompt.replace(/\ben\s+fran[çc]ais\b/gi, `en ${langName}`)
    : renderedPrompt;

  const prompt = langInstruction ? `${adjustedPrompt}\n${langInstruction}` : adjustedPrompt;

  if (shouldUseGemini(modelId)) {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!geminiApiKey) {
      return jsonResponse(500, {
        error: "GEMINI_API_KEY manquante : le modèle configuré nécessite Google Gen AI.",
        model_configured: modelId,
      });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    let geminiJson: unknown;
    try {
      geminiJson = await ai.models.generateContent({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: 640,
          temperature: 0.5,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse(502, {
        error: "Erreur d'appel Gemini (generate-artist-bio).",
        details: msg,
        model_used: modelId,
      });
    }

    const bio = extractGeminiText(geminiJson);
    if (!bio) {
      return jsonResponse(502, { error: "Réponse vide de Gemini.", model_used: modelId });
    }

    const usageMetadata = extractGeminiUsageMetadataFromResponse(geminiJson);
    const tok = tokensFromAnyGeminiUsageLike(usageMetadata);
    await insertAiUsageLog(admin, {
      model_id: modelId,
      provider: "gemini",
      prompt_tokens: tok.prompt_tokens,
      completion_tokens: tok.completion_tokens,
      total_tokens: tok.total_tokens,
      artwork_id: null,
    });

    return jsonResponse(200, { bio });
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  if (!groqApiKey) {
    return jsonResponse(500, {
      error: "GROQ_API_KEY manquante : le modèle configuré nécessite Groq.",
      model_configured: modelId,
    });
  }

  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 320,
    }),
  });

  if (!groqResp.ok) {
    const details = await groqResp.text();
    return jsonResponse(502, {
      error: "Erreur Groq (generate-artist-bio).",
      details,
      model_used: modelId,
    });
  }

  const groqJson = (await groqResp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const bio = groqJson.choices?.[0]?.message?.content?.trim() ?? "";
  if (!bio) {
    return jsonResponse(502, { error: "Réponse vide de Groq.", model_used: modelId });
  }

  const groqTok = tokensFromGroqOpenAiUsage(groqJson.usage);
  await insertAiUsageLog(admin, {
    model_id: modelId,
    provider: "groq",
    prompt_tokens: groqTok.prompt_tokens,
    completion_tokens: groqTok.completion_tokens,
    total_tokens: groqTok.total_tokens,
    artwork_id: null,
  });

  return jsonResponse(200, { bio });
});
