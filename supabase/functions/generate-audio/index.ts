import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TTS_COST_PER_CHAR: Record<string, number> = {
  "tts-1":    15 / 1_000_000,
  "tts-1-hd": 30 / 1_000_000,
};

interface GenerateAudioPayload {
  text_id:              string;
  text_type:            "bio" | "mediation";
  lang:                 string;
  prompt_style_id:      string;
  gender:               "F" | "M";
  model?:               "tts-1" | "tts-1-hd";
  mediation_style_key?: string;
}

function extractMediationText(
  i18nRaw: unknown,
  lang: string,
  styleCode: string,
  styleKeyHint?: string,
): string {
  const langKey = lang.trim().toLowerCase().slice(0, 2);
  const keysToTry = [
    styleKeyHint?.trim().toLowerCase(),
    styleCode.trim().toLowerCase(),
  ].filter((k): k is string => Boolean(k));
  const i18n = (i18nRaw ?? {}) as Record<string, unknown>;

  const langBucket = i18n[langKey] ?? i18n.fr;
  if (typeof langBucket === "string") return langBucket.trim();
  if (langBucket && typeof langBucket === "object") {
    const byStyle = langBucket as Record<string, unknown>;
    for (const codeKey of keysToTry) {
      for (const [k, v] of Object.entries(byStyle)) {
        if (k.toLowerCase() === codeKey && typeof v === "string" && v.trim()) {
          return v.trim();
        }
      }
    }
  }

  for (const codeKey of keysToTry) {
    const legacy = i18n[codeKey];
    if (typeof legacy === "string") return legacy.trim();
  }
  return "";
}

async function markAudioFileError(
  supabase: ReturnType<typeof createClient>,
  payload: GenerateAudioPayload,
  message: string,
): Promise<void> {
  await supabase.from("audio_files").upsert({
    text_id:         payload.text_id,
    text_type:       payload.text_type,
    lang:            payload.lang,
    prompt_style_id: payload.prompt_style_id,
    gender:          payload.gender,
    status:          "error",
    error_message:   message.slice(0, 500),
    updated_at:      new Date().toISOString(),
  }, { onConflict: "text_id,text_type,lang,prompt_style_id,gender" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  let payload: GenerateAudioPayload | null = null;

  try {
    payload = await req.json() as GenerateAudioPayload;
    const { text_id, text_type, lang, prompt_style_id, gender, model = "tts-1" } = payload;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const tableName = text_type === "bio" ? "artist_bios" : "artworks";

    const { data: row, error: rowError } = await supabase
      .from(tableName)
      .select("*")
      .eq(text_type === "bio" ? "id" : "artwork_id", text_id)
      .single();

    if (rowError || !row) throw new Error(`Texte introuvable : ${rowError?.message}`);

    const { data: style, error: styleError } = await supabase
      .from("prompt_style")
      .select("id, code, name_fr, persona_vibe, voice_f, voice_m")
      .eq("id", prompt_style_id)
      .single();

    if (styleError || !style) throw new Error(`Style introuvable : ${styleError?.message}`);

    const styleCode = (style.code ?? "").trim();

    let textContent: string;
    if (text_type === "bio") {
      textContent = (row.bio_text ?? "").trim();
    } else {
      textContent = extractMediationText(
        row.artwork_description_i18n,
        lang,
        styleCode,
        payload.mediation_style_key,
      );
    }

    if (!textContent) {
      const hint = payload.mediation_style_key ?? styleCode;
      throw new Error(
        `Aucun contenu pour ${text_type} · langue=${lang}${hint ? ` · style=${hint}` : ""}`,
      );
    }

    const voiceId     = gender === "F" ? style.voice_f : style.voice_m;
    const personaVibe = style.persona_vibe ?? "";

    const storagePath = `${text_type}/${text_id}/${lang}/${prompt_style_id}_${gender}.m4a`;

    await supabase.from("audio_files").upsert({
      text_id,
      text_type,
      lang,
      prompt_style_id,
      voice_id:     voiceId,
      gender,
      storage_path: storagePath,
      provider:     "openai",
      model:        "gpt-4o-mini-tts",
      status:       "generating",
      input_chars:  textContent.length,
      error_message: null,
    }, { onConflict: "text_id,text_type,lang,prompt_style_id,gender" });

    const start = Date.now();

    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:           "gpt-4o-mini-tts",
        voice:           voiceId,
        input:           textContent,
        instructions:    personaVibe,
        response_format: "aac",
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      throw new Error(`OpenAI TTS error : ${err}`);
    }

    const audioBuffer   = await openaiRes.arrayBuffer();
    const latencyMs     = Date.now() - start;
    const fileSizeBytes = audioBuffer.byteLength;

    const { error: uploadError } = await supabase.storage
      .from("audio-guides")
      .upload(storagePath, audioBuffer, { contentType: "audio/mp4", upsert: true });

    if (uploadError) throw new Error(`Storage upload : ${uploadError.message}`);

    const costUsd = textContent.length * (TTS_COST_PER_CHAR[model] ?? TTS_COST_PER_CHAR["tts-1"]);

    await supabase.from("audio_files").update({
      status:          "ready",
      file_size_bytes: fileSizeBytes,
      input_tokens:    Math.round(textContent.length / 4),
      cost_usd:        costUsd,
      error_message:   null,
      updated_at:      new Date().toISOString(),
    })
    .eq("text_id",         text_id)
    .eq("text_type",       text_type)
    .eq("lang",            lang)
    .eq("prompt_style_id", prompt_style_id)
    .eq("gender",          gender);

    await supabase.from("ai_usage_events").insert({
      provider:        "openai",
      tool_type:       "tts",
      api_name:        "tts",
      model_name:      "gpt-4o-mini-tts",
      input_units:     textContent.length,
      output_units:    0,
      unit_type:       "characters",
      cost_estimated:  costUsd,
      currency:        "USD",
      status:          "success",
      operation_name:  text_type,
      source:          "generate-audio",
      metadata:        { text_id, lang, prompt_style_id, gender, voice_id: voiceId, latency_ms: latencyMs },
    });

    return new Response(
      JSON.stringify({ success: true, storage_path: storagePath, file_size: fileSizeBytes, cost_usd: costUsd, latency_ms: latencyMs, voice_id: voiceId }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );

  } catch (error) {
    const message = (error as Error).message ?? "Erreur inconnue";
    console.error("generate-audio error:", error);
    if (payload) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await markAudioFileError(supabase, payload, message);
      } catch (markErr) {
        console.error("generate-audio mark error:", markErr);
      }
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
