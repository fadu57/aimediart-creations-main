import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { QR_CODE_PRINT_OPTIONS } from "@/lib/qrCodeScanFriendly";

import {
  resolveCartelFormat,
  getCartelSlots,
  type CartelCustomSizeMm,
  type CartelFormatId,
  type CartelFormatSelection,
  type CartelSlot,
} from "@/lib/cartelPdfFormats";
import { computeCartelLayout, CARTEL_FREE_STAMP_URL } from "@/lib/cartelPdfLayout";
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

/** Charge le stamp et rend le fond blanc transparent. */
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

type CartelAssets = {
  logoImg: HTMLImageElement;
  qrImg: HTMLImageElement;
  stampImg: HTMLImageElement;
  logoWidthMm: number;
  logoHeightMm: number;
};

type CartelContent = {
  titleText: string;
  extraTitles?: string[];
  artistText: string;
  explorationLines: string[];
};

function renderCartelInSlot(
  pdf: jsPDF,
  slot: CartelSlot,
  assets: CartelAssets,
  content: CartelContent,
  strictQrMin: boolean,
): void {
  const { logoImg, qrImg, stampImg, logoWidthMm, logoHeightMm } = assets;

  const layout = computeCartelLayout(pdf, slot, content, { strictQrMin });
  if (!layout) {
    throw new Error("Dimensions trop petites pour afficher le cartel (QR et textes)");
  }

  const {
    centerX,
    stampX,
    stampY,
    stampW,
    stampH,
    headerLines,
    headerFontSize,
    headerBaseline,
    headerLineHeight,
    qrX,
    qrY,
    qrSize,
    titleLines,
    titleFontSize,
    titleLineHeight,
    titleY,
    extraBlocks,
    extraStartY,
    extraGap,
    artistLines,
    artistFontSize,
    artistLineHeight,
    artistY,
  } = layout;

  // Stamp FREE
  pdf.addImage(stampImg, "PNG", stampX, stampY, stampW, stampH, undefined, "NONE");

  pdf.setTextColor(0, 0, 0);
  if (headerLines.length > 0) {
    // Helvetica ≈ Arial (jsPDF standard)
    pdf.setFont("helvetica", "bolditalic");
    pdf.setFontSize(headerFontSize);
    let y = headerBaseline;
    for (const line of headerLines) {
      pdf.text(line, centerX, y, { align: "center" });
      y += headerLineHeight;
    }
  }

  pdf.addImage(qrImg, "PNG", qrX, qrY, qrSize, qrSize, undefined, "NONE");

  const centerLogoW = qrSize * 0.52;
  const centerLogoH = centerLogoW * (logoHeightMm / logoWidthMm);
  const logoPad = Math.max(0.6, qrSize * 0.018);
  const centerLogoX = qrX + (qrSize - centerLogoW) / 2;
  const centerLogoY = qrY + (qrSize - centerLogoH) / 2;
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(
    centerLogoX - logoPad,
    centerLogoY - logoPad,
    centerLogoW + 2 * logoPad,
    centerLogoH + 2 * logoPad,
    Math.max(0.5, qrSize * 0.01),
    Math.max(0.5, qrSize * 0.01),
    "F",
  );
  pdf.addImage(logoImg, "PNG", centerLogoX, centerLogoY, centerLogoW, centerLogoH, undefined, "NONE");

  if (titleLines.length > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(titleFontSize);
    let y = titleY;
    for (const line of titleLines) {
      pdf.text(line, centerX, y, { align: "center" });
      y += titleLineHeight;
    }
  }

  if (extraBlocks.length > 0) {
    let y = extraStartY;
    for (const block of extraBlocks) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(block.fontSize);
      for (const line of block.lines) {
        pdf.text(line, centerX, y, { align: "center" });
        y += block.lineHeight;
      }
      y += extraGap;
    }
  }

  if (artistLines.length > 0) {
    pdf.setFont("helvetica", "bolditalic");
    pdf.setFontSize(artistFontSize);
    let y = artistY;
    for (const line of artistLines) {
      pdf.text(line, centerX, y, { align: "center" });
      y += artistLineHeight;
    }
  }
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
  const strictQrMin = format.id === "custom";

  const pdf = new jsPDF({
    orientation: format.pageWidthMm >= format.pageHeightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [format.pageWidthMm, format.pageHeightMm],
  });

  const headerLogo = await createAimediaHeaderLogoBlockPng();
  const { widthMm: logoWidthMm, heightMm: logoHeightMm } = brandLogoSizeMm();
  const logoImg = await loadImage(headerLogo.dataUrl);
  const stampImg = await loadStampWithTransparency(CARTEL_FREE_STAMP_URL);

  for (let i = 0; i < items.length; i++) {
    const input = items[i];
    if (i > 0) {
      pdf.addPage(
        [format.pageWidthMm, format.pageHeightMm],
        format.pageWidthMm >= format.pageHeightMm ? "landscape" : "portrait",
      );
    }

    const qrDataUrl = await QRCode.toDataURL(input.qrTargetUrl, QR_CODE_PRINT_OPTIONS);
    const qrImg = await loadImage(qrDataUrl);
    const assets: CartelAssets = { logoImg, qrImg, stampImg, logoWidthMm, logoHeightMm };
    const content: CartelContent = {
      titleText: input.titleText,
      extraTitles: input.extraTitles,
      artistText: input.artistText,
      explorationLines: input.explorationLines,
    };

    for (const slot of slots) {
      renderCartelInSlot(pdf, slot, assets, content, strictQrMin);
    }
  }

  return pdf.output("bloburl") as string;
}
