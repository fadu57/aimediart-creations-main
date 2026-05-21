/**
 * Formats papier partagés entre l’UI (aperçu CSS @page) et l’export PDF navigateur (jsPDF).
 */

/** Formats pris en charge (portrait). */
export const PDF_FORMAT_OPTIONS = [
  { value: "a4" as const },
  { value: "a3" as const },
  { value: "a5" as const },
  { value: "letter" as const },
  { value: "legal" as const },
  { value: "tabloid" as const },
] as const;

export type PdfPaperFormat = (typeof PDF_FORMAT_OPTIONS)[number]["value"];

/** Valeur CSS pour @page { size: … } */
export const PDF_FORMAT_CSS_PAGE: Record<PdfPaperFormat, string> = {
  a4: "A4",
  a3: "A3",
  a5: "A5",
  letter: "letter",
  legal: "legal",
  tabloid: "tabloid",
};
