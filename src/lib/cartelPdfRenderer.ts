/**
 * Génération des cartels PDF via @react-pdf/renderer (remplace jsPDF).
 */
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { CartelPdfDocument, type CartelPdfPageProps } from "@/components/cartel/CartelPdfDocument";
import {
  CARTEL_FREE_STAMP_ROTATION_DEG,
  CARTEL_FREE_STAMP_URL,
  CARTEL_STAMP_NATIVE_H_MM,
  CARTEL_STAMP_NATIVE_W_MM,
  rotatedStampBoundsMm,
} from "@/lib/cartelPdfLayout";
import {
  resolveCartelFormat,
  getCartelSlots,
  type CartelCustomSizeMm,
  type CartelFormatId,
  type CartelFormatSelection,
} from "@/lib/cartelPdfFormats";
import { createAimediaHeaderLogoBlockPng } from "@/lib/pdfHeaderLogoBlock";
import { QR_CODE_PRINT_OPTIONS } from "@/lib/qrCodeScanFriendly";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

async function loadStampWithTransparency(url: string): Promise<HTMLImageElement> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return loadImage(canvas.toDataURL("image/png"));
}

/** Stamp pré-tourné + ratio pixel exact du canvas (bw/bh). */
async function loadRotatedStampAsset(
  url: string,
  rotationDeg: number = CARTEL_FREE_STAMP_ROTATION_DEG,
): Promise<{ dataUrl: string; aspect: number }> {
  const img = await loadStampWithTransparency(url);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = Math.max(1, Math.ceil(w * cos + h * sin));
  const bh = Math.max(1, Math.ceil(w * sin + h * cos));
  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { dataUrl: url, aspect: w / Math.max(1, h) };
  }
  ctx.translate(bw / 2, bh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return { dataUrl: canvas.toDataURL("image/png"), aspect: bw / bh };
}

function absoluteAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:")) return pathOrUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(pathOrUrl, window.location.origin).href;
  }
  return pathOrUrl;
}

export type GenerateCartelPdfInput = {
  formatId: CartelFormatId;
  customSizeMm?: CartelCustomSizeMm;
  titleText: string;
  extraTitles?: string[];
  artistText: string;
  explorationLines: string[];
  qrTargetUrl: string;
};

export async function generateCartelPdf(input: GenerateCartelPdfInput): Promise<string> {
  return generateCartelPdfBatch([input]);
}

export async function generateCartelPdfBatch(items: GenerateCartelPdfInput[]): Promise<string> {
  if (items.length === 0) {
    throw new Error("Aucune œuvre pour générer les cartels");
  }

  const selection: CartelFormatSelection = {
    formatId: items[0].formatId,
    customSizeMm: items[0].customSizeMm,
  };
  const format = resolveCartelFormat(selection);
  const slots = getCartelSlots(format);

  const stampAsset = await loadRotatedStampAsset(absoluteAssetUrl(CARTEL_FREE_STAMP_URL));
  /** Largeur d’affichage (mm sur 80×80) = largeur AABB théorique. */
  const stampWidthMm = rotatedStampBoundsMm(
    CARTEL_STAMP_NATIVE_W_MM,
    CARTEL_STAMP_NATIVE_H_MM,
    CARTEL_FREE_STAMP_ROTATION_DEG,
  ).w;
  const headerLogo = await createAimediaHeaderLogoBlockPng();
  const logoSrc = headerLogo.dataUrl;

  const pages: CartelPdfPageProps[] = [];

  for (const input of items) {
    const qrDataUrl = await QRCode.toDataURL(input.qrTargetUrl, QR_CODE_PRINT_OPTIONS);
    const headerText = input.explorationLines.map((l) => l.trim()).filter(Boolean).join(" ");

    for (const slot of slots) {
      pages.push({
        pageWidthMm: format.pageWidthMm,
        pageHeightMm: format.pageHeightMm,
        slotOffsetXMm: slot.x,
        slotOffsetYMm: slot.y,
        widthMm: slot.w,
        heightMm: slot.h,
        headerText,
        titleText: input.titleText,
        artistText: input.artistText,
        extraTitles: input.extraTitles,
        qrDataUrl,
        stampSrc: stampAsset.dataUrl,
        stampAspect: stampAsset.aspect,
        stampWidthMm,
        logoSrc,
      });
    }
  }

  const blob = await pdf(createElement(CartelPdfDocument, { pages })).toBlob();
  return URL.createObjectURL(blob);
}
