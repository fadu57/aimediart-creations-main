/**
 * Prépare le texte de médiation stocké pour affichage Markdown visiteur.
 * - Retire les blocs ``` éventuels
 * - Restaure les retours ligne littéraux "\\n"
 */
export function normalizeMediationMarkdownSource(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return "";

  if (t.includes("\\n")) {
    t = t.replace(/\\n/g, "\n");
  }

  const fence = /^```[\w-]*\s*\n?([\s\S]*?)\n?```\s*$/m;
  const m = t.match(fence);
  if (m?.[1]) t = m[1].trim();
  else {
    t = t.replace(/^```[\w-]*\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();
  }

  // L'IA insère parfois des lignes vides excessives entre chaque phrase.
  t = t.replace(/\n{3,}/g, "\n\n");

  return t;
}
