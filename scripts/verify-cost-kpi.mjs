#!/usr/bin/env node
/**
 * Vérifie les KPI coûts attendus (scan intégral service role).
 * Usage : npm run verify:cost-kpi
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const sb = createClient(url, key);
const PAGE = 1000;
const rate = 0.8732;

function effectiveCost(r) {
  if (r.provider === "openai" && r.tool_type === "tts") {
    const meta = r.metadata || {};
    if (meta.cost_model === "gpt-4o-mini-tts-v2") return Number(r.cost_estimated) || 0;
    const textChars = Number(meta.text_chars ?? r.input_units ?? 0);
    const instructionChars = Number(meta.instruction_chars ?? 0);
    const fileSizeBytes = Number(meta.file_size_bytes ?? 0);
    const durationSec = fileSizeBytes > 0 ? (fileSizeBytes * 8) / 128000 : textChars / 12.5;
    const inputTokens = Math.ceil((Math.max(0, textChars) + Math.max(0, instructionChars)) / 4);
    const audioOutputTokens = Math.ceil(Math.max(0, durationSec) * 50);
    const inputCostUsd = (inputTokens / 1e6) * 0.6;
    const audioByTokens = (audioOutputTokens / 1e6) * 12;
    const audioByMinute = (durationSec / 60) * 0.015;
    return inputCostUsd + Math.max(audioByTokens, audioByMinute);
  }
  const amount = Number(r.cost_estimated) || 0;
  return (r.currency || "USD").toUpperCase() === "EUR" ? amount / rate : amount;
}

let all = [];
let from = 0;
while (true) {
  const { data, error } = await sb
    .from("ai_usage_events")
    .select("provider, tool_type, cost_estimated, currency, input_units, output_units, metadata")
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("ERREUR:", error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  all.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}

let total = 0;
let cursor = 0;
let totalInput = 0;
let totalOutput = 0;
const byProv = {};
for (const r of all) {
  const c = effectiveCost(r);
  total += c;
  byProv[r.provider] = (byProv[r.provider] || 0) + c;
  if (r.provider === "cursor") cursor += c;
  if (r.input_units != null) totalInput += Number(r.input_units) || 0;
  if (r.output_units != null) totalOutput += Number(r.output_units) || 0;
}

console.log("=== KPI attendus (référence) ===");
console.log("Événements   :", all.length);
console.log("Total USD    :", total.toFixed(2));
console.log("Tokens in    :", totalInput.toLocaleString("fr-FR"));
console.log("Tokens out   :", totalOutput.toLocaleString("fr-FR"));
console.log("Cursor USD   :", cursor.toFixed(2));
console.log("Par provider :", Object.fromEntries(
  Object.entries(byProv).map(([k, v]) => [k, (v).toFixed(2)]),
));

if (all.length <= 1000) {
  console.error("\n[ERREUR] Moins de 1001 événements — dataset suspect.");
  process.exit(1);
}
if (cursor < 179) {
  console.error("\n[ERREUR] Cursor < 180 $ — agrégation incorrecte.");
  process.exit(1);
}
console.log("\n✓ Référence OK — l'UI doit afficher ces ordres de grandeur.");
