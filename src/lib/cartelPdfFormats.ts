import { getCartelMinCustomSizeMm } from "@/lib/cartelPdfLayout";

export {
  getCartelMinCustomSizeMm,
  CARTEL_REF_WIDTH_MM,
  CARTEL_REF_HEIGHT_MM,
  cartelScaleForSlot,
} from "@/lib/cartelPdfLayout";

export type CartelPresetFormatId =
  | "a6-portrait"
  | "a6-landscape"
  | "a7-portrait"
  | "a7-landscape"
  | "square-105"
  | "square-85"
  | "square-80"
  | "square-65";

/** Préréglages + format libre (dimensions saisies). */
export type CartelFormatId = CartelPresetFormatId | "custom";

export type CartelFormatGroup = "rectangular" | "square" | "custom";

export type CartelSizeUnit = "mm" | "cm";

export type CartelCustomSizeMm = {
  widthMm: number;
  heightMm: number;
};

/** Choix utilisateur dans le dialogue de format. */
export type CartelFormatSelection = {
  formatId: CartelFormatId;
  customSizeMm?: CartelCustomSizeMm;
};

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

/** Limites raisonnables pour un cartel imprimable (mm). */
export const CARTEL_CUSTOM_MAX_MM = 420;

export function sizeValueToMm(value: number, unit: CartelSizeUnit): number {
  return unit === "cm" ? value * 10 : value;
}

export function sizeValueFromMm(mm: number, unit: CartelSizeUnit): number {
  return unit === "cm" ? mm / 10 : mm;
}

export function formatCustomDimensionsLabel(widthMm: number, heightMm: number, unit: CartelSizeUnit): string {
  const w = sizeValueFromMm(widthMm, unit);
  const h = sizeValueFromMm(heightMm, unit);
  const fmt = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  return `${fmt(w)} × ${fmt(h)} ${unit}`;
}

export function isValidCartelCustomSizeMm(
  size: CartelCustomSizeMm | undefined,
  extraTitleCount = 0,
): size is CartelCustomSizeMm {
  if (!size) return false;
  const { widthMm, heightMm } = size;
  const min = getCartelMinCustomSizeMm(extraTitleCount);
  return (
    Number.isFinite(widthMm) &&
    Number.isFinite(heightMm) &&
    widthMm >= min.widthMm &&
    heightMm >= min.heightMm &&
    widthMm <= CARTEL_CUSTOM_MAX_MM &&
    heightMm <= CARTEL_CUSTOM_MAX_MM
  );
}

/** Ramène les dimensions sous les minima vers les dimensions minimales autorisées. */
export function clampCartelCustomSizeToMinimum(
  size: CartelCustomSizeMm,
  extraTitleCount = 0,
): CartelCustomSizeMm {
  const min = getCartelMinCustomSizeMm(extraTitleCount);
  return {
    widthMm: Math.min(CARTEL_CUSTOM_MAX_MM, Math.max(min.widthMm, size.widthMm)),
    heightMm: Math.min(CARTEL_CUSTOM_MAX_MM, Math.max(min.heightMm, size.heightMm)),
  };
}

export function buildCustomCartelFormat(size: CartelCustomSizeMm): CartelFormatDef {
  const widthMm = Math.round(size.widthMm * 100) / 100;
  const heightMm = Math.round(size.heightMm * 100) / 100;
  return {
    id: "custom",
    group: "custom",
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    cardsPerPage: 1,
    labelKey: "pdf_format_custom",
    dimensionsLabel: formatCustomDimensionsLabel(widthMm, heightMm, "mm"),
  };
}

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
    id: "square-80",
    group: "square",
    pageWidthMm: 80,
    pageHeightMm: 80,
    cardsPerPage: 1,
    labelKey: "pdf_format_square_80",
    dimensionsLabel: "80 × 80 mm",
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

export function getCartelFormat(id: CartelPresetFormatId): CartelFormatDef {
  const format = CARTEL_FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Format cartel inconnu : ${id}`);
  return format;
}

/** Résout un préréglage ou un format libre (dimensions en mm). */
export function resolveCartelFormat(selection: CartelFormatSelection): CartelFormatDef {
  if (selection.formatId === "custom") {
    if (!isValidCartelCustomSizeMm(selection.customSizeMm)) {
      throw new Error("Dimensions personnalisées invalides");
    }
    return buildCustomCartelFormat(selection.customSizeMm);
  }
  return getCartelFormat(selection.formatId);
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
