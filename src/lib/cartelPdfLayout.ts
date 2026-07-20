import type { jsPDF } from "jspdf";

/**
 * Maquette de référence : A3 portrait 295 × 420 mm (capture utilisateur).
 * Tous les autres formats = scale uniforme min(w/295, h/420).
 */
export const CARTEL_REF_WIDTH_MM = 295;
export const CARTEL_REF_HEIGHT_MM = 420;

export const CARTEL_REF_STAMP_W_MM = 50;
export const CARTEL_REF_STAMP_H_MM = 20;
export const CARTEL_REF_QR_MM = 220;

/** Polices de référence A3 (pt jsPDF ≈ px demandés). */
export const CARTEL_REF_HEADER_PT = 26;
export const CARTEL_REF_TITLE_PT = 36;
export const CARTEL_REF_EXTRA_PT = 24;
export const CARTEL_REF_ARTIST_PT = 36;

/** Minima absolus (ne jamais descendre en dessous après scale). */
export const CARTEL_HEADER_MIN_PT = 10;
export const CARTEL_TITLE_MIN_PT = 12;
export const CARTEL_EXTRA_TITLE_MIN_PT = 9;
export const CARTEL_ARTIST_MIN_PT = 12;
export const CARTEL_QR_MIN_MM = 35;

/** Espacements verticaux de référence A3 (mm). */
const REF_MARGIN_TOP = 8;
const REF_MARGIN_BOTTOM = 8;
const REF_GAP_STAMP_HEADER = 4;
const REF_GAP_HEADER_QR = 5;
const REF_GAP_QR_TITLE = 6;
const REF_GAP_TITLE_EXTRA = 2.5;
const REF_GAP_EXTRA_BLOCKS = 1.8;
const REF_GAP_EXTRA_ARTIST = 5;
const REF_TEXT_WIDTH_RATIO = 0.82;
const LINE_HEIGHT_RATIO = 1.12;

type PdfFontStyle = "normal" | "bold" | "italic" | "bolditalic";

export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

export function cartelLineHeightMm(fontPt: number): number {
  return ptToMm(fontPt) * LINE_HEIGHT_RATIO;
}

/** Facteur d'échelle par rapport à la maquette A3. */
export function cartelScaleForSlot(slotW: number, slotH: number): number {
  return Math.min(slotW / CARTEL_REF_WIDTH_MM, slotH / CARTEL_REF_HEIGHT_MM);
}

/**
 * Dimensions minimales custom : scale tel que polices ≥ minima et QR ≥ 35 mm.
 */
export function getCartelMinCustomSizeMm(extraTitleCount = 0): {
  widthMm: number;
  heightMm: number;
} {
  const scaleFonts = Math.max(
    CARTEL_HEADER_MIN_PT / CARTEL_REF_HEADER_PT,
    CARTEL_TITLE_MIN_PT / CARTEL_REF_TITLE_PT,
    CARTEL_EXTRA_TITLE_MIN_PT / CARTEL_REF_EXTRA_PT,
    CARTEL_ARTIST_MIN_PT / CARTEL_REF_ARTIST_PT,
    CARTEL_QR_MIN_MM / CARTEL_REF_QR_MM,
  );
  const extraCount = Math.max(0, Math.floor(extraTitleCount));
  // Hauteur contenu à ce scale (estimation) pour ne pas couper les traductions.
  const s = scaleFonts;
  const headerH = cartelLineHeightMm(Math.max(CARTEL_HEADER_MIN_PT, CARTEL_REF_HEADER_PT * s));
  const titleH = 2 * cartelLineHeightMm(Math.max(CARTEL_TITLE_MIN_PT, CARTEL_REF_TITLE_PT * s));
  const extraH =
    extraCount *
    (2 * cartelLineHeightMm(Math.max(CARTEL_EXTRA_TITLE_MIN_PT, CARTEL_REF_EXTRA_PT * s)) +
      REF_GAP_EXTRA_BLOCKS * s);
  const artistH = cartelLineHeightMm(Math.max(CARTEL_ARTIST_MIN_PT, CARTEL_REF_ARTIST_PT * s));
  const contentH =
    REF_MARGIN_TOP * s +
    CARTEL_REF_STAMP_H_MM * s +
    REF_GAP_STAMP_HEADER * s +
    headerH +
    REF_GAP_HEADER_QR * s +
    CARTEL_REF_QR_MM * s +
    REF_GAP_QR_TITLE * s +
    titleH +
    (extraCount > 0 ? REF_GAP_TITLE_EXTRA * s + extraH + REF_GAP_EXTRA_ARTIST * s : REF_GAP_EXTRA_ARTIST * s) +
    artistH +
    REF_MARGIN_BOTTOM * s;

  const widthMm = Math.ceil(CARTEL_REF_WIDTH_MM * s);
  const heightMm = Math.ceil(Math.max(CARTEL_REF_HEIGHT_MM * s, contentH));
  return { widthMm, heightMm };
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

export type CartelComputedLayout = {
  scale: number;
  centerX: number;
  maxTextWidth: number;
  stampX: number;
  stampY: number;
  stampW: number;
  stampH: number;
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

function wrapUpToTwoLines(pdf: jsPDF, text: string, maxWidth: number, style: PdfFontStyle, fontSize: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  setFont(pdf, style, fontSize);
  const raw = pdf.splitTextToSize(trimmed, maxWidth) as string[];
  if (raw.length <= 2) return raw;
  return [raw[0], fitEllipsis(pdf, raw.slice(1).join(" "), maxWidth)];
}

function wrapSingleLine(pdf: jsPDF, text: string, maxWidth: number, style: PdfFontStyle, fontSize: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  setFont(pdf, style, fontSize);
  if (pdf.getTextWidth(trimmed) <= maxWidth) return trimmed;
  return fitEllipsis(pdf, trimmed, maxWidth);
}

function contentHeightAtScale(
  pdf: jsPDF,
  content: CartelLayoutContent,
  scale: number,
  maxTextWidth: number,
): {
  height: number;
  headerLines: string[];
  headerFontSize: number;
  headerLineHeight: number;
  titleLines: string[];
  titleFontSize: number;
  titleLineHeight: number;
  extraBlocks: CartelExtraBlock[];
  extraGap: number;
  artistLines: string[];
  artistFontSize: number;
  artistLineHeight: number;
  stampH: number;
  qrSize: number;
  gaps: {
    stampHeader: number;
    headerQr: number;
    qrTitle: number;
    titleExtra: number;
    extraArtist: number;
  };
} {
  const headerFontSize = Math.max(CARTEL_HEADER_MIN_PT, CARTEL_REF_HEADER_PT * scale);
  const titleFontSize = Math.max(CARTEL_TITLE_MIN_PT, CARTEL_REF_TITLE_PT * scale);
  const extraFontSize = Math.max(CARTEL_EXTRA_TITLE_MIN_PT, CARTEL_REF_EXTRA_PT * scale);
  const artistFontSize = Math.max(CARTEL_ARTIST_MIN_PT, CARTEL_REF_ARTIST_PT * scale);
  const stampH = CARTEL_REF_STAMP_H_MM * scale;
  const qrSize = CARTEL_REF_QR_MM * scale;

  const gaps = {
    stampHeader: REF_GAP_STAMP_HEADER * scale,
    headerQr: REF_GAP_HEADER_QR * scale,
    qrTitle: REF_GAP_QR_TITLE * scale,
    titleExtra: REF_GAP_TITLE_EXTRA * scale,
    extraArtist: REF_GAP_EXTRA_ARTIST * scale,
  };
  const extraGap = REF_GAP_EXTRA_BLOCKS * scale;
  const marginTop = REF_MARGIN_TOP * scale;
  const marginBottom = REF_MARGIN_BOTTOM * scale;

  const headerText = content.explorationLines.map((l) => l.trim()).filter(Boolean).join(" ");
  const headerLine = headerText
    ? wrapSingleLine(pdf, headerText, maxTextWidth, "bolditalic", headerFontSize)
    : "";
  const headerLines = headerLine ? [headerLine] : [];
  const headerLineHeight = cartelLineHeightMm(headerFontSize);

  const titleTrim = content.titleText.trim();
  const titleLines = titleTrim
    ? wrapUpToTwoLines(pdf, titleTrim, maxTextWidth, "bold", titleFontSize)
    : [];
  const titleLineHeight = cartelLineHeightMm(titleFontSize);

  const titleMain = titleTrim;
  const extraTitles = (content.extraTitles ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== titleMain);
  const extraBlocks: CartelExtraBlock[] = extraTitles.map((text) => {
    const lines = wrapUpToTwoLines(pdf, text, maxTextWidth, "italic", extraFontSize);
    return {
      lines,
      fontSize: extraFontSize,
      lineHeight: cartelLineHeightMm(extraFontSize),
    };
  });

  const artistLine = wrapSingleLine(
    pdf,
    content.artistText || " ",
    maxTextWidth,
    "bolditalic",
    artistFontSize,
  );
  const artistLines = artistLine ? [artistLine] : [];
  const artistLineHeight = cartelLineHeightMm(artistFontSize);

  const headerH = headerLines.length * headerLineHeight;
  const titleH = titleLines.length * titleLineHeight;
  const extrasH = extraBlocks.reduce(
    (sum, b) => sum + b.lines.length * b.lineHeight + extraGap,
    0,
  );
  const artistH = artistLines.length * artistLineHeight;

  const height =
    marginTop +
    stampH +
    gaps.stampHeader +
    headerH +
    gaps.headerQr +
    qrSize +
    gaps.qrTitle +
    titleH +
    (extraBlocks.length > 0 ? gaps.titleExtra + extrasH : 0) +
    gaps.extraArtist +
    artistH +
    marginBottom;

  return {
    height,
    headerLines,
    headerFontSize,
    headerLineHeight,
    titleLines,
    titleFontSize,
    titleLineHeight,
    extraBlocks,
    extraGap,
    artistLines,
    artistFontSize,
    artistLineHeight,
    stampH,
    qrSize,
    gaps,
  };
}

/**
 * Layout proportionnel à la maquette A3.
 * Retourne null si mode strict et QR < 35 mm (ou contenu impossible).
 */
export function computeCartelLayout(
  pdf: jsPDF,
  slot: CartelLayoutSlot,
  content: CartelLayoutContent,
  options?: { strictQrMin?: boolean },
): CartelComputedLayout | null {
  const strictQrMin = options?.strictQrMin ?? false;
  const slotX = slot.x;
  const slotY = slot.y;
  const slotW = slot.w;
  const slotH = slot.h;
  const centerX = slotX + slotW / 2;

  let scale = cartelScaleForSlot(slotW, slotH);
  let maxTextWidth = Math.max(10, slotW * REF_TEXT_WIDTH_RATIO);

  // Si trop de traductions : réduire un peu le scale pour tout faire tenir.
  let measured = contentHeightAtScale(pdf, content, scale, maxTextWidth);
  if (measured.height > slotH) {
    let lo = scale * 0.35;
    let hi = scale;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const m = contentHeightAtScale(pdf, content, mid, maxTextWidth);
      if (m.height <= slotH) {
        lo = mid;
        measured = m;
      } else {
        hi = mid;
      }
    }
    scale = lo;
    measured = contentHeightAtScale(pdf, content, scale, maxTextWidth);
  }

  if (strictQrMin && measured.qrSize < CARTEL_QR_MIN_MM) {
    return null;
  }
  if (measured.qrSize <= 0 || measured.height <= 0) return null;

  const stampW = CARTEL_REF_STAMP_W_MM * scale;
  const stampH = measured.stampH;
  const marginTop = REF_MARGIN_TOP * scale;

  // Centrer verticalement le bloc si de la place reste.
  const blockTop = slotY + Math.max(0, (slotH - measured.height) / 2);
  let y = blockTop + marginTop;

  const stampX = centerX - stampW / 2;
  const stampY = y;
  y += stampH + measured.gaps.stampHeader;

  const headerBaseline = y + measured.headerLineHeight * 0.85;
  y += measured.headerLines.length * measured.headerLineHeight + measured.gaps.headerQr;

  const qrSize = measured.qrSize;
  const qrX = centerX - qrSize / 2;
  const qrY = y;
  y += qrSize + measured.gaps.qrTitle;

  const titleY =
    measured.titleLines.length > 0 ? y + measured.titleLineHeight * 0.85 : y;
  y += measured.titleLines.length * measured.titleLineHeight;

  let extraStartY = y;
  if (measured.extraBlocks.length > 0) {
    y += measured.gaps.titleExtra;
    const firstExtraLh = measured.extraBlocks[0]?.lineHeight ?? measured.titleLineHeight;
    extraStartY = y + firstExtraLh * 0.85;
    for (const b of measured.extraBlocks) {
      y += b.lines.length * b.lineHeight + measured.extraGap;
    }
  }

  y += measured.gaps.extraArtist;
  const artistY =
    measured.artistLines.length > 0 ? y + measured.artistLineHeight * 0.85 : y;

  return {
    scale,
    centerX,
    maxTextWidth,
    stampX,
    stampY,
    stampW,
    stampH,
    headerLines: measured.headerLines,
    headerFontSize: measured.headerFontSize,
    headerBaseline,
    headerLineHeight: measured.headerLineHeight,
    qrX,
    qrY,
    qrSize,
    titleLines: measured.titleLines,
    titleFontSize: measured.titleFontSize,
    titleLineHeight: measured.titleLineHeight,
    titleY,
    extraBlocks: measured.extraBlocks,
    extraStartY,
    extraGap: measured.extraGap,
    artistLines: measured.artistLines,
    artistFontSize: measured.artistFontSize,
    artistLineHeight: measured.artistLineHeight,
    artistY,
  };
}

/** Rouge logo / marque AIMEDIArt. */
export const CARTEL_BRAND_RED = "#E63946";

/** Asset stamp FREE (tampon fourni). */
export const CARTEL_FREE_STAMP_URL = "/brand/cartel-free-stamp.png";
