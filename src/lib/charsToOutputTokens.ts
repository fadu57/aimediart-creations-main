/**
 * Estime le nombre de tokens de **sortie** Gemini à partir d’un plafond en caractères (français).
 * Les modèles raisonnent en tokens (~3 à 4 caractères par token selon le texte).
 */
export function approxOutputTokensFromMaxChars(maxChars: number): number {
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    return 1200;
  }
  const raw = Math.ceil(maxChars / 3.5);
  return Math.min(4096, Math.max(256, raw));
}
