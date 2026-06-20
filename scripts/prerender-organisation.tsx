/**
 * Prérendu SSG de /organisation — SEO head + données initiales (pas de HTML React dans #root).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

import { initI18nForPath } from "../src/i18n/bootstrapI18n";
import frHome from "../src/i18n/locales/fr/home.json";
import {
  auditPrerenderedHtml,
  buildOrganisationSeoPayload,
  injectOrganisationHead,
} from "../src/lib/organisation/organisationSeo";
import { fetchPublicHomeData } from "../src/lib/organisation/publicHomeData";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const distDir = resolve(process.cwd(), "dist");
const templatePath = resolve(distDir, "index.html");

async function main(): Promise<void> {
  if (!supabaseUrl || !anonKey) {
    console.warn("[prerender:organisation] Variables Supabase absentes — prérendu ignoré.");
    return;
  }

  try {
    readFileSync(templatePath, "utf8");
  } catch {
    console.warn("[prerender:organisation] dist/index.html introuvable — lancez vite build d'abord.");
    return;
  }

  await initI18nForPath("/organisation");
  const initialData = await fetchPublicHomeData(supabaseUrl, anonKey);

  const seo = buildOrganisationSeoPayload(
    frHome.hero.title_line1,
    frHome.hero.title_line2,
  );

  const template = readFileSync(templatePath, "utf8");
  const safeJson = JSON.stringify(initialData).replace(/</g, "\\u003c");
  const initialDataScript = `<script type="application/json" id="__ORGANISATION_INITIAL_DATA__">${safeJson}</script>`;

  let html = template.replace(
    '<div id="root"></div>',
    `<div id="root"></div>\n    ${initialDataScript}`,
  );

  html = injectOrganisationHead(html, seo);

  const warnings = auditPrerenderedHtml(html, { requireBodySemantics: false });
  for (const w of warnings) {
    console.warn(`[prerender:organisation] audit SEO : ${w}`);
  }

  const outDir = resolve(distDir, "organisation");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "index.html"), html, "utf8");

  console.log(
    `[prerender:organisation] dist/organisation/index.html généré (description ${seo.description.length} car., canonical ${seo.canonicalUrl}).`,
  );
}

main().catch((err: unknown) => {
  console.error("[prerender:organisation] échec :", err);
  process.exit(1);
});
