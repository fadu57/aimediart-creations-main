/**
 * make-avatars-transparent.mjs — Détourage fond blanc → PNG alpha (bucket avatars)
 *
 * Les images FLUX sont en JPEG #FFFFFF. Ce script :
 *   1. Liste le bucket Storage « avatars »
 *   2. Télécharge chaque .jpg / .png
 *   3. Rend transparent le fond blanc (seuil réglable + léger adoucissement alpha)
 *   4. Upload le résultat en .png (même nom de base : adorable_tiger.png)
 *   5. Option --delete-source : supprime l’ancien .jpg après succès
 *
 * Prérequis (.env) : SUPABASE_URL (ou VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage :
 *   node scripts/make-avatars-transparent.mjs --dry-run
 *   LIMIT=20 node scripts/make-avatars-transparent.mjs
 *   node scripts/make-avatars-transparent.mjs --delete-source
 *   THRESHOLD=250 node scripts/make-avatars-transparent.mjs
 *
 * Qualité :
 *   - Fond #FFFFFF uniforme : très bon résultat avec sharp (rapide, 2500 images OK).
 *   - Pour des bords difficiles : envisager rembg (Python) sur les échecs seulement.
 *   - Ne pas descendre THRESHOLD trop bas (risque de trouer le pelage clair).
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

dotenv.config({ path: join(ROOT, ".env") });
dotenv.config({ path: join(ROOT, ".env.local"), override: false });

const BUCKET = "avatars";
const FILE_RE = /^[a-z0-9]+_[a-z0-9]+\.(jpg|jpeg|png)$/i;
const LIST_PAGE = 1000;
const CONCURRENCY = Number.parseInt(process.env.CONCURRENCY ?? "4", 10) || 4;
const THRESHOLD = Number.parseInt(process.env.THRESHOLD ?? "248", 10) || 248;

function parseArgs(argv) {
  const args = { dryRun: false, deleteSource: false, limit: process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--delete-source") args.deleteSource = true;
    else if (a === "--limit" && argv[i + 1]) args.limit = Number.parseInt(argv[++i], 10) || null;
  }
  return args;
}

function toPngPath(objectName) {
  return objectName.replace(/\.(jpe?g|png|webp)$/i, ".png");
}

/** Distance au blanc ; plus c’est proche de 255, plus c’est transparent. */
function keyOutWhite(rawData, width, height, threshold) {
  for (let i = 0; i < rawData.length; i += 4) {
    const r = rawData[i];
    const g = rawData[i + 1];
    const b = rawData[i + 2];
    const min = Math.min(r, g, b);
    const avg = (r + g + b) / 3;
    if (min >= threshold - 4 && avg >= threshold - 2) {
      rawData[i + 3] = 0;
    }
  }
  return sharp(rawData, { raw: { width, height, channels: 4 } });
}

async function makeTransparentPng(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return keyOutWhite(data, info.width, info.height, THRESHOLD)
    .png({ compressionLevel: 9, effort: 7 })
    .toBuffer();
}

async function listAvatarObjects(admin) {
  const names = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(BUCKET).list("", {
      limit: LIST_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (row.name && FILE_RE.test(row.name)) names.push(row.name);
    }
    if (data.length < LIST_PAGE) break;
    offset += data.length;
  }
  return names;
}

async function processOne(admin, objectName, args) {
  const pngName = toPngPath(objectName);

  if (args.dryRun) {
    return { status: "dry", pngName };
  }

  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(objectName);
  if (dlErr) throw dlErr;

  const inputBuf = Buffer.from(await blob.arrayBuffer());
  const pngBuf = await makeTransparentPng(inputBuf);

  const { error: upErr } = await admin.storage.from(BUCKET).upload(pngName, pngBuf, {
    upsert: true,
    contentType: "image/png",
  });
  if (upErr) throw upErr;

  if (args.deleteSource && objectName !== pngName && /\.(jpe?g)$/i.test(objectName)) {
    await admin.storage.from(BUCKET).remove([objectName]);
  }

  return { status: "ok", pngName, bytes: pngBuf.length };
}

async function runPool(admin, jobs, args) {
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let index = 0;

  async function worker() {
    while (index < jobs.length) {
      const i = index++;
      const name = jobs[i];
      try {
        const result = await processOne(admin, name, args);
        if (result.status === "skip") {
          skip++;
          console.log(`⏭ ${name} — ${result.reason}`);
        } else if (result.status === "dry") {
          console.log(`🔍 ${name} → ${result.pngName}`);
          ok++;
        } else {
          ok++;
          console.log(`✅ ${name} → ${result.pngName} (${Math.round(result.bytes / 1024)} Ko)`);
        }
      } catch (err) {
        fail++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ ${name} : ${msg}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));
  return { ok, skip, fail };
}

async function main() {
  const args = parseArgs(process.argv);
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("❌ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis dans .env");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const all = await listAvatarObjects(admin);
  const pngBases = new Set(all.filter((n) => /\.png$/i.test(n)).map((n) => toPngPath(n)));

  /** Par défaut : ne traiter que les JPEG dont le .png n’existe pas encore. */
  let objects = all.filter((name) => {
    if (!/\.(jpe?g)$/i.test(name)) return false;
    return !pngBases.has(toPngPath(name));
  });

  if (args.limit) objects = objects.slice(0, args.limit);

  console.log(`📦 ${objects.length} fichier(s) à traiter (seuil=${THRESHOLD}, concurrence=${CONCURRENCY})`);
  if (args.dryRun) console.log("   Mode dry-run : aucun upload.");

  const { ok, skip, fail } = await runPool(admin, objects, args);
  console.log(`\nTerminé : ${ok} traité(s), ${skip} ignoré(s), ${fail} erreur(s).`);
  if (fail > 0) process.exit(1);
}

main();
