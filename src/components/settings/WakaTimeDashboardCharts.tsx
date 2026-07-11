import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  entityBarData, entityPieData, formatTimelineTotal, segmentStyle,
  timelineHourLabels, weekdayBarData, WAKA_CHART_COLORS,
} from "@/lib/wakatimeCharts";
import {
  formatWakaSeconds, formatWakaChartDayLabel, type WakaEntity, type WakaTimelineRow, type WakaTimeDashboard,
} from "@/lib/wakatime";
import { isCursorEditorName, sumCursorEditorSeconds } from "@/lib/wakatimeCursor";
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function EmptyChart({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-10 text-center">{text}</p>;
}

function HorizontalBarCard({
  title, data, emptyText, hoursLabel, color = "#3b82f6",
}: {
  title: string;
  data: ReturnType<typeof entityBarData>;
  emptyText: string;
  hoursLabel: string;
  color?: string;
}) {
  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[220px]">
        {data.length === 0 ? (
          <EmptyChart text={emptyText} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => [`${v} h`, hoursLabel]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { fullName?: string } | undefined;
                  return row?.fullName ?? "";
                }}
              />
              <Bar dataKey="heures" fill={color} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function DonutCard({
  title, items, emptyText, hoursLabel,
}: {
  title: string;
  items: WakaEntity[];
  emptyText: string;
  hoursLabel: string;
}) {
  const pieData = entityPieData(items, 6);
  const top = items[0]?.name ?? "—";

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[240px]">
        {pieData.length === 0 ? (
          <EmptyChart text={emptyText} />
        ) : (
          <div className="flex h-full items-center gap-2">
            <div className="relative h-full min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v} h`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="max-w-[72px] truncate text-center text-xs font-semibold">{top}</span>
              </div>
            </div>
            <ul className="flex w-[42%] shrink-0 flex-col gap-1.5 text-[11px]">
              {pieData.map((row) => {
                const total = items.reduce((s, i) => s + i.total_seconds, 0) || 1;
                const pct = Math.round((row.seconds / total) * 1000) / 10;
                return (
                  <li key={row.name} className="flex items-start gap-1.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} />
                    <span className="min-w-0 leading-tight">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-muted-foreground">
                        {formatWakaSeconds(row.seconds)} ({pct}%) — {hoursLabel}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineCard({
  title, rows, emptyText,
}: {
  title: string;
  rows: WakaTimelineRow[];
  emptyText: string;
}) {
  const hours = timelineHourLabels();

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyChart text={emptyText} />
        ) : (
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={row.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatTimelineTotal(row.total_seconds)}
                  </span>
                </div>
                <div className="relative h-5 w-full overflow-hidden rounded bg-muted/40">
                  {row.segments.map((seg, si) => (
                    <div
                      key={`${row.name}-${si}`}
                      className="absolute top-0 bottom-0 rounded-sm opacity-90"
                      style={{
                        ...segmentStyle(seg),
                        backgroundColor: WAKA_CHART_COLORS[idx % WAKA_CHART_COLORS.length],
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-1 text-[10px] text-muted-foreground">
              {hours.map((h, i) => (
                <span key={`timeline-hour-${i}`}>{h}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyGaugeCard({
  title, todaySeconds, todayLabel, todayCaption, avgLabel, bestLabel, emptyText,
}: {
  title: string;
  todaySeconds: number;
  todayLabel: string;
  todayCaption: string;
  avgLabel: string;
  bestLabel: string;
  emptyText: string;
}) {
  const gaugeData = useMemo(() => {
    const goalSec = 4 * 3600;
    const pct = Math.min(Math.round((todaySeconds / goalSec) * 100), 100);
    return [{ name: "today", value: pct, fill: "#22c55e" }];
  }, [todaySeconds]);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[260px]">
        {todaySeconds <= 0 ? (
          <EmptyChart text={emptyText} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="relative h-[150px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="85%"
                  innerRadius="70%"
                  outerRadius="100%"
                  startAngle={180}
                  endAngle={0}
                  data={gaugeData}
                  barSize={14}
                >
                  <RadialBar background dataKey="value" cornerRadius={6} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center">
                <span className="text-lg font-semibold tabular-nums">{todayLabel}</span>
                <span className="text-[11px] text-muted-foreground">{todayCaption}</span>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{avgLabel}</p>
            <p className="text-center text-xs text-muted-foreground">{bestLabel}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WakaTimeDashboardCharts({
  data, t,
}: {
  data: WakaTimeDashboard;
  t: TFn;
}) {
  const empty = t("wakatime.empty");
  const hoursLabel = t("wakatime.hours");
  const isSingleDay = data.range.dateFrom === data.range.dateTo;
  const stats = data.stats;

  const projectBar = useMemo(() => entityBarData(stats.projects ?? []), [stats.projects]);
  const categoryBar = useMemo(() => entityBarData(data.categories ?? []), [data.categories]);
  const weekdayChart = useMemo(
    () => weekdayBarData(data.weekdays ?? [], {
      Monday: t("wakatime.weekday_mon"),
      Tuesday: t("wakatime.weekday_tue"),
      Wednesday: t("wakatime.weekday_wed"),
      Thursday: t("wakatime.weekday_thu"),
      Friday: t("wakatime.weekday_fri"),
      Saturday: t("wakatime.weekday_sat"),
      Sunday: t("wakatime.weekday_sun"),
    }),
    [data.weekdays, t],
  );

  const dailyChart = useMemo(
    () => (data.daily ?? []).map((d) => ({
      date: formatWakaChartDayLabel(d.date),
      heures: d.hours,
    })),
    [data.daily],
  );

  const cursorDailyChart = useMemo(
    () => (data.cursor?.daily ?? [])
      .filter((d) => d.seconds > 0)
      .map((d) => ({
        date: formatWakaChartDayLabel(d.date),
        heures: d.hours,
      })),
    [data.cursor?.daily],
  );

  const aiVsHumanChart = useMemo(() => {
    const cursorByDate = new Map(
      (data.cursor?.daily ?? []).map((d) => [d.date, d.hours]),
    );
    return (data.daily ?? []).map((d) => {
      const ia = Math.round((cursorByDate.get(d.date) ?? 0) * 100) / 100;
      const humain = Math.max(0, Math.round((d.hours - ia) * 100) / 100);
      return {
        date: formatWakaChartDayLabel(d.date),
        ia,
        humain,
      };
    });
  }, [data.daily, data.cursor?.daily]);

  const editorSplitChart = useMemo(() => {
    const editors = stats.editors ?? [];
    const cursorSec = sumCursorEditorSeconds(editors);
    const otherSec = editors
      .filter((e) => !isCursorEditorName(e.name))
      .reduce((sum, e) => sum + e.total_seconds, 0);
    const rows = [
      {
        name: "Cursor",
        heures: Math.round((cursorSec / 3600) * 100) / 100,
        fullName: "Cursor",
      },
      {
        name: t("wakatime.chart_other_editors"),
        heures: Math.round((otherSec / 3600) * 100) / 100,
        fullName: t("wakatime.chart_other_editors"),
      },
    ].filter((row) => row.heures > 0);
    return rows;
  }, [stats.editors, t]);

  const hasAiVsHumanData = aiVsHumanChart.some((d) => d.ia > 0 || d.humain > 0);
  const hasCursorDaily = cursorDailyChart.length > 0;
  const hasEditorSplit = editorSplitChart.length > 0;

  const gaugeSeconds = isSingleDay ? data.today.total_seconds : stats.total_seconds;
  const gaugeLabel = formatWakaSeconds(gaugeSeconds);
  const gaugeCaption = isSingleDay
    ? t("wakatime.kpi_today_sub")
    : t("wakatime.kpi_total_sub");
  const avgLabel = t("wakatime.gauge_avg", {
    value: formatWakaSeconds(stats.daily_average_seconds),
  });
  const bestLabel = t("wakatime.gauge_best", {
    value: stats.best_day?.total_seconds
      ? formatWakaSeconds(Number(stats.best_day.total_seconds))
      : "—",
  });

  const xAxisInterval = dailyChart.length > 14 ? Math.max(0, Math.ceil(dailyChart.length / 8) - 1) : 0;

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("wakatime.chart_activity_title")}</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px]">
          {dailyChart.length === 0 ? (
            <EmptyChart text={empty} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="wakaArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={xAxisInterval} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip formatter={(v: number) => [`${v} h`, hoursLabel]} />
                <Area type="monotone" dataKey="heures" stroke="#3b82f6" fill="url(#wakaArea)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card border-[#E63946]/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("wakatime.chart_agents_title")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            {hasCursorDaily ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cursorDailyChart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="cursorAgentArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E63946" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#E63946" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={xAxisInterval} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip formatter={(v: number) => [`${v} h`, hoursLabel]} />
                  <Area
                    type="monotone"
                    dataKey="heures"
                    stroke="#E63946"
                    fill="url(#cursorAgentArea)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : hasEditorSplit ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={editorSplitChart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v} h`, hoursLabel]} />
                  <Bar dataKey="heures" fill="#E63946" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text={t("wakatime.cursor.empty")} />
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("wakatime.chart_ai_title")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            {hasAiVsHumanData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aiVsHumanChart} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={xAxisInterval} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${v} h`,
                      name === "ia" ? t("wakatime.chart_ai_ia_label") : t("wakatime.chart_ai_human_label"),
                    ]}
                  />
                  <Bar dataKey="ia" stackId="mix" fill="#E63946" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="humain" stackId="mix" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text={empty} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HorizontalBarCard
          title={t("wakatime.chart_projects_title")}
          data={projectBar}
          emptyText={empty}
          hoursLabel={hoursLabel}
          color="#3b82f6"
        />
        <HorizontalBarCard
          title={t("wakatime.chart_categories_title")}
          data={categoryBar}
          emptyText={empty}
          hoursLabel={hoursLabel}
          color="#8b5cf6"
        />
      </div>

      {isSingleDay && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TimelineCard
            title={t("wakatime.chart_project_timeline_title")}
            rows={data.project_timeline ?? []}
            emptyText={t("wakatime.empty_today")}
          />
          <TimelineCard
            title={t("wakatime.chart_language_timeline_title")}
            rows={data.language_timeline ?? []}
            emptyText={t("wakatime.empty_today")}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DonutCard title={t("wakatime.chart_editors_title")} items={stats.editors ?? []} emptyText={empty} hoursLabel={hoursLabel} />
        <DonutCard title={t("wakatime.chart_languages_title")} items={stats.languages ?? []} emptyText={empty} hoursLabel={hoursLabel} />
        <DonutCard
          title={t("wakatime.chart_os_title")}
          items={stats.operating_systems ?? data.operating_systems ?? []}
          emptyText={empty}
          hoursLabel={hoursLabel}
        />
        <DonutCard
          title={t("wakatime.chart_machines_title")}
          items={stats.machines ?? data.machines ?? []}
          emptyText={empty}
          hoursLabel={hoursLabel}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyGaugeCard
          title={isSingleDay ? t("wakatime.chart_daily_summary_title") : t("wakatime.kpi_total")}
          todaySeconds={gaugeSeconds}
          todayLabel={gaugeLabel}
          todayCaption={gaugeCaption}
          avgLabel={avgLabel}
          bestLabel={bestLabel}
          emptyText={empty}
        />
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("wakatime.chart_weekdays_title")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {weekdayChart.every((d) => d.heures === 0) ? (
              <EmptyChart text={empty} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayChart} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip formatter={(v: number) => [`${v} h`, hoursLabel]} />
                  <Bar dataKey="heures" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
