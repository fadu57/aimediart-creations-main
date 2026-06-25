import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ExternalLink, GitBranch, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CursorGitStats } from "@/lib/cursorGitStats";
import {
  chartDateFr,
  formatWakaChartDayLabel,
  formatWakaSeconds,
  type WakaCursorBlock,
} from "@/lib/wakatime";

type CursorGitFilesPanelProps = {
  stats: CursorGitStats | null;
  loading: boolean;
  error: string | null;
  cursor: WakaCursorBlock | null;
  cursorLoading?: boolean;
};

export function CursorGitFilesPanel({
  stats,
  loading,
  error,
  cursor,
  cursorLoading = false,
}: CursorGitFilesPanelProps) {
  const { t } = useTranslation("settings");

  const filesChartData = useMemo(
    () =>
      (stats?.daily ?? []).map((d) => ({
        date: chartDateFr(d.date),
        fichiers: d.files_created,
        commits: d.commits,
      })),
    [stats?.daily],
  );

  const hoursChartData = useMemo(
    () =>
      (cursor?.daily ?? [])
        .filter((d) => d.seconds > 0)
        .map((d) => ({
          date: formatWakaChartDayLabel(d.date),
          heures: Math.round((d.seconds / 3600) * 100) / 100,
          seconds: d.seconds,
        })),
    [cursor?.daily],
  );

  const hasDailyHours = hoursChartData.length > 0;
  const hasCursorTime = (cursor?.total_seconds ?? 0) > 0;

  const timeKpis = cursor
    ? [
      {
        label: t("wakatime.cursor.kpi_total"),
        value: cursor.human_readable_total || formatWakaSeconds(cursor.total_seconds),
        sub: t("wakatime.cursor.kpi_total_sub"),
        accent: true,
      },
      {
        label: t("wakatime.cursor.kpi_share"),
        value: `${cursor.share_percent} %`,
        sub: t("wakatime.cursor.kpi_share_sub"),
        accent: true,
      },
      {
        label: t("wakatime.cursor.kpi_avg"),
        value: cursor.human_readable_daily_average || formatWakaSeconds(cursor.daily_average_seconds),
        sub: t("wakatime.cursor.kpi_avg_sub"),
        accent: true,
      },
      {
        label: t("wakatime.cursor.kpi_active_days"),
        value: String(cursor.active_days),
        sub: t("wakatime.cursor.kpi_active_days_sub"),
        accent: true,
      },
    ]
    : [];

  const gitKpis = stats
    ? [
      {
        label: t("wakatime.cursor_git.kpi_commits"),
        value: String(stats.commit_count),
        sub: t("wakatime.cursor_git.kpi_commits_sub"),
        accent: false,
      },
      {
        label: t("wakatime.cursor_git.kpi_files"),
        value: String(stats.files_created_count),
        sub: t("wakatime.cursor_git.kpi_files_sub"),
        accent: false,
      },
      {
        label: t("wakatime.cursor_git.kpi_unique"),
        value: String(stats.unique_files_created),
        sub: t("wakatime.cursor_git.kpi_unique_sub"),
        accent: false,
      },
    ]
    : [];

  const xAxisInterval = hoursChartData.length > 14
    ? Math.max(0, Math.ceil(hoursChartData.length / 8) - 1)
    : 0;

  return (
    <section className="space-y-3" aria-labelledby="cursor-git-title">
      <div>
        <h2
          id="cursor-git-title"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <GitBranch className="h-5 w-5 text-[#E63946]" aria-hidden />
          {t("wakatime.cursor_git.section_title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t("wakatime.cursor_git.section_sub_unified")}</p>
        {stats?.repo ? (
          <p className="text-xs text-muted-foreground/90 mt-1">
            {t("wakatime.cursor_git.repo_label", { repo: stats.repo, branch: stats.branch })}
          </p>
        ) : null}
        {cursor?.editor_names.length ? (
          <p className="text-xs text-muted-foreground/90 mt-0.5">
            {t("wakatime.cursor.editor_names", { names: cursor.editor_names.join(", ") })}
          </p>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {error}
            {error.includes("GITHUB_TOKEN") ? (
              <span className="block mt-2 text-xs opacity-90">{t("wakatime.cursor_git.config_hint")}</span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {(cursorLoading || loading) && !stats && !cursor ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <>
          {timeKpis.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("wakatime.cursor_git.time_section")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {timeKpis.map((kpi) => (
                  <Card key={kpi.label} className="glass-card border-[#E63946]/25">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className="text-xl font-semibold mt-1 text-[#E63946]">{kpi.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {!hasDailyHours && hasCursorTime ? (
                <p className="text-xs text-muted-foreground">{t("wakatime.cursor_git.daily_hours_unavailable")}</p>
              ) : null}
            </div>
          ) : cursorLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("wakatime.cursor_git.time_loading")}
            </div>
          ) : null}

          {hasDailyHours ? (
            <Card className="glass-card border-[#E63946]/15">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("wakatime.cursor.chart_title")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hoursChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                    <defs>
                      <linearGradient id="cursorHoursArea" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#cursorHoursArea)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : null}

          {gitKpis.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("wakatime.cursor_git.files_section")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {gitKpis.map((kpi) => (
                  <Card key={kpi.label} className="glass-card border-[#E63946]/15">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className="text-xl font-semibold mt-1">{kpi.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("wakatime.cursor_git.files_loading")}
            </div>
          ) : null}

          {filesChartData.some((d) => d.fichiers > 0) ? (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("wakatime.cursor_git.chart_title")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filesChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        v,
                        name === "fichiers"
                          ? t("wakatime.cursor_git.tooltip_files")
                          : t("wakatime.cursor_git.tooltip_commits"),
                      ]}
                    />
                    <Bar dataKey="fichiers" fill="#E63946" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : null}

          {stats ? (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("wakatime.cursor_git.commits_title")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {stats.commits.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-4 py-8 text-center">{t("wakatime.cursor_git.empty")}</p>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto divide-y divide-border/60">
                    {stats.commits.map((commit) => (
                      <article key={commit.sha} className="px-4 py-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{commit.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {chartDateFr(commit.date)} · {commit.short_sha} ·{" "}
                              {t("wakatime.cursor_git.files_count", { count: commit.files_added.length })}
                            </p>
                          </div>
                          <a
                            href={commit.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#E63946] hover:underline shrink-0"
                          >
                            GitHub
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </div>
                        {commit.files_added.length > 0 ? (
                          <ul className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] font-mono space-y-0.5 max-h-32 overflow-y-auto">
                            {commit.files_added.map((file) => (
                              <li key={`${commit.sha}-${file}`} className="truncate text-muted-foreground">
                                + {file}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </section>
  );
}
