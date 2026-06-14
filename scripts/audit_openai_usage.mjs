/**
 * Audit OpenAI : ai_usage_events vs audio_files (juin 2026).
 * Usage : node scripts/audit_openai_usage.mjs
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(join(root, ".env"));
loadEnv(join(root, ".env.local"));

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Variables VITE_SUPABASE_URL et clé Supabase manquantes.");
  process.exit(1);
}

const sb = createClient(url, key);
const monthStart = "2026-06-01T00:00:00.000Z";

const [eventsRes, filesRes, allOpenaiRes] = await Promise.all([
  sb
    .from("ai_usage_events")
    .select(
      "id,created_at,tool_type,operation_name,status,cost_estimated,input_units,source,metadata",
    )
    .eq("provider", "openai")
    .gte("created_at", monthStart)
    .order("created_at"),
  sb
    .from("audio_files")
    .select(
      "id,created_at,updated_at,status,text_type,gender,lang,cost_usd,input_chars,error_message,provider,model,text_id,prompt_style_id",
    )
    .eq("provider", "openai")
    .gte("created_at", monthStart)
    .order("created_at"),
  sb.from("ai_usage_events").select("tool_type,operation_name,status,created_at").eq("provider", "openai"),
]);

if (eventsRes.error) {
  console.error("ai_usage_events:", eventsRes.error.message);
  process.exit(1);
}
if (filesRes.error) {
  console.error("audio_files:", filesRes.error.message);
  process.exit(1);
}

const events = eventsRes.data ?? [];
const files = filesRes.data ?? [];
const allOpenai = allOpenaiRes.data ?? [];

const byToolAllTime = {};
for (const e of allOpenai) {
  const k = e.tool_type ?? "(null)";
  byToolAllTime[k] = (byToolAllTime[k] ?? 0) + 1;
}

const eventsSum = events.reduce((s, e) => s + (Number(e.cost_estimated) || 0), 0);
const filesReady = files.filter((f) => f.status === "ready");
const filesError = files.filter((f) => f.status === "error");
const filesInProgress = files.filter(
  (f) => f.status === "generating" || f.status === "pending",
);
const filesCostSum = filesReady.reduce((s, f) => s + (Number(f.cost_usd) || 0), 0);

/** Appels OpenAI probables sans ligne ai_usage_events (ready ou error post-API). */
const eventKeys = new Set(
  events.map((e) => {
    const m = e.metadata ?? {};
    return `${m.text_id}|${m.lang}|${m.prompt_style_id}|${m.gender}`;
  }),
);

const unmatchedReady = filesReady.filter((f) => {
  const k = `${f.text_id}|${f.lang}|${f.prompt_style_id}|${f.gender}`;
  return !eventKeys.has(k);
});

const cancelledMsg = "Génération annulée";
const errorsLikelyAfterApi = filesError.filter(
  (f) =>
    !(f.error_message ?? "").includes(cancelledMsg) &&
    (f.input_chars ?? 0) > 0,
);

console.log(
  JSON.stringify(
    {
      synthese: {
        openai_dans_code: "Uniquement generate-audio → gpt-4o-mini-tts (TTS)",
        allTime_openai_events_par_tool_type: byToolAllTime,
      },
      juin_2026: {
        ai_usage_events: {
          count: events.length,
          cost_estimated_sum_usd: Math.round(eventsSum * 100) / 100,
          par_operation: events.reduce((a, e) => {
            const k = e.operation_name ?? "?";
            a[k] = (a[k] ?? 0) + 1;
            return a;
          }, {}),
          par_statut: events.reduce((a, e) => {
            a[e.status] = (a[e.status] ?? 0) + 1;
            return a;
          }, {}),
          chars_input_total: events.reduce(
            (s, e) => s + (Number(e.input_units) || 0),
            0,
          ),
        },
        audio_files_openai: {
          total: files.length,
          ready: filesReady.length,
          error: filesError.length,
          generating_or_pending: filesInProgress.length,
          cost_usd_sum_ready: Math.round(filesCostSum * 100) / 100,
        },
        ecarts: {
          ready_sans_event_metadata_match: unmatchedReady.length,
          events_moins_ready: events.length - filesReady.length,
        },
      },
      fichiers_ready_sans_event: unmatchedReady.slice(0, 20).map((f) => ({
        created_at: f.created_at,
        text_type: f.text_type,
        lang: f.lang,
        gender: f.gender,
        cost_usd: f.cost_usd,
        input_chars: f.input_chars,
      })),
      erreurs_hors_annulation_avec_input_chars: errorsLikelyAfterApi
        .slice(0, 20)
        .map((f) => ({
          created_at: f.created_at,
          text_type: f.text_type,
          lang: f.lang,
          error: (f.error_message ?? "").slice(0, 150),
          input_chars: f.input_chars,
        })),
      erreurs_annulation: filesError.filter((f) =>
        (f.error_message ?? "").includes(cancelledMsg),
      ).length,
    },
    null,
    2,
  ),
);
