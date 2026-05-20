/**
 * Clés canoniques des styles de médiation (stockage JSON, modale curator, visiteur).
 * Toute l’app doit s’aligner sur cette liste et sur {@link FR_MEDIATION_STYLE_LABELS}.
 */
export const MEDIATION_VISITOR_STYLE_CODES = [
  "simple",
  "poetique",
  "expert",
  "senior",
  "pote",
  "conteur",
  "hip-hopeur",
  "enfant",
] as const;

export type MediationVisitorStyleCode = (typeof MEDIATION_VISITOR_STYLE_CODES)[number];

/** Libellés FR de secours si aucune ligne `prompt_style` ne correspond au code canonique. */
export const FR_MEDIATION_STYLE_LABELS: Readonly<Record<MediationVisitorStyleCode, string>> = {
  simple: "Simple",
  poetique: "Poétique",
  expert: "Expert",
  senior: "Senior",
  pote: "Pote",
  conteur: "Conteur",
  "hip-hopeur": "Hip-hopeur",
  enfant: "Enfant",
};

export const CANONICAL_MEDIATION_STYLE_SET = new Set<string>(MEDIATION_VISITOR_STYLE_CODES);
