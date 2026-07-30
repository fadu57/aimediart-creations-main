#!/usr/bin/env node
// Test de non-régression pour AIM-23 (expo_user_role_user_id_fkey).
// Exécuté par `npm run test:expo-user-role-fk` — job CI `tenant-isolation`
// (.github/workflows/ci.yml, même stack Supabase local déjà démarré).
// Requiert un stack Supabase local démarré (`supabase start`) sur le port
// par défaut, ou EXPO_USER_ROLE_FK_DB_URL.
//
// Les checks avec effets de bord tournent dans leur propre transaction psql
// (BEGIN ... ROLLBACK) : aucune ligne n'est jamais persistée. Les checks
// d'introspection pure (pg_constraint) n'ont pas besoin de transaction.

import { execFileSync } from "node:child_process";

const DB_URL =
  process.env.EXPO_USER_ROLE_FK_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

check("expo_user_role_user_id_fkey référence auth.users (pas users_legacy)", () => {
  const out = psql(
    `SELECT confrelid::regclass::text
     FROM pg_constraint
     WHERE conname = 'expo_user_role_user_id_fkey'
       AND conrelid = 'public.expo_user_role'::regclass;`,
  ).trim();
  if (out !== "auth.users") {
    throw new Error(`attendu "auth.users", obtenu "${out}"`);
  }
});

check("expo_user_role_expo_user_uniq empêche les doublons (expo_id, user_id)", () => {
  const out = psql(
    `SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conname = 'expo_user_role_expo_user_uniq'
       AND conrelid = 'public.expo_user_role'::regclass;`,
  ).trim();
  if (out !== "UNIQUE NULLS NOT DISTINCT (expo_id, user_id)") {
    throw new Error(`attendu "UNIQUE NULLS NOT DISTINCT (expo_id, user_id)", obtenu "${out}"`);
  }
});

check("un insert expo_user_role réussit pour un id existant dans auth.users (AC1)", () => {
  const out = psql(
    `BEGIN;
     INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-111111111111');
     INSERT INTO public.expos (id, expo_name) VALUES ('22222222-2222-2222-2222-222222222222', 'expo-test-aim-23');
     INSERT INTO public.expo_user_role (expo_id, user_id)
       VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111')
       RETURNING 'inserted';
     ROLLBACK;`,
  ).trim();
  if (out !== "inserted") {
    throw new Error(`insert attendu en succès, obtenu "${out}"`);
  }
});

check("un insert expo_user_role échoue pour un user_id absent de auth.users (FK toujours active)", () => {
  const stderr = psqlExpectFailure(
    `BEGIN;
     INSERT INTO public.expos (id, expo_name) VALUES ('33333333-3333-3333-3333-333333333333', 'expo-test-aim-23-bis');
     INSERT INTO public.expo_user_role (expo_id, user_id)
       VALUES ('33333333-3333-3333-3333-333333333333', '99999999-9999-9999-9999-999999999999');
     ROLLBACK;`,
  );
  if (!stderr || !/violates foreign key constraint "expo_user_role_user_id_fkey"/i.test(stderr)) {
    throw new Error(`échec de FK attendu, obtenu: ${stderr ?? "succès"}`);
  }
});

check("un second insert (expo_id, user_id) identique viole l'unicité (upsert applicatif requis)", () => {
  const stderr = psqlExpectFailure(
    `BEGIN;
     INSERT INTO auth.users (id) VALUES ('44444444-4444-4444-4444-444444444444');
     INSERT INTO public.expos (id, expo_name) VALUES ('55555555-5555-5555-5555-555555555555', 'expo-test-aim-23-ter');
     INSERT INTO public.expo_user_role (expo_id, user_id)
       VALUES ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444');
     INSERT INTO public.expo_user_role (expo_id, user_id)
       VALUES ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444');
     ROLLBACK;`,
  );
  if (!stderr || !/violates unique constraint "expo_user_role_expo_user_uniq"/i.test(stderr)) {
    throw new Error(`échec d'unicité attendu, obtenu: ${stderr ?? "succès"}`);
  }
});

check("la suppression du compte auth.users entraîne bien la cascade sur expo_user_role", () => {
  const out = psql(
    `BEGIN;
     INSERT INTO auth.users (id) VALUES ('66666666-6666-6666-6666-666666666666');
     INSERT INTO public.expos (id, expo_name) VALUES ('77777777-7777-7777-7777-777777777777', 'expo-test-aim-23-cascade');
     INSERT INTO public.expo_user_role (expo_id, user_id)
       VALUES ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666');
     DELETE FROM auth.users WHERE id = '66666666-6666-6666-6666-666666666666';
     SELECT count(*)::text FROM public.expo_user_role
       WHERE user_id = '66666666-6666-6666-6666-666666666666';
     ROLLBACK;`,
  ).trim();
  if (out !== "0") {
    throw new Error(`cascade attendue (0 ligne restante), obtenu "${out}"`);
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} vérification(s) AIM-23 en échec.`);
  process.exit(1);
}
console.log("\nToutes les vérifications AIM-23 (expo_user_role_user_id_fkey) sont passées.");
