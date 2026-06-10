import { supabase } from "@/lib/supabase";

export type AudioTextType = "bio" | "mediation";
export type AudioGender = "F" | "M";
export type AudioFileStatus = "pending" | "generating" | "ready" | "error";

export type AudioFile = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  voice_id: string | null;
  gender: AudioGender;
  storage_path: string | null;
  duration_sec: number | null;
  file_size_bytes: number | null;
  provider: string | null;
  model: string | null;
  input_chars: number | null;
  input_tokens: number | null;
  cost_usd: number | null;
  status: AudioFileStatus;
  error_message: string | null;
};

const AUDIO_BUCKET = "audio-guides";
const SIGNED_URL_TTL_SEC = 3600;

let cachedBioPromptStyleId: string | null = null;

/** Style vocal par défaut pour les bios (premier `prompt_style` « simple » ou le plus bas ordonnancement). */
export async function resolveBioPromptStyleId(): Promise<string | null> {
  if (cachedBioPromptStyleId) return cachedBioPromptStyleId;

  const { data: simpleRows } = await supabase
    .from("prompt_style")
    .select("id")
    .eq("code", "simple")
    .limit(1);

  const simpleId = (simpleRows?.[0] as { id?: string } | undefined)?.id;
  if (simpleId) {
    cachedBioPromptStyleId = String(simpleId);
    return cachedBioPromptStyleId;
  }

  const { data: orderedRows } = await supabase
    .from("prompt_style")
    .select("id")
    .order("ordonnancement", { ascending: true })
    .limit(1);

  const fallbackId = (orderedRows?.[0] as { id?: string } | undefined)?.id;
  if (fallbackId) {
    cachedBioPromptStyleId = String(fallbackId);
    return cachedBioPromptStyleId;
  }

  return null;
}

async function invokeGenerateAudio(payload: {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  gender: AudioGender;
  model?: string;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("generate-audio", { body: payload });
  if (error) {
    throw error;
  }
}

/** Déclenche la génération audio F + M via l'Edge Function `generate-audio`. */
export async function triggerAudioGeneration(params: {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  model?: string;
}): Promise<void> {
  const { text_id, text_type, lang, prompt_style_id, model } = params;
  if (!text_id?.trim() || !lang?.trim() || !prompt_style_id?.trim()) return;

  try {
    await Promise.all(
      (["F", "M"] as const).map((gender) =>
        invokeGenerateAudio({ text_id, text_type, lang, prompt_style_id, gender, model }),
      ),
    );
  } catch (e) {
    console.error("[audioService] triggerAudioGeneration:", e);
  }
}

/** Déclenche l'audio pour toutes les médiations non vides d'une œuvre. */
export function triggerMediationAudioBatch(params: {
  artworkId: string;
  descriptionsByLang: Record<string, Record<string, string>>;
  stylePromptStyleIds: Record<string, string>;
}): void {
  const { artworkId, descriptionsByLang, stylePromptStyleIds } = params;
  if (!artworkId?.trim()) return;

  for (const [lang, byStyle] of Object.entries(descriptionsByLang)) {
    if (!byStyle || typeof byStyle !== "object") continue;
    for (const [styleKey, rawText] of Object.entries(byStyle)) {
      const text = (rawText ?? "").trim();
      if (!text) continue;
      const prompt_style_id = stylePromptStyleIds[styleKey];
      if (!prompt_style_id) continue;
      void triggerAudioGeneration({
        text_id: artworkId,
        text_type: "mediation",
        lang,
        prompt_style_id,
      }).catch(console.error);
    }
  }
}

export function buildMediationStylePromptStyleMap(
  styleTabs: Array<{ key: string; promptStyleId?: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tab of styleTabs) {
    const id = tab.promptStyleId?.trim();
    if (id) map[tab.key] = id;
  }
  return map;
}

/** URL signée (1 h) pour lecture du MP3. */
export async function getAudioUrl(storage_path: string): Promise<string> {
  const path = storage_path.trim();
  if (!path) throw new Error("storage_path vide");

  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("URL signée indisponible");
  }
  return data.signedUrl;
}

/** Tous les fichiers audio liés à un texte. */
export async function getAudioFiles(
  text_id: string,
  text_type: AudioTextType,
): Promise<AudioFile[]> {
  const { data, error } = await supabase
    .from("audio_files")
    .select("*")
    .eq("text_id", text_id)
    .eq("text_type", text_type)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[audioService] getAudioFiles:", error);
    return [];
  }
  return (data ?? []) as AudioFile[];
}
