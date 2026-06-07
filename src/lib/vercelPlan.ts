export type VercelPlanName = "Hobby" | "Pro";

export const VERCEL_PLAN_AMOUNTS: Record<VercelPlanName, number> = {
  Hobby: 0,
  Pro: 20,
};

export function parseVercelPlan(value: unknown): VercelPlanName {
  return value === "Pro" ? "Pro" : "Hobby";
}

export function nextVercelPlan(current: VercelPlanName): VercelPlanName {
  return current === "Pro" ? "Hobby" : "Pro";
}

export function firstDayNextMonthLabelFr(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  return day === 1 ? `1er ${month}` : `${day} ${month}`;
}
