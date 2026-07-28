import type { jsPDF } from "jspdf";

/**
 * Consignes STRICTES — réf. 80 × 80 mm (sinon × min(côté)/80) :
 *
 * 1. Stamp FREE     : 5 mm du haut, 5 mm de la gauche
 * 2. Header         : 12 mm (1,2 cm) du haut, 12 mm (1,2 cm) de la gauche, aligné à gauche
 * 3. QR + titres    : directement sous le header, vers le bas
 *
 * Taille QR de maquette = 43 mm sur 80×80 (proportion capture) — fixe, non « réduite ».
 */
export const CARTEL_LAYOUT_BASE_MM = 80;
export const CARTEL_STAMP_MARGIN_MM = 5;
export const CARTEL_HEADER_TOP_MM = 12;
export const CARTEL_HEADER_LEFT_MM = 12;

/** Taille native PNG (non tourné) — AABB ≈ 17×14 mm après −32° (capture). */
export const CARTEL_STAMP_NATIVE_W_MM = 16;
export const CARTEL_STAMP_NATIVE_H_MM = (16 * 263) / 557;
export const CARTEL_FREE_STAMP_ROTATION_DEG = -32;

/** QR fixe sur maquette 80×80. */
export const CARTEL_REF_QR_MM = 43;

/** @deprecated aliases */
export const CARTEL_STAMP_BASE_MM = CARTEL_LAYOUT_BASE_MM;
export const CARTEL_REF_STAMP_W_MM = CARTEL_STAMP_NATIVE_W_MM;
export const CARTEL_REF_STAMP_H_MM = CARTEL_STAMP_NATIVE_H_MM;
export const CARTEL_REF_WIDTH_MM = 295;
export const CARTEL_REF_HEIGHT_MM = 420;

/** Typo sur 80×80 (pt). */
export const CARTEL_REF_HEADER_PT = 11;
export const CARTEL_REF_TITLE_PT = 12;
export const CARTEL_REF_EXTRA_PT = 9;
export const CARTEL_REF_ARTIST_PT = 11;

export const CARTEL_HEADER_MIN_PT = 9;
export const CARTEL_TITLE_MIN_PT = 10;
export const CARTEL_EXTRA_TITLE_MIN_PT = 8;
export const CARTEL_ARTIST_MIN_PT = 9;
export const CARTEL_QR_MIN_MM = 35;

const GAP_HEADER_QR_MM = 2;
const GAP_QR_TITLE_MM = 1.5;
const GAP_TITLE_EXTRA_MM = 1.2;
const GAP_EXTRA_BLOCKS_MM = 1;
const GAP_TITLE_ARTIST_MM = 1.5;
const MARGIN_BOTTOM_MM = 4;
const MARGIN_RIGHT_MM = 5;
const LINE_HEIGHT_RATIO = 1.12;
const TEXT_WIDTH_RATIO = 0.88;

type PdfFontStyle = "normal" | "bold" | "italic" | "bolditalic";

export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

export function cartelLineHeightMm(fontPt: number): number {
  return ptToMm(fontPt) * LINE_HEIGHT_RATIO;
}

export function cartelScaleForSlot(slotW: number, slotH: number): number {
  return Math.min(slotW / CARTEL_LAYOUT_BASE_MM, slotH / CARTEL_LAYOUT_BASE_MM);
}

export function getCartelMinCustomSizeMm(extraTitleCount = 0): {
  widthMm: number;
  heightMm: number;
} {
  const s = Math.max(
    CARTEL_HEADER_MIN_PT / CARTEL_REF_HEADER_PT,
    CARTEL_TITLE_MIN_PT / CARTEL_REF_TITLE_PT,
    CARTEL_QR_MIN_MM / CARTEL_REF_QR_MM,
  );
  const extraCount = Math.max(0, Math.floor(extraTitleCount));
  const headerH = cartelLineHeightMm(Math.max(CARTEL_HEADER_MIN_PT, CARTEL_REF_HEADER_PT * s));
  const titleH = 2 * cartelLineHeightMm(Math.max(CARTEL_TITLE_MIN_PT, CARTEL_REF_TITLE_PT * s));
  const extraH =
    extraCount *
    (2 * cartelLineHeightMm(Math.max(CARTEL_EXTRA_TITLE_MIN_PT, CARTEL_REF_EXTRA_PT * s)) +
      GAP_EXTRA_BLOCKS_MM * s);
  const artistH = cartelLineHeightMm(Math.max(CARTEL_ARTIST_MIN_PT, CARTEL_REF_ARTIST_PT * s));
  const contentH =
    CARTEL_HEADER_TOP_MM * s +
    headerH +
    GAP_HEADER_QR_MM * s +
    CARTEL_REF_QR_MM * s +
    GAP_QR_TITLE_MM * s +
    titleH +
    (extraCount > 0 ? GAP_TITLE_EXTRA_MM * s + extraH : 0) +
    GAP_TITLE_ARTIST_MM * s +
    artistH +
    MARGIN_BOTTOM_MM * s;

  return {
    widthMm: Math.ceil(CARTEL_LAYOUT_BASE_MM * s),
    heightMm: Math.ceil(Math.max(CARTEL_LAYOUT_BASE_MM * s, contentH)),
  };
}

export type CartelLayoutSlot = { x: number; y: number; w: number; h: number };

export type CartelLayoutContent = {
  titleText: string;
  extraTitles?: string[];
  artistText: string;
  explorationLines: string[];
};

export type CartelExtraBlock = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
};

export function rotatedStampBoundsMm(
  stampW: number,
  stampH: number,
  rotationDeg = CARTEL_FREE_STAMP_ROTATION_DEG,
): { w: number; h: number } {
  const rad = (Math.abs(rotationDeg) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { w: stampW * c + stampH * s, h: stampW * s + stampH * c };
}

export type CartelComputedLayout = {
  scale: number;
  centerX: number;
  maxTextWidth: number;
  stampX: number;
  stampY: number;
  stampW: number;
  stampH: number;
  stampRotationDeg: number;
  headerX: number;
  headerLines: string[];
  headerFontSize: number;
  headerBaseline: number;
  headerLineHeight: number;
  qrX: number;
  qrY: number;
  qrSize: number;
  titleLines: string[];
  titleFontSize: number;
  titleLineHeight: number;
  titleY: number;
  extraBlocks: CartelExtraBlock[];
  extraStartY: number;
  extraGap: number;
  artistLines: string[];
  artistFontSize: number;
  artistLineHeight: number;
  artistY: number;
};

function setFont(pdf: jsPDF, style: PdfFontStyle, size: number): void {
  pdf.setFont("helvetica", style);
  pdf.setFontSize(size);
}

function fitEllipsis(pdf: jsPDF, text: string, maxWidth: number): string {
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

function wrapUpToTwoLines(
  pdf: jsPDF,
  text: string,
  maxWidth: number,
  style: PdfFontStyle,
  fontSize: number,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  setFont(pdf, style, fontSize);
  const raw = pdf.splitTextToSize(trimmed, maxWidth) as string[];
  if (raw.length <= 2) return raw;
  return [raw[0], fitEllipsis(pdf, raw.slice(1).join(" "), maxWidth)];
}

function wrapSingleLine(
  pdf: jsPDF,
  text: string,
  maxWidth: number,
  style: PdfFontStyle,
  fontSize: number,
): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  setFont(pdf, style, fontSize);
  if (pdf.getTextWidth(trimmed) <= maxWidth) return trimmed;
  return fitEllipsis(pdf, trimmed, maxWidth);
}

export function computeCartelLayout(
  pdf: jsPDF,
  slot: CartelLayoutSlot,
  content: CartelLayoutContent,
  options?: { strictQrMin?: boolean },
): CartelComputedLayout | null {
  const strictQrMin = options?.strictQrMin ?? false;
  const { x: slotX, y: slotY, w: slotW, h: slotH } = slot;
  const centerX = slotX + slotW / 2;
  const k = cartelScaleForSlot(slotW, slotH);
  if (k <= 0) return null;

  // 1) Stamp — 5 mm / 5 mm
  const stampX = slotX + CARTEL_STAMP_MARGIN_MM * k;
  const stampY = slotY + CARTEL_STAMP_MARGIN_MM * k;
  const stampBounds = rotatedStampBoundsMm(
    CARTEL_STAMP_NATIVE_W_MM * k,
    CARTEL_STAMP_NATIVE_H_MM * k,
  );
  const stampW = stampBounds.w;
  const stampH = stampBounds.h;

  // 2) Header — 12 mm / 12 mm
  const headerX = slotX + CARTEL_HEADER_LEFT_MM * k;
  const headerBaseline = slotY + CARTEL_HEADER_TOP_MM * k;
  const headerMaxW = Math.max(8, slotW - CARTEL_HEADER_LEFT_MM * k - MARGIN_RIGHT_MM * k);
  const maxTextWidth = Math.max(10, slotW * TEXT_WIDTH_RATIO);

  const headerFontSize = Math.max(CARTEL_HEADER_MIN_PT, CARTEL_REF_HEADER_PT * k);
  const titleFontSize = Math.max(CARTEL_TITLE_MIN_PT, CARTEL_REF_TITLE_PT * k);
  const extraFontSize = Math.max(CARTEL_EXTRA_TITLE_MIN_PT, CARTEL_REF_EXTRA_PT * k);
  const artistFontSize = Math.max(CARTEL_ARTIST_MIN_PT, CARTEL_REF_ARTIST_PT * k);
  const qrSize = CARTEL_REF_QR_MM * k;

  if (strictQrMin && qrSize < CARTEL_QR_MIN_MM) return null;
  if (qrSize <= 0) return null;

  const headerText = content.explorationLines.map((l) => l.trim()).filter(Boolean).join(" ");
  const headerLine = headerText
    ? wrapSingleLine(pdf, headerText, headerMaxW, "bolditalic", headerFontSize)
    : "";
  const headerLines = headerLine ? [headerLine] : [];
  const headerLineHeight = cartelLineHeightMm(headerFontSize);

  const titleTrim = content.titleText.trim();
  const titleLines = titleTrim
    ? wrapUpToTwoLines(pdf, titleTrim, maxTextWidth, "bold", titleFontSize)
    : [];
  const titleLineHeight = cartelLineHeightMm(titleFontSize);

  const extraTitles = (content.extraTitles ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== titleTrim);
  const extraGap = GAP_EXTRA_BLOCKS_MM * k;
  const extraBlocks: CartelExtraBlock[] = extraTitles.map((text) => ({
    lines: wrapUpToTwoLines(pdf, text, maxTextWidth, "italic", extraFontSize),
    fontSize: extraFontSize,
    lineHeight: cartelLineHeightMm(extraFontSize),
  }));

  const artistLine = wrapSingleLine(
    pdf,
    content.artistText || " ",
    maxTextWidth,
    "bolditalic",
    artistFontSize,
  );
  const artistLines = artistLine ? [artistLine] : [];
  const artistLineHeight = cartelLineHeightMm(artistFontSize);

  // 3) QR sous le header — taille fixe (43 mm × k), puis titres / artiste
  let y =
    headerBaseline +
    headerLines.length * headerLineHeight +
    GAP_HEADER_QR_MM * k;
  const qrX = centerX - qrSize / 2;
  const qrY = y;
  y += qrSize + GAP_QR_TITLE_MM * k;

  const titleY = titleLines.length > 0 ? y + titleLineHeight * 0.85 : y;
  y += titleLines.length * titleLineHeight;

  let extraStartY = y;
  if (extraBlocks.length > 0) {
    y += GAP_TITLE_EXTRA_MM * k;
    const firstLh = extraBlocks[0]?.lineHeight ?? titleLineHeight;
    extraStartY = y + firstLh * 0.85;
    for (const b of extraBlocks) {
      y += b.lines.length * b.lineHeight + extraGap;
    }
  }

  y += GAP_TITLE_ARTIST_MM * k;
  const artistY = artistLines.length > 0 ? y + artistLineHeight * 0.85 : y;

  return {
    scale: k,
    centerX,
    maxTextWidth,
    stampX,
    stampY,
    stampW,
    stampH,
    stampRotationDeg: CARTEL_FREE_STAMP_ROTATION_DEG,
    headerX,
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
  };
}

export const CARTEL_BRAND_RED = "#E63946";
export const CARTEL_FREE_STAMP_URL = "/brand/cartel-free-stamp.png";
