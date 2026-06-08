import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock, Loader2, RefreshCw } from "lucide-react";

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

export default function SettingsSuiviTemps() {
  const { t } = useTranslation("settings");
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = role_id === 1 || role_id === 2 || role_id === 3;

  const [data, setData] = useState<WakaTimeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: dash, error: err } = await fetchWakaTimeDashboard();
    setLoading(false);
    if (err) {
      setError(err);
      setData(null);
      return;
    }
    setData(dash);
  }, []);

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

  const kpis = data
    ? [
      {
        label: t("wakatime.kpi_7d"),
        value: data.stats7.human_readable_total || formatWakaSeconds(data.stats7.total_seconds),
        sub: data.stats7.range,
      },
      {
        label: t("wakatime.kpi_today"),
        value: data.today.human_readable_total || formatWakaSeconds(data.today.total_seconds),
        sub: t("wakatime.kpi_today_sub"),
      },
      {
        label: t("wakatime.kpi_avg"),
        value: data.stats7.human_readable_daily_average || formatWakaSeconds(data.stats7.daily_average_seconds),
        sub: t("wakatime.kpi_avg_sub"),
      },
      {
        label: t("wakatime.kpi_best"),
        value: data.stats7.best_day?.text
          ?? (data.stats7.best_day?.total_seconds
            ? formatWakaSeconds(Number(data.stats7.best_day.total_seconds))
            : "—"),
        sub: data.stats7.best_day?.date
          ? chartDateFr(String(data.stats7.best_day.date))
          : t("wakatime.kpi_best_sub"),
      },
    ]
    : [];

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
                at: new Date(data.fetched_at).toLocaleString("fr-FR"),
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
