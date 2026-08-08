import type { jsPDF } from "jspdf";

/**
 * Maquette de référence : carré 80 × 80 mm.
 * Tous les autres formats = scale uniforme k = min(slotW, slotH) / 80.
 * Le bloc 80×k est centré dans le slot (formats rectangulaires inclus).
 *
 * Positions sur 80×80 :
 * - Stamp FREE              : 5 mm / 3 mm
 * - « Votre (audio) guide… » : 15 mm / 15,8 mm (aligné à gauche)
 * - QR-Code                  : 23 mm / 17,6 mm
 * - Taille QR-Code           : 36 mm × 36 mm
 * Titres / artiste : sous le QR, vers le bas.
 */
export const CARTEL_LAYOUT_BASE_MM = 80;

export const CARTEL_STAMP_LEFT_MM = 5;
export const CARTEL_STAMP_TOP_MM = 3;
/** @deprecated alias — marge gauche */
export const CARTEL_STAMP_MARGIN_MM = CARTEL_STAMP_LEFT_MM;
export const CARTEL_HEADER_LEFT_MM = 15;
export const CARTEL_HEADER_TOP_MM = 15.8;
export const CARTEL_QR_LEFT_MM = 23;
export const CARTEL_QR_TOP_MM = 17.6;
export const CARTEL_QR_SIZE_MM = 36;

/** Taille native PNG (non tourné) — ratio asset 557×263. */
export const CARTEL_STAMP_NATIVE_W_MM = 16;
export const CARTEL_STAMP_NATIVE_H_MM = (16 * 263) / 557;
export const CARTEL_FREE_STAMP_ROTATION_DEG = -32;

/** @deprecated aliases */
export const CARTEL_STAMP_BASE_MM = CARTEL_LAYOUT_BASE_MM;
export const CARTEL_REF_STAMP_W_MM = CARTEL_STAMP_NATIVE_W_MM;
export const CARTEL_REF_STAMP_H_MM = CARTEL_STAMP_NATIVE_H_MM;
/** Alias historiques — la maquette est désormais 80×80. */
export const CARTEL_REF_WIDTH_MM = CARTEL_LAYOUT_BASE_MM;
export const CARTEL_REF_HEIGHT_MM = CARTEL_LAYOUT_BASE_MM;
export const CARTEL_REF_QR_MM = CARTEL_QR_SIZE_MM;

/** Typo sur 80×80 (pt) — scale proportionnel via k. */
export const CARTEL_REF_HEADER_PT = 11;
export const CARTEL_REF_TITLE_PT = 12;
export const CARTEL_REF_EXTRA_PT = 9;
export const CARTEL_REF_ARTIST_PT = 11;

export const CARTEL_HEADER_MIN_PT = 6;
export const CARTEL_TITLE_MIN_PT = 7;
export const CARTEL_EXTRA_TITLE_MIN_PT = 5;
export const CARTEL_ARTIST_MIN_PT = 6;
/** Seuil QR sur maquette 80×80 (mm) — scale avec k pour les autres formats. */
export const CARTEL_QR_MIN_MM = 30;

const GAP_QR_TITLE_MM = 1.5;
const GAP_TITLE_EXTRA_MM = 1;
const GAP_EXTRA_BLOCKS_MM = 0.8;
const GAP_TITLE_ARTIST_MM = 0.6;
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
    CARTEL_QR_MIN_MM / CARTEL_QR_SIZE_MM,
  );
  const extraCount = Math.max(0, Math.floor(extraTitleCount));
  const titleH = 2 * cartelLineHeightMm(Math.max(CARTEL_TITLE_MIN_PT, CARTEL_REF_TITLE_PT * s));
  const extraH =
    extraCount *
    (2 * cartelLineHeightMm(Math.max(CARTEL_EXTRA_TITLE_MIN_PT, CARTEL_REF_EXTRA_PT * s)) +
      GAP_EXTRA_BLOCKS_MM * s);
  const artistH = cartelLineHeightMm(Math.max(CARTEL_ARTIST_MIN_PT, CARTEL_REF_ARTIST_PT * s));
  const contentBottom =
    CARTEL_QR_TOP_MM * s +
    CARTEL_QR_SIZE_MM * s +
    GAP_QR_TITLE_MM * s +
    titleH +
    (extraCount > 0 ? GAP_TITLE_EXTRA_MM * s + extraH : 0) +
    GAP_TITLE_ARTIST_MM * s +
    artistH +
    4 * s;

  return {
    widthMm: Math.ceil(CARTEL_LAYOUT_BASE_MM * s),
    heightMm: Math.ceil(Math.max(CARTEL_LAYOUT_BASE_MM * s, contentBottom)),
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
  const k = cartelScaleForSlot(slotW, slotH);
  if (k <= 0) return null;

  // Bloc contenu = maquette 80×80 × k, centré dans le slot
  const contentW = CARTEL_LAYOUT_BASE_MM * k;
  const contentH = CARTEL_LAYOUT_BASE_MM * k;
  const originX = slotX + (slotW - contentW) / 2;
  const originY = slotY + (slotH - contentH) / 2;
  const centerX = originX + contentW / 2;

  // Stamp : 5 / 3
  const stampX = originX + CARTEL_STAMP_LEFT_MM * k;
  const stampY = originY + CARTEL_STAMP_TOP_MM * k;
  const stampBounds = rotatedStampBoundsMm(
    CARTEL_STAMP_NATIVE_W_MM * k,
    CARTEL_STAMP_NATIVE_H_MM * k,
  );
  const stampW = stampBounds.w;
  const stampH = stampBounds.h;

  // Header : 15 / 15,8
  const headerX = originX + CARTEL_HEADER_LEFT_MM * k;
  const headerBaseline = originY + CARTEL_HEADER_TOP_MM * k;
  const headerMaxW = Math.max(4, contentW - CARTEL_HEADER_LEFT_MM * k - MARGIN_RIGHT_MM * k);
  const maxTextWidth = Math.max(4, contentW * TEXT_WIDTH_RATIO);

  const headerFontSize = Math.max(CARTEL_HEADER_MIN_PT, CARTEL_REF_HEADER_PT * k);
  const titleFontSize = Math.max(CARTEL_TITLE_MIN_PT, CARTEL_REF_TITLE_PT * k);
  const extraFontSize = Math.max(CARTEL_EXTRA_TITLE_MIN_PT, CARTEL_REF_EXTRA_PT * k);
  const artistFontSize = Math.max(CARTEL_ARTIST_MIN_PT, CARTEL_REF_ARTIST_PT * k);

  // QR : 23 / 17,6 — 36 × 36
  const qrSize = CARTEL_QR_SIZE_MM * k;
  const qrX = originX + CARTEL_QR_LEFT_MM * k;
  const qrY = originY + CARTEL_QR_TOP_MM * k;

  if (strictQrMin && qrSize < CARTEL_QR_MIN_MM * k) return null;
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

  // Titres / artiste sous le QR
  let y = qrY + qrSize + GAP_QR_TITLE_MM * k;
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
