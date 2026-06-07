import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Fournisseurs pour lesquels la sync de coûts est implémentée. */
export const ACTIVE_COST_SYNC_PROVIDER_KEYS = [
  "groq",
  "google_gemini",
  "google_tts",
] as const;

export type ActiveCostSyncProviderKey = typeof ACTIVE_COST_SYNC_PROVIDER_KEYS[number];

export type CostSyncMode = "incremental" | "backfill";

export type ProviderSyncContext = {
  admin: SupabaseClient;
  mode: CostSyncMode;
  /** YYYY-MM-DD inclusif (backfill ou override incremental) */
  dateFrom?: string;
  /** YYYY-MM-DD inclusif */
  dateTo?: string;
  /** Jours glissants pour incremental (défaut 7) */
  days?: number;
  providerKey?: string;
};

export type ProviderSyncBody = {
  provider_key?: string;
  mode?: CostSyncMode;
  date_from?: string;
  date_to?: string;
  days?: number;
};

/** Résout la plage de dates selon le mode. */
export function resolveSyncDateRange(ctx: ProviderSyncContext): { from: string; to: string } {
  const today = new Date();
  const toDate = ctx.dateTo ?? formatYmd(today);

  if (ctx.mode === "backfill") {
    const from = ctx.dateFrom;
    if (!from) {
      throw new Error("mode=backfill requiert date_from (YYYY-MM-DD).");
    }
    return { from, to: toDate };
  }

  // incremental
  if (ctx.dateFrom) {
    return { from: ctx.dateFrom, to: toDate };
  }
  const days = Math.max(1, Math.min(ctx.days ?? 7, 365));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days);
  return { from: formatYmd(start), to: toDate };
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseProviderSyncBody(body: unknown): ProviderSyncBody {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  return {
    provider_key: typeof b.provider_key === "string" ? b.provider_key : undefined,
    mode: b.mode === "backfill" || b.mode === "incremental" ? b.mode : undefined,
    date_from: typeof b.date_from === "string" ? b.date_from : undefined,
    date_to: typeof b.date_to === "string" ? b.date_to : undefined,
    days: typeof b.days === "number" ? b.days : undefined,
  };
}
