import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QR_CODE_PRINT_OPTIONS } from "@/lib/qrCodeScanFriendly";

import {
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

/**
 * Maquette de référence : Micro format carré 85 × 85 mm.
 * En-tête gras italique en haut, grand QR centré, titre + artiste dessous,
 * logo AIMEDIArt en bas à droite. Les autres formats scalent uniformément
 * (sw = largeur slot / 85) sans déformer QR ni logo.
 */
function renderCartelInSlot(
  pdf: jsPDF,
  slot: CartelSlot,
  assets: CartelAssets,
  content: CartelContent,
): void {
  const { logoImg, qrImg, logoWidthMm, logoHeightMm } = assets;
  const { titleText, artistText, explorationLines } = content;

  const slotX = slot.x;
  const slotY = slot.y;
  const slotW = slot.w;
  const slotH = slot.h;

  const sw = slotW / 85;
  const margin = 6 * sw;
  const maxTextWidth = slotW - 2 * margin;
  const centerX = slotX + slotW / 2;

  // En-tête « Votre (audio) guide pour cette œuvre » — une ligne ajustée à la largeur.
  const headerText = explorationLines.map((l) => l.trim()).filter(Boolean).join(" ");
  let headerBottom = slotY + 3 * sw;
  if (headerText) {
    let headerFs = 12.5 * sw;
    pdf.setFont("helvetica", "bolditalic");
    pdf.setFontSize(headerFs);
    while (headerFs > 5 && pdf.getTextWidth(headerText) > maxTextWidth) {
      headerFs -= 0.25;
      pdf.setFontSize(headerFs);
    }
    const headerBaseline = slotY + 7 * sw;
    pdf.setTextColor(0, 0, 0);
    pdf.text(headerText, centerX, headerBaseline, { align: "center" });
    headerBottom = headerBaseline + 1.5 * sw;
  }

  // Logo AIMEDIArt en bas à droite (ratio préservé).
  const logoW = 26 * sw;
  const logoH = logoW * (logoHeightMm / logoWidthMm);
  const logoX = slotX + slotW - margin - logoW;
  const logoY = slotY + slotH - 6 * sw - logoH;

  const { lines: titleLines, fontSize: titleFontSize, lineHeight: titleLineHeight } = titleText.trim()
    ? computePdfTitleUpToTwoLines(
        pdf,
        titleText,
        maxTextWidth,
        15 * sw,
        Math.max(7, 9 * sw),
      )
    : { lines: [] as string[], fontSize: 0, lineHeight: 0 };

  const artistFontSize = 12 * sw;
  const artistLineHeight = 4.6 * sw;
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(artistFontSize);
  const artistLines = pdf.splitTextToSize(artistText, maxTextWidth) as string[];

  const gapQrToTitle = titleLines.length > 0 ? 7 * sw : 5 * sw;
  const gapTitleToArtist = titleLines.length > 0 ? 2.5 * sw : 0;
  const textBlockH =
    gapQrToTitle +
    titleLines.length * titleLineHeight +
    gapTitleToArtist +
    artistLines.length * artistLineHeight;

  // QR carré : ~62 % de la largeur, borné par la hauteur restante ; bloc QR + textes
  // centré verticalement entre l'en-tête et le logo.
  const zoneTop = headerBottom + 1 * sw;
  const zoneBottom = logoY - 2 * sw;
  const zoneH = Math.max(0, zoneBottom - zoneTop);
  const qrSize = Math.min(slotW * 0.62, Math.max(15 * sw, zoneH - textBlockH));
  const blockTop = zoneTop + Math.max(0, (zoneH - (qrSize + textBlockH)) / 2);

  const qrX = slotX + (slotW - qrSize) / 2;
  pdf.addImage(qrImg, "PNG", qrX, blockTop, qrSize, qrSize, undefined, "NONE");

  let textY = blockTop + qrSize + gapQrToTitle;
  pdf.setTextColor(0, 0, 0);
  if (titleLines.length > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(titleFontSize);
    pdf.text(titleLines, centerX, textY, { align: "center" });
    textY += titleLines.length * titleLineHeight + gapTitleToArtist;
  }

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(artistFontSize);
  pdf.text(artistLines, centerX, textY, { align: "center" });

  pdf.addImage(logoImg, "PNG", logoX, logoY, logoW, logoH, undefined, "NONE");
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
    renderCartelInSlot(pdf, slot, assets, content);
  }

  return pdf.output("bloburl") as string;
}
