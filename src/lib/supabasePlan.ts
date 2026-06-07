export type SupabasePlanName = "Free" | "Pro";

export const SUPABASE_PLAN_AMOUNTS: Record<SupabasePlanName, number> = {
  Free: 0,
  Pro: 25,
};

export function parseSupabasePlan(value: unknown): SupabasePlanName {
  return value === "Pro" ? "Pro" : "Free";
}

export function nextSupabasePlan(current: SupabasePlanName): SupabasePlanName {
  return current === "Pro" ? "Free" : "Pro";
}

export function firstDayNextMonthLabelFr(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  return day === 1 ? `1er ${month}` : `${day} ${month}`;
}
