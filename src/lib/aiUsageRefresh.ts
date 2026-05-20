/** Émis après une génération IA qui écrit dans `ai_usage_logs` (Edge Functions). */
export const AI_USAGE_REFRESH_EVENT = "aimediart:ai-usage-updated";

export function dispatchAiUsageRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_USAGE_REFRESH_EVENT));
}
