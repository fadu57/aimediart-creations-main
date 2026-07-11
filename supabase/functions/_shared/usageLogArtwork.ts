/** Résout l'UUID œuvre depuis une ligne ai_usage_logs (colonne ou metadata). */
export function artworkIdFromUsageLogRow(log: {
  artwork_id?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const direct = log.artwork_id?.trim();
  if (direct) return direct;
  const metaId = log.metadata?.artwork_id;
  return typeof metaId === "string" && metaId.trim() ? metaId.trim() : null;
}

export function isMediationUsageLog(log: {
  metadata?: Record<string, unknown> | null;
}): boolean {
  const op = log.metadata?.operation;
  if (op === "mediation") return true;
  return log.metadata?.source_function === "generate-mediation";
}

export function mediationUsageLogMetadata(artworkId: string | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    source_function: "generate-mediation",
    operation: "mediation",
  };
  if (artworkId) {
    base.artwork_id = artworkId;
    base.text_id = artworkId;
  }
  return base;
}
