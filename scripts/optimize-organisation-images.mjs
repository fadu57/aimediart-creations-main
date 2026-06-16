/**
 * Génère des variantes WebP à côté des PNG (public/ + src/assets/) pour le build.
 * Idempotent : ne régénère que si le PNG est plus récent que le WebP.
 */
import { readdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCAN_DIRS = [join(root, "public"), join(root, "src", "assets")];

async function collectPngFiles(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPngFiles(full)));
    } else if (/\.png$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function needsRegenerate(pngPath, webpPath) {
  try {
    const [pngStat, webpStat] = await Promise.all([stat(pngPath), stat(webpPath)]);
    return pngStat.mtimeMs > webpStat.mtimeMs;
  } catch {
    return true;
  }
}

async function convertOne(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, ".webp");
  if (!(await needsRegenerate(pngPath, webpPath))) return false;

  await sharp(pngPath)
    .webp({ quality: 82, effort: 4 })
    .toFile(webpPath);

  return true;
}

async function main() {
  const pngFiles = (
    await Promise.all(SCAN_DIRS.map((dir) => collectPngFiles(dir)))
  ).flat();

  if (pngFiles.length === 0) {
    console.log("[optimize-images] Aucun PNG trouvé — étape ignorée.");
    return;
  }

  let converted = 0;
  for (const pngPath of pngFiles) {
    if (await convertOne(pngPath)) converted += 1;
  }

  console.log(
    `[optimize-images] ${converted} WebP généré(s) / ${pngFiles.length} PNG scanné(s).`,
  );
}

main().catch((err) => {
  console.error("[optimize-images] Échec :", err);
  process.exit(1);
});
