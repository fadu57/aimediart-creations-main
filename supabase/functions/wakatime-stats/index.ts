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

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDate(d: Date): string {
  return isoDateLocal(d);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDateLocal(d);
}

function clampIsoDate(iso: string): string {
  return iso.slice(0, 10);
}

function buildStatsFromDaily(
  daily: Array<{ date: string; seconds: number; label: string }>,
  dateFrom: string,
  dateTo: string,
): Record<string, unknown> {
  const total_seconds = daily.reduce((sum, d) => sum + d.seconds, 0);
  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(`${dateTo}T12:00:00`).getTime() - new Date(`${dateFrom}T12:00:00`).getTime())
        / (24 * 3600 * 1000),
    ) + 1,
  );
  const daily_average = total_seconds / spanDays;
  const best = daily.reduce<{ date: string; seconds: number; label: string } | null>(
    (bestDay, d) => (!bestDay || d.seconds > bestDay.seconds ? d : bestDay),
    null,
  );

  const formatDuration = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (h === 0) return `${m} mins`;
    if (m === 0) return `${h} hrs`;
    return `${h} hrs ${m} mins`;
  };

  return {
    total_seconds,
    human_readable_total: formatDuration(total_seconds),
    daily_average,
    human_readable_daily_average: formatDuration(daily_average),
    best_day: best && best.seconds > 0
      ? { date: best.date, total_seconds: best.seconds, text: best.label || formatDuration(best.seconds) }
      : null,
    range: `${dateFrom} → ${dateTo}`,
    human_readable_range: `${dateFrom} → ${dateTo}`,
  };
}

async function fetchWakaStats(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, unknown>> {
  if (dateFrom === dateTo) {
    try {
      const dayRes = await wakaGet<{ data?: Record<string, unknown> }>(
        apiKey,
        `/users/current/stats/day/${dateFrom}`,
      );
      if (dayRes.data) return dayRes.data;
    } catch (err) {
      console.warn("[wakatime-stats] stats/day échoué", err);
    }
  }

  try {
    const rangeRes = await wakaGet<{ data?: Record<string, unknown> }>(
      apiKey,
      `/users/current/stats/range/${dateFrom}/${dateTo}`,
    );
    if (rangeRes.data) return rangeRes.data;
  } catch (err) {
    console.warn("[wakatime-stats] stats/range échoué", err);
  }

  return {};
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
  for (const day of daily) {
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

function isCursorEditor(name: string): boolean {
  return /cursor/i.test(name.trim());
}

function formatDurationFr(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function cursorSecondsFromSummaryDay(day: Record<string, unknown>): number {
  const items = day.editors as WakaEntityInput[] | undefined;
  let sec = 0;
  for (const item of items ?? []) {
    const name = String(item.name ?? "").trim();
    if (!isCursorEditor(name)) continue;
    const part = Number(item.total_seconds);
    if (Number.isFinite(part) && part > 0) sec += part;
  }
  return sec;
}

function buildCursorBlock(
  summariesRaw: Array<Record<string, unknown>>,
  daily: Array<{ date: string; seconds: number; hours: number; label: string }>,
  editors: WakaEntity[],
  totalCodingSeconds: number,
  dateFrom: string,
  dateTo: string,
): Record<string, unknown> {
  const cursorDaily = daily.map((d) => {
    const summary = summariesRaw.find((row) => {
      const range = row.range as { date?: string } | undefined;
      return range?.date === d.date;
    });
    const seconds = summary ? cursorSecondsFromSummaryDay(summary) : 0;
    return {
      date: d.date,
      seconds,
      hours: Math.round((seconds / 3600) * 100) / 100,
      label: formatDurationFr(seconds),
    };
  });

  const total_seconds = cursorDaily.reduce((sum, d) => sum + d.seconds, 0)
    || editors.filter((e) => isCursorEditor(e.name)).reduce((sum, e) => sum + e.total_seconds, 0);

  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(`${dateTo}T12:00:00`).getTime() - new Date(`${dateFrom}T12:00:00`).getTime())
        / (24 * 3600 * 1000),
    ) + 1,
  );
  const daily_average_seconds = total_seconds / spanDays;
  const active_days = cursorDaily.filter((d) => d.seconds > 0).length;
  const editor_names = editors.filter((e) => isCursorEditor(e.name)).map((e) => e.name);
  const share_percent = totalCodingSeconds > 0
    ? Math.round((total_seconds / totalCodingSeconds) * 1000) / 10
    : 0;

  return {
    total_seconds,
    human_readable_total: formatDurationFr(total_seconds),
    share_percent,
    daily_average_seconds,
    human_readable_daily_average: formatDurationFr(daily_average_seconds),
    active_days,
    daily: cursorDaily,
    editor_names,
  };
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

    let body: { dateFrom?: string; dateTo?: string } = {};
    try {
      body = (await req.json()) as { dateFrom?: string; dateTo?: string };
    } catch {
      body = {};
    }

    const today = new Date();
    const todayIso = isoDateLocal(today);
    let dateTo = clampIsoDate(body.dateTo ?? todayIso);
    let dateFrom = clampIsoDate(body.dateFrom ?? addDaysIso(dateTo, -6));
    if (dateFrom > dateTo) {
      const tmp = dateFrom;
      dateFrom = dateTo;
      dateTo = tmp;
    }
    const isSingleDay = dateFrom === dateTo;

    const summariesRes = await wakaGet<{ data?: Array<Record<string, unknown>> }>(
      apiKey,
      `/users/current/summaries?start=${dateFrom}&end=${dateTo}`,
    ).catch((err) => {
      console.warn("[wakatime-stats] summaries échoué", err);
      return { data: [] as Array<Record<string, unknown>> };
    });

    const heartbeatsRes = isSingleDay
      ? await wakaGet<{ data?: WakaHeartbeat[] }>(
        apiKey,
        `/users/current/heartbeats?date=${dateFrom}`,
      ).catch(() => ({ data: [] as WakaHeartbeat[] }))
      : { data: [] as WakaHeartbeat[] };

    const summariesRaw = summariesRes.data ?? [];
    const heartbeats = heartbeatsRes.data ?? [];

    const daily = summariesRaw.map((day) => {
      const range = day.range as { date?: string } | undefined;
      const grand = day.grand_total as { total_seconds?: number; text?: string } | undefined;
      const seconds = Number(grand?.total_seconds ?? 0);
      const dayDate = range?.date ?? "";
      if (!dayDate || dayDate < dateFrom || dayDate > dateTo) return null;
      return {
        date: dayDate,
        seconds,
        hours: Math.round((seconds / 3600) * 100) / 100,
        label: grand?.text ?? "",
      };
    }).filter((d): d is { date: string; seconds: number; hours: number; label: string } => d !== null);

    let statsRange = await fetchWakaStats(apiKey, dateFrom, dateTo);
    if (!Number(statsRange.total_seconds ?? 0) && daily.length > 0) {
      statsRange = { ...statsRange, ...buildStatsFromDaily(daily, dateFrom, dateTo) };
    }

    const languages = pickEntities(
      mapEntities(statsRange.languages as WakaEntityInput[]),
      summariesRaw,
      "languages",
      dateFrom,
      dateTo,
    );
    const editors = pickEntities(
      mapEntities(statsRange.editors as WakaEntityInput[]),
      summariesRaw,
      "editors",
      dateFrom,
      dateTo,
    );
    const projects = pickEntities(
      mapEntities(statsRange.projects as WakaEntityInput[]),
      summariesRaw,
      "projects",
      dateFrom,
      dateTo,
    );
    const categories = pickEntities(
      mapEntities(statsRange.categories as WakaEntityInput[]),
      summariesRaw,
      "categories",
      dateFrom,
      dateTo,
    );
    const osList = pickEntities(
      mapEntities(statsRange.operating_systems as WakaEntityInput[]),
      summariesRaw,
      "operating_systems",
      dateFrom,
      dateTo,
    );
    const machines = pickEntities(
      mapEntities(statsRange.machines as WakaEntityInput[]),
      summariesRaw,
      "machines",
      dateFrom,
      dateTo,
    );

    const dayTotal = isSingleDay
      ? daily.find((d) => d.date === dateFrom)
      : null;

    const totalCodingSeconds = Number(statsRange.total_seconds ?? 0);
    const cursor = buildCursorBlock(
      summariesRaw,
      daily,
      editors,
      totalCodingSeconds,
      dateFrom,
      dateTo,
    );

    return jsonResponse({
      stats: {
        total_seconds: Number(statsRange.total_seconds ?? 0),
        human_readable_total: String(statsRange.human_readable_total ?? ""),
        daily_average_seconds: Number(statsRange.daily_average ?? 0),
        human_readable_daily_average: String(statsRange.human_readable_daily_average ?? ""),
        best_day: statsRange.best_day ?? null,
        range: String(statsRange.human_readable_range ?? statsRange.range ?? `${dateFrom} → ${dateTo}`),
        languages,
        projects,
        editors,
        categories,
        operating_systems: osList,
        machines,
      },
      daily,
      today: {
        total_seconds: Number(dayTotal?.seconds ?? 0),
        human_readable_total: String(dayTotal?.label ?? ""),
      },
      categories,
      operating_systems: osList,
      machines,
      weekdays: computeWeekdays(daily),
      project_timeline: isSingleDay ? buildTimelineRows(heartbeats, "project") : [],
      language_timeline: isSingleDay ? buildTimelineRows(heartbeats, "language") : [],
      cursor,
      range: { dateFrom, dateTo },
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wakatime-stats]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
