/**
 * Seuil pour les contrôles d'intégrité uniquement (logs historiques sans artwork_id).
 * N'impacte PAS la fiabilité des totaux globaux (coût, tokens, appels).
 */
export const COST_INTEGRITY_HISTORICAL_CUTOFF_ISO = "2026-07-11T12:00:00.000Z";

export function isAfterIntegrityCutoff(createdAt: string | null | undefined): boolean {
  if (!createdAt?.trim()) return true;
  return createdAt >= COST_INTEGRITY_HISTORICAL_CUTOFF_ISO;
}
