/**
 * Estimation des coûts OpenAI gpt-4o-mini-tts (entrée texte + consignes + audio sortie).
 * Les montants restent des estimations : seule la facturation OpenAI fait foi.
 */

export const GPT4O_MINI_TTS_MODEL = "gpt-4o-mini-tts";
export const GPT4O_MINI_TTS_COST_MODEL = "gpt-4o-mini-tts-v2";

/** USD / 1M tokens texte (input + instructions). */
export const GPT4O_MINI_TTS_INPUT_USD_PER_1M = 0.6;
/** USD / 1M tokens audio sortie. */
export const GPT4O_MINI_TTS_AUDIO_USD_PER_1M = 12;
/** Heuristique OpenAI ~0,015 USD / minute d'audio. */
export const GPT4O_MINI_TTS_USD_PER_MINUTE = 0.015;

export const OPENAI_BILLING_URL =
  "https://platform.openai.com/settings/organization/billing/history";
export const OPENAI_USAGE_URL = "https://platform.openai.com/usage";

export type Gpt4oMiniTtsCostBreakdown = {
  inputTokens: number;
  audioDurationSec: number;
  audioOutputTokens: number;
  inputCostUsd: number;
  audioCostUsd: number;
  totalUsd: number;
};

/** Durée audio (s) depuis taille M4A/AAC (~128 kbps). */
export function estimateAudioDurationSecFromBytes(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return 0;
  return (fileSizeBytes * 8) / 128_000;
}

/** Durée audio (s) estimée depuis le texte (~12,5 caractères / seconde à l'oral). */
export function estimateAudioDurationSecFromTextChars(textChars: number): number {
  if (textChars <= 0) return 0;
  return textChars / 12.5;
}

export function estimateInputTokens(textChars: number, instructionChars = 0): number {
  return Math.ceil((Math.max(0, textChars) + Math.max(0, instructionChars)) / 4);
}

/** ~50 tokens audio / seconde (approximation documentation OpenAI TTS). */
export function estimateAudioOutputTokens(durationSec: number): number {
  return Math.ceil(Math.max(0, durationSec) * 50);
}

export function estimateGpt4oMiniTtsCostUsd(params: {
  textChars: number;
  instructionChars?: number;
  audioFileSizeBytes?: number;
}): Gpt4oMiniTtsCostBreakdown {
  const instructionChars = params.instructionChars ?? 0;
  const inputTokens = estimateInputTokens(params.textChars, instructionChars);

  const durationSec =
    params.audioFileSizeBytes && params.audioFileSizeBytes > 0
      ? estimateAudioDurationSecFromBytes(params.audioFileSizeBytes)
      : estimateAudioDurationSecFromTextChars(params.textChars);

  const audioOutputTokens = estimateAudioOutputTokens(durationSec);
  const inputCostUsd = (inputTokens / 1_000_000) * GPT4O_MINI_TTS_INPUT_USD_PER_1M;
  const audioByTokens = (audioOutputTokens / 1_000_000) * GPT4O_MINI_TTS_AUDIO_USD_PER_1M;
  const audioByMinute = (durationSec / 60) * GPT4O_MINI_TTS_USD_PER_MINUTE;
  /** Fourchette haute pour ne pas sous-estimer en production. */
  const audioCostUsd = Math.max(audioByTokens, audioByMinute);

  return {
    inputTokens,
    audioDurationSec: durationSec,
    audioOutputTokens,
    inputCostUsd,
    audioCostUsd,
    totalUsd: inputCostUsd + audioCostUsd,
  };
}

type UsageEventLike = {
  cost_estimated?: number | null;
  input_units?: number | null;
  metadata?: Record<string, unknown> | null;
};

/** Recalcule le coût d'un événement (historique ou courant). */
export function recalculateOpenAiTtsEventCostUsd(event: UsageEventLike): number {
  const meta = event.metadata ?? {};
  if (meta.cost_model === GPT4O_MINI_TTS_COST_MODEL) {
    return Number(event.cost_estimated) || 0;
  }

  const textChars = Number(meta.text_chars ?? event.input_units ?? 0);
  const instructionChars = Number(meta.instruction_chars ?? 0);
  const fileSizeBytes = Number(meta.file_size_bytes ?? 0);

  return estimateGpt4oMiniTtsCostUsd({
    textChars,
    instructionChars,
    audioFileSizeBytes: fileSizeBytes,
  }).totalUsd;
}

export function voiceCellKeyFromMetadata(meta: Record<string, unknown> | null | undefined): string {
  const m = meta ?? {};
  return `${String(m.text_id ?? "")}|${String(m.lang ?? "")}|${String(m.prompt_style_id ?? "")}|${String(m.gender ?? "")}`;
}
