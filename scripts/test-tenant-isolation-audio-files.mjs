#!/usr/bin/env node
// Test d'isolation RLS/GRANT pour AIM-30 (audio_files, rôle anon).
// Exécuté par `npm run test:tenant-isolation` — job CI `tenant-isolation`
// (.github/workflows/ci.yml). Nécessite un stack Supabase local démarré
// (`supabase start`) sur le port par défaut, ou TENANT_ISOLATION_DB_URL.
//
// Chaque check tourne dans sa propre transaction psql (BEGIN ... ROLLBACK) :
// aucune ligne n'est jamais persistée.

import { execFileSync } from "node:child_process";

const DB_URL =
  process.env.TENANT_ISOLATION_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const READY_PATH = "test/tenant-isolation-ready.mp3";
const PENDING_PATH = "test/tenant-isolation-pending.mp3";

const AC2_READY_A = "test/tenant-isolation-ac2-ready-a.mp3";
const AC2_READY_B = "test/tenant-isolation-ac2-ready-b.mp3";
const AC2_PENDING = "test/tenant-isolation-ac2-pending.mp3";

const AC2_FIXTURES = `
  INSERT INTO public.audio_files
    (text_id, text_type, lang, prompt_style_id, voice_id, gender, storage_path, status, provider, model, cost_usd)
  VALUES
    (gen_random_uuid(), 'mediation', 'fr', NULL, 'voice-f-1', 'F', '${AC2_READY_A}', 'ready', 'openai', 'tts-1', 0.42),
    (gen_random_uuid(), 'mediation', 'fr', NULL, 'voice-m-1', 'M', '${AC2_READY_B}', 'ready', 'openai', 'tts-1', 0.55),
    (gen_random_uuid(), 'mediation', 'fr', NULL, 'voice-f-2', 'F', '${AC2_PENDING}', 'pending', 'openai', 'tts-1', 0.10);
`;

const FIXTURES = `
  INSERT INTO public.audio_files
    (text_id, text_type, lang, prompt_style_id, voice_id, gender, storage_path, status, provider, model, cost_usd)
  VALUES
    (gen_random_uuid(), 'mediation', 'fr', NULL, 'voice-f-1', 'F', '${READY_PATH}', 'ready', 'openai', 'tts-1', 0.42),
    (gen_random_uuid(), 'mediation', 'fr', NULL, 'voice-m-1', 'M', '${PENDING_PATH}', 'pending', 'openai', 'tts-1', 0.10);
`;

function psql(sql) {
  return execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-c", sql], {
    encoding: "utf8",
  });
}

function psqlExpectFailure(sql) {
  try {
    execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return null; // a réussi -> pas d'échec à rapporter
  } catch (err) {
    return err.stderr?.toString() ?? String(err);
  }
}

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`ok   - ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`FAIL - ${name}`);
    console.error(`       ${err.message}`);
  }
}

check("AC2 - anon (vue) et authenticated (table, status=ready) voient exactement le même ensemble de fichiers ready", () => {
  const out = psql(
    `BEGIN; ${AC2_FIXTURES}
     SET ROLE anon;
     SELECT string_agg(storage_path, ',' ORDER BY storage_path)
     FROM public.audio_files_visitor
     WHERE storage_path IN ('${AC2_READY_A}', '${AC2_READY_B}', '${AC2_PENDING}');
     RESET ROLE;
     SET ROLE authenticated;
     -- audio_files_select vérifie auth.role() (claim JWT), pas le rôle Postgres :
     -- SET ROLE seul ne suffit pas à satisfaire cette policy.
     SET LOCAL request.jwt.claim.role TO 'authenticated';
     SELECT string_agg(storage_path, ',' ORDER BY storage_path)
     FROM public.audio_files
     WHERE storage_path IN ('${AC2_READY_A}', '${AC2_READY_B}', '${AC2_PENDING}')
       AND status = 'ready';
     RESET ROLE;
     ROLLBACK;`,
  );
  const [anonSet, authSet] = out
    .trim()
    .split("\n")
    .map((line) => line.trim());
  const expected = [AC2_READY_A, AC2_READY_B].sort().join(",");
  if (anonSet !== expected) {
    throw new Error(`anon: attendu "${expected}", obtenu "${anonSet}"`);
  }
  if (authSet !== expected) {
    throw new Error(`authenticated: attendu "${expected}", obtenu "${authSet}"`);
  }
});

check("anon voit uniquement les fichiers ready via audio_files_visitor", () => {
  const out = psql(
    `BEGIN; ${FIXTURES} SET ROLE anon;
     SELECT string_agg(storage_path, ',' ORDER BY storage_path)
     FROM public.audio_files_visitor
     WHERE storage_path IN ('${READY_PATH}', '${PENDING_PATH}');
     ROLLBACK;`,
  ).trim();
  if (out !== READY_PATH) {
    throw new Error(`attendu "${READY_PATH}", obtenu "${out}"`);
  }
});

check("anon ne peut pas lire cost_usd/provider (absents de la vue)", () => {
  const stderr = psqlExpectFailure(
    `BEGIN; ${FIXTURES} SET ROLE anon;
     SELECT cost_usd FROM public.audio_files_visitor LIMIT 1;
     ROLLBACK;`,
  );
  if (!stderr || !/column .*cost_usd.* does not exist/i.test(stderr)) {
    throw new Error(`échec attendu (colonne inexistante), obtenu: ${stderr ?? "succès"}`);
  }
});

check("anon ne peut pas SELECT la table audio_files directement", () => {
  const stderr = psqlExpectFailure(
    `BEGIN; ${FIXTURES} SET ROLE anon;
     SELECT 1 FROM public.audio_files LIMIT 1;
     ROLLBACK;`,
  );
  if (!stderr || !/permission denied for table audio_files/i.test(stderr)) {
    throw new Error(`échec attendu (permission denied), obtenu: ${stderr ?? "succès"}`);
  }
});

check("anon ne peut pas INSERT dans audio_files", () => {
  const stderr = psqlExpectFailure(
    `BEGIN; SET ROLE anon;
     INSERT INTO public.audio_files (text_id, text_type, lang, voice_id, gender, storage_path, status)
     VALUES (gen_random_uuid(), 'mediation', 'fr', 'voice-x', 'F', 'test/tenant-isolation-insert.mp3', 'ready');
     ROLLBACK;`,
  );
  if (!stderr) throw new Error("l'INSERT anon aurait dû échouer");
});

check("anon ne peut pas UPDATE audio_files", () => {
  const stderr = psqlExpectFailure(
    `BEGIN; ${FIXTURES} SET ROLE anon;
     UPDATE public.audio_files SET status = 'ready' WHERE storage_path = '${PENDING_PATH}';
     ROLLBACK;`,
  );
  if (!stderr) throw new Error("l'UPDATE anon aurait dû échouer");
});

check("anon ne peut pas DELETE dans audio_files", () => {
  const stderr = psqlExpectFailure(
    `BEGIN; ${FIXTURES} SET ROLE anon;
     DELETE FROM public.audio_files WHERE storage_path = '${READY_PATH}';
     ROLLBACK;`,
  );
  if (!stderr) throw new Error("le DELETE anon aurait dû échouer");
});

check("audio_file_is_ready() reflète le statut réel (fonction storage)", () => {
  const out = psql(
    `BEGIN; ${FIXTURES} SET ROLE anon;
     SELECT public.audio_file_is_ready('${READY_PATH}')::text || ',' || public.audio_file_is_ready('${PENDING_PATH}')::text;
     ROLLBACK;`,
  ).trim();
  if (out !== "true,false") {
    throw new Error(`attendu "true,false", obtenu "${out}"`);
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} vérification(s) d'isolation en échec.`);
  process.exit(1);
}
console.log("\nToutes les vérifications d'isolation anon/audio_files sont passées.");
