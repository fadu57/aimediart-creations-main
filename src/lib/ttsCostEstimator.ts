/**
 * Estimation des coûts Google Cloud Text-to-Speech (Neural2) à partir des caractères.
 *
 * Tarif : 16 USD / million de caractères (Neural2).
 * Quota gratuit : 1 000 000 caractères / mois calendaire.
 */

export const GOOGLE_TTS_USD_PER_MILLION_CHARS = 16;
export const GOOGLE_TTS_FREE_CHARS_PER_MONTH = 1_000_000;

export type GoogleTtsCostEstimate = {
  costUsd: number;
  billableChars: number;
  freeCharsApplied: number;
};

/** Mois calendaire YYYY-MM depuis un ISO timestamp. */
export function googleTtsMonthKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

/**
 * Coût USD pour un volume de caractères, compte tenu des caractères
 * déjà consommés dans le même mois (quota gratuit appliqué en tête).
 */
export function estimateGoogleTtsCostUsd(
  characterCount: number,
  monthCharsAlreadyUsed = 0,
): GoogleTtsCostEstimate {
  const chars = Math.max(0, Math.round(characterCount));
  const used = Math.max(0, Math.round(monthCharsAlreadyUsed));
  const freeRemaining = Math.max(0, GOOGLE_TTS_FREE_CHARS_PER_MONTH - used);
  const freeCharsApplied = Math.min(chars, freeRemaining);
  const billableChars = chars - freeCharsApplied;
  const costUsd =
    Math.round((billableChars / 1_000_000) * GOOGLE_TTS_USD_PER_MILLION_CHARS * 1_000_000) /
    1_000_000;

  return { costUsd, billableChars, freeCharsApplied };
}

export type GoogleTtsLogLike = {
  characterCount: number;
  created_at: string;
};

/** Coût total pour une série de logs triés ou non (quota mensuel appliqué chronologiquement). */
export function estimateGoogleTtsCostUsdForLogs(logs: GoogleTtsLogLike[]): number {
  const sorted = [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const monthUsage = new Map<string, number>();
  let total = 0;

  for (const log of sorted) {
    const month = googleTtsMonthKey(log.created_at);
    const already = monthUsage.get(month) ?? 0;
    const { costUsd, billableChars, freeCharsApplied } = estimateGoogleTtsCostUsd(
      log.characterCount,
      already,
    );
    total += costUsd;
    monthUsage.set(month, already + freeCharsApplied + billableChars);
  }

  return Math.round(total * 1_000_000) / 1_000_000;
}
