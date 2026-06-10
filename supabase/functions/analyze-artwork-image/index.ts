import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai@0.14.1";
import {
  aiGuardBlockedResponse,
  checkAILimitBeforeCall,
} from "../_shared/aiGuard.ts";
import {
  extractGeminiUsageMetadataFromResponse,
  insertAiUsageLog,
  tokensFromAnyGeminiUsageLike,
} from "../_shared/ai_usage_log.ts";

type RequestBody = {
  image_url?: string | null;
  image_base64?: string | null;
  image_mime_type?: string | null;
  artist_name?: string;
  artwork_name?: string;
  /** Langue de sortie : fr | en | de | es | it (défaut fr). */
  output_lang?: string | null;
  /** Optionnel — pour lier la consommation à une œuvre dans ai_usage_logs */
  artwork_id?: string | null;
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

function renderPrompt(
  template: string,
  vars: { artist_name: string; artwork_name: string },
): string {
  return template
    .replaceAll("{{artist_name}}", vars.artist_name || "inconnu")
    .replaceAll("{{artwork_name}}", vars.artwork_name || "sans titre");
}

/** Extrait le texte visible (hors blocs « thought » internes Gemini 2.5). */
function extractGeminiText(geminiJson: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geminiJson as any;
  const t = g?.text?.trim?.();
  if (typeof t === "string" && t) return t;
  const parts = g?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p: { thought?: boolean }) => !p?.thought)
      .map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function clampGeminiMaxOutputTokens(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n <= 0) return 1600;
  return Math.min(4096, Math.max(256, Math.round(n)));
}

type LoadAnalysisPromptResult = {
  template: string;
  maxOutputTokens: number;
  source: string;
};

const OUTPUT_LANG_LABELS: Record<string, string> = {
  fr: "français",
  en: "English",
  de: "Deutsch",
  es: "español",
  it: "italiano",
};

const SUPPORTED_OUTPUT_LANGS = new Set(Object.keys(OUTPUT_LANG_LABELS));

function resolveOutputLang(raw: string | null | undefined): string {
  const code = (raw ?? "fr").split("-")[0].toLowerCase();
  return SUPPORTED_OUTPUT_LANGS.has(code) ? code : "fr";
}

function outputLangLabel(code: string): string {
  return OUTPUT_LANG_LABELS[code] ?? OUTPUT_LANG_LABELS.fr;
}

/** Remplace les mentions « en français » par la langue demandée dans le prompt. */
function applyOutputLangToPrompt(template: string, langCode: string): string {
  const label = outputLangLabel(langCode);
  if (langCode === "fr") return template;
  return template
    .replace(/répondre en français/gi, `répondre en ${label}`)
    .replace(/FICHE SOURCE DENSE en français/gi, `FICHE SOURCE DENSE en ${label}`)
    .replace(/\ben français\b/gi, `en ${label}`);
}

/** Préfixe impératif — prime sur le prompt app_settings (souvent rédigé en français). */
function wrapPromptWithOutputLang(prompt: string, langCode: string): string {
  const label = outputLangLabel(langCode);
  return [
    `=== LANGUE DE SORTIE OBLIGATOIRE ===`,
    `Code langue : ${langCode}`,
    `Libellé : ${label}`,
    `Consigne : rédige TOUTE ta réponse (titres, puces, labels, paragraphes) exclusivement en ${label}.`,
    langCode !== "fr"
      ? `N'utilise pas le français (sauf noms propres d'artistes ou d'œuvres).`
      : `Utilise le français pour l'intégralité du texte.`,
    `=== FIN CONSIGNE LANGUE ===`,
    "",
    prompt,
    "",
    `RAPPEL FINAL : réponse intégralement en ${label}.`,
  ].join("\n");
}

function buildMediationSourceOutputSuffix(langCode: string): string {
  const label = outputLangLabel(langCode);
  return [
    "",
    "---",
    "FORMAT DE SORTIE — FICHE MÉDIATION (obligatoire) :",
    "Ce texte sert UNIQUEMENT de matière première pour générer ensuite des médiations IA (plusieurs personas).",
    `Rédige une FICHE SOURCE DENSE en ${label} (Markdown léger : titres courts, puces ou paragraphes brefs).`,
    "Longueur cible : 700 à 1000 mots maximum. Pas de dissertation, pas de paragraphes encyclopédiques.",
    "Pour chaque section demandée ci-dessus : 2 à 4 phrases percutantes OU puces courtes (faits visuels, symboles, émotions).",
    "N'utilise pas de JSON, pas de crochets [] ni d'accolades {}. Pas de préambule « En tant que… ».",
    "",
    `IMPORTANT : Rédige l'intégralité de ta réponse en ${label}.`,
  ].join("\n");
}

const OUTPUT_FORMAT_MARKERS = [
  "FORMAT DE SORTIE — FICHE MÉDIATION",
  "FORMAT DE SORTIE (obligatoire)",
  "FORMAT DE SORTIE :",
] as const;

function buildAnalysisPromptText(template: string, langCode = "fr"): string {
  let base = applyOutputLangToPrompt(template.trim(), langCode);
  if (!base) return base;
  for (const marker of OUTPUT_FORMAT_MARKERS) {
    const i = base.indexOf(marker);
    if (i !== -1) {
      base = base.slice(0, i).trim();
      break;
    }
  }
  const suffix = buildMediationSourceOutputSuffix(langCode);
  if (base.includes("FORMAT DE SORTIE — FICHE MÉDIATION")) return base;
  return `${base}\n${suffix}`;
}

/**
 * Source unique : `app_settings` (clé « Analyse de l'image » puis legacy `analysis_prompt`).
 * `prompt_style` sert aux médiations (personas), pas à ce bouton.
 */
async function loadAnalysisPrompt(langCode = "fr"): Promise<LoadAnalysisPromptResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const fallback: LoadAnalysisPromptResult = {
    template: buildAnalysisPromptText(DEFAULT_ANALYSIS_PROMPT, langCode),
    maxOutputTokens: 1200,
    source: "default_constant",
  };
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("[analyze-artwork-image] loadAnalysisPrompt: no service role, using default");
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
      const result = {
        template: buildAnalysisPromptText(trimmed, langCode),
        maxOutputTokens: tokens,
        source: `app_settings:${k}`,
      };
      console.log(
        `[analyze-artwork-image] prompt from ${result.source}, ${result.template.length} chars, max_tokens=${result.maxOutputTokens}`,
      );
      return result;
    }
  } else if (appErr) {
    console.warn("[analyze-artwork-image] app_settings select failed:", appErr.message);
  }

  console.log("[analyze-artwork-image] prompt from default_constant");
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Persona renvoyée à l’app — alignée sur le structured output Gemini (title, description, tone optionnel). */
type ImageAnalysisPersona = {
  title: string;
  description: string;
  tone?: string;
};

/**
 * Schéma Structured Output (Gemini) : tableau d’objets { title, description, tone? }.
 * @see https://ai.google.dev/gemini-api/docs/json-mode
 */
const IMAGE_ANALYSIS_PERSONAS_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      description: { type: "STRING" },
      tone: { type: "STRING" },
    },
    required: ["title", "description"],
  },
};

function stringField(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/**
 * Correspondance universelle — Groq, anciens prompts ou clés alternatives → { title, description, tone? }.
 */
function canonicalizePersonaEntry(raw: unknown): ImageAnalysisPersona | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const d = raw.trim();
    return d ? { title: "—", description: d } : null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const title =
    stringField(o.title) ||
    stringField(o.name) ||
    stringField(o.label) ||
    stringField(o.persona) ||
    stringField(o.id);
  const description =
    stringField(o.description) ||
    stringField(o.biography) ||
    stringField(o.text) ||
    stringField(o.content) ||
    stringField(o.summary) ||
    stringField(o.mediation);
  const toneRaw = stringField(o.tone) || stringField(o.voix) || stringField(o.mood);
  const tone = toneRaw || undefined;
  if (!title && !description) return null;
  return {
    title: title || "—",
    description: description || "",
    ...(tone ? { tone } : {}),
  };
}

function personasToNotes(personas: ImageAnalysisPersona[]): string {
  return personas
    .map((p) => {
      const toneLine = p.tone ? `*Ton : ${p.tone}*\n\n` : "";
      return `### ${p.title}\n\n${toneLine}${p.description}`.trim();
    })
    .join("\n\n---\n\n");
}

/** Dernière passe avant la réponse HTTP (alias résiduels, forme stable). */
function finalizePersonasForResponse(personas: ImageAnalysisPersona[]): ImageAnalysisPersona[] {
  return personas
    .map((p) => canonicalizePersonaEntry(p as unknown))
    .filter((x): x is ImageAnalysisPersona => x != null);
}

/** Si `parsed` est un tableau d’objets persona, renvoie notes + personas canoniques. */
function applyParsedPersonasArray(parsed: unknown, logLabel: string): {
  personas: ImageAnalysisPersona[];
  notes: string;
} | null {
  if (!Array.isArray(parsed)) return null;
  const rawList = parsed.map(canonicalizePersonaEntry).filter((x): x is ImageAnalysisPersona => x != null);
  if (rawList.length === 0) return null;
  const personas = finalizePersonasForResponse(rawList);
  console.log(`Données parsées avec succès (${logLabel}) :`, parsed);
  return { personas, notes: personasToNotes(personas) };
}

/**
 * Retire les blocs markdown ```json ... ``` puis extrait le premier objet `{...}` ou tableau `[...]` JSON
 * équilibré (respecte les guillemets et échappements).
 */
function extractBalancedJsonString(raw: string): string | null {
  let unwrapped = raw.trim().replace(/^[\s\uFEFF]+/, "");
  const fenceIdx = unwrapped.search(/```(?:json|JSON)?\s*\n?/);
  if (fenceIdx !== -1) {
    unwrapped = unwrapped.slice(fenceIdx).replace(/^```(?:json|JSON)?\s*\n?/, "");
    unwrapped = unwrapped.replace(/\n?```[\s]*$/m, "").trim();
  }

  const startObj = unwrapped.indexOf("{");
  const startArr = unwrapped.indexOf("[");
  if (startObj === -1 && startArr === -1) return null;

  const useArray = startArr !== -1 && (startObj === -1 || startArr < startObj);
  const start = useArray ? startArr : startObj;
  const open = useArray ? "[" : "{";
  const close = useArray ? "]" : "}";

  let depth = 0;
  let inString = false;
  let esc = false;

  for (let i = start; i < unwrapped.length; i++) {
    const c = unwrapped[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\" && inString) {
      esc = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return unwrapped.slice(start, i + 1);
    }
  }
  return null;
}

/** Construit une liste de personas + un texte « notes » pour le champ matériau source (formats legacy / enveloppés). */
function normalizePersonasPayload(parsed: unknown): {
  personas: ImageAnalysisPersona[];
  notes: string;
} | null {
  const fromEntry = (key: string, body: unknown): ImageAnalysisPersona | null => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const o = body as Record<string, unknown>;
      return canonicalizePersonaEntry({
        ...o,
        title: stringField(o.title) || key,
      });
    }
    if (typeof body === "string") return canonicalizePersonaEntry({ title: key, description: body });
    return canonicalizePersonaEntry({ title: key, description: stringField(body) });
  };

  const list: ImageAnalysisPersona[] = [];

  if (Array.isArray(parsed)) {
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const c = canonicalizePersonaEntry(item);
      if (c) {
        list.push(c);
        continue;
      }
      if (typeof item === "string" && item.trim()) {
        list.push({ title: `Point ${i + 1}`, description: item.trim() });
      }
    }
  } else if (parsed && typeof parsed === "object") {
    const root = parsed as Record<string, unknown>;

    const arr =
      root.personas ??
      root.items ??
      root.results ??
      (Array.isArray(root.data) ? root.data : null);
    if (Array.isArray(arr)) {
      const nested = normalizePersonasPayload(arr);
      if (nested?.personas.length) return nested;
    }

    const box = root.mediations_par_style ?? root.styles ?? root.personas_by_id;
    if (box && typeof box === "object" && !Array.isArray(box)) {
      for (const [k, v] of Object.entries(box as Record<string, unknown>)) {
        const p = fromEntry(k, v);
        if (p) list.push(p);
      }
    }

    const titles = root.titles;
    const descriptions = root.descriptions;
    if (Array.isArray(titles) && Array.isArray(descriptions)) {
      const n = Math.min(titles.length, descriptions.length);
      for (let i = 0; i < n; i++) {
        const p = canonicalizePersonaEntry({
          title: titles[i],
          description: descriptions[i],
        });
        if (p) list.push(p);
      }
    }

    if (
      list.length === 0 &&
      (typeof root.analyse_et_reflexion === "string" || typeof root.analyse_globale === "string") &&
      root.mediations_par_style &&
      typeof root.mediations_par_style === "object"
    ) {
      return normalizePersonasPayload({
        mediations_par_style: root.mediations_par_style,
      });
    }
  }

  if (list.length === 0) return null;

  const finalized = finalizePersonasForResponse(list);
  return { personas: finalized, notes: personasToNotes(finalized) };
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
  const artworkName = body.artwork_name?.trim() ?? "";
  const outputLang = resolveOutputLang(body.output_lang);
  const artworkId =
    typeof body.artwork_id === "string" && body.artwork_id.trim() ? body.artwork_id.trim() : null;
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

  const { template: promptTemplate, maxOutputTokens, source: promptSource } = await loadAnalysisPrompt(outputLang);
  const prompt = wrapPromptWithOutputLang(
    renderPrompt(promptTemplate, {
      artist_name: artistName || "inconnu",
      artwork_name: artworkName,
    }),
    outputLang,
  );
  console.log(
    "[analyze-artwork-image] prompt:",
    promptSource,
    "output_lang:",
    outputLang,
    "maxOutputTokens:",
    maxOutputTokens,
    "artist:",
    artistName || "inconnu",
    "artwork:",
    artworkName || "sans titre",
  );

  const contents = [
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
  ];

  // Gemini 2.5 : les tokens de réflexion comptent dans maxOutputTokens par défaut → texte tronqué.
  // thinkingBudget: 0 consacre tout le plafond au texte visible.
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget: 0 },
  };

  const preferredModels = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const guard = await checkAILimitBeforeCall(
      admin,
      "gemini",
      preferredModels[0],
      maxOutputTokens,
    );
    if (!guard.allowed) {
      return aiGuardBlockedResponse(guard);
    }
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
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
          contents,
          config: generationConfig,
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

  const text = extractGeminiText(geminiJson);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finishReason = (geminiJson as any)?.candidates?.[0]?.finishReason ?? null;
  const usageMetadata = extractGeminiUsageMetadataFromResponse(geminiJson);
  const truncated = finishReason === "MAX_TOKENS";
  const tok = tokensFromAnyGeminiUsageLike(usageMetadata);
  console.log(
    "[analyze-artwork-image] finish:",
    finishReason,
    "truncated:",
    truncated,
    "chars:",
    text.length,
    "completion_tokens:",
    tok.completion_tokens,
    "maxOutputTokens:",
    maxOutputTokens,
  );

  if (!text) {
    return jsonResponse(502, {
      error: "Réponse texte Gemini vide.",
      finish_reason: finishReason,
      usage_metadata: usageMetadata,
      model_used: modelUsed,
    });
  }

  const notesOut = text.trim();
  console.log("[analyze-artwork-image] réponse texte brut, longueur:", notesOut.length);

  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await insertAiUsageLog(admin, {
      model_id: modelUsed,
      provider: "gemini",
      prompt_tokens: tok.prompt_tokens,
      completion_tokens: tok.completion_tokens,
      total_tokens: tok.total_tokens,
      artwork_id: artworkId,
    });
  }

  return jsonResponse(200, {
    notes: notesOut,
    output_lang: outputLang,
    model_used: modelUsed,
    finish_reason: finishReason,
    usage_metadata: usageMetadata,
    truncated,
    max_output_tokens: maxOutputTokens,
  });
});

