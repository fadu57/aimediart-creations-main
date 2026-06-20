/**
 * Métadonnées SEO / Open Graph pour la vitrine /organisation.
 * Partagé entre le script de prérendu (Node) et l'app (référence des constantes).
 */

import { AIMEDIART_CONTACT_EMAIL } from "@/lib/aimediartContact";

export const ORGANISATION_PATH = "/organisation";

/** Description optimisée Google + LLM (cible 140–160 caractères). */
export const ORGANISATION_META_DESCRIPTION =
  "AIMEDIArt : médiation d'exposition par QR code et IA. Mesurez les émotions des visiteurs en direct, sans application, pour musées et galeries.";

export const ORGANISATION_OG_IMAGE_PATH = "/landing-hero-new.png";

export const ORGANISATION_LCP_IMAGE_PATH = ORGANISATION_OG_IMAGE_PATH;
export const ORGANISATION_LCP_WEBP_PATH = ORGANISATION_LCP_IMAGE_PATH.replace(/\.png$/i, ".webp");

export const ORGANISATION_KEYWORDS =
  "médiation exposition, art-médiation, QR code musée, visite virtuelle, émotions visiteurs, galerie, musée, IA culturelle, AIMEDIArt";

export type OrganisationSeoPayload = {
  siteOrigin: string;
  title: string;
  description: string;
  ogImageUrl: string;
  canonicalUrl: string;
  pageUrl: string;
};

/** Tronque proprement entre min et max caractères (coupure sur espace). */
export function trimMetaDescription(text: string, min = 140, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized.length >= min ? normalized : padMetaDescription(normalized, min, max);
  }
  const slice = normalized.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > min ? slice.slice(0, lastSpace) : normalized.slice(0, max);
  return cut.replace(/[.,;:\s]+$/, "").trim() + "…";
}

function padMetaDescription(text: string, min: number, max: number): string {
  const suffix = " Solution de médiation digitale pour expositions et lieux culturels.";
  const combined = (text + suffix).replace(/\s+/g, " ").trim();
  return combined.length > max ? trimMetaDescription(combined, min, max) : combined;
}

export function resolveSiteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv =
    env.VITE_PUBLIC_SITE_URL?.trim() ||
    env.VITE_PUBLIC_URL?.trim() ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL.replace(/^https?:\/\//, "")}` : "");
  const base = fromEnv || "https://www.aimediart.com";
  return base.replace(/\/+$/, "");
}

export function buildOrganisationSeoPayload(
  heroTitleLine1: string,
  heroTitleLine2: string,
  env: NodeJS.ProcessEnv = process.env,
): OrganisationSeoPayload {
  const siteOrigin = resolveSiteOrigin(env);
  const title = `AIMEDIArt — ${heroTitleLine1} ${heroTitleLine2} | Médiation exposition QR code & IA`;
  const description = trimMetaDescription(ORGANISATION_META_DESCRIPTION);
  const pageUrl = `${siteOrigin}${ORGANISATION_PATH}`;
  const ogImageUrl = `${siteOrigin}${ORGANISATION_OG_IMAGE_PATH}`;

  return {
    siteOrigin,
    title,
    description,
    ogImageUrl,
    canonicalUrl: pageUrl,
    pageUrl,
  };
}

export function buildOrganisationJsonLd(seo: OrganisationSeoPayload): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${seo.siteOrigin}/#organization`,
        name: "AIMEDIArt",
        url: seo.siteOrigin,
        logo: `${seo.siteOrigin}/favicon.svg`,
        email: AIMEDIART_CONTACT_EMAIL,
        description: seo.description,
      },
      {
        "@type": "WebSite",
        "@id": `${seo.siteOrigin}/#website`,
        url: seo.siteOrigin,
        name: "AIMEDIArt",
        publisher: { "@id": `${seo.siteOrigin}/#organization` },
        inLanguage: "fr-FR",
      },
      {
        "@type": "WebPage",
        "@id": `${seo.canonicalUrl}#webpage`,
        url: seo.canonicalUrl,
        name: seo.title,
        description: seo.description,
        inLanguage: "fr-FR",
        isPartOf: { "@id": `${seo.siteOrigin}/#website` },
        about: {
          "@type": "SoftwareApplication",
          name: "AIMEDIArt",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Plateforme de médiation d'exposition par QR code et intelligence artificielle pour musées, galeries et lieux culturels.",
        },
      },
    ],
  };
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Injecte / remplace les balises <head> SEO pour dist/organisation/index.html */
export function injectOrganisationHead(html: string, seo: OrganisationSeoPayload): string {
  const jsonLd = JSON.stringify(buildOrganisationJsonLd(seo)).replace(/</g, "\\u003c");
  const lcpWebpUrl = `${seo.siteOrigin}${ORGANISATION_LCP_WEBP_PATH}`;
  const performanceHints = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link rel="preload" as="image" type="image/webp" href="${escapeHtmlAttribute(lcpWebpUrl)}" fetchpriority="high" />`;
  const headBlock = `
    <title>${escapeHtmlAttribute(seo.title)}</title>
    <meta name="description" content="${escapeHtmlAttribute(seo.description)}" />
    <meta name="keywords" content="${escapeHtmlAttribute(ORGANISATION_KEYWORDS)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtmlAttribute(seo.canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:site_name" content="AIMEDIArt" />
    <meta property="og:title" content="${escapeHtmlAttribute(seo.title)}" />
    <meta property="og:description" content="${escapeHtmlAttribute(seo.description)}" />
    <meta property="og:url" content="${escapeHtmlAttribute(seo.pageUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttribute(seo.ogImageUrl)}" />
    <meta property="og:image:alt" content="Visiteurs dans une exposition utilisant la médiation AIMEDIArt" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttribute(seo.title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttribute(seo.description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttribute(seo.ogImageUrl)}" />
    <script type="application/ld+json">${jsonLd}</script>`;

  let out = html.replace(/<title>[\s\S]*?<\/title>/i, "").replace(
    /<meta name="description"[^>]*\/?>/i,
    "",
  );
  out = out.replace(/<meta property="og:title"[^>]*\/?>/gi, "");
  out = out.replace(/<meta property="og:description"[^>]*\/?>/gi, "");
  out = out.replace(/<meta property="og:type"[^>]*\/?>/gi, "");
  out = out.replace(/<meta name="twitter:card"[^>]*\/?>/gi, "");

  out = out.replace(
    /<meta name="viewport"[^>]*\/?>/i,
    (match) => `${match}\n${performanceHints}\n${headBlock}`,
  );

  return out;
}

/** Contrôles qualité post-prérendu (logs build). */
export function auditPrerenderedHtml(
  html: string,
  options?: { requireBodySemantics?: boolean },
): string[] {
  const warnings: string[] = [];
  const requireBody = options?.requireBodySemantics !== false;
  if (requireBody) {
    const h1Count = (html.match(/<h1\b/gi) ?? []).length;
    if (h1Count !== 1) warnings.push(`Attendu 1 <h1>, trouvé ${h1Count}.`);
    if (!/<main\b/i.test(html)) warnings.push("Balise <main> absente.");
    if (!/<footer\b/i.test(html)) warnings.push("Balise <footer> absente.");
    if (!/<header\b/i.test(html)) warnings.push("Balise <header> absente.");
  }
  const descMatch = html.match(/<meta name="description" content="([^"]*)"/i);
  if (descMatch) {
    const len = descMatch[1].length;
    if (len < 140 || len > 160) {
      warnings.push(`Meta description : ${len} caractères (cible 140–160).`);
    }
  }
  return warnings;
}
