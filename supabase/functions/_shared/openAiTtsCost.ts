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
