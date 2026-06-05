/**
 * backfill-avatar-pseudos.mjs — Recalcule full_pseudo_* depuis le lexique (dry-run par défaut).
 *
 * Prérequis : supabase/sql/avatar_i18n/01..04 exécutés + lexique relu manuellement.
 *
 * Usage :
 *   node scripts/backfill-avatar-pseudos.mjs              # dry-run
 *   node scripts/backfill-avatar-pseudos.mjs --apply    # écrit en base
 *   node scripts/backfill-avatar-pseudos.mjs --apply --limit 50
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : null;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  let query = supabase
    .from("avatars")
    .select("id, full_pseudo_fr, full_pseudo_en, adjective_key, noun_id, image_path")
    .not("adjective_key", "is", null)
    .not("noun_id", "is", null);

  if (limit) query = query.limit(limit);

  const { data: rows, error } = await query;
  if (error) throw error;

  console.log(`Lignes éligibles : ${rows?.length ?? 0} | mode : ${apply ? "APPLY" : "DRY-RUN"}`);

  let changed = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const { data: rebuilt, error: rpcError } = await supabase.rpc("build_avatar_full_pseudo", {
      p_adjective_key: row.adjective_key,
      p_noun_id: row.noun_id,
      p_lang: "fr",
    });

    if (rpcError) {
      console.warn(`[${row.id}] RPC error:`, rpcError.message);
      failed += 1;
      continue;
    }

    const differs = row.full_pseudo_fr !== rebuilt;
    if (differs) {
      changed += 1;
      console.log({
        id: row.id,
        image_path: row.image_path,
        before: row.full_pseudo_fr,
        after: rebuilt,
      });
    }

    if (apply && differs) {
      const { error: refreshError } = await supabase.rpc("refresh_avatar_pseudo_columns", {
        p_avatar_id: row.id,
      });
      if (refreshError) {
        console.warn(`[${row.id}] refresh error:`, refreshError.message);
        failed += 1;
      }
    }
  }

  console.log(`Terminé. Modifiés (FR différent) : ${changed} | erreurs : ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
