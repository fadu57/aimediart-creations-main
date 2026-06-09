import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw } from "lucide-react";

import { WakaTimeDashboardCharts } from "@/components/settings/WakaTimeDashboardCharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  chartDateFr,
  fetchWakaTimeDashboard,
  formatWakaSeconds,
  type WakaTimeDashboard,
} from "@/lib/wakatime";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => getWakaPeriodRange(period, periodOffset),
    [period, periodOffset],
  );

  const locale = dateLocale(i18n.language);

  useEffect(() => {
    setPeriod(DEFAULT_WAKA_PERIOD);
    setPeriodOffset(0);
  }, [location.key]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: dash, error: err } = await fetchWakaTimeDashboard({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    });
    setLoading(false);
    if (err) {
      setError(err);
      setData(null);
      return;
    }
    setData(dash);
  }, [range.dateFrom, range.dateTo]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  const stats = data?.stats;
  const activeDays = data?.daily.filter((d) => d.seconds > 0).length ?? 0;

  const kpis = stats
    ? [
      {
        label: t("wakatime.kpi_total"),
        value: stats.human_readable_total || formatWakaSeconds(stats.total_seconds),
        sub: range.dateFrom === range.dateTo
          ? formatWakaPeriodDate(range.dateFrom, locale)
          : t("wakatime.kpi_total_sub"),
      },
      {
        label: t("wakatime.kpi_avg"),
        value: stats.human_readable_daily_average || formatWakaSeconds(stats.daily_average_seconds),
        sub: t("wakatime.kpi_avg_sub"),
      },
      {
        label: t("wakatime.kpi_best"),
        value: stats.best_day?.text
          ?? (stats.best_day?.total_seconds
            ? formatWakaSeconds(Number(stats.best_day.total_seconds))
            : "—"),
        sub: stats.best_day?.date
          ? chartDateFr(String(stats.best_day.date))
          : t("wakatime.kpi_best_sub"),
      },
      {
        label: t("wakatime.kpi_active_days"),
        value: String(activeDays),
        sub: t("wakatime.kpi_active_days_sub"),
      },
    ]
    : [];

  const rangeLabel = range.dateFrom === range.dateTo
    ? formatWakaPeriodDate(range.dateFrom, locale)
    : t("wakatime.range_label", {
      from: formatWakaPeriodDate(range.dateFrom, locale),
      to: formatWakaPeriodDate(range.dateTo, locale),
    });

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
          disabled={loading}
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
            onClick={() => setPeriodOffset((o) => o - 1)}
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
            onClick={() => setPeriodOffset((o) => o + 1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          {periodOffset !== 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setPeriodOffset(0)}
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

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="glass-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-semibold mt-1">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <WakaTimeDashboardCharts data={data} t={t} />
        </>
      ) : null}
    </div>
  );
}
