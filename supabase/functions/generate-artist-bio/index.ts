import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai@0.14.1";
import {
  aiGuardBlockedResponse,
  checkAILimitBeforeCall,
} from "../_shared/aiGuard.ts";
import {
  extractGeminiUsageMetadataFromResponse,
  insertAiUsageLog,
  tokensFromAnyGeminiUsageLike,
  tokensFromGroqOpenAiUsage,
} from "../_shared/ai_usage_log.ts";
import { ingestGroqRateLimitHeaders } from "../_shared/groqObservedLimits.ts";

const SELECTED_MODEL_KEY = "selected_ai_model";

/** Même clé que le tableau de bord IA (`AiModelControlPanel`). */
async function resolveSelectedModelId(admin: SupabaseClient): Promise<string> {
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
  /** Alias legacy envoyé par le front (`grokBio.ts`). */
  name?: string;
  art_types?: string[];
  /** Alias legacy envoyé par le front (`grokBio.ts`). */
  artTypes?: string[];
  /** Code de langue BCP-47 court (fr, en, de, es, it). Optionnel — sans valeur, le comportement par défaut (français) est conservé. */
  lang?: string;
  /** Bio source (français) à traduire — évite 5 générations indépendantes de longueurs incohérentes. */
  source_bio?: string;
};

const DEFAULT_FR_LENGTH_LINE =
  "Rédige une biographie courte en français (4 à 6 phrases, maximum 550 caractères).";

const BIO_LANG_META: Record<string, { lengthLine: string; lockLine: string }> = {
  fr: {
    lengthLine: DEFAULT_FR_LENGTH_LINE,
    lockLine: "Rédige UNIQUEMENT en français.",
  },
  en: {
    lengthLine: "Write a short biography in English (4 to 6 sentences, maximum 550 characters).",
    lockLine: "Write ONLY in English.",
  },
  de: {
    lengthLine: "Verfasse eine kurze Biografie auf Deutsch (4 bis 6 Sätze, maximal 550 Zeichen).",
    lockLine: "Schreibe NUR auf Deutsch.",
  },
  es: {
    lengthLine: "Redacta una biografía corta en español (4 a 6 frases, máximo 550 caracteres).",
    lockLine: "Escribe ÚNICAMENTE en español.",
  },
  it: {
    lengthLine: "Scrivi una breve biografia in italiano (4-6 frasi, massimo 550 caratteri).",
    lockLine: "Scrivi SOLO in italiano.",
  },
};

function resolveLangCode(lang: string | undefined): string {
  const code = (lang ?? "fr").toLowerCase().slice(0, 2);
  return BIO_LANG_META[code] ? code : "fr";
}

/** Adapte le template (FR par défaut) à la langue cible. */
function buildPromptForLang(template: string, lang: string | undefined): string {
  const code = resolveLangCode(lang);
  if (code === "fr") return template;

  const meta = BIO_LANG_META[code];
  const withLength = template.replace(
    /Rédige une biographie courte en français \(4 à 6 phrases, maximum 550 caractères\)\./i,
    meta.lengthLine,
  );
  return `${withLength}\n\n${meta.lockLine}`;
}

const TRANSLATION_TARGET_LABEL: Record<string, string> = {
  en: "anglais",
  de: "allemand",
  es: "espagnol",
  it: "italien",
};

/** Traduit une bio FR validée vers une autre langue (longueur homogène). */
function buildTranslationPrompt(sourceBio: string, lang: string | undefined): string {
  const code = resolveLangCode(lang);
  const target = TRANSLATION_TARGET_LABEL[code] ?? code;
  const meta = BIO_LANG_META[code];
  return [
    "Tu es traducteur culturel spécialisé dans les biographies d'artistes.",
    `Traduis la biographie ci-dessous en ${target}.`,
    meta.lengthLine,
    "Contraintes:",
    "- conserver le même niveau de détail et le même ton que le texte source",
    "- ne pas inventer de faits précis absents du texte source",
    "- ne pas utiliser de liste à puces",
    meta.lockLine,
    "Retourne uniquement le paragraphe traduit.",
    "",
    sourceBio,
  ].join("\n");
}

function extractGroqAssistantText(
  choice: { message?: { content?: unknown } } | undefined,
): string {
  const raw = choice?.message?.content;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_PROMPT_TEMPLATE = [
  "Tu es rédacteur culturel.",
  DEFAULT_FR_LENGTH_LINE,
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
  const nom = (body.nom ?? body.name)?.trim() ?? "";
  const artTypesSource = Array.isArray(body.art_types) ? body.art_types : body.artTypes;
  const artTypes = Array.isArray(artTypesSource)
    ? artTypesSource.map((t) => t?.trim() ?? "").filter(Boolean)
    : [];
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

  const langCode = resolveLangCode(body.lang);
  const sourceBio = body.source_bio?.trim() ?? "";
  const prompt =
    sourceBio && langCode !== "fr"
      ? buildTranslationPrompt(sourceBio, body.lang)
      : buildPromptForLang(renderedPrompt, body.lang);

  const guardProvider = shouldUseGemini(modelId) ? "gemini" : "groq";
  const guard = await checkAILimitBeforeCall(admin, guardProvider, modelId, 640);
  if (!guard.allowed) {
    return aiGuardBlockedResponse(guard);
  }

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
          maxOutputTokens: 1024,
          temperature: 0.5,
          thinkingConfig: { thinkingBudget: 0 },
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
      max_tokens: 1024,
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

  const groqRaw = await groqResp.text();
  ingestGroqRateLimitHeaders(admin, modelId, groqResp);

  let groqJson: {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    usage?: unknown;
  };
  try {
    groqJson = JSON.parse(groqRaw) as typeof groqJson;
  } catch {
    return jsonResponse(502, {
      error: "Réponse Groq invalide (JSON).",
      details: groqRaw.slice(0, 500),
      model_used: modelId,
    });
  }

  const bio = extractGroqAssistantText(groqJson.choices?.[0]);
  const finishReason = groqJson.choices?.[0]?.finish_reason;
  if (finishReason === "length") {
    console.warn(`[generate-artist-bio] Groq finish_reason=length model=${modelId} lang=${body.lang ?? "fr"}`);
  }
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
