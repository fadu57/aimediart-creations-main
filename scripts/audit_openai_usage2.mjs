/** Suite audit : régénérations et historique OpenAI. */
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

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

const monthStart = "2026-06-01T00:00:00.000Z";
const { data: events, error } = await sb
  .from("ai_usage_events")
  .select("id,created_at,cost_estimated,input_units,operation_name,metadata")
  .eq("provider", "openai")
  .gte("created_at", monthStart)
  .order("created_at");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = events ?? [];
const cellKey = (m) =>
  `${m?.text_id}|${m?.lang}|${m?.prompt_style_id}|${m?.gender}`;

const byCell = new Map();
for (const e of rows) {
  const k = cellKey(e.metadata);
  if (!byCell.has(k)) byCell.set(k, []);
  byCell.get(k).push(e);
}

const regenCells = [...byCell.entries()].filter(([, list]) => list.length > 1);
const regenExtraEvents = regenCells.reduce((s, [, list]) => s + list.length - 1, 0);
const regenExtraCost = regenCells.reduce(
  (s, [, list]) => s + list.slice(1).reduce((a, e) => a + (Number(e.cost_estimated) || 0), 0),
  0,
);

const { data: beforeJune } = await sb
  .from("ai_usage_events")
  .select("id", { count: "exact", head: true })
  .eq("provider", "openai")
  .lt("created_at", monthStart);

/** Estimation gpt-4o-mini-tts (ordre de grandeur) : ~0,015 $/min audio + entrée texte. */
const totalChars = rows.reduce((s, e) => s + (Number(e.input_units) || 0), 0);
const estMinutes = rows.length * 0.75;
const estRealUsd = estMinutes * 0.015 + (totalChars / 4 / 1_000_000) * 0.6;

console.log(
  JSON.stringify(
    {
      juin_2026_events: rows.length,
      cellules_voix_uniques: byCell.size,
      regenerations: {
        cellules_regenerees: regenCells.length,
        events_supplementaires: regenExtraEvents,
        cost_estimated_supplementaire_usd: Math.round(regenExtraCost * 100) / 100,
        top_regens: regenCells
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 5)
          .map(([k, list]) => ({
            cellule: k,
            appels: list.length,
            dates: list.map((e) => e.created_at?.slice(0, 10)),
            cost_sum: Math.round(list.reduce((s, e) => s + (Number(e.cost_estimated) || 0), 0) * 100) / 100,
          })),
      },
      openai_events_avant_juin: beforeJune ?? 0,
      estimation_reelle_gpt4o_mini_tts_ordre_grandeur_usd: Math.round(estRealUsd * 100) / 100,
      note_estimation: "~0,015 USD/min × nb appels × ~45-60s + tokens entrée ; fourchette indicative",
    },
    null,
    2,
  ),
);
