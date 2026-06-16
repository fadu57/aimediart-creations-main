/**
 * Prérendu SSG de /organisation — HTML optimisé SEO, Open Graph et JSON-LD.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import React from "react";
import { config } from "dotenv";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";

import i18n from "../src/i18n/config";
import { initI18nForPath } from "../src/i18n/bootstrapI18n";
import frHome from "../src/i18n/locales/fr/home.json";
import {
  auditPrerenderedHtml,
  buildOrganisationSeoPayload,
  injectOrganisationHead,
} from "../src/lib/organisation/organisationSeo";
import { fetchPublicHomeData } from "../src/lib/organisation/publicHomeData";
import PublicHome from "../src/pages/PublicHome";
import { UiLanguageProvider } from "../src/providers/UiLanguageProvider";

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
  await i18n.changeLanguage("fr");
  const initialData = await fetchPublicHomeData(supabaseUrl, anonKey);

  const appHtml = renderToString(
    <MemoryRouter initialEntries={["/organisation"]}>
      <I18nextProvider i18n={i18n}>
        <UiLanguageProvider>
          <PublicHome initialData={initialData} />
        </UiLanguageProvider>
      </I18nextProvider>
    </MemoryRouter>,
  );

  const seo = buildOrganisationSeoPayload(
    frHome.hero.title_line1,
    frHome.hero.title_line2,
  );

  const template = readFileSync(templatePath, "utf8");
  const safeJson = JSON.stringify(initialData).replace(/</g, "\\u003c");
  const initialDataScript = `<script type="application/json" id="__ORGANISATION_INITIAL_DATA__">${safeJson}</script>`;

  let html = template.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div>\n    ${initialDataScript}`,
  );

  html = injectOrganisationHead(html, seo);

  const warnings = auditPrerenderedHtml(html);
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
