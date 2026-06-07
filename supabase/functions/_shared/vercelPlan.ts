export type VercelPlanName = "Hobby" | "Pro";

/** Tarifs Vercel (USD/mois par siège, hors usage dépassement). */
export const VERCEL_PLAN_AMOUNTS: Record<VercelPlanName, number> = {
  Hobby: 0,
  Pro: 20,
};

export function isVercelPlanName(value: unknown): value is VercelPlanName {
  return value === "Hobby" || value === "Pro";
}

export function vercelPlanAmount(plan: VercelPlanName): number {
  return VERCEL_PLAN_AMOUNTS[plan];
}

export function nextVercelPlanToggle(current: VercelPlanName): VercelPlanName {
  return current === "Pro" ? "Hobby" : "Pro";
}
