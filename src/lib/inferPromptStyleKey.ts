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
  return n.includes("analyse") && n.includes("image");
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
  if (n.includes("rap")) return "rap";
  if (n.includes("simple")) return "simple";
  if (n.includes("neutre")) return "neutre";
  return null;
}
