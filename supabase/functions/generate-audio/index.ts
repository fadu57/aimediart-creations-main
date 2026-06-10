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
  text_id:         string;
  text_type:       "bio" | "mediation";
  lang:            string;
  prompt_style_id: string;
  gender:          "F" | "M";
  model?:          "tts-1" | "tts-1-hd";
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

  try {
    const payload: GenerateAudioPayload = await req.json();
    const { text_id, text_type, lang, prompt_style_id, gender, model = "tts-1" } = payload;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Récupérer le texte source
    const tableName = text_type === "bio" ? "artist_bios" : "artworks";

    const { data: row, error: rowError } = await supabase
      .from(tableName)
      .select("*")
      .eq(text_type === "bio" ? "id" : "artwork_id", text_id)
      .single();

    if (rowError || !row) throw new Error(`Texte introuvable : ${rowError?.message}`);

    let textContent: string;
    if (text_type === "bio") {
      textContent = row.bio_text ?? "";
    } else {
      const i18n = row.artwork_description_i18n ?? {};
      textContent = i18n[lang] ?? i18n["fr"] ?? "";
    }

    if (!textContent) throw new Error(`Aucun contenu pour la langue : ${lang}`);

    // 2. Récupérer le prompt_style
    const { data: style, error: styleError } = await supabase
      .from("prompt_style")
      .select("id, name_fr, persona_vibe, voice_f, voice_m")
      .eq("id", prompt_style_id)
      .single();

    if (styleError || !style) throw new Error(`Style introuvable : ${styleError?.message}`);

    const voiceId     = gender === "F" ? style.voice_f : style.voice_m;
    const personaVibe = style.persona_vibe ?? "";
    const styledText  = personaVibe ? `[STYLE: ${personaVibe}]\n\n${textContent}` : textContent;

    // 3. Upsert audio_files -> generating
    const storagePath = `${text_type}/${text_id}/${lang}/${prompt_style_id}_${gender}.mp3`;

    await supabase.from("audio_files").upsert({
      text_id,
      text_type,
      lang,
      prompt_style_id,
      voice_id:     voiceId,
      gender,
      storage_path: storagePath,
      provider:     "openai",
      model,
      status:       "generating",
      input_chars:  styledText.length,
    }, { onConflict: "text_id,text_type,lang,prompt_style_id,gender" });

    // 4. Appel OpenAI TTS
    const start = Date.now();

    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model,
        voice:           voiceId,
        input:           styledText,
        response_format: "mp3",
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      throw new Error(`OpenAI TTS error : ${err}`);
    }

    const audioBuffer   = await openaiRes.arrayBuffer();
    const latencyMs     = Date.now() - start;
    const fileSizeBytes = audioBuffer.byteLength;

    // 5. Upload Storage
    const { error: uploadError } = await supabase.storage
      .from("audio-guides")
      .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

    if (uploadError) throw new Error(`Storage upload : ${uploadError.message}`);

    // 6. Calcul coût
    const costUsd = styledText.length * (TTS_COST_PER_CHAR[model] ?? TTS_COST_PER_CHAR["tts-1"]);

    // 7. Update audio_files -> ready
    await supabase.from("audio_files").update({
      status:          "ready",
      file_size_bytes: fileSizeBytes,
      input_tokens:    Math.round(styledText.length / 4),
      cost_usd:        costUsd,
      updated_at:      new Date().toISOString(),
    })
    .eq("text_id",         text_id)
    .eq("text_type",       text_type)
    .eq("lang",            lang)
    .eq("prompt_style_id", prompt_style_id)
    .eq("gender",          gender);

    // 8. Log ai_usage_events
    await supabase.from("ai_usage_events").insert({
      provider:            "openai",
      tool:                "tts",
      model_name:          model,
      tokens_input:        Math.round(styledText.length / 4),
      tokens_output:       0,
      cost_usd:            costUsd,
      latency_ms:          latencyMs,
      context_object_type: text_type,
      context_object_id:   text_id,
    });

    return new Response(
      JSON.stringify({ success: true, storage_path: storagePath, file_size: fileSizeBytes, cost_usd: costUsd, latency_ms: latencyMs, voice_id: voiceId }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );

  } catch (error) {
    console.error("generate-audio error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
