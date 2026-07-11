#!/usr/bin/env node
/**
 * Audit de cohérence des coûts variables.
 * Usage : npm run audit:costs
 * Code de sortie 1 si au moins une erreur bloquante.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL et clé Supabase requis.");
  process.exit(1);
}

const sb = createClient(url, key);

function logHasArtwork(row) {
  if (row.artwork_id?.trim()) return true;
  const m = row.metadata?.artwork_id;
  return typeof m === "string" && Boolean(m.trim());
}

function isMediationLog(row) {
  if (row.metadata?.operation === "mediation") return true;
  if (row.metadata?.source_function === "generate-mediation") return true;
  return row.provider === "gemini" || row.provider === "groq";
}

console.log("=== Audit cohérence coûts AIMediArt ===\n");

const { data: logs, error: logsErr } = await sb
  .from("ai_usage_logs")
  .select("id, provider, artwork_id, metadata, created_at");

if (logsErr) {
  console.error("ERREUR lecture ai_usage_logs:", logsErr.message);
  process.exit(1);
}

const allLogs = logs ?? [];
const mediationLogs = allLogs.filter(isMediationLog);
const mediationUnlinked = mediationLogs.filter((r) => !logHasArtwork(r));

console.log(`Logs total              : ${allLogs.length}`);
console.log(`Logs médiation (G/G)    : ${mediationLogs.length}`);
console.log(`Médiation sans œuvre    : ${mediationUnlinked.length}`);

let exitCode = 0;

if (mediationUnlinked.length > 0) {
  console.error(
    `\n[ERREUR] ${mediationUnlinked.length} log(s) médiation sans artwork_id — non inclus dans les KPI filtrés.`,
  );
  exitCode = 1;
  const byProv = {};
  for (const r of mediationUnlinked) {
    byProv[r.provider] = (byProv[r.provider] ?? 0) + 1;
  }
  console.error("  Par fournisseur:", byProv);
}

const { data: events, error: evErr } = await fetchAllEvents(sb);
if (evErr) {
  console.error("ERREUR lecture ai_usage_events:", evErr);
  process.exit(1);
}

async function fetchAllEvents(client) {
  const rows = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await client
      .from("ai_usage_events")
      .select("provider, operation_name, cost_estimated, currency, metadata, tool_type, input_units")
      .range(from, from + page - 1);
    if (error) return { data: null, error: error.message };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return { data: rows, error: null };
}

const evRows = events ?? [];
const openaiMed = evRows.filter(
  (e) => e.provider === "openai" && (e.operation_name === "mediation" || e.operation_name === "bio"),
);
const openaiSum = openaiMed.reduce((s, e) => s + (Number(e.cost_estimated) || 0), 0);
const openaiNoLink = openaiMed.filter(
  (e) => !String(e.metadata?.text_id ?? e.metadata?.artwork_id ?? "").trim(),
);

console.log(`\nÉvénements OpenAI TTS   : ${openaiMed.length} (total $${openaiSum.toFixed(2)})`);
console.log(`OpenAI sans text_id     : ${openaiNoLink.length}`);

if (openaiNoLink.length > 0) {
  console.error(`[ERREUR] ${openaiNoLink.length} événement(s) OpenAI non filtrables par expo.`);
  exitCode = 1;
}

const geminiEv = evRows.filter((e) => e.provider === "google_gemini");
const groqEv = evRows.filter((e) => e.provider === "groq");
console.log(`\nÉvénements Gemini       : ${geminiEv.length}`);
console.log(`Événements Groq         : ${groqEv.length}`);
console.log(`Événements total        : ${evRows.length}`);

let totalUsdApprox = 0;
for (const e of evRows) {
  const cur = (e.currency || "USD").toUpperCase();
  const raw = Number(e.cost_estimated) || 0;
  totalUsdApprox += cur === "EUR" ? raw / 0.92 : raw;
}
console.log(`Total agrégé (USD + EUR→USD ~0,92) : $${totalUsdApprox.toFixed(2)}`);
console.log("Vérifier que ce total inclut bien Cursor (~180 $) et tous les événements paginés.");

const expoId = process.argv[2];
if (expoId) {
  const { data: artworks } = await sb
    .from("artworks")
    .select("artwork_id")
    .eq("artwork_expo_id", expoId)
    .is("artwork_deleted_at", null);
  const ids = (artworks ?? []).map((a) => a.artwork_id);
  if (ids.length > 0) {
    const idSet = new Set(ids);
    let linkedSum = 0;
    let linkedCount = 0;
    for (const e of evRows) {
      const aid = String(e.metadata?.text_id ?? e.metadata?.artwork_id ?? "").trim();
      if (idSet.has(aid)) {
        linkedSum += Number(e.cost_estimated) || 0;
        linkedCount += 1;
      }
    }
    console.log(`\nExpo ${expoId}`);
    console.log(`  Œuvres                : ${ids.length}`);
    console.log(`  Événements liés       : ${linkedCount}`);
    console.log(`  Total USD (liés)      : $${linkedSum.toFixed(4)}`);
  }
}

console.log(exitCode === 0 ? "\n✓ Audit OK" : "\n✗ Audit : anomalies détectées");
process.exit(exitCode);
