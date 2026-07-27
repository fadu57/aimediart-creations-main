#!/usr/bin/env node
// AIM-173 — génère la baseline unique supabase/migrations/20260101000000_baseline_schema.sql
// à partir d'un dump pg_dump de prod, en remplacement des 74 migrations legacy
// (archivées dans supabase/migrations_archive/).
//
// Usage : node scripts/build-baseline-migration.mjs <chemin-vers-schema_prod.sql>
//
// Le fichier source (dump prod) reste hors du repo : son chemin est passé en argument.

import fs from "node:fs";
import path from "node:path";

const [, , inputArg] = process.argv;
if (!inputArg) {
  console.error("Usage: node scripts/build-baseline-migration.mjs <chemin-vers-schema_prod.sql>");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split("\n");

// En-tête stable émis par pg_dump avant chaque objet :
//   --
//   -- Name: <n>; Type: <t>; Schema: <s>; Owner: <o>
//   --
const HEADER_RE = /^-- Name: (.+); Type: (.+); Schema: (.*); Owner: (.*)$/;

const headers = [];
lines.forEach((line, index) => {
  const match = line.match(HEADER_RE);
  if (match) {
    headers.push({ index, name: match[1], type: match[2], schema: match[3], owner: match[4] });
  }
});

if (headers.length === 0) {
  console.error(
    'Aucun en-tête "-- Name: ...; Type: ...; Schema: ...; Owner: ..." trouvé — ' +
      "le fichier source ne ressemble pas à une sortie pg_dump standard.",
  );
  process.exit(1);
}

// Chaque en-tête est précédé d'une ligne "--" isolée ; on l'inclut dans le bloc si présente.
function blockStart(headerIndex) {
  return headerIndex > 0 && lines[headerIndex - 1].trim() === "--" ? headerIndex - 1 : headerIndex;
}

const preambleLines = lines.slice(0, blockStart(headers[0].index));

const blocks = headers.map((header, i) => {
  const start = blockStart(header.index);
  const end = i + 1 < headers.length ? blockStart(headers[i + 1].index) : lines.length;
  return { ...header, text: lines.slice(start, end).join("\n") };
});

function isRestrictLine(line) {
  return /^\\(un)?restrict\b/.test(line.trim());
}

function stripRestrictLines(text) {
  return text
    .split("\n")
    .filter((line) => !isRestrictLine(line))
    .join("\n");
}

// Exclusions volontaires :
//   - CREATE SCHEMA public / storage : provisionnés automatiquement par Supabase.
//   - Tout le schéma "storage" sauf POLICY (règles métier sur les buckets) : le
//     reste (tables, fonctions, triggers, et l'activation de la RLS elle-même)
//     est géré par le service storage-api à chaque démarrage. Vérifié empiriquement
//     (cold start isolé) : réactiver ROW SECURITY sur storage.buckets échoue avec
//     "must be owner of table buckets" — storage-api l'active déjà lui-même.
const EXCLUDED_SCHEMA_NAMES = new Set(["public", "storage"]);
const STORAGE_KEPT_TYPES = new Set(["POLICY"]);

function isExcludedSchemaCreation(block) {
  return block.type.trim() === "SCHEMA" && EXCLUDED_SCHEMA_NAMES.has(block.name.trim());
}

function isExcludedStorageBlock(block) {
  return block.schema.trim() === "storage" && !STORAGE_KEPT_TYPES.has(block.type.trim());
}

const kept = [];
const excluded = [];

for (const block of blocks) {
  if (isExcludedSchemaCreation(block) || isExcludedStorageBlock(block)) {
    excluded.push(block);
  } else {
    kept.push(block);
  }
}

const cleanedPreamble = stripRestrictLines(preambleLines.join("\n")).trim();
const cleanedKept = kept.map((block) => stripRestrictLines(block.text).trim());

const PROVENANCE = `-- =============================================================================
-- Baseline unique — remplace les 74 migrations legacy (voir supabase/migrations_archive/)
-- Générée par scripts/build-baseline-migration.mjs à partir d'un dump pg_dump de PROD
-- (fourni par l'associé le 2026-07-27, confirmé comme reflétant l'état réel de prod).
-- Ticket : AIM-173.
--
-- Exclusions volontaires par rapport au dump source :
--   - CREATE SCHEMA public / storage (provisionnés automatiquement par Supabase)
--   - Schéma "storage" : uniquement POLICY conservées, le reste (tables, fonctions,
--     triggers, activation de la RLS) est géré par le service storage-api.
-- =============================================================================

`;

const output = `${PROVENANCE}BEGIN;

${cleanedPreamble}

${cleanedKept.join("\n\n")}

COMMIT;
`;

// --- Assertions programmatiques (le script échoue si l'une d'elles ne passe pas) ---
function countMatches(text, re) {
  return (text.match(re) || []).length;
}

const createTableCount = countMatches(output, /^CREATE TABLE /gm);
const createSchemaCount = countMatches(output, /^CREATE SCHEMA\b/gm);
const restrictCount = countMatches(output, /^\\(un)?restrict\b/gm);
const remainingStorageBlocks = kept.filter((block) => block.schema.trim() === "storage");
const storageBlocksOk = remainingStorageBlocks.every((block) => STORAGE_KEPT_TYPES.has(block.type.trim()));

// Le dump source contient 79 CREATE TABLE au total (71 dans public + 8 dans storage,
// vérifié via les en-têtes pg_dump). Le schéma storage étant exclu (voir plus haut),
// la baseline générée ne doit conserver que les 71 tables du schéma public.
const assertions = [
  [`CREATE TABLE count === 71 (obtenu: ${createTableCount})`, createTableCount === 71],
  [`CREATE SCHEMA count === 0 (obtenu: ${createSchemaCount})`, createSchemaCount === 0],
  [`restrict count === 0 (obtenu: ${restrictCount})`, restrictCount === 0],
  [
    `blocs storage restants limités à POLICY (obtenu: ${remainingStorageBlocks
      .map((b) => b.type.trim())
      .join(", ") || "aucun"})`,
    storageBlocksOk,
  ],
];

const failed = assertions.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error("Échec des assertions de génération de la baseline :");
  for (const [label] of failed) {
    console.error(`  - ${label}`);
  }
  process.exit(1);
}

const outputPath = path.resolve("supabase/migrations/20260101000000_baseline_schema.sql");
fs.writeFileSync(outputPath, output, "utf8");

console.log(`Baseline écrite : ${outputPath}`);
console.log(`Blocs conservés : ${kept.length}, blocs exclus : ${excluded.length}`);
console.log("Assertions : OK");
