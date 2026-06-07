export type SupabasePlanName = "Free" | "Pro";

/** Tarifs Supabase (USD/mois par projet, hors usage dépassement). */
export const SUPABASE_PLAN_AMOUNTS: Record<SupabasePlanName, number> = {
  Free: 0,
  Pro: 25,
};

export function isSupabasePlanName(value: unknown): value is SupabasePlanName {
  return value === "Free" || value === "Pro";
}

export function supabasePlanAmount(plan: SupabasePlanName): number {
  return SUPABASE_PLAN_AMOUNTS[plan];
}

export function nextSupabasePlanToggle(current: SupabasePlanName): SupabasePlanName {
  return current === "Pro" ? "Free" : "Pro";
}
