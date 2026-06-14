import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MONITORING_CHART_DEFS,
  buildChartRows,
  formatByChart,
  formatBytes,
  formatBytesPerSecond,
  formatChartAxisTime,
  headlineValue,
  type DbMonitoringInfra,
  type MonitoringChartDef,
} from "@/lib/supabaseDbMonitoring";
import {
  getChartReferenceLines,
  SUPABASE_PLAN_LIMITS,
  type SupabasePlanId,
} from "@/lib/supabasePlanLimits";

type Props = {
  infra: DbMonitoringInfra;
  locale: string;
  planId: SupabasePlanId;
};

function seriesLabel(
  chartId: string,
  attribute: string,
  t: (key: string) => string,
): string {
  const key = `supabase_monitoring.series.${chartId}.${attribute}`;
  const translated = t(key);
  return translated !== key ? translated : attribute;
}

function ChartTooltip({
  active,
  payload,
  label,
  chart,
  locale,
  t,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  chart: MonitoringChartDef;
  locale: string;
  t: (key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const timeLabel = typeof label === "string" ? formatChartAxisTime(label, locale) : "";
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      {timeLabel && <p className="mb-1 font-medium text-foreground">{timeLabel}</p>}
      <ul className="space-y-0.5">
        {payload.map((entry) => {
          const v = Number(entry.value ?? 0);
          const name = seriesLabel(chart.id, String(entry.dataKey ?? entry.name ?? ""), t);
          return (
            <li key={String(entry.dataKey)} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto font-medium">{formatByChart(chart.format, v)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function yAxisTick(chart: MonitoringChartDef, v: number): string {
  switch (chart.format) {
    case "bytes":
      return formatBytes(v, 0);
    case "bytesPerSecond":
      return formatBytesPerSecond(v);
    case "percent":
      return `${Math.round(v)}%`;
    case "iops":
      return String(Math.round(v));
    case "count":
      return String(Math.round(v));
    default:
      return String(v);
  }
}

function computeYMax(
  rows: Array<Record<string, string | number | null>>,
  chart: MonitoringChartDef,
  refLines: ReturnType<typeof getChartReferenceLines>,
): number | [number, number] {
  if (chart.format === "percent") return [0, 100];

  let max = 0;
  const stacked = chart.series.filter((s) => !s.omitFromStack);
  for (const row of rows) {
    if (stacked.length > 1 && chart.kind === "stackedBar") {
      let stackSum = 0;
      for (const s of stacked) {
        const v = Number(row[s.attribute] ?? 0);
        if (Number.isFinite(v)) stackSum += v;
      }
      max = Math.max(max, stackSum);
    } else {
      for (const s of chart.series) {
        const v = Number(row[s.attribute] ?? 0);
        if (Number.isFinite(v)) max = Math.max(max, v);
      }
    }
  }
  for (const ref of refLines) max = Math.max(max, ref.value);
  return max > 0 ? max * 1.12 : (refLines[0]?.value ?? 1) * 1.12;
}

function MonitoringChartCard({
  chart,
  infra,
  locale,
  planId,
}: {
  chart: MonitoringChartDef;
  infra: DbMonitoringInfra;
  locale: string;
  planId: SupabasePlanId;
}) {
  const { t } = useTranslation("settings");
  const plan = SUPABASE_PLAN_LIMITS[planId];
  const refLines = useMemo(() => getChartReferenceLines(chart.id, plan), [chart.id, plan]);
  const rows = useMemo(() => buildChartRows(infra, chart), [infra, chart]);
  const stackedSeries = chart.series.filter((s) => !s.omitFromStack);
  const headline = headlineValue(infra, chart);
  const yDomain = useMemo(() => computeYMax(rows, chart, refLines), [rows, chart, refLines]);

  if (!rows.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{t(chart.titleKey)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("supabase_monitoring.no_series")}</p>
        </CardContent>
      </Card>
    );
  }

  const commonAxis = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
      <XAxis
        dataKey="period_start"
        tick={{ fontSize: 10 }}
        tickFormatter={(v) => formatChartAxisTime(String(v), locale)}
        minTickGap={24}
      />
      <YAxis
        tick={{ fontSize: 10 }}
        width={58}
        tickFormatter={(v) => yAxisTick(chart, Number(v))}
        domain={Array.isArray(yDomain) ? yDomain : [0, yDomain]}
      />
      <Tooltip
        content={(
          <ChartTooltip chart={chart} locale={locale} t={t} />
        )}
      />
      <Legend
        formatter={(value) => seriesLabel(chart.id, String(value), t)}
        wrapperStyle={{ fontSize: 11 }}
      />
    </>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base font-semibold">{t(chart.titleKey)}</CardTitle>
          {headline && (
            <span className="text-sm font-medium text-muted-foreground">{headline}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          {chart.kind === "line" ? (
            <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              {commonAxis}
              {refLines.map((ref) => (
                <ReferenceLine
                  key={ref.labelKey}
                  y={ref.value}
                  stroke={ref.stroke ?? "#E63946"}
                  strokeDasharray={ref.strokeDasharray ?? "4 4"}
                  label={{
                    value: t(ref.labelKey),
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: ref.stroke ?? "#E63946",
                  }}
                />
              ))}
              {stackedSeries.map((s) => (
                <Line
                  key={s.attribute}
                  type="monotone"
                  dataKey={s.attribute}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  name={s.attribute}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              {commonAxis}
              {refLines.map((ref) => (
                <ReferenceLine
                  key={ref.labelKey}
                  y={ref.value}
                  stroke={ref.stroke ?? "#E63946"}
                  strokeDasharray={ref.strokeDasharray ?? "4 4"}
                  label={{
                    value: t(ref.labelKey),
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: ref.stroke ?? "#E63946",
                  }}
                />
              ))}
              {stackedSeries.map((s) => (
                <Bar
                  key={s.attribute}
                  dataKey={s.attribute}
                  stackId={s.stackId ?? "a"}
                  fill={s.color}
                  name={s.attribute}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function SupabaseDbMonitoringCharts({ infra, locale, planId }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {MONITORING_CHART_DEFS.map((chart) => (
        <MonitoringChartCard key={chart.id} chart={chart} infra={infra} locale={locale} planId={planId} />
      ))}
    </div>
  );
}
