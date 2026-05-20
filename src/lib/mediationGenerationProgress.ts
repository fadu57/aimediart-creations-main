import { MEDIATION_UI_LANGS, type MediationUiLang } from "@/lib/artworkDescriptionI18n";

export const MEDIATION_LANG_COUNT = MEDIATION_UI_LANGS.length;

/** Plages communes : génération globale et régénération d’un persona (generate-mediation). */
export const MEDIATION_GENERATION_PROGRESS = {
  persist: { end: 5 },
  langs: { start: 5, span: 85 },
  save: { start: 90, end: 100 },
} as const;

/** @deprecated Utiliser MEDIATION_GENERATION_PROGRESS */
export const BULK_PROGRESS = MEDIATION_GENERATION_PROGRESS;

/** @deprecated Utiliser MEDIATION_GENERATION_PROGRESS */
export const REGENERATE_PROGRESS = MEDIATION_GENERATION_PROGRESS;

export function clampMediationPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function mediationPercentLang(langIndex: number, subPercent: number): number {
  const { start, span } = MEDIATION_GENERATION_PROGRESS.langs;
  const slice = span / MEDIATION_LANG_COUNT;
  const sub = Math.max(0, Math.min(100, subPercent));
  return clampMediationPercent(start + slice * langIndex + (slice * sub) / 100);
}

/** Progression pour N étapes (ex. une génération par langue × persona). */
export function mediationPercentByStep(
  stepIndex: number,
  totalSteps: number,
  subPercent: number,
): number {
  const { langs } = MEDIATION_GENERATION_PROGRESS;
  if (totalSteps <= 0) return langs.start;
  const slice = langs.span / totalSteps;
  const sub = Math.max(0, Math.min(100, subPercent));
  return clampMediationPercent(langs.start + slice * stepIndex + (slice * sub) / 100);
}

/** @deprecated Utiliser mediationPercentLang */
export const bulkPercentLang = mediationPercentLang;

/** @deprecated Utiliser mediationPercentLang */
export const regeneratePercentLang = mediationPercentLang;

export function langCodeForProgress(lang: MediationUiLang): string {
  return lang.toUpperCase();
}

/**
 * Avance un sous-pourcentage (0→~92) pendant une promesse longue (HTTP ou poll),
 * puis 100 % à la résolution.
 */
export async function runWithMediationSubProgress<T>(
  fn: () => Promise<T>,
  onSubPercent: (sub: number) => void,
  options?: { intervalMs?: number; maxSub?: number },
): Promise<T> {
  const intervalMs = options?.intervalMs ?? 450;
  const maxSub = options?.maxSub ?? 92;
  let sub = 0;
  onSubPercent(0);
  const timer = window.setInterval(() => {
    sub = Math.min(maxSub, sub + 3);
    onSubPercent(sub);
  }, intervalMs);
  try {
    return await fn();
  } finally {
    window.clearInterval(timer);
    onSubPercent(100);
  }
}
