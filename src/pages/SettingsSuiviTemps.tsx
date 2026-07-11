import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw } from "lucide-react";

import { WakaTimeDashboardCharts } from "@/components/settings/WakaTimeDashboardCharts";
import { CursorGitFilesPanel } from "@/components/settings/CursorGitFilesPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  chartDateFr,
  fetchWakaTimeDashboard,
  formatWakaSeconds,
  summarizeWakaPeriodDaily,
  type WakaTimeDashboard,
} from "@/lib/wakatime";
import { fetchCursorGitStats, type CursorGitStats } from "@/lib/cursorGitStats";
import {
  formatWakaPeriodDate,
  DEFAULT_WAKA_PERIOD,
  getWakaPeriodRange,
  WAKA_PERIODS,
  type WakaPeriod,
} from "@/lib/wakatimePeriod";
import { cn } from "@/lib/utils";

function dateLocale(lang: string): string {
  const code = (lang ?? "fr").slice(0, 2);
  const map: Record<string, string> = {
    fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT",
  };
  return map[code] ?? "fr-FR";
}

export default function SettingsSuiviTemps() {
  const { t, i18n } = useTranslation("settings");
  const location = useLocation();
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = role_id === 1 || role_id === 2 || role_id === 3;

  const [period, setPeriod] = useState<WakaPeriod>(DEFAULT_WAKA_PERIOD);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [data, setData] = useState<WakaTimeDashboard | null>(null);
  const [gitData, setGitData] = useState<CursorGitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [gitLoading, setGitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const loadSeqRef = useRef(0);

  const range = useMemo(
    () => getWakaPeriodRange(period, periodOffset),
    [period, periodOffset],
  );

  const locale = dateLocale(i18n.language);
  const rangeKey = `${range.dateFrom}|${range.dateTo}`;

  useEffect(() => {
    setPeriod(DEFAULT_WAKA_PERIOD);
    setPeriodOffset(0);
    setData(null);
    setGitData(null);
  }, [location.key]);

  const resetLoadedData = useCallback(() => {
    setData(null);
    setGitData(null);
  }, []);

  const beginRangeChange = useCallback(() => {
    setLoading(true);
    setGitLoading(true);
    resetLoadedData();
  }, [resetLoadedData]);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const rangeParams = { dateFrom: range.dateFrom, dateTo: range.dateTo };

    setLoading(true);
    setGitLoading(true);
    setError(null);
    setGitError(null);

    const [wakaResult, gitResult] = await Promise.all([
      fetchWakaTimeDashboard(rangeParams),
      fetchCursorGitStats(rangeParams),
    ]);

    if (seq !== loadSeqRef.current) return;

    setLoading(false);
    setGitLoading(false);

    if (wakaResult.error) {
      setError(wakaResult.error);
      setData(null);
    } else {
      setData(wakaResult.data);
    }

    if (gitResult.error) {
      setGitError(gitResult.error);
      setGitData(null);
    } else {
      setGitData(gitResult.data);
    }
  }, [range.dateFrom, range.dateTo]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, period, periodOffset, load]);

  const dataMatchesRange = data?.range.dateFrom === range.dateFrom
    && data?.range.dateTo === range.dateTo;
  const displayData = dataMatchesRange ? data : null;
  const isLoadingDashboard = loading || gitLoading || (data != null && !dataMatchesRange);

  const periodStats = useMemo(
    () => (displayData
      ? summarizeWakaPeriodDaily(displayData.daily ?? [], range.dateFrom, range.dateTo)
      : null),
    [displayData, range.dateFrom, range.dateTo],
  );

  const kpis = useMemo(
    () => (periodStats
      ? [
        {
          label: t("wakatime.kpi_total"),
          value: formatWakaSeconds(periodStats.total_seconds),
          sub: range.dateFrom === range.dateTo
            ? formatWakaPeriodDate(range.dateFrom, locale)
            : t("wakatime.range_label", {
              from: formatWakaPeriodDate(range.dateFrom, locale),
              to: formatWakaPeriodDate(range.dateTo, locale),
            }),
        },
        {
          label: t("wakatime.kpi_avg"),
          value: formatWakaSeconds(periodStats.daily_average_seconds),
          sub: t("wakatime.kpi_avg_sub"),
        },
        {
          label: t("wakatime.kpi_best"),
          value: periodStats.best_day
            ? formatWakaSeconds(periodStats.best_day.seconds)
            : "—",
          sub: periodStats.best_day?.date
            ? chartDateFr(periodStats.best_day.date)
            : t("wakatime.kpi_best_sub"),
        },
        {
          label: t("wakatime.kpi_active_days"),
          value: String(periodStats.active_days),
          sub: t("wakatime.kpi_active_days_sub"),
        },
      ]
      : []),
    [periodStats, range.dateFrom, range.dateTo, locale, t],
  );

  const rangeLabel = range.dateFrom === range.dateTo
    ? formatWakaPeriodDate(range.dateFrom, locale)
    : t("wakatime.range_label", {
      from: formatWakaPeriodDate(range.dateFrom, locale),
      to: formatWakaPeriodDate(range.dateTo, locale),
    });

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden />
              {t("wakatime.back_settings")}
            </Link>
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" aria-hidden />
            {t("wakatime.page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("wakatime.page_sub")}</p>
          {data?.fetched_at && (
            <p className="text-xs text-muted-foreground/80 mt-1">
              {t("wakatime.fetched_at", {
                at: new Date(data.fetched_at).toLocaleString(locale),
              })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          disabled={loading || gitLoading}
          onClick={() => void load()}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <RefreshCw className="h-4 w-4" aria-hidden />}
          {t("wakatime.refresh")}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {WAKA_PERIODS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={period === p ? "default" : "outline"}
              className={cn(period === p && "bg-[#E63946] hover:bg-[#c92f3b]")}
              onClick={() => {
                if (period === p && periodOffset === 0) return;
                beginRangeChange();
                setPeriod(p);
                setPeriodOffset(0);
              }}
            >
              {t(`wakatime.period_${p}`)}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            aria-label={t("wakatime.period_prev")}
            onClick={() => {
              beginRangeChange();
              setPeriodOffset((o) => o - 1);
            }}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="min-w-[12rem] text-center text-xs text-muted-foreground">
            {rangeLabel}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            aria-label={t("wakatime.period_next")}
            disabled={!range.canGoNext}
            onClick={() => {
              beginRangeChange();
              setPeriodOffset((o) => o + 1);
            }}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          {periodOffset !== 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                if (periodOffset === 0) return;
                beginRangeChange();
                setPeriodOffset(0);
              }}
            >
              {t("wakatime.period_current")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {error.includes("WAKATIME_API_KEY") && (
              <span className="block mt-2 text-xs opacity-90">
                {t("wakatime.config_hint")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isLoadingDashboard ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="h-[88px] rounded-xl bg-muted/30 p-4" />
            </Card>
          ))}
        </div>
      ) : displayData ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="glass-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-semibold mt-1 tabular-nums">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <WakaTimeDashboardCharts key={rangeKey} data={displayData} t={t} />

          <Collapsible open={gitPanelOpen} onOpenChange={setGitPanelOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between gap-2"
              >
                <span>{t("wakatime.cursor_git.section_title")}</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 transition-transform", gitPanelOpen && "rotate-180")}
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <CursorGitFilesPanel
                key={rangeKey}
                stats={gitData}
                loading={gitLoading}
                error={gitError}
                cursor={displayData.cursor ?? null}
                cursorLoading={loading}
              />
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : !error ? (
        <p className="text-sm text-center text-muted-foreground py-10">{t("wakatime.empty")}</p>
      ) : null}
    </div>
  );
}
