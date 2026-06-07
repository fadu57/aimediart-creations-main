export type CursorPlanName = "Pro" | "Pro+";

export const CURSOR_PLAN_AMOUNTS: Record<CursorPlanName, number> = {
  "Pro": 20,
  "Pro+": 60,
};

export function parseCursorPlan(value: unknown): CursorPlanName {
  return value === "Pro" ? "Pro" : "Pro+";
}

export function nextCursorPlan(current: CursorPlanName): CursorPlanName {
  return current === "Pro+" ? "Pro" : "Pro+";
}

export function firstDayNextMonthLabelFr(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  return day === 1 ? `1er ${month}` : `${day} ${month}`;
}
