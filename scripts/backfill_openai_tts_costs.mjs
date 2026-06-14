/**
 * Met à jour cost_estimated en base pour les événements OpenAI TTS legacy (barème tts-1).
 * Usage : node scripts/backfill_openai_tts_costs.mjs
 *        node scripts/backfill_openai_tts_costs.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(join(root, ".env"));
loadEnv(join(root, ".env.local"));

const GPT4O_MINI_TTS_COST_MODEL = "gpt-4o-mini-tts-v2";
const INPUT_USD_PER_1M = 0.6;
const AUDIO_USD_PER_1M = 12;
const USD_PER_MINUTE = 0.015;

function estimateGpt4oMiniTtsCostUsd({ textChars, instructionChars = 0, audioFileSizeBytes = 0 }) {
  const inputTokens = Math.ceil((Math.max(0, textChars) + Math.max(0, instructionChars)) / 4);
  const durationSec =
    audioFileSizeBytes > 0
      ? (audioFileSizeBytes * 8) / 128_000
      : textChars > 0
        ? textChars / 12.5
        : 0;
  const audioOutputTokens = Math.ceil(Math.max(0, durationSec) * 50);
  const inputCostUsd = (inputTokens / 1_000_000) * INPUT_USD_PER_1M;
  const audioByTokens = (audioOutputTokens / 1_000_000) * AUDIO_USD_PER_1M;
  const audioByMinute = (durationSec / 60) * USD_PER_MINUTE;
  return {
    totalUsd: inputCostUsd + Math.max(audioByTokens, audioByMinute),
    inputTokens,
    audioOutputTokens,
    audioDurationSec: durationSec,
    inputCostUsd,
    audioCostUsd: Math.max(audioByTokens, audioByMinute),
  };
}

function recalculate(row) {
  const meta = row.metadata ?? {};
  if (meta.cost_model === GPT4O_MINI_TTS_COST_MODEL) return null;
  const breakdown = estimateGpt4oMiniTtsCostUsd({
    textChars: Number(meta.text_chars ?? row.input_units ?? 0),
    instructionChars: Number(meta.instruction_chars ?? 0),
    audioFileSizeBytes: Number(meta.file_size_bytes ?? 0),
  });
  return breakdown;
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const sb = createClient(url, key);

const { data, error } = await sb
  .from("ai_usage_events")
  .select("id,cost_estimated,input_units,output_units,metadata")
  .eq("provider", "openai")
  .eq("tool_type", "tts");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data ?? [];
let skipped = 0;
let updated = 0;
let beforeSum = 0;
let afterSum = 0;

for (const row of rows) {
  beforeSum += Number(row.cost_estimated) || 0;
  const breakdown = recalculate(row);
  if (!breakdown) {
    skipped += 1;
    afterSum += Number(row.cost_estimated) || 0;
    continue;
  }
  afterSum += breakdown.totalUsd;

  const meta = { ...(row.metadata ?? {}) };
  meta.cost_model = GPT4O_MINI_TTS_COST_MODEL;
  meta.cost_input_usd = breakdown.inputCostUsd;
  meta.cost_audio_usd = breakdown.audioCostUsd;
  meta.audio_duration_sec = breakdown.audioDurationSec;

  if (!dryRun) {
    const { error: upErr } = await sb
      .from("ai_usage_events")
      .update({
        cost_estimated: breakdown.totalUsd,
        input_units: breakdown.inputTokens,
        output_units: breakdown.audioOutputTokens,
        metadata: meta,
      })
      .eq("id", row.id);
    if (upErr) {
      console.error(`Erreur id=${row.id}:`, upErr.message);
      process.exit(1);
    }
  }
  updated += 1;
}

console.log(
  JSON.stringify(
    {
      dryRun,
      totalEvents: rows.length,
      updated,
      skippedAlreadyV2: skipped,
      costLoggedBeforeUsd: Math.round(beforeSum * 100) / 100,
      costAfterUsd: Math.round(afterSum * 100) / 100,
    },
    null,
    2,
  ),
);
