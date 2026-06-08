import type { WakaEntity, WakaTimelineRow } from "@/lib/wakatime";

export const WAKA_CHART_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];

export function entityPieData(items: WakaEntity[], max = 8) {
  return items.slice(0, max).map((item, i) => ({
    name: item.name,
    value: Math.round((item.total_seconds / 3600) * 100) / 100,
    seconds: item.total_seconds,
    fill: WAKA_CHART_COLORS[i % WAKA_CHART_COLORS.length],
  }));
}

export function entityBarData(items: WakaEntity[], max = 8) {
  return items.slice(0, max).map((item) => ({
    name: item.name.length > 24 ? `${item.name.slice(0, 22)}…` : item.name,
    fullName: item.name,
    heures: Math.round((item.total_seconds / 3600) * 100) / 100,
  }));
}

export function weekdayBarData(
  weekdays: Array<{ name: string; total_seconds: number }>,
  labels: Record<string, string>,
) {
  const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const byName = new Map(weekdays.map((w) => [w.name, w.total_seconds]));
  return order.map((key) => ({
    day: labels[key] ?? key.slice(0, 3),
    heures: Math.round(((byName.get(key) ?? 0) / 3600) * 100) / 100,
  }));
}

export function formatTimelineTotal(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function timelineHourLabels(): string[] {
  return ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm", "12am"];
}

export function segmentStyle(seg: WakaTimelineRow["segments"][number]) {
  const left = (seg.start_minute / 1440) * 100;
  const width = Math.max(((seg.end_minute - seg.start_minute) / 1440) * 100, 0.15);
  return { left: `${left}%`, width: `${width}%` };
}
