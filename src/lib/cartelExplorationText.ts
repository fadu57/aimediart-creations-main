/** En-tête du cartel PDF (1 ligne) selon la présence d’audios générés. */
export function cartelExplorationLines(
  hasAudio: boolean,
  translate: (key: string) => string,
): string[] {
  return [translate(hasAudio ? "pdf_guide_with_audio" : "pdf_guide_without_audio")];
}
