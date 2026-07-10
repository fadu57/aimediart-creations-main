/** Référence de mise en page : cartel A6 portrait (105 × 148 mm). */
export const CARTEL_REF_WIDTH_MM = 105;
export const CARTEL_REF_HEIGHT_MM = 148;

export type CartelFormatId =
  | "a6-portrait"
  | "a6-landscape"
  | "a7-portrait"
  | "a7-landscape"
  | "square-105"
  | "square-85"
  | "square-65";

export type CartelFormatGroup = "rectangular" | "square";

export type CartelFormatDef = {
  id: CartelFormatId;
  group: CartelFormatGroup;
  pageWidthMm: number;
  pageHeightMm: number;
  cardsPerPage: number;
  /** Paysage : 1 cartel sur la moitié gauche, 2e impression après retournement feuille. */
  landscapeDuplex?: boolean;
  /** Clé i18n catalogue (pdf_format_*). */
  labelKey: string;
  /** Suffixe dimensions affiché tel quel (ex. « 105 × 148 mm »). */
  dimensionsLabel: string;
};

export const CARTEL_FORMATS: CartelFormatDef[] = [
  {
    id: "a6-portrait",
    group: "rectangular",
    pageWidthMm: 105,
    pageHeightMm: 148,
    cardsPerPage: 1,
    labelKey: "pdf_format_a6_portrait",
    dimensionsLabel: "105 × 148 mm",
  },
  {
    id: "a6-landscape",
    group: "rectangular",
    pageWidthMm: 148,
    pageHeightMm: 105,
    cardsPerPage: 1,
    landscapeDuplex: true,
    labelKey: "pdf_format_a6_landscape",
    dimensionsLabel: "148 × 105 mm",
  },
  {
    id: "a7-portrait",
    group: "rectangular",
    pageWidthMm: 74,
    pageHeightMm: 105,
    cardsPerPage: 1,
    labelKey: "pdf_format_a7_portrait",
    dimensionsLabel: "74 × 105 mm",
  },
  {
    id: "a7-landscape",
    group: "rectangular",
    pageWidthMm: 105,
    pageHeightMm: 74,
    cardsPerPage: 1,
    landscapeDuplex: true,
    labelKey: "pdf_format_a7_landscape",
    dimensionsLabel: "105 × 74 mm",
  },
  {
    id: "square-105",
    group: "square",
    pageWidthMm: 105,
    pageHeightMm: 105,
    cardsPerPage: 1,
    labelKey: "pdf_format_square_105",
    dimensionsLabel: "105 × 105 mm",
  },
  {
    id: "square-85",
    group: "square",
    pageWidthMm: 85,
    pageHeightMm: 85,
    cardsPerPage: 1,
    labelKey: "pdf_format_square_85",
    dimensionsLabel: "85 × 85 mm",
  },
  {
    id: "square-65",
    group: "square",
    pageWidthMm: 65,
    pageHeightMm: 65,
    cardsPerPage: 1,
    labelKey: "pdf_format_square_65",
    dimensionsLabel: "65 × 65 mm",
  },
];

export function getCartelFormat(id: CartelFormatId): CartelFormatDef {
  const format = CARTEL_FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Format cartel inconnu : ${id}`);
  return format;
}

export type CartelSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Emplacement cartel sur la page (demi-page en paysage duplex). */
export function getCartelSlots(format: CartelFormatDef): CartelSlot[] {
  if (format.landscapeDuplex) {
    const slotW = format.pageWidthMm / 2;
    return [{ x: 0, y: 0, w: slotW, h: format.pageHeightMm }];
  }
  return [{ x: 0, y: 0, w: format.pageWidthMm, h: format.pageHeightMm }];
}

/** Échelle uniforme pour adapter le cartel A6 de référence à l'emplacement. */
export function cartelScaleForSlot(slotW: number, slotH: number): number {
  return Math.min(slotW / CARTEL_REF_WIDTH_MM, slotH / CARTEL_REF_HEIGHT_MM);
}
