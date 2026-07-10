export type OeuvresNavigationMode = "single_scan_sequence" | "same_artist_all_works";

/** En-tête du cartel PDF (1 ligne) selon le mode « type de navigation œuvres ». */
export function cartelExplorationLines(
  mode: string,
  translate: (key: string) => string,
): string[] {
  if (mode === "same_artist_all_works") {
    return [translate("pdf_guide_same_artist")];
  }
  return [translate("pdf_guide_single_scan")];
}
