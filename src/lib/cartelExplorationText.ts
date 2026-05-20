export type OeuvresNavigationMode = "single_scan_sequence" | "same_artist_all_works";

/** Texte d'exploration cartel PDF (2 lignes fixes) selon le mode « type de navigation œuvres ». */
export function cartelExplorationLines(
  mode: string,
  translate: (key: string) => string,
): [string, string] {
  if (mode === "same_artist_all_works") {
    return [translate("pdf_explore_same_artist_line1"), translate("pdf_explore_same_artist_line2")];
  }
  return [translate("pdf_explore_single_scan_line1"), translate("pdf_explore_single_scan_line2")];
}
