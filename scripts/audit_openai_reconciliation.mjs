/**
 * Réconciliation OpenAI TTS : ancien barème en base vs gpt-4o-mini-tts recalculé.
 * Usage : node scripts/audit_openai_reconciliation.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  const audioCostUsd = Math.max(audioByTokens, audioByMinute);
  return inputCostUsd + audioCostUsd;
}

function recalculateEventCost(e) {
  const meta = e.metadata ?? {};
  if (meta.cost_model === GPT4O_MINI_TTS_COST_MODEL) return Number(e.cost_estimated) || 0;
  return estimateGpt4oMiniTtsCostUsd({
    textChars: Number(meta.text_chars ?? e.input_units ?? 0),
    instructionChars: Number(meta.instruction_chars ?? 0),
    audioFileSizeBytes: Number(meta.file_size_bytes ?? 0),
  });
}

function cellKey(meta) {
  const m = meta ?? {};
  return `${String(m.text_id ?? "")}|${String(m.lang ?? "")}|${String(m.prompt_style_id ?? "")}|${String(m.gender ?? "")}`;
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Variables VITE_SUPABASE_URL et clé Supabase manquantes.");
  process.exit(1);
}

const sb = createClient(url, key);
const now = new Date();
const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00.000`;

const [eventsRes, filesRes] = await Promise.all([
  sb
    .from("ai_usage_events")
    .select("id,created_at,cost_estimated,input_units,operation_name,status,metadata")
    .eq("provider", "openai")
    .eq("tool_type", "tts")
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false }),
  sb
    .from("audio_files")
    .select("gender,text_type,text_id,lang,prompt_style_id,status,provider")
    .eq("provider", "openai")
    .gte("created_at", monthStart),
]);

if (eventsRes.error) {
  console.error(eventsRes.error.message);
  process.exit(1);
}

const events = eventsRes.data ?? [];
const readyFiles = (filesRes.data ?? []).filter((f) => f.status === "ready");

let costLoggedUsd = 0;
let costRecalculatedUsd = 0;
let legacyCount = 0;
const byCell = new Map();

for (const e of events) {
  costLoggedUsd += Number(e.cost_estimated) || 0;
  costRecalculatedUsd += recalculateEventCost(e);
  if ((e.metadata?.cost_model) !== GPT4O_MINI_TTS_COST_MODEL) legacyCount += 1;
  const k = cellKey(e.metadata);
  if (!byCell.has(k)) byCell.set(k, []);
  byCell.get(k).push(e);
}

const eventKeys = new Set(events.map((e) => cellKey(e.metadata)).filter((k) => k !== "|||"));
const unloggedReady = readyFiles.filter(
  (f) => !eventKeys.has(`${f.text_id}|${f.lang}|${f.prompt_style_id}|${f.gender}`),
);

let regenExtra = 0;
let regenExtraCost = 0;
for (const [k, list] of byCell) {
  if (k === "|||" || list.length <= 1) continue;
  regenExtra += list.length - 1;
  regenExtraCost += list.slice(1).reduce((s, e) => s + recalculateEventCost(e), 0);
}

const round = (n) => Math.round(n * 100) / 100;

console.log(
  JSON.stringify(
    {
      periode: { monthStart, generatedAt: now.toISOString() },
      interpretation: {
        facturation_carte:
          "Les prélèvements OpenAI (ex. 12 $, 6,31 $) rechargent des crédits — pas le détail TTS de l'app.",
        reference_fiable:
          "Comparer « costRecalculatedUsd » avec Usage API sur platform.openai.com/usage (modèle gpt-4o-mini-tts).",
        apres_deploy:
          "Après redéploiement de generate-audio, les nouveaux événements utilisent le barème v2 en base.",
      },
      chiffres: {
        apiCalls: events.length,
        uniqueVoiceCells: byCell.size,
        readyAudioFiles: readyFiles.length,
        costLoggedUsd: round(costLoggedUsd),
        costRecalculatedUsd: round(costRecalculatedUsd),
        ecart_barème: round(costRecalculatedUsd - costLoggedUsd),
        eventsLegacyPricing: legacyCount,
        regenerationExtraCalls: regenExtra,
        regenerationExtraCostRecalculatedUsd: round(regenExtraCost),
        unloggedReadyFiles: unloggedReady.length,
        reconciliationOk: unloggedReady.length === 0,
        avgCostRecalculatedPerCall: events.length ? round(costRecalculatedUsd / events.length) : 0,
      },
    },
    null,
    2,
  ),
);
