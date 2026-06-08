import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai@2.3.0";
import {
  aiGuardBlockedResponse,
  checkAILimitBeforeCall,
} from "../_shared/aiGuard.ts";
import {
  extractGeminiUsageMetadataFromResponse,
  insertAiUsageLog,
  interactionUsageIsEffectivelyEmpty,
  tokensFromAnyGeminiUsageLike,
  tokensFromGroqOpenAiUsage,
} from "../_shared/ai_usage_log.ts";
import { ingestGroqRateLimitHeaders } from "../_shared/groqObservedLimits.ts";

const SELECTED_MODEL_KEY = "selected_ai_model";

/** Plafond tokens / requête (tier on_demand, ex. llama-3.1-8b-instant) — prompt + max_tokens sortie. */
const GROQ_PER_REQUEST_TOKEN_BUDGET = 6000;
const GROQ_TOKEN_SAFETY_MARGIN = 250;

function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/** Caractères max. estimés pour un plafond tokens (français ~3,5 car./token). */
function approxMaxCharsFromTokens(maxTokens: number): number {
  return Math.max(80, Math.round(maxTokens * 3.5));
}

function approxMaxWordsFromTokens(maxTokens: number): number {
  return Math.max(15, Math.round(maxTokens * 0.7));
}

/** Tronque au plafond caractères (phrase ou mot entier) si le modèle dépasse max_tokens. */
function clampMediationTextToMaxTokens(text: string, maxTokens: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const maxChars = approxMaxCharsFromTokens(maxTokens);
  if (trimmed.length <= maxChars) return trimmed;

  let slice = trimmed.slice(0, maxChars);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf(".\n"),
    slice.lastIndexOf("!\n"),
    slice.lastIndexOf("?\n"),
  );
  if (sentenceEnd > maxChars * 0.55) {
    slice = slice.slice(0, sentenceEnd + 1).trimEnd();
  } else {
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > maxChars * 0.65) slice = slice.slice(0, lastSpace).trimEnd();
  }
  return slice.endsWith("…") ? slice : `${slice}…`;
}

function enforceStyleLengthLimits(
  stylesOut: Record<string, string>,
  styles: MediationStyleInput[],
): Record<string, string> {
  const maxById = new Map(styles.map((s) => [s.id.trim(), Math.round(s.max_tokens)]));
  const out: Record<string, string> = { ...stylesOut };
  for (const [id, raw] of Object.entries(out)) {
    const maxT = maxById.get(id.trim());
    if (!maxT || !raw) continue;
    const clamped = clampMediationTextToMaxTokens(raw, maxT);
    if (clamped.length < raw.trim().length) {
      console.warn(
        `[generate-mediation] Texte tronqué pour id="${id}" (${raw.trim().length} → ${clamped.length} car., plafond ${maxT} tokens).`,
      );
    }
    out[id] = clamped;
  }
  return out;
}

/** Sortie Groq : somme des plafonds par persona + marge JSON. */
function groqMediationMaxOutputTokens(styles: MediationStyleInput[]): number {
  const sum = styles.reduce((acc, s) => acc + Math.round(s.max_tokens), 0);
  return Math.min(4096, Math.max(768, sum + 500));
}

function geminiMediationMaxOutputTokens(styles: MediationStyleInput[]): number {
  const sum = styles.reduce((acc, s) => acc + Math.round(s.max_tokens), 0);
  return Math.min(32_768, Math.max(2048, sum + 1_800));
}

function truncateSourceForGroq(params: {
  sourceText: string;
  systemInstruction: string;
  userPromptPrefix: string;
  reservedOutputTokens: number;
}): { text: string; truncated: boolean } {
  const budget =
    GROQ_PER_REQUEST_TOKEN_BUDGET -
    GROQ_TOKEN_SAFETY_MARGIN -
    params.reservedOutputTokens;
  const prefixTokens =
    estimateTextTokens(params.systemInstruction) + estimateTextTokens(params.userPromptPrefix);
  const sourceTokenBudget = Math.max(350, budget - prefixTokens);
  const maxChars = Math.floor(sourceTokenBudget * 3.5);
  const src = params.sourceText.trim();
  if (src.length <= maxChars) return { text: src, truncated: false };
  return {
    text:
      src.slice(0, maxChars).trimEnd() +
      "\n\n[… matériau source tronqué pour respecter la limite Groq — conservez l’essentiel visuel et symbolique …]",
    truncated: true,
  };
}

function isGroqRequestTooLargeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("request too large") ||
    m.includes("tokens per minute") ||
    (m.includes("rate_limit") && m.includes("requested") && m.includes("limit"))
  );
}

function isGroqJsonValidateFailedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("json_validate_failed") ||
    m.includes("failed to generate json") ||
    m.includes("invalid_request_error") && m.includes("json")
  );
}

function isGroqRecoverableWithGeminiError(message: string): boolean {
  return isGroqRequestTooLargeError(message) || isGroqJsonValidateFailedError(message);
}

/** Personas avec rimes / strophes / vers imposés : Groq (llama) les respecte mal → préférer Gemini. */
const STRICT_FORMAT_MARKERS = [
  "rime",
  "rimes",
  "rimant",
  "abab",
  "aabb",
  "strophe",
  "strophes",
  "vers obligatoire",
  "8 vers",
  "huit vers",
  "octosyllabe",
  "alexandrin",
  "poème",
  "poeme",
  "poésie",
  "poesie",
  "double espace",
  "vers libres",
  "schéma de rimes",
  "schema de rimes",
];

function styleRulesCombined(style: MediationStyleInput): string {
  return [style.system_instruction, style.style_rules]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .join("\n");
}

function styleNeedsStrictFormatting(style: MediationStyleInput): boolean {
  const t = styleRulesCombined(style)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!t) return false;
  return STRICT_FORMAT_MARKERS.some((m) => t.includes(m));
}

function anyStyleNeedsStrictFormatting(styles: MediationStyleInput[]): boolean {
  return styles.some(styleNeedsStrictFormatting);
}

/** Gemini rapide pour contraintes de forme (rimes, strophes) quand le modèle actif est Groq. */
const GEMINI_STRICT_FORMAT_FALLBACK = "gemini-2.5-flash";

type MediationStyleInput = {
  id: string;
  label?: string;
  max_tokens: number;
  style_rules?: string;
  system_instruction?: string;
};

type RequestBody = {
  source_text?: string;
  styles?: MediationStyleInput[];
  /** Code langue BCP-47 court (fr, en, de, es, it). */
  lang?: string;
};

type MediationApiResponse = {
  analyse_globale: string;
  styles: Record<string, string>;
  model_used?: string;
  configured_model_id?: string;
  routing_note?: string;
};

const LANG_NAMES: Record<string, string> = {
  fr: "français",
  en: "English",
  de: "Deutsch",
  es: "español",
  it: "italiano",
};

function buildLangInstruction(lang: string | undefined): string | null {
  if (!lang) return null;
  const code = lang.toLowerCase().slice(0, 2);
  const name = LANG_NAMES[code];
  if (!name) return null;
  if (code === "fr") return null; // pas de consigne superflue pour le français (langue par défaut)
  return [
    `LANGUE CIBLE OBLIGATOIRE : ${name} (${code}).`,
    `Rédige INTÉGRALEMENT le contenu textuel (analyse_et_reflexion + chaque valeur dans mediations_par_style) UNIQUEMENT en ${name}.`,
    `INTERDICTION ABSOLUE : ne traduis PAS les clés JSON.`,
    `Les clés "analyse_et_reflexion", "mediations_par_style" et les ids de style (ex : "poetique", "simple", "expert"…) sont des identifiants techniques — ils doivent rester EXACTEMENT tels quels, sans modification ni traduction.`,
    `Seul le CONTENU (les valeurs des chaînes) est en ${name}.`,
  ].join(" ");
}

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

/**
 * Consigne système courte : le matériau source est déjà une fiche d’analyse ;
 * JSON strict (analyse interne + textes persona).
 */
const SYSTEM_INSTRUCTION = `Tu es médiateur culturel pour musées et galeries.

Le « matériau source » fourni est déjà une fiche sur l'œuvre. Ne refais pas une dissertation : en 5 à 8 phrases maximum dans « analyse_et_reflexion », note l'essentiel utile aux personas (sujet, émotion, symboles, accroches visuelles).

Pour CHAQUE id de style demandé dans « mediations_par_style » :
- applique STRICTEMENT les « Consignes obligatoires » listées pour ce persona dans la requête (format, rimes, structure, interdictions) — elles priment sur tes habitudes par défaut ;
- adopte une voix nette et spécifique à ce persona (pas de ton générique) ;
- réécris sous cet angle uniquement, en t'appuyant sur le matériau source ;
- n'invente pas de faits (dates, lieux, titres) absents du source ; si besoin, reste prudent ;
- texte public : court, vivant, lisible sur borne ou fiche (pas de plan de dissertation) ;
- PLAFOND DE LONGUEUR OBLIGATOIRE : pour chaque id, ne dépasse jamais le maximum en tokens indiqué (équivalent mots/caractères dans la fiche). Si le sujet est riche, synthétise : qualité et concision priment sur l'exhaustivité.

Réponds UNIQUEMENT par un objet JSON valide (sans markdown, sans \`\`\`), avec exactement :
1) "analyse_et_reflexion" : chaîne (réflexion interne, non destinée au visiteur).
2) "mediations_par_style" : objet dont les clés sont EXACTEMENT les ids fournis ; chaque valeur est le texte final pour ce persona.

Chaque valeur de mediations_par_style doit être une chaîne JSON unique (guillemets, échappements \\n si besoin) : jamais de titres Markdown (###, ##), jamais de bloc de code (\`\`\`).

Pour les personas dont les consignes imposent des vers ou strophes : insère de vrais retours à la ligne \\n dans la chaîne JSON (un vers par ligne, double espace en fin de ligne si demandé, ligne vide entre strophes). N'écris pas tout le poème sur une seule ligne séparée par des virgules.

Ne recopie pas l'analyse dans chaque persona : synthétise et adapte le ton.`;

function parseMediationGeminiJson(
  raw: string,
  expectedIds: string[],
): { analyse: string; styles: Record<string, string> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Réponse Gemini n'est pas un JSON parsable.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON racine invalide.");
  }
  const root = parsed as Record<string, unknown>;
  const analyseRaw = root.analyse_et_reflexion ?? root.analyse_globale;
  const analyse =
    typeof analyseRaw === "string"
      ? analyseRaw.trim()
      : typeof analyseRaw === "number"
        ? String(analyseRaw)
        : "";
  const box = root.mediations_par_style ?? root.mediators_par_style;
  if (!box || typeof box !== "object" || Array.isArray(box)) {
    throw new Error('Clé "mediations_par_style" manquante ou invalide.');
  }
  const styles: Record<string, string> = {};
  for (const id of expectedIds) {
    const v = (box as Record<string, unknown>)[id];
    styles[id] = typeof v === "string" ? v.trim() : "";
  }
  return { analyse, styles };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lecture robuste de `app_settings.value` (texte, JSON, jsonb). */
function parseAppSettingsModelValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return "";
    if ((t.startsWith('"') && t.endsWith('"')) || t.startsWith("{")) {
      try {
        const p = JSON.parse(t) as unknown;
        if (typeof p === "string") return p.trim();
        if (p && typeof p === "object" && !Array.isArray(p)) {
          const o = p as Record<string, unknown>;
          const id = o.model_id ?? o.id ?? o.selected_model ?? o.model;
          if (typeof id === "string" && id.trim()) return id.trim();
        }
      } catch {
        /* chaîne brute */
      }
    }
    return t;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const id = o.model_id ?? o.id ?? o.selected_model ?? o.model;
    if (typeof id === "string") return id.trim();
  }
  const s = String(raw).trim();
  return s === "[object Object]" ? "" : s;
}

/** Même heuristique que generate-artist-bio : Gemini / Deep Research vs Groq. */
function shouldUseGemini(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (id.startsWith("gemini")) return true;
  const relaxed = id.replace(/[-_]/g, " ");
  if (relaxed.includes("deep research")) return true;
  if (id.includes("deep-research")) return true;
  return false;
}

/**
 * Modèles agent Deep Research : exclusifs à l’Interactions API (pas generateContent).
 * @see https://ai.google.dev/gemini-api/docs/interactions
 */
function isGeminiDeepResearchAgent(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (id.includes("deep-research")) return true;
  const relaxed = id.replace(/[-_]/g, " ");
  return relaxed.includes("deep research");
}

/**
 * Après statut completed/incomplete, l’objet `usage` peut arriver vide sur le premier GET
 * (interaction `background: true`) ; on refetch quelques fois avant de journaliser.
 */
async function resolveInteractionUsageAfterComplete(
  ai: GoogleGenAI,
  interactionId: string,
  initial: unknown,
): Promise<unknown> {
  let usage: unknown = initial ?? null;
  if (!interactionUsageIsEffectivelyEmpty(usage)) return usage;
  const maxExtra = Math.min(6, Math.max(2, Number(Deno.env.get("GEMINI_INTERACTION_USAGE_EXTRA_GETS") ?? "4")));
  for (let i = 0; i < maxExtra; i++) {
    await sleep(350 * (i + 1));
    const again = await ai.interactions.get(interactionId);
    // `usage` et parfois `usageMetadata` selon la version du SDK / l’API.
    const againRec = again as Record<string, unknown>;
    const nextUsage =
      again.usage ?? againRec.usageMetadata ?? againRec.usage_metadata;
    if (nextUsage != null) usage = nextUsage;
    if (!interactionUsageIsEffectivelyEmpty(usage)) break;
  }
  if (interactionUsageIsEffectivelyEmpty(usage)) {
    console.warn(
      "[generate-mediation] usage Interaction toujours vide après refetch — les compteurs peuvent rester à 0.",
    );
  }
  return usage;
}

/** Usage d’une interaction : `usage` (SDK) ou `usageMetadata` selon les versions. */
function interactionRecordUsage(interaction: unknown): unknown {
  if (interaction == null || typeof interaction !== "object") return null;
  const r = interaction as Record<string, unknown>;
  return r.usage ?? r.usageMetadata ?? r.usage_metadata ?? null;
}

/** Concatène les blocs texte utiles dans `outputs` d’une Interaction terminée. */
function extractInteractionOutputsText(interaction: { outputs?: unknown }): string {
  const outs = interaction.outputs;
  if (!Array.isArray(outs)) return "";
  const chunks: string[] = [];
  for (const block of outs) {
    if (!block || typeof block !== "object") continue;
    const o = block as Record<string, unknown>;
    if (o.type === "text" && typeof o.text === "string") {
      chunks.push(o.text);
      continue;
    }
    if (o.type === "thought" && Array.isArray(o.summary)) {
      for (const s of o.summary) {
        if (s && typeof s === "object") {
          const so = s as Record<string, unknown>;
          if (so.type === "text" && typeof so.text === "string") chunks.push(so.text);
        }
      }
    }
  }
  return chunks.join("\n").trim();
}

async function runDeepResearchMediationInteraction(params: {
  ai: GoogleGenAI;
  agentId: string;
  systemInstruction: string;
  userInput: string;
}): Promise<{ text: string; usage: unknown; interactionId: string }> {
  const maxPolls = Math.min(80, Math.max(8, Number(Deno.env.get("GEMINI_DEEP_RESEARCH_MAX_POLLS") ?? "45")));
  const pollMs = Math.min(60_000, Math.max(2_000, Number(Deno.env.get("GEMINI_DEEP_RESEARCH_POLL_MS") ?? "8000")));

  /** Les agents Deep Research refusent `system_instruction` ; tout doit aller dans `input`. */
  const input = [
    "### Rôle et méthode (respect strict)\n\n",
    params.systemInstruction,
    "\n\n### Données de la requête\n\n",
    params.userInput,
  ].join("");

  let cur = await params.ai.interactions.create({
    agent: params.agentId,
    input,
    agent_config: { type: "deep-research", thinking_summaries: "none" },
    background: true,
    store: true,
  });
  const interactionId = cur.id;

  for (let poll = 0; ; poll++) {
    if (cur.status === "completed") {
      const text = extractInteractionOutputsText(cur);
      if (!text) {
        throw new Error("Deep Research: interaction terminée mais sans texte dans outputs.");
      }
      const usage = await resolveInteractionUsageAfterComplete(params.ai, interactionId, interactionRecordUsage(cur));
      return { text, usage, interactionId };
    }
    if (cur.status === "incomplete") {
      const text = extractInteractionOutputsText(cur);
      if (text) {
        const usage = await resolveInteractionUsageAfterComplete(params.ai, interactionId, interactionRecordUsage(cur));
        return { text, usage, interactionId };
      }
    }
    if (cur.status === "failed" || cur.status === "cancelled") {
      throw new Error(`Deep Research: statut « ${cur.status} ».`);
    }
    if (cur.status === "requires_action") {
      throw new Error(
        "Deep Research: statut requires_action (outil) — non pris en charge dans generate-mediation.",
      );
    }
    if (poll >= maxPolls) {
      throw new Error(
        `Deep Research: timeout après ${maxPolls} sondages (statut encore « ${cur.status} »). Augmentez GEMINI_DEEP_RESEARCH_MAX_POLLS ou le timeout de la Edge Function.`,
      );
    }
    await sleep(pollMs);
    cur = await params.ai.interactions.get(interactionId);
  }
}

function extractBalancedJsonObject(raw: string): string | null {
  let s = raw.trim();
  const fence = s.search(/```(?:json)?\s*\n?/i);
  if (fence !== -1) {
    s = s.slice(fence).replace(/^```(?:json)?\s*\n?/i, "");
    s = s.replace(/\n?```\s*$/i, "").trim();
  }
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
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
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function coerceMediationModelJsonText(raw: string): string {
  const t = raw.trim();
  try {
    JSON.parse(t);
    return t;
  } catch {
    const slice = extractBalancedJsonObject(t);
    if (slice) return slice;
    throw new Error("JSON médiation introuvable dans la réponse (Groq / enveloppes markdown).");
  }
}

function parseGroqRetrySecondsFromBody(text: string): number | null {
  const m = text.match(/try again in ([0-9.]+)\s*s/i);
  if (m) return Math.min(90, Math.ceil(Number(m[1]) + 0.5));
  try {
    const j = JSON.parse(text) as { error?: { message?: string } };
    const msg = typeof j?.error?.message === "string" ? j.error.message : "";
    const m2 = msg.match(/try again in ([0-9.]+)\s*s/i);
    if (m2) return Math.min(90, Math.ceil(Number(m2[1]) + 0.5));
  } catch {
    /* ignore */
  }
  return null;
}

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

async function callGroqMediationJson(params: {
  admin: ReturnType<typeof createClient>;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<{ content: string; usage: unknown }> {
  const maxGroqOut = Math.min(params.maxTokens, 16_384);
  const baseMessages = [
    { role: "system" as const, content: params.system },
    { role: "user" as const, content: params.user },
  ];
  let lastErr = "";

  // Sans response_format json_object : Groq rejette souvent les ### / markdown dans les valeurs.
  for (let attempt = 0; attempt < 4; attempt++) {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: baseMessages,
      temperature: 0.35,
      max_tokens: maxGroqOut,
    };

    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 3) {
      const txt429 = await res.text();
      const wait = parseGroqRetrySecondsFromBody(txt429) ?? 2 + attempt * 2;
      console.warn(`[generate-mediation] Groq rate limit — attente ${wait}s (tentative ${attempt + 1}/4).`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) {
      const txtErr = await res.text();
      lastErr = txtErr.slice(0, 1_200) || `Groq HTTP ${res.status}`;
      throw new Error(lastErr);
    }

    ingestGroqRateLimitHeaders(params.admin, params.model, res);

    const txt = await res.text();
    const json = JSON.parse(txt) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    if (json.usage == null) {
      console.warn("[generate-mediation] Réponse Groq sans objet `usage` — compteurs probablement à 0.");
    }
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("Réponse Groq vide.");
    return { content, usage: json.usage ?? null };
  }
  throw new Error(lastErr || "Groq: échec après tentatives.");
}

async function runGeminiMediationFallback(params: {
  geminiApiKey: string;
  fallbackModel: string;
  combinedPrompt: string;
  geminiMaxOutputTokens: number;
  expectedIds: string[];
  admin: ReturnType<typeof createClient>;
  reason: string;
}): Promise<{ analyse: string; styles: Record<string, string>; model: string }> {
  console.warn(`[generate-mediation] Repli Gemini (${params.fallbackModel}) — ${params.reason}`);
  const ai = new GoogleGenAI({ apiKey: params.geminiApiKey });
  const geminiJson = await ai.models.generateContent({
    model: params.fallbackModel,
    contents: [{ role: "user", parts: [{ text: params.combinedPrompt }] }],
    config: {
      maxOutputTokens: params.geminiMaxOutputTokens,
      temperature: 0.38,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = extractGeminiText(geminiJson);
  if (!text) throw new Error("Réponse Gemini vide (repli).");
  const parsed = parseMediationGeminiJson(text, params.expectedIds);
  const tok = tokensFromAnyGeminiUsageLike(extractGeminiUsageMetadataFromResponse(geminiJson));
  await insertAiUsageLog(params.admin, {
    model_id: params.fallbackModel,
    provider: "gemini",
    prompt_tokens: tok.prompt_tokens,
    completion_tokens: tok.completion_tokens,
    total_tokens: tok.total_tokens,
    artwork_id: null,
  });
  return { ...parsed, model: params.fallbackModel };
}

async function resolveMediationModelId(
  admin: ReturnType<typeof createClient>,
): Promise<string> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", SELECTED_MODEL_KEY)
    .maybeSingle();
  const fromDb = parseAppSettingsModelValue((data as { value?: unknown } | null)?.value);
  if (fromDb) return fromDb;
  const env = Deno.env.get("GEMINI_MEDIATION_MODEL")?.trim();
  if (env) return env;
  return "gemini-2.5-pro-preview-05-06";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Configuration Supabase serveur incomplète (SUPABASE_URL / SERVICE_ROLE_KEY)." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Body JSON invalide." });
  }

  const sourceText = body.source_text?.trim() ?? "";
  const styles = body.styles ?? [];
  const langInstruction = buildLangInstruction(body.lang);

  if (!sourceText) {
    return jsonResponse(400, { error: "source_text est requis." });
  }
  if (!Array.isArray(styles) || styles.length === 0) {
    return jsonResponse(400, { error: "styles est requis (tableau non vide)." });
  }

  for (const style of styles) {
    if (!style?.id?.trim()) {
      return jsonResponse(400, { error: "Chaque style doit contenir un id." });
    }
    if (!Number.isFinite(style.max_tokens) || style.max_tokens < 50 || style.max_tokens > 2000) {
      return jsonResponse(400, { error: "max_tokens doit être un nombre entre 50 et 2000." });
    }
  }

  const expectedIds = styles.map((s) => s.id.trim());
  const stylesSpec = styles
    .map((s) => {
      const label = s.label?.trim() || s.id;
      const ruleParts = [s.system_instruction, s.style_rules]
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0);
      const rulesBlock =
        ruleParts.length > 0
          ? `\n  Consignes obligatoires pour ce persona (à respecter à la lettre) :\n${ruleParts.join("\n\n")}`
          : "";
      const maxT = Math.round(s.max_tokens);
      const maxWords = approxMaxWordsFromTokens(maxT);
      const maxChars = approxMaxCharsFromTokens(maxT);
      return `- id="${s.id}", persona / libellé="${label}", PLAFOND STRICT : maximum ${maxT} tokens (~${maxWords} mots, ~${maxChars} caractères) — ne pas dépasser${rulesBlock}`;
    })
    .join("\n\n");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const configuredModelId = await resolveMediationModelId(admin);
  const geminiApiKeyEarly = Deno.env.get("GEMINI_API_KEY")?.trim();
  let effectiveModelId = configuredModelId;
  let useGemini = shouldUseGemini(configuredModelId);
  let routingNote: string | undefined;

  const multiPersonaBatch = styles.length > 1;
  const needsStrictFormat = anyStyleNeedsStrictFormatting(styles);
  if (!useGemini && geminiApiKeyEarly && (needsStrictFormat || multiPersonaBatch)) {
    useGemini = true;
    effectiveModelId = GEMINI_STRICT_FORMAT_FALLBACK;
    routingNote = needsStrictFormat
      ? `Format strict (rimes/vers) : utilisation de ${effectiveModelId} plutôt que Groq (${configuredModelId}).`
      : `Lot multi-personas (${styles.length}) : utilisation de ${effectiveModelId} plutôt que Groq (${configuredModelId}).`;
    console.log(`[generate-mediation] ${routingNote}`);
  }

  console.log(
    `[generate-mediation] Modèle configuré: "${configuredModelId}" → effectif: "${effectiveModelId}" (${useGemini ? "Gemini" : "Groq"})`,
  );

  const guardProvider = useGemini ? "gemini" : "groq";
  const estimatedTokens = estimateTextTokens(sourceText)
    + (useGemini ? 4096 : groqMediationMaxOutputTokens(styles));
  const guard = await checkAILimitBeforeCall(
    admin,
    guardProvider,
    effectiveModelId,
    estimatedTokens,
  );
  if (!guard.allowed) {
    return aiGuardBlockedResponse(guard);
  }

  const userPromptPrefix = [
    langInstruction,
    "",
    "## Styles à produire (identifiants EXACTS pour les clés de mediations_par_style)",
    stylesSpec,
    "",
    "## Matériau source (œuvre, notes catalogue, etc.)",
    "",
  ].join("\n");

  const expectedIdsFormatted = expectedIds.map((id) => `"${id}"`).join(", ");
  const userPromptSuffix = [
    "",
    "## Rappel sortie",
    "Un seul objet JSON avec les clés \"analyse_et_reflexion\" et \"mediations_par_style\" (clés internes = ids ci-dessus).",
    "Chaque valeur de mediations_par_style doit respecter le PLAFOND STRICT (tokens/mots/caractères) de son id — texte plus long = non conforme.",
    `RAPPEL CRITIQUE : les clés dans mediations_par_style doivent être EXACTEMENT : ${expectedIdsFormatted}. Ne pas traduire ces identifiants.`,
  ].join("\n");

  const geminiMaxOutputTokens = geminiMediationMaxOutputTokens(styles);
  const groqMaxOutputTokens = groqMediationMaxOutputTokens(styles);

  let effectiveSource = sourceText;
  if (!useGemini) {
    const trimmed = truncateSourceForGroq({
      sourceText,
      systemInstruction: SYSTEM_INSTRUCTION,
      userPromptPrefix,
      reservedOutputTokens: groqMaxOutputTokens,
    });
    effectiveSource = trimmed.text;
    if (trimmed.truncated) {
      console.warn(
        `[generate-mediation] Matériau source tronqué pour Groq (${effectiveSource.length} car., max sortie ${groqMaxOutputTokens} tokens)`,
      );
    }
  }

  const userPrompt = [userPromptPrefix, effectiveSource, userPromptSuffix].join("\n");

  const combinedPrompt = [
    "### Rôle et méthode (respect strict)\n\n",
    SYSTEM_INSTRUCTION,
    "\n\n### Données de la requête\n\n",
    userPrompt,
  ].join("");

  let analyse: string;
  let stylesOut: Record<string, string>;

  if (useGemini) {
    const geminiApiKey = geminiApiKeyEarly;
    if (!geminiApiKey) {
      return jsonResponse(500, {
        error: "GEMINI_API_KEY manquante : le modèle configuré nécessite Gemini (ex. gemini-*, deep research).",
      });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    let geminiJson: unknown = null;
    let text: string;
    let usageForLog: unknown = null;

    if (isGeminiDeepResearchAgent(effectiveModelId)) {
      try {
        const dr = await runDeepResearchMediationInteraction({
          ai,
          agentId: effectiveModelId.trim(),
          systemInstruction: SYSTEM_INSTRUCTION,
          userInput: userPrompt,
        });
        text = dr.text;
        usageForLog = dr.usage;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse(502, {
          error: "Erreur Deep Research (Interactions API, generate-mediation).",
          details: msg,
          model_used: effectiveModelId,
        });
      }
    } else {
      try {
        geminiJson = await ai.models.generateContent({
          model: effectiveModelId,
          contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
          config: {
            maxOutputTokens: geminiMaxOutputTokens,
            temperature: 0.38,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse(502, {
          error: "Erreur d'appel Gemini (generate-mediation).",
          details: msg,
          model_used: effectiveModelId,
        });
      }

      text = extractGeminiText(geminiJson);
      if (!text && geminiJson && typeof geminiJson === "object" && "text" in geminiJson) {
        const t2 = (geminiJson as { text?: unknown }).text;
        if (typeof t2 === "string") text = t2.trim();
      }
      if (!text) {
        return jsonResponse(502, {
          error: "Réponse Gemini vide.",
          model_used: effectiveModelId,
        });
      }
      // SDK @google/genai : usageMetadata peut être absent ou nommé autrement selon le transport.
      usageForLog = extractGeminiUsageMetadataFromResponse(geminiJson);
      if (!usageForLog) {
        console.warn("[generate-mediation] usageMetadata absent après generateContent — à vérifier côté API / SDK.");
      }
    }

    if (!text?.trim()) {
      return jsonResponse(502, {
        error: "Réponse Gemini vide.",
        model_used: effectiveModelId,
      });
    }

    try {
      let rawJson = text;
      if (isGeminiDeepResearchAgent(effectiveModelId)) {
        try {
          rawJson = coerceMediationModelJsonText(text);
        } catch {
          /* la réponse est peut-être déjà du JSON brut */
        }
      }
      const parsed = parseMediationGeminiJson(rawJson, expectedIds);
      analyse = parsed.analyse;
      stylesOut = parsed.styles;
    } catch (e) {
      return jsonResponse(502, {
        error: "JSON de médiation invalide (Gemini).",
        details: e instanceof Error ? e.message : "unknown",
        model_used: effectiveModelId,
        raw: text.slice(0, 2_000),
      });
    }

    const tok = tokensFromAnyGeminiUsageLike(usageForLog);
    if (tok.total_tokens === 0) {
      console.warn(
        `[generate-mediation] Compteurs tokens à 0 (modèle: ${effectiveModelId}). Vérifiez la réponse API si le problème persiste.`,
      );
    }
    await insertAiUsageLog(admin, {
      model_id: effectiveModelId,
      provider: "gemini",
      prompt_tokens: tok.prompt_tokens,
      completion_tokens: tok.completion_tokens,
      total_tokens: tok.total_tokens,
      artwork_id: null,
    });
  } else {
    const groqApiKey = Deno.env.get("GROQ_API_KEY")?.trim();
    if (!groqApiKey) {
      return jsonResponse(500, {
        error: "GROQ_API_KEY manquante : le modèle configuré nécessite Groq (ex. llama-*).",
      });
    }

    let groqRes: { content: string; usage: unknown };
    try {
      groqRes = await callGroqMediationJson({
        admin,
        apiKey: groqApiKey,
        model: configuredModelId,
        system: SYSTEM_INSTRUCTION,
        user: userPrompt,
        maxTokens: groqMaxOutputTokens,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
      if (geminiApiKey && isGroqRecoverableWithGeminiError(msg)) {
        const fallbackModel = GEMINI_STRICT_FORMAT_FALLBACK;
        const fullUserPrompt = [userPromptPrefix, sourceText, userPromptSuffix].join("\n");
        const combinedFallback = [
          "### Rôle et méthode (respect strict)\n\n",
          SYSTEM_INSTRUCTION,
          "\n\n### Données de la requête\n\n",
          fullUserPrompt,
        ].join("");
        try {
          const parsed = await runGeminiMediationFallback({
            geminiApiKey,
            fallbackModel,
            combinedPrompt: combinedFallback,
            geminiMaxOutputTokens,
            expectedIds,
            admin,
            reason: isGroqJsonValidateFailedError(msg)
              ? "JSON Groq invalide (markdown dans les valeurs)"
              : "requête Groq trop volumineuse",
          });
          return jsonResponse(200, {
            analyse_globale: parsed.analyse,
            styles: enforceStyleLengthLimits(parsed.styles, styles),
            model_used: parsed.model,
            groq_fallback: true,
          });
        } catch (geminiErr) {
          const gMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
          return jsonResponse(502, {
            error: "Erreur Groq puis repli Gemini (generate-mediation).",
            details: `${msg} | Gemini: ${gMsg}`,
            model_used: configuredModelId,
          });
        }
      }
      return jsonResponse(502, {
        error: "Erreur Groq (generate-mediation).",
        details: msg,
        model_used: configuredModelId,
      });
    }

    let textRaw: string;
    try {
      textRaw = coerceMediationModelJsonText(groqRes.content);
    } catch (coerceErr) {
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
      if (geminiApiKey) {
        try {
          const fullUserPrompt = [userPromptPrefix, sourceText, userPromptSuffix].join("\n");
          const combinedFallback = [
            "### Rôle et méthode (respect strict)\n\n",
            SYSTEM_INSTRUCTION,
            "\n\n### Données de la requête\n\n",
            fullUserPrompt,
          ].join("");
          const parsed = await runGeminiMediationFallback({
            geminiApiKey,
            fallbackModel: GEMINI_STRICT_FORMAT_FALLBACK,
            combinedPrompt: combinedFallback,
            geminiMaxOutputTokens,
            expectedIds,
            admin,
            reason: "JSON Groq non extractible après réponse",
          });
          return jsonResponse(200, {
            analyse_globale: parsed.analyse,
            styles: enforceStyleLengthLimits(parsed.styles, styles),
            model_used: parsed.model,
            groq_fallback: true,
          });
        } catch {
          /* repli échoué → erreur Groq ci-dessous */
        }
      }
      return jsonResponse(502, {
        error: "JSON de médiation invalide (Groq).",
        details: coerceErr instanceof Error ? coerceErr.message : "unknown",
        model_used: configuredModelId,
        raw: groqRes.content.slice(0, 2_000),
      });
    }

    try {
      const parsed = parseMediationGeminiJson(textRaw, expectedIds);
      analyse = parsed.analyse;
      stylesOut = parsed.styles;
    } catch (parseErr) {
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
      if (geminiApiKey) {
        try {
          const fullUserPrompt = [userPromptPrefix, sourceText, userPromptSuffix].join("\n");
          const combinedFallback = [
            "### Rôle et méthode (respect strict)\n\n",
            SYSTEM_INSTRUCTION,
            "\n\n### Données de la requête\n\n",
            fullUserPrompt,
          ].join("");
          const parsed = await runGeminiMediationFallback({
            geminiApiKey,
            fallbackModel: GEMINI_STRICT_FORMAT_FALLBACK,
            combinedPrompt: combinedFallback,
            geminiMaxOutputTokens,
            expectedIds,
            admin,
            reason: "JSON Groq parsable mais structure invalide",
          });
          return jsonResponse(200, {
            analyse_globale: parsed.analyse,
            styles: enforceStyleLengthLimits(parsed.styles, styles),
            model_used: parsed.model,
            groq_fallback: true,
          });
        } catch {
          /* repli échoué */
        }
      }
      return jsonResponse(502, {
        error: "JSON de médiation invalide après parsing (Groq).",
        details: parseErr instanceof Error ? parseErr.message : "unknown",
        model_used: configuredModelId,
        raw: textRaw.slice(0, 2_000),
      });
    }

    const tok = tokensFromGroqOpenAiUsage(groqRes.usage);
    await insertAiUsageLog(admin, {
      model_id: configuredModelId,
      provider: "groq",
      prompt_tokens: tok.prompt_tokens,
      completion_tokens: tok.completion_tokens,
      total_tokens: tok.total_tokens,
      artwork_id: null,
    });
  }

  const payload: MediationApiResponse = {
    analyse_globale: analyse,
    styles: enforceStyleLengthLimits(stylesOut, styles),
    model_used: effectiveModelId,
    configured_model_id: configuredModelId,
    ...(routingNote ? { routing_note: routingNote } : {}),
  };

  return jsonResponse(200, payload);
});
