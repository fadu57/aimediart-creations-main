/**
 * Export PNG haute résolution du bloc logo Header pour les PDF (cartel œuvre, etc.).
 */

import {
  AIMEDIART_BRAND_LOGO,
  AIMEDIART_LOGO_RED,
  LUCIDE_HEART_PATH,
} from "@/lib/aimediartBrandLogo";

const RENDER_SCALE = 4;

function buildBrandLogoSvg(): string {
  const { widthPx, heightPx, boxPx, boxRadiusPx, textX, titleFontSizePx, subtitleFontSizePx } =
    AIMEDIART_BRAND_LOGO;
  const heartOffset = (boxPx - 24) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
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
  <text
    x="${textX}"
    y="15"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-size="${titleFontSizePx}"
    font-weight="700"
    letter-spacing="-0.025em"
    fill="${AIMEDIART_LOGO_RED}"
  >AIMEDIArt.com</text>
  <text
    x="${textX}"
    y="32"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-size="${subtitleFontSizePx}"
    font-weight="700"
    font-style="italic"
    fill="${AIMEDIART_LOGO_RED}"
  >Art-mediation with AI</text>
</svg>`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Chargement image logo impossible."));
    img.src = url;
  });
}

async function ensureInterFontLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  await Promise.all([
    document.fonts.load("700 16px Inter"),
    document.fonts.load("italic 700 10px Inter"),
  ]).catch(() => undefined);
  await document.fonts.ready;
}

export type PdfHeaderLogoBlock = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
};

/**
 * PNG (data URL) du bandeau logo en résolution native ×4 pour impression nette.
 */
export async function createAimediaHeaderLogoBlockPng(): Promise<PdfHeaderLogoBlock> {
  if (typeof document === "undefined") {
    throw new Error("Génération du logo PDF impossible hors navigateur.");
  }

  await ensureInterFontLoaded();

  const { widthPx, heightPx } = AIMEDIART_BRAND_LOGO;
  const svg = buildBrandLogoSvg();
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = widthPx * RENDER_SCALE;
    canvas.height = heightPx * RENDER_SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D indisponible.");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthPx,
      heightPx,
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Largeur / hauteur en mm pour jsPDF (96 CSS px → mm). */
export function brandLogoSizeMm(): { widthMm: number; heightMm: number } {
  const { widthPx, heightPx } = AIMEDIART_BRAND_LOGO;
  return {
    widthMm: (widthPx * 25.4) / 96,
    heightMm: (heightPx * 25.4) / 96,
  };
}
