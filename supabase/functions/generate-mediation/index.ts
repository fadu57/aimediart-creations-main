import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type MediationStyleInput = {
  id: string;
  label?: string;
  max_tokens: number;
};

type RequestBody = {
  source_text?: string;
  styles?: MediationStyleInput[];
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

function parseJsonObject(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le modèle n'a pas renvoyé un objet JSON.");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    return jsonResponse(500, { error: "Variable d'environnement GROQ_API_KEY manquante." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Body JSON invalide." });
  }

  const sourceText = body.source_text?.trim() ?? "";
  const styles = body.styles ?? [];

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

  const stylesSpec = styles
    .map((s) => {
      const label = s.label?.trim() || s.id;
      return `- id="${s.id}", label="${label}", max_tokens=${Math.round(s.max_tokens)}`;
    })
    .join("\n");

  // Budget de sortie unique pour tout le JSON : au moins 3000 tokens pour couvrir plusieurs styles sans couper.
  const maxFromStyles = Math.max(...styles.map((s) => Math.round(s.max_tokens)));
  const maxTokens = Math.min(8192, Math.max(3000, maxFromStyles));

  const prompt = [
    "Tu es un assistant de médiation culturelle.",
    "À partir du texte source, génère un JSON strict (sans markdown) avec une clé par style demandé.",
    "Respecte le ton de chaque label de style.",
    "Chaque texte doit rester concis, clair, fidèle aux informations fournies.",
    "IMPORTANT: les clés JSON de sortie doivent être exactement les IDs fournis.",
    "",
    "Contraintes styles:",
    stylesSpec,
    "",
    "Texte source:",
    sourceText,
  ].join("\n");

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // llama-3.1-70b-versatile a été retiré par Groq ; aligné sur generate-artist-bio
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    const normalized = (errorText || "").toLowerCase();
    const isInvalidApiKey =
      groqResponse.status === 401 ||
      groqResponse.status === 403 ||
      normalized.includes("invalid_api_key") ||
      normalized.includes("invalid api key");
    if (isInvalidApiKey) {
      return jsonResponse(502, {
        error: "Clé API Groq invalide.",
        details: "Vérifiez la variable d'environnement GROQ_API_KEY dans Supabase Edge Functions.",
      });
    }
    return jsonResponse(502, {
      error: "Erreur Groq.",
      details: errorText || `HTTP ${groqResponse.status}`,
    });
  }

  const groqJson = (await groqResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };

  const content = groqJson.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return jsonResponse(502, { error: "Réponse vide de Groq." });
  }

  try {
    const mediation = parseJsonObject(content);
    // Retourne directement l'objet clé(style_id) -> texte
    return jsonResponse(200, mediation);
  } catch (error) {
    return jsonResponse(502, {
      error: "Réponse JSON invalide de Groq.",
      details: error instanceof Error ? error.message : "unknown",
      raw: content,
    });
  }
});

