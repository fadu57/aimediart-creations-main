import type { MediationVisitorStyleCode } from "@/lib/mediationStyleCodes";

/**
 * Accélération légère à la lecture (HTMLAudioElement.playbackRate)
 * pour les personae jugées trop lentes au débit TTS par défaut.
 */
const FASTER_RATES: Readonly<Partial<Record<MediationVisitorStyleCode, number>>> = {
  pote: 1.18,
  expert: 1.15,
  conteur: 1.15,
  "hip-hopeur": 1.18,
};

/** Taux de lecture (1 = normal). Borné pour rester naturel. */
export function playbackRateForMediationStyle(
  styleCode: string | null | undefined,
): number {
  if (!styleCode?.trim()) return 1;
  const rate = FASTER_RATES[styleCode.trim().toLowerCase() as MediationVisitorStyleCode];
  if (typeof rate !== "number" || !Number.isFinite(rate)) return 1;
  return Math.min(1.25, Math.max(0.85, rate));
}
