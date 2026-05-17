import type { PromptStyleLabelFields } from "@/lib/promptStyleLabel";

/**
 * Fait correspondre le libellé affiché en base (ex. « L'Expert », « Le Poète »)
 * aux clés JSON de `artwork_description` (expert, poetique, …).
 */
export function normalizeStyleNameForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Ligne réservée au prompt Gemini « Analyse de l’image » (fiche œuvre) : ne doit pas apparaître comme style de médiation.
 */
export function isImageAnalysisPromptStyleName(name: string | null | undefined): boolean {
  const n = normalizeStyleNameForMatch(name ?? "");
  if (!n) return false;
  if (n === "analyse de l'image" || n === "analyse de l image") return true;
  if (n.includes("analyse") && n.includes("image")) return true;
  if (n.includes("analysis") && n.includes("image")) return true;
  return false;
}

/** Vrai si au moins une colonne de libellé (`name` ou `name_*`) correspond au prompt « analyse d’image ». */
export function isImageAnalysisPromptStyleRow(style: PromptStyleLabelFields): boolean {
  const candidates: (string | null | undefined)[] = [
    style.name_fr,
    style.name_en,
    style.name_de,
    style.name_es,
    style.name_it,
    style.name,
  ];
  return candidates.some((v) => isImageAnalysisPromptStyleName(v));
}

export function inferJsonKeyFromDisplayName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const n = normalizeStyleNameForMatch(name);
  if (!n) return null;
  if (n.includes("poete") || n.includes("poetique")) return "poetique";
  if (n.includes("conteur")) return "conteur";
  if (n.includes("expert")) return "expert";
  if (n.includes("enfant")) return "enfant";
  if (n.includes("ado")) return "ado";
  if (n.includes("hip-hopeur")) return "rap";
  if (n.includes("rap")) return "rap";
  if (n.includes("simple")) return "simple";
  if (n.includes("neutre")) return "neutre";
  return null;
}
