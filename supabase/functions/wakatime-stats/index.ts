/**
 * wakatime-stats — proxy sécurisé vers l'API WakaTime (clé côté serveur).
 * POST /functions/v1/wakatime-stats
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";

const WAKATIME_BASE = "https://wakatime.com/api/v1";

type WakaEntity = { name: string; total_seconds: number };

type WakaTimelineSegment = { start_minute: number; end_minute: number };

type WakaTimelineRow = {
  name: string;
  total_seconds: number;
  segments: WakaTimelineSegment[];
};

type WakaHeartbeat = {
  time?: number;
  project?: string | null;
  language?: string | null;
};

const HEARTBEAT_TIMEOUT_SEC = 15 * 60;
const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toLocalMinute(unixSec: number): number {
  const d = new Date(unixSec * 1000);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function buildTimelineRows(heartbeats: WakaHeartbeat[], field: "project" | "language"): WakaTimelineRow[] {
  const sorted = heartbeats
    .filter((hb) => typeof hb.time === "number")
    .sort((a, b) => Number(a.time) - Number(b.time));
  if (!sorted.length) return [];

  type RawSeg = { start: number; end: number; name: string };
  const raw: RawSeg[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const hb = sorted[i];
    const next = sorted[i + 1];
    const name = String(hb[field] ?? "—").trim() || "—";
    const start = Number(hb.time);
    const dur = next
      ? Math.min(Math.max(Number(next.time) - start, 0), HEARTBEAT_TIMEOUT_SEC)
      : HEARTBEAT_TIMEOUT_SEC;
    raw.push({ start, end: start + dur, name });
  }

  const byName = new Map<string, { total: number; segments: WakaTimelineSegment[] }>();

  for (const seg of raw) {
    const duration = seg.end - seg.start;
    if (!byName.has(seg.name)) byName.set(seg.name, { total: 0, segments: [] });
    const row = byName.get(seg.name)!;
    row.total += duration;
    const sm = toLocalMinute(seg.start);
    const em = toLocalMinute(seg.end);
    const last = row.segments[row.segments.length - 1];
    if (last && Math.abs(sm - last.end_minute) < HEARTBEAT_TIMEOUT_SEC / 60) {
      last.end_minute = Math.max(last.end_minute, em);
    } else {
      row.segments.push({ start_minute: sm, end_minute: em });
    }
  }

  return [...byName.entries()]
    .map(([name, v]) => ({
      name,
      total_seconds: Math.round(v.total),
      segments: v.segments,
    }))
    .sort((a, b) => b.total_seconds - a.total_seconds)
    .slice(0, 8);
}

function computeWeekdays(daily: Array<{ date: string; seconds: number }>): Array<{ name: string; total_seconds: number }> {
  const totals = new Map<string, number>();
  const last7 = daily.slice(-7);
  for (const day of last7) {
    const d = new Date(`${day.date}T12:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toLocaleDateString("en-US", { weekday: "long" });
    totals.set(key, (totals.get(key) ?? 0) + day.seconds);
  }
  return WEEKDAY_ORDER.map((name) => ({
    name,
    total_seconds: totals.get(name) ?? 0,
  }));
}

function authHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

async function wakaGet<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${WAKATIME_BASE}${path}`, {
    headers: {
      Authorization: authHeader(apiKey),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WakaTime ${res.status} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type WakaEntityInput = { name?: string; total_seconds?: number | string };

const SUMMARY_ENTITY_FIELDS = [
  "languages",
  "editors",
  "projects",
  "categories",
  "operating_systems",
  "machines",
] as const;

type SummaryEntityField = (typeof SUMMARY_ENTITY_FIELDS)[number];

function mapEntities(items: WakaEntityInput[] | undefined): WakaEntity[] {
  return (items ?? [])
    .map((x) => {
      const name = String(x.name ?? "").trim();
      const total_seconds = Number(x.total_seconds);
      if (!name || !Number.isFinite(total_seconds) || total_seconds <= 0) return null;
      return { name, total_seconds };
    })
    .filter((x): x is WakaEntity => x !== null)
    .sort((a, b) => b.total_seconds - a.total_seconds);
}

function aggregateFromSummaries(
  summaries: Array<Record<string, unknown>>,
  field: SummaryEntityField,
  startIso: string,
  endIso: string,
): WakaEntity[] {
  const totals = new Map<string, number>();

  for (const day of summaries) {
    const range = day.range as { date?: string } | undefined;
    const date = range?.date ?? "";
    if (!date || date < startIso || date > endIso) continue;

    const items = day[field] as WakaEntityInput[] | undefined;
    for (const item of items ?? []) {
      const name = String(item.name ?? "").trim();
      const sec = Number(item.total_seconds);
      if (!name || !Number.isFinite(sec) || sec <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + sec);
    }
  }

  return [...totals.entries()]
    .map(([name, total_seconds]) => ({ name, total_seconds }))
    .sort((a, b) => b.total_seconds - a.total_seconds);
}

function pickEntities(
  statsItems: WakaEntity[],
  summaries: Array<Record<string, unknown>>,
  field: SummaryEntityField,
  startIso: string,
  endIso: string,
): WakaEntity[] {
  if (statsItems.length > 0) return statsItems;
  return aggregateFromSummaries(summaries, field, startIso, endIso);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const admin = getServiceRoleClient();
    const auth = await requireAdminUser(req, admin);
    if (!auth.authorized) {
      return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
    }

    const apiKey = Deno.env.get("WAKATIME_API_KEY")?.trim() ?? "";
    if (!apiKey) {
      return jsonResponse({
        error: "not_configured",
        message: "Secret WAKATIME_API_KEY manquant sur la Edge Function.",
      }, 503);
    }

    const today = new Date();
    const start30 = new Date(today);
    start30.setDate(start30.getDate() - 29);

    const todayIso = isoDate(today);

    const [stats7Res, stats30Res, summariesRes, statsTodayRes, heartbeatsRes] = await Promise.all([
      wakaGet<{ data?: Record<string, unknown> }>(apiKey, "/users/current/stats/last_7_days"),
      wakaGet<{ data?: Record<string, unknown> }>(apiKey, "/users/current/stats/last_30_days"),
      wakaGet<{ data?: Array<Record<string, unknown>> }>(
        apiKey,
        `/users/current/summaries?start=${isoDate(start30)}&end=${todayIso}`,
      ),
      wakaGet<{ data?: Record<string, unknown> }>(apiKey, "/users/current/stats/today").catch(() => ({ data: {} })),
      wakaGet<{ data?: WakaHeartbeat[] }>(apiKey, `/users/current/heartbeats?date=${todayIso}`).catch(() => ({ data: [] })),
    ]);

    const stats7 = stats7Res.data ?? {};
    const stats30 = stats30Res.data ?? {};
    const summariesRaw = summariesRes.data ?? [];

    const start7 = new Date(today);
    start7.setDate(start7.getDate() - 6);
    const start7Iso = isoDate(start7);

    const languages7 = pickEntities(
      mapEntities(stats7.languages as WakaEntityInput[]),
      summariesRaw,
      "languages",
      start7Iso,
      todayIso,
    );
    const editors7 = pickEntities(
      mapEntities(stats7.editors as WakaEntityInput[]),
      summariesRaw,
      "editors",
      start7Iso,
      todayIso,
    );
    const projects7 = pickEntities(
      mapEntities(stats7.projects as WakaEntityInput[]),
      summariesRaw,
      "projects",
      start7Iso,
      todayIso,
    );
    const categories7 = pickEntities(
      mapEntities(stats7.categories as WakaEntityInput[]),
      summariesRaw,
      "categories",
      start7Iso,
      todayIso,
    );
    const os7 = pickEntities(
      mapEntities(stats7.operating_systems as WakaEntityInput[]),
      summariesRaw,
      "operating_systems",
      start7Iso,
      todayIso,
    );
    const machines7 = pickEntities(
      mapEntities(stats7.machines as WakaEntityInput[]),
      summariesRaw,
      "machines",
      start7Iso,
      todayIso,
    );

    const daily = summariesRaw.map((day) => {
      const range = day.range as { date?: string } | undefined;
      const grand = day.grand_total as { total_seconds?: number; text?: string } | undefined;
      const seconds = Number(grand?.total_seconds ?? 0);
      return {
        date: range?.date ?? "",
        seconds,
        hours: Math.round((seconds / 3600) * 100) / 100,
        label: grand?.text ?? "",
      };
    }).filter((d) => d.date);

    const statsToday = statsTodayRes.data ?? {};
    const heartbeats = heartbeatsRes.data ?? [];
    const todayFromDaily = daily.find((d) => d.date === todayIso);

    return jsonResponse({
      stats7: {
        total_seconds: Number(stats7.total_seconds ?? 0),
        human_readable_total: String(stats7.human_readable_total ?? ""),
        daily_average_seconds: Number(stats7.daily_average ?? 0),
        human_readable_daily_average: String(stats7.human_readable_daily_average ?? ""),
        best_day: stats7.best_day ?? null,
        range: stats7.human_readable_range ?? stats7.range ?? "7 derniers jours",
        languages: languages7,
        projects: projects7,
        editors: editors7,
        categories: categories7,
        operating_systems: os7,
        machines: machines7,
      },
      stats30: {
        total_seconds: Number(stats30.total_seconds ?? 0),
        human_readable_total: String(stats30.human_readable_total ?? ""),
        daily_average_seconds: Number(stats30.daily_average ?? 0),
        human_readable_daily_average: String(stats30.human_readable_daily_average ?? ""),
        best_day: stats30.best_day ?? null,
        range: stats30.human_readable_range ?? stats30.range ?? "30 derniers jours",
        languages: mapEntities(stats30.languages as Array<{ name?: string; total_seconds?: number }>),
        projects: mapEntities(stats30.projects as Array<{ name?: string; total_seconds?: number }>),
        editors: mapEntities(stats30.editors as Array<{ name?: string; total_seconds?: number }>),
      },
      daily,
      today: {
        total_seconds: Number(statsToday.total_seconds ?? todayFromDaily?.seconds ?? 0),
        human_readable_total: String(
          statsToday.human_readable_total ?? todayFromDaily?.label ?? "",
        ),
      },
      categories: categories7,
      operating_systems: os7,
      machines: machines7,
      weekdays: computeWeekdays(daily),
      project_timeline: buildTimelineRows(heartbeats, "project"),
      language_timeline: buildTimelineRows(heartbeats, "language"),
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wakatime-stats]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
