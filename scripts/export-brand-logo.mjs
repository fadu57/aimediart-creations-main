/**
 * Exporte le bloc logo marque en SVG (texte vectorisé Inter) + PNG HD.
 * Usage : npm run export:brand-logo
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

const AIMEDIART_LOGO_RED = "#ca2b2b";
const LUCIDE_HEART_PATH =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

const heightPx = 40;
const boxPx = 40;
const boxRadiusPx = 6;
const textX = 48;
const titleFontSizePx = 16;
const subtitleFontSizePx = 10;
const titleLetterSpacingEm = -0.025;
const heartOffset = (boxPx - 24) / 2;
const RENDER_SCALE = 4;
const RIGHT_PADDING_PX = 4;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = join(root, "public", "brand");
const fontDir = join(root, "node_modules", "@fontsource", "inter", "files");
const fontNormalPath = join(fontDir, "inter-latin-700-normal.woff");
const fontItalicPath = join(fontDir, "inter-latin-700-italic.woff");

function loadFont(path) {
  return opentype.parse(readFileSync(path));
}

/** Contours SVG + bbox réel (inclut dépassements des glyphes). */
function textToPath(font, text, x, y, fontSize, letterSpacingEm = 0) {
  const path = new opentype.Path();
  let cursorX = x;
  const scale = fontSize / font.unitsPerEm;

  for (const char of text) {
    const glyph = font.charToGlyph(char);
    path.extend(glyph.getPath(cursorX, y, fontSize));
    cursorX += glyph.advanceWidth * scale + fontSize * letterSpacingEm;
  }

  const bbox = path.getBoundingBox();
  return { d: path.toPathData(2), bbox };
}

function buildLogo() {
  const fontBold = loadFont(fontNormalPath);
  const fontBoldItalic = loadFont(fontItalicPath);

  const title = textToPath(fontBold, "AIMEDIArt.com", textX, 15, titleFontSizePx, titleLetterSpacingEm);
  const subtitle = textToPath(fontBoldItalic, "Art-mediation with AI", textX, 32, subtitleFontSizePx);

  const widthPx = Math.ceil(
    Math.max(boxPx, title.bbox.x2, subtitle.bbox.x2, 0) + RIGHT_PADDING_PX,
  );

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" role="img" aria-label="AIMEDIArt.com — Art-mediation with AI">
  <rect x="0" y="0" width="${boxPx}" height="${boxPx}" rx="${boxRadiusPx}" fill="${AIMEDIART_LOGO_RED}" />
  <g transform="translate(${heartOffset}, ${heartOffset})">
    <path
      d="${LUCIDE_HEART_PATH}"
      fill="none"
      stroke="#ffffff"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
  <path d="${title.d}" fill="${AIMEDIART_LOGO_RED}" />
  <path d="${subtitle.d}" fill="${AIMEDIART_LOGO_RED}" />
</svg>
`;

  return { svg, widthPx, heightPx };
}

async function renderPng(svg, targetWidth, targetHeight) {
  return sharp(Buffer.from(svg))
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

mkdirSync(brandDir, { recursive: true });

const { svg, widthPx } = buildLogo();
const svgPath = join(brandDir, "aimediart-logo-block.svg");
const pngPath = join(brandDir, "aimediart-logo-block.png");
const png2xPath = join(brandDir, "aimediart-logo-block@2x.png");

writeFileSync(svgPath, svg, "utf8");
console.log(`SVG (${widthPx}×${heightPx}, Inter vectorisé) : ${svgPath}`);

writeFileSync(pngPath, await renderPng(svg, widthPx * RENDER_SCALE, heightPx * RENDER_SCALE));
console.log(`PNG (${widthPx * RENDER_SCALE}×${heightPx * RENDER_SCALE}) : ${pngPath}`);

writeFileSync(png2xPath, await renderPng(svg, widthPx * 2, heightPx * 2));
console.log(`PNG @2x (${widthPx * 2}×${heightPx * 2}) : ${png2xPath}`);
