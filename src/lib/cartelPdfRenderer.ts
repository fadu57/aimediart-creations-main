import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QR_CODE_PRINT_OPTIONS } from "@/lib/qrCodeScanFriendly";

import {
  CARTEL_REF_WIDTH_MM,
  cartelScaleForSlot,
  getCartelFormat,
  getCartelSlots,
  type CartelFormatId,
  type CartelSlot,
} from "@/lib/cartelPdfFormats";
import { brandLogoSizeMm, createAimediaHeaderLogoBlockPng } from "@/lib/pdfHeaderLogoBlock";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function fitPdfLineWithEllipsis(pdf: jsPDF, text: string, maxWidth: number): string {
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  const ell = "\u2026";
  let s = text.replace(/\s+$/, "");
  while (s.length > 0) {
    const candidate = `${s.trimEnd()}${ell}`;
    if (pdf.getTextWidth(candidate) <= maxWidth) return candidate;
    s = s.slice(0, -1);
  }
  return ell;
}

function computePdfTitleUpToTwoLines(
  pdf: jsPDF,
  titleText: string,
  maxTextWidth: number,
  maxFs: number,
  minFs: number,
): { lines: string[]; fontSize: number; lineHeight: number } {
  const lineHeightRatio = 6.8 / 22;

  for (let fs = maxFs; fs >= minFs; fs--) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fs);
    const lines = pdf.splitTextToSize(titleText, maxTextWidth) as string[];
    if (lines.length <= 2) {
      return { lines, fontSize: fs, lineHeight: fs * lineHeightRatio };
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(minFs);
  const lines = pdf.splitTextToSize(titleText, maxTextWidth) as string[];
  if (lines.length <= 2) {
    return { lines, fontSize: minFs, lineHeight: minFs * lineHeightRatio };
  }
  const first = lines[0];
  const rest = lines.slice(1).join(" ");
  const second = fitPdfLineWithEllipsis(pdf, rest, maxTextWidth);
  return {
    lines: [first, second],
    fontSize: minFs,
    lineHeight: minFs * lineHeightRatio,
  };
}

type CartelAssets = {
  logoImg: HTMLImageElement;
  qrImg: HTMLImageElement;
  logoWidthMm: number;
  logoHeightMm: number;
};

type CartelContent = {
  titleText: string;
  artistText: string;
  explorationLines: string[];
};

function renderCartelInSlot(
  pdf: jsPDF,
  slot: CartelSlot,
  assets: CartelAssets,
  content: CartelContent,
  scale: number,
): void {
  const { logoImg, qrImg, logoWidthMm, logoHeightMm } = assets;
  const { titleText, artistText, explorationLines } = content;

  const slotX = slot.x;
  const slotY = slot.y;
  const slotW = slot.w;
  const slotH = slot.h;

  const margin = 10 * scale;
  const bottomSafe = slotY + slotH - margin;
  const maxTextWidth = slotW - 2 * margin;

  const logoMarginY = slotY + 5 * scale;
  const logoMarginX = slotX + 4 * scale;
  // Formats carrés : l’échelle globale suit la hauteur A6 (148 mm) et réduisait le logo
  // plus que le reste ; on aligne sa taille sur la largeur du slot (comme en A6 portrait).
  const logoScale = slotW / CARTEL_REF_WIDTH_MM;
  const scaledLogoW = logoWidthMm * logoScale;
  const scaledLogoH = logoHeightMm * logoScale;
  pdf.addImage(logoImg, "PNG", logoMarginX, logoMarginY, scaledLogoW, scaledLogoH, undefined, "NONE");

  const artistFontSize = 16 * scale;
  const artistLineHeight = 5.2 * scale;
  const explorationFontSize = 14 * scale;
  const explorationLineHeight = 5.5 * scale;
  const explorationGap = 2 * scale;
  const gapQrToTitleMm = 9 * scale;

  const titleMaxFs = 22 * scale;
  const titleMinFs = Math.max(8, 12 * scale);

  const { lines: titleLines, fontSize: titleFontSize, lineHeight: titleLineHeight } = computePdfTitleUpToTwoLines(
    pdf,
    titleText,
    maxTextWidth,
    titleMaxFs,
    titleMinFs,
  );

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(artistFontSize);
  const artistLines = pdf.splitTextToSize(artistText, maxTextWidth) as string[];

  const belowTextBlockHeight =
    gapQrToTitleMm + titleLines.length * titleLineHeight + 1 * scale + artistLines.length * artistLineHeight;

  const contentTop = logoMarginY + scaledLogoH + 4 * scale;
  const contentBottom = bottomSafe - belowTextBlockHeight - 2 * scale;
  const maxQrByWidth = slotW - 2 * margin;
  const availableHeight = Math.max(0, contentBottom - contentTop);
  const qrSize = Math.min(maxQrByWidth * 0.7, availableHeight);

  const qrX = slotX + (slotW - qrSize) / 2;
  const qrY = contentTop + (availableHeight - qrSize) / 2;

  const lines = explorationLines.map((l) => l.trim()).filter(Boolean);
  const showExploration = scale >= 0.42 && lines.length > 0;
  if (showExploration) {
    const textZoneTop = contentTop;
    const textZoneBottom = qrY - explorationGap;
    const midY = textZoneTop + (textZoneBottom - textZoneTop) / 2;
    let explorationStartY = midY - ((lines.length - 1) * explorationLineHeight) / 2;
    const minStart = textZoneTop + 1 * scale;
    const maxStart = textZoneBottom - (lines.length - 1) * explorationLineHeight - 0.5 * scale;
    const safeMax = Math.max(maxStart, minStart);
    explorationStartY = Math.min(Math.max(explorationStartY, minStart), safeMax);

    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "bolditalic");
    pdf.setFontSize(explorationFontSize);
    pdf.text(lines, slotX + slotW / 2, explorationStartY, { align: "center" });
  }

  pdf.addImage(qrImg, "PNG", qrX, qrY, qrSize, qrSize, undefined, "NONE");

  let textY = qrY + qrSize + gapQrToTitleMm;
  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(titleFontSize);
  pdf.text(titleLines, slotX + slotW / 2, textY, { align: "center" });
  textY += titleLines.length * titleLineHeight + 2 * scale;

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(artistFontSize);
  pdf.text(artistLines, slotX + slotW / 2, textY, { align: "center" });
}

export type GenerateCartelPdfInput = {
  formatId: CartelFormatId;
  titleText: string;
  artistText: string;
  explorationLines: string[];
  qrTargetUrl: string;
};

/** Génère le PDF cartel et retourne une URL blob à ouvrir. */
export async function generateCartelPdf(input: GenerateCartelPdfInput): Promise<string> {
  const format = getCartelFormat(input.formatId);
  const slots = getCartelSlots(format);

  const pdf = new jsPDF({
    orientation: format.pageWidthMm >= format.pageHeightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [format.pageWidthMm, format.pageHeightMm],
  });

  const qrDataUrl = await QRCode.toDataURL(input.qrTargetUrl, QR_CODE_PRINT_OPTIONS);

  const headerLogo = await createAimediaHeaderLogoBlockPng();
  const { widthMm: logoWidthMm, heightMm: logoHeightMm } = brandLogoSizeMm();
  const [logoImg, qrImg] = await Promise.all([loadImage(headerLogo.dataUrl), loadImage(qrDataUrl)]);

  const assets: CartelAssets = { logoImg, qrImg, logoWidthMm, logoHeightMm };
  const content: CartelContent = {
    titleText: input.titleText,
    artistText: input.artistText,
    explorationLines: input.explorationLines,
  };

  for (const slot of slots) {
    const scale = cartelScaleForSlot(slot.w, slot.h);
    renderCartelInSlot(pdf, slot, assets, content, scale);
  }

  return pdf.output("bloburl") as string;
}
