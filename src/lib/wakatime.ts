import { supabase } from "@/lib/supabase";

export type WakaEntity = { name: string; total_seconds: number };

export type WakaStatsBlock = {
  total_seconds: number;
  human_readable_total: string;
  daily_average_seconds: number;
  human_readable_daily_average: string;
  best_day: { date?: string; total_seconds?: number; text?: string } | null;
  range: string;
  languages: WakaEntity[];
  projects: WakaEntity[];
  editors: WakaEntity[];
  categories?: WakaEntity[];
  operating_systems?: WakaEntity[];
  machines?: WakaEntity[];
};

export type WakaDailyPoint = {
  date: string;
  seconds: number;
  hours: number;
  label: string;
};

export type WakaTimelineSegment = {
  start_minute: number;
  end_minute: number;
};

export type WakaTimelineRow = {
  name: string;
  total_seconds: number;
  segments: WakaTimelineSegment[];
};

export type WakaTodayBlock = {
  total_seconds: number;
  human_readable_total: string;
};

export type WakaWeekdayPoint = {
  name: string;
  total_seconds: number;
};

export type WakaTimeDashboard = {
  stats: WakaStatsBlock;
  daily: WakaDailyPoint[];
  today: WakaTodayBlock;
  categories: WakaEntity[];
  operating_systems: WakaEntity[];
  machines: WakaEntity[];
  weekdays: WakaWeekdayPoint[];
  project_timeline: WakaTimelineRow[];
  language_timeline: WakaTimelineRow[];
  range: { dateFrom: string; dateTo: string };
  fetched_at: string;
};

async function parseInvokeError(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).text === "function") {
      const text = await (ctx as Response).text().catch(() => "");
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string; details?: string };
          return [json.message, json.error, json.details].filter(Boolean).join(" — ");
        } catch {
          return text;
        }
      }
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Erreur lors de l'appel WakaTime.";
}

export async function fetchWakaTimeDashboard(
  range: { dateFrom: string; dateTo: string },
): Promise<{ data: WakaTimeDashboard | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("wakatime-stats", {
    method: "POST",
    body: { dateFrom: range.dateFrom, dateTo: range.dateTo },
  });
  if (error) {
    return { data: null, error: await parseInvokeError(error) };
  }
  const payload = data as { error?: string; message?: string } | WakaTimeDashboard | null;
  if (!payload || typeof payload !== "object") {
    return { data: null, error: "Réponse WakaTime vide." };
  }
  if ("error" in payload && payload.error) {
    const msg = [payload.message, payload.error].filter(Boolean).join(" — ");
    return { data: null, error: msg || "Erreur WakaTime." };
  }
  const dash = payload as WakaTimeDashboard;
  return {
    data: {
      ...dash,
      stats: dash.stats ?? {
        total_seconds: 0,
        human_readable_total: "",
        daily_average_seconds: 0,
        human_readable_daily_average: "",
        best_day: null,
        range: "",
        languages: [],
        projects: [],
        editors: [],
      },
      today: dash.today ?? { total_seconds: 0, human_readable_total: "" },
      categories: dash.categories?.length ? dash.categories : (dash.stats?.categories ?? []),
      operating_systems: dash.operating_systems?.length
        ? dash.operating_systems
        : (dash.stats?.operating_systems ?? []),
      machines: dash.machines?.length ? dash.machines : (dash.stats?.machines ?? []),
      weekdays: dash.weekdays ?? [],
      project_timeline: dash.project_timeline ?? [],
      language_timeline: dash.language_timeline ?? [],
      range: dash.range ?? { dateFrom: range.dateFrom, dateTo: range.dateTo },
    },
    error: null,
  };
}

export function formatWakaSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 h";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function chartDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/** Libellé axe graphique activité (jj/mm). */
export function formatWakaChartDayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}
