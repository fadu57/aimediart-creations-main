import { generateMediation, type MediationStyleRequest } from "@/services/mediationService";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";

export type MediationBatchResult = {
  stylesById: Record<string, string>;
  analyseGlobale: string;
};

async function fetchBatch(
  sourceText: string,
  styles: MediationStyleRequest[],
  lang: MediationUiLang,
): Promise<MediationBatchResult> {
  const generated = await generateMediation({ sourceText, styles, lang });
  const stylesById: Record<string, string> = {};
  for (const s of styles) {
    stylesById[s.id] = (generated.stylesById[s.id] ?? "").trim();
  }
  return { stylesById, analyseGlobale: generated.analyseGlobale.trim() };
}

function emptyStyleIds(styles: MediationStyleRequest[], stylesById: Record<string, string>): string[] {
  return styles.filter((s) => !(stylesById[s.id] ?? "").trim()).map((s) => s.id);
}

/**
 * Génère tous les personas demandés en un appel par langue (lot multi-personas côté Edge Function).
 * En cas d'échec partiel : un second lot complet, puis repli persona par persona pour les trous restants.
 */
export async function generatePersonasBatchWithRetry(
  sourceText: string,
  styles: MediationStyleRequest[],
  lang: MediationUiLang,
): Promise<MediationBatchResult> {
  if (styles.length === 0) {
    return { stylesById: {}, analyseGlobale: "" };
  }

  if (styles.length === 1) {
    const single = await fetchBatch(sourceText, styles, lang);
    if (emptyStyleIds(styles, single.stylesById).length === 0) return single;
    const retry = await fetchBatch(sourceText, styles, lang);
    return {
      stylesById: {
        [styles[0].id]: retry.stylesById[styles[0].id] || single.stylesById[styles[0].id],
      },
      analyseGlobale: retry.analyseGlobale || single.analyseGlobale,
    };
  }

  let { stylesById, analyseGlobale } = await fetchBatch(sourceText, styles, lang);
  let missing = emptyStyleIds(styles, stylesById);

  if (missing.length > 0) {
    const retry = await fetchBatch(sourceText, styles, lang);
    if (retry.analyseGlobale) analyseGlobale = retry.analyseGlobale;
    for (const s of styles) {
      const retried = retry.stylesById[s.id];
      if (retried) stylesById[s.id] = retried;
    }
    missing = emptyStyleIds(styles, stylesById);
  }

  for (const id of missing) {
    const style = styles.find((s) => s.id === id);
    if (!style) continue;
    const single = await fetchBatch(sourceText, [style], lang);
    if (single.stylesById[id]) stylesById[id] = single.stylesById[id];
    if (!analyseGlobale && single.analyseGlobale) analyseGlobale = single.analyseGlobale;
  }

  return { stylesById, analyseGlobale };
}
