/**
 * Identifiants modèle pour `ai_usage_logs` et agrégation côté client.
 * Aligné sur la normalisation des Edge Functions (strip du préfixe API `models/`).
 */
export function canonicalAiModelIdForUsageLog(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("models/")) {
    s = s.slice("models/".length).trim();
  }
  return s;
}

/** Clé stable pour additionner les lignes de logs (casse ignorée). */
export function usageAggregationKey(raw: string | null | undefined): string {
  return canonicalAiModelIdForUsageLog(raw).toLowerCase();
}
