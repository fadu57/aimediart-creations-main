import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RequestBody = {
  prenom?: string;
  nom?: string;
  art_types?: string[];
};

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

  const prenom = body.prenom?.trim() ?? "";
  const nom = body.nom?.trim() ?? "";
  const artTypes = Array.isArray(body.art_types) ? body.art_types.map((t) => t?.trim() ?? "").filter(Boolean) : [];
  if (!prenom || !nom || artTypes.length === 0) {
    return jsonResponse(400, { error: "prenom, nom et art_types sont requis." });
  }

  const promptTemplate = await loadPromptTemplate();
  const prompt = renderTemplate(promptTemplate, {
    prenom,
    nom,
    art_types: artTypes.join(", "),
  });

  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 320,
    }),
  });

  if (!groqResp.ok) {
    const details = await groqResp.text();
    return jsonResponse(502, { error: "Erreur Groq.", details });
  }

  const groqJson = (await groqResp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const bio = groqJson.choices?.[0]?.message?.content?.trim() ?? "";
  if (!bio) {
    return jsonResponse(502, { error: "Réponse vide de Groq." });
  }

  return jsonResponse(200, { bio });
});

