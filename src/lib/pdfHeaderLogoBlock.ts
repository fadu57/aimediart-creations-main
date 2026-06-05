/**
 * Export PNG haute résolution du bloc logo Header pour les PDF (cartel œuvre, etc.).
 */

import {
  AIMEDIART_BRAND_LOGO,
} from "@/lib/aimediartBrandLogo";
import { buildAimediartBrandLogoSvg } from "@/lib/aimediartBrandLogoSvg";

const RENDER_SCALE = 4;

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
  const svg = buildAimediartBrandLogoSvg();
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
