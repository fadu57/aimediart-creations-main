import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  languageCodeFromVoiceName,
  parseTtsGender,
  pickRandomTtsGender,
  resolveGoogleTtsVoiceName,
  type GoogleTtsGender,
} from "../_shared/googleTtsVoices.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  text?: string;
  language?: string;
  gender?: GoogleTtsGender;
  /** true = nouveau tirage M/F à chaque requête (visiteur « Écouter »). */
  randomVoice?: boolean;
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

function resolveRequestGender(body: RequestBody): GoogleTtsGender {
  if (body.randomVoice === true) {
    return pickRandomTtsGender();
  }
  return parseTtsGender(body.gender) ?? pickRandomTtsGender();
}

async function logTtsUsage(
  admin: ReturnType<typeof createClient>,
  voiceName: string,
  textLength: number,
): Promise<void> {
  const { error } = await admin.from("ai_usage_logs").insert({
    model_id: voiceName,
    provider: "google_tts",
    prompt_tokens: 0,
    completion_tokens: textLength,
    total_tokens: textLength,
    metadata: {
      operation: "tts_synthesize",
      source_function: "google-tts",
    },
  });

  if (error) {
    console.error("[google-tts] échec journal ai_usage_logs", {
      message: error.message,
      code: (error as { code?: string }).code,
    });
  }
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
    return jsonResponse(400, { error: "Corps JSON invalide." });
  }

  const text = (body.text ?? "").trim();
  const language = (body.language ?? "fr").trim();
  const gender = resolveRequestGender(body);

  if (!text) {
    return jsonResponse(400, { error: "Le champ « text » est requis." });
  }

  if (text.length > 5000) {
    return jsonResponse(400, {
      error: "Texte trop long pour la synthèse vocale (max. 5000 caractères).",
    });
  }

  const apiKey = Deno.env.get("GOOGLE_TTS_API_KEY")?.trim();
  if (!apiKey) {
    return jsonResponse(500, { error: "Secret GOOGLE_TTS_API_KEY manquant." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;

  const voiceName = resolveGoogleTtsVoiceName(language, gender);
  const languageCode = languageCodeFromVoiceName(voiceName);

  const googlePayload = {
    input: { text },
    voice: {
      languageCode,
      name: voiceName,
      ssmlGender: gender,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 0.95,
      pitch: 0,
    },
  };

  const googleUrl =
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;

  let googleRes: Response;
  try {
    googleRes = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(googlePayload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[google-tts] erreur réseau Google TTS", message);
    return jsonResponse(502, { error: "Impossible de joindre l'API Google Text-to-Speech.", details: message });
  }

  const googleBody = await googleRes.json().catch(() => ({})) as {
    audioContent?: string;
    error?: { code?: number; message?: string; status?: string };
  };

  if (!googleRes.ok) {
    const googleMessage =
      googleBody.error?.message ??
      (typeof googleBody === "object" && googleBody !== null && "message" in googleBody
        ? String((googleBody as { message?: unknown }).message)
        : "Erreur Google Text-to-Speech.");
    console.error("[google-tts] erreur Google TTS", {
      status: googleRes.status,
      voiceName,
      message: googleMessage,
    });
    return jsonResponse(googleRes.status >= 400 && googleRes.status < 600 ? googleRes.status : 502, {
      error: googleMessage,
      status: googleBody.error?.status ?? googleRes.status,
    });
  }

  const audioContent = googleBody.audioContent;
  if (!audioContent || typeof audioContent !== "string") {
    return jsonResponse(502, { error: "Réponse Google TTS sans audioContent." });
  }

  if (admin) {
    await logTtsUsage(admin, voiceName, text.length);
  }

  return jsonResponse(200, { audioContent, voiceName });
});
