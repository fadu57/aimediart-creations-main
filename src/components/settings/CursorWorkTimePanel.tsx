import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Monitor } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatWakaChartDayLabel,
  formatWakaSeconds,
  type WakaCursorBlock,
} from "@/lib/wakatime";

type CursorWorkTimePanelProps = {
  cursor: WakaCursorBlock;
};

export function CursorWorkTimePanel({ cursor }: CursorWorkTimePanelProps) {
  const { t } = useTranslation("settings");

  const chartData = useMemo(
    () =>
      cursor.daily.map((d) => ({
        date: formatWakaChartDayLabel(d.date),
        heures: Math.round((d.seconds / 3600) * 100) / 100,
        seconds: d.seconds,
      })),
    [cursor.daily],
  );

  const hasCursorTime = cursor.total_seconds > 0;
  const xAxisInterval = chartData.length > 14 ? Math.max(0, Math.ceil(chartData.length / 8) - 1) : 0;

  const kpis = [
    {
      label: t("wakatime.cursor.kpi_total"),
      value: cursor.human_readable_total || formatWakaSeconds(cursor.total_seconds),
      sub: t("wakatime.cursor.kpi_total_sub"),
    },
    {
      label: t("wakatime.cursor.kpi_share"),
      value: `${cursor.share_percent} %`,
      sub: t("wakatime.cursor.kpi_share_sub"),
    },
    {
      label: t("wakatime.cursor.kpi_avg"),
      value: cursor.human_readable_daily_average || formatWakaSeconds(cursor.daily_average_seconds),
      sub: t("wakatime.cursor.kpi_avg_sub"),
    },
    {
      label: t("wakatime.cursor.kpi_active_days"),
      value: String(cursor.active_days),
      sub: t("wakatime.cursor.kpi_active_days_sub"),
    },
  ];

  return (
    <section className="space-y-3" aria-labelledby="cursor-worktime-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="cursor-worktime-title"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <Monitor className="h-5 w-5 text-[#E63946]" aria-hidden />
            {t("wakatime.cursor.section_title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("wakatime.cursor.section_sub")}</p>
          {cursor.editor_names.length > 0 ? (
            <p className="text-xs text-muted-foreground/90 mt-1">
              {t("wakatime.cursor.editor_names", { names: cursor.editor_names.join(", ") })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="glass-card border-[#E63946]/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-xl font-semibold mt-1 text-[#E63946]">{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-card border-[#E63946]/15">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("wakatime.cursor.chart_title")}</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px]">
          {!hasCursorTime || chartData.every((d) => d.seconds <= 0) ? (
            <p className="text-sm text-muted-foreground py-10 text-center">{t("wakatime.cursor.empty")}</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="cursorWakaArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E63946" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#E63946" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={xAxisInterval} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip formatter={(v: number) => [`${v} h`, t("wakatime.hours")]} />
                <Area
                  type="monotone"
                  dataKey="heures"
                  stroke="#E63946"
                  fill="url(#cursorWakaArea)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
