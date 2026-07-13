/**
 * Estimation coût gpt-4o-mini-tts (Edge Functions — miroir de src/lib/openAiTtsCost.ts).
 */

export const GPT4O_MINI_TTS_COST_MODEL = "gpt-4o-mini-tts-v2";
const INPUT_USD_PER_1M = 0.6;
const AUDIO_USD_PER_1M = 12;
const USD_PER_MINUTE = 0.015;

export type Gpt4oMiniTtsCostBreakdown = {
  inputTokens: number;
  audioDurationSec: number;
  audioOutputTokens: number;
  inputCostUsd: number;
  audioCostUsd: number;
  totalUsd: number;
};

function estimateAudioDurationSecFromBytes(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return 0;
  return (fileSizeBytes * 8) / 128_000;
}

function estimateAudioDurationSecFromTextChars(textChars: number): number {
  if (textChars <= 0) return 0;
  return textChars / 12.5;
}

function estimateInputTokens(textChars: number, instructionChars: number): number {
  return Math.ceil((Math.max(0, textChars) + Math.max(0, instructionChars)) / 4);
}

function estimateAudioOutputTokens(durationSec: number): number {
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
  const inputCostUsd = (inputTokens / 1_000_000) * INPUT_USD_PER_1M;
  const audioByTokens = (audioOutputTokens / 1_000_000) * AUDIO_USD_PER_1M;
  const audioByMinute = (durationSec / 60) * USD_PER_MINUTE;
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

/** Recalcule le coût d'un événement OpenAI TTS (historique ou courant). */
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

type CostEventLike = UsageEventLike & {
  provider?: string;
  tool_type?: string;
  currency?: string | null;
};

/** Coût affiché / agrégé : recalcule OpenAI TTS legacy, sinon cost_estimated en base. */
export function effectiveCostEstimatedUsd(event: CostEventLike): number {
  if (event.provider === "openai" && event.tool_type === "tts") {
    return recalculateOpenAiTtsEventCostUsd(event);
  }
  return Number(event.cost_estimated) || 0;
}

/** Coût normalisé USD pour agrégation KPI. */
export function costAmountInUsd(
  event: CostEventLike,
  usdToEurRate: number | null = null,
): number {
  const amount = effectiveCostEstimatedUsd(event);
  const currency = (event.currency ?? "USD").toUpperCase();
  if (currency === "EUR" && usdToEurRate != null && usdToEurRate > 0) {
    return amount / usdToEurRate;
  }
  return amount;
}
