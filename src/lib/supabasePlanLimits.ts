/**
 * Limites forfait Supabase (réf. https://supabase.com/pricing — Free / Pro).
 * Valeurs indicatives : le compute Pro modifie connexions et RAM.
 */

export type SupabasePlanId = "free" | "pro";

export type SupabasePlanLimits = {
  id: SupabasePlanId;
  /** Clé i18n settings.supabase_monitoring.plans.* */
  labelKey: string;
  /** Espace disque base de données inclus */
  database_bytes: number;
  /** Stockage fichiers (Storage) */
  storage_bytes: number;
  /** Bande passante sortante / mois */
  egress_bytes_month: number;
  /** Connexions Postgres directes (compute Micro / Free) */
  max_db_connections: number;
  /** Connexions pooler Supavisor */
  pooler_connections: number;
  /** RAM instance (Micro Free ≈ 512 Mo) — null si variable (Pro) */
  ram_bytes: number | null;
  /** Utilisateurs Auth actifs / mois */
  mau: number;
  /** Seuil d'alerte CPU (%) */
  cpu_warning_percent: number;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const SUPABASE_PLAN_LIMITS: Record<SupabasePlanId, SupabasePlanLimits> = {
  free: {
    id: "free",
    labelKey: "supabase_monitoring.plans.free",
    database_bytes: 500 * MB,
    storage_bytes: 1 * GB,
    egress_bytes_month: 5 * GB,
    max_db_connections: 60,
    pooler_connections: 200,
    ram_bytes: 512 * MB,
    mau: 50_000,
    cpu_warning_percent: 80,
  },
  pro: {
    id: "pro",
    labelKey: "supabase_monitoring.plans.pro",
    database_bytes: 8 * GB,
    storage_bytes: 100 * GB,
    egress_bytes_month: 250 * GB,
    max_db_connections: 200,
    pooler_connections: 400,
    ram_bytes: null,
    mau: 100_000,
    cpu_warning_percent: 80,
  },
};

export type ChartReferenceLine = {
  value: number;
  labelKey: string;
  stroke?: string;
  strokeDasharray?: string;
};

/** Lignes de référence forfait par graphique. */
export function getChartReferenceLines(
  chartId: string,
  plan: SupabasePlanLimits,
): ChartReferenceLine[] {
  switch (chartId) {
    case "disk-size":
      return [{
        value: plan.database_bytes,
        labelKey: "supabase_monitoring.limits.database_max",
        stroke: "#E63946",
        strokeDasharray: "4 4",
      }];
    case "connections":
      return [{
        value: plan.max_db_connections,
        labelKey: "supabase_monitoring.limits.connections_max",
        stroke: "#E63946",
        strokeDasharray: "4 4",
      }];
    case "ram-usage":
    case "memory-commitment":
      return plan.ram_bytes
        ? [{
          value: plan.ram_bytes,
          labelKey: "supabase_monitoring.limits.ram_max",
          stroke: "#E63946",
          strokeDasharray: "4 4",
        }]
        : [];
    case "cpu-usage":
      return [
        {
          value: plan.cpu_warning_percent,
          labelKey: "supabase_monitoring.limits.cpu_warning",
          stroke: "#f59e0b",
          strokeDasharray: "4 4",
        },
        {
          value: 100,
          labelKey: "supabase_monitoring.limits.cpu_max",
          stroke: "#94a3b8",
          strokeDasharray: "2 2",
        },
      ];
    default:
      return [];
  }
}

export type UsageStatus = "ok" | "warn" | "critical";

export function usageRatio(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(1, Math.max(0, used / limit));
}

export function usageStatus(ratio: number): UsageStatus {
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.75) return "warn";
  return "ok";
}

export const PLAN_STORAGE_KEY = "supabase_monitoring_plan";

export function loadStoredPlanId(): SupabasePlanId {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (raw === "pro" || raw === "free") return raw;
  } catch { /* ignore */ }
  return "free";
}

export function storePlanId(planId: SupabasePlanId): void {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, planId);
  } catch { /* ignore */ }
}
