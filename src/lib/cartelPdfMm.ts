/** Conversion millimètres → points PDF (1 pt = 1/72 inch). */
export const MM_TO_PT = 2.83465;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/** Maquette de référence cartel. */
export const CARTEL_LAYOUT_BASE_MM = 80;

/** Échelle uniforme vs maquette 80×80. */
export function cartelScaleFromPageMm(widthMm: number, heightMm: number): number {
  return Math.min(widthMm, heightMm) / CARTEL_LAYOUT_BASE_MM;
}

/**
 * Réduit la taille de police si le texte est trop long pour la largeur utile.
 * Heuristique : ~0,5 × fontSize pt par caractère (Helvetica).
 */
export function fitFontSizePt(
  text: string,
  basePt: number,
  maxWidthPt: number,
  minPt: number,
): number {
  const trimmed = text.trim();
  if (!trimmed || maxWidthPt <= 0) return basePt;
  const avgChar = basePt * 0.5;
  const needed = trimmed.length * avgChar;
  if (needed <= maxWidthPt) return basePt;
  const scaled = basePt * (maxWidthPt / needed);
  return Math.max(minPt, scaled);
}
