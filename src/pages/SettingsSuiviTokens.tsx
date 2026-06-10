import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowLeft, ChevronLeft, ChevronRight, Coins, Loader2, RefreshCw } from "lucide-react";

import { AILimitsMonitor } from "@/components/admin/AILimitsMonitor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  breakdownByModel,
  breakdownByProvider,
  fetchTokenUsageDateBounds,
  fetchTokenUsageLogs,
  filterTokenRowsByProvider,
  filterTokenRowsToAnchorDay,
  formatTokenCount,
  listDistinctProviders,
  formatTokenUsageDate,
  formatTokenChartDayLabel,
  formatUsageTableCell,
  getTokenChartRange,
  getTokenFetchRange,
  getTokenPeriodRange,
  jobTypeLabel,
  summarizeTokenUsage,
  tokenTimeSeries,
  type TokenPeriod,
} from "@/lib/aiTokenUsage";
import { cn } from "@/lib/utils";

const PERIODS: TokenPeriod[] = ["day", "week", "month"];
const ALL_PROVIDERS = "all";

function dateLocale(lang: string): string {
  const code = (lang ?? "fr").slice(0, 2);
  const map: Record<string, string> = {
    fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT",
  };
  return map[code] ?? "fr-FR";
}

/** Filtre tokens → filtre limites (ai_provider_limits : groq / gemini uniquement). */
function limitsProviderFromTokenFilter(filter: string): string | undefined {
  if (filter === ALL_PROVIDERS) return undefined;
  if (filter === "google_gemini") return "gemini";
  if (filter === "google_tts" || filter === "openai") return undefined;
  return filter;
}


export default function SettingsSuiviTokens() {
  const { t, i18n } = useTranslation("settings");
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = role_id === 1 || role_id === 2 || role_id === 3;

  const [period, setPeriod] = useState<TokenPeriod>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchTokenUsageLogs>>["data"]>([]);
  const [dataEarliest, setDataEarliest] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState(ALL_PROVIDERS);
  const limitsRefetchRef = useRef<(() => void) | null>(null);

  const range = useMemo(
    () => getTokenPeriodRange(period, periodOffset),
    [period, periodOffset],
  );

  const fetchRange = useMemo(
    () => getTokenFetchRange(period, range),
    [period, range],
  );

  const chartRange = useMemo(
    () => getTokenChartRange(period, range),
    [period, range],
  );

  const locale = dateLocale(i18n.language);

  const isBeforeEarliestData = useMemo(() => {
    if (!dataEarliest) return false;
    return range.dateTo < dataEarliest;
  }, [dataEarliest, range.dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchTokenUsageLogs(fetchRange);
    setLoading(false);
    if (err) {
      setError(err);
      setRows([]);
      return;
    }
    setRows(data);
  }, [fetchRange]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  useEffect(() => {
    if (!canAccess) return;
    void fetchTokenUsageDateBounds().then(({ earliest, error: boundsErr }) => {
      if (!boundsErr) setDataEarliest(earliest);
    });
  }, [canAccess]);

  const availableProviders = useMemo(() => listDistinctProviders(rows), [rows]);

  useEffect(() => {
    if (providerFilter !== ALL_PROVIDERS && !availableProviders.includes(providerFilter)) {
      setProviderFilter(ALL_PROVIDERS);
    }
  }, [availableProviders, providerFilter]);

  const filteredRows = useMemo(
    () => filterTokenRowsByProvider(
      rows,
      providerFilter === ALL_PROVIDERS ? undefined : providerFilter,
    ),
    [rows, providerFilter],
  );

  const periodRows = useMemo(
    () => (period === "day" ? filterTokenRowsToAnchorDay(filteredRows, range.dateTo) : filteredRows),
    [filteredRows, period, range.dateTo],
  );

  const summary = useMemo(() => summarizeTokenUsage(periodRows), [periodRows]);
  const byProvider = useMemo(() => breakdownByProvider(periodRows), [periodRows]);
  const byModel = useMemo(() => breakdownByModel(periodRows), [periodRows]);
  const series = useMemo(
    () => tokenTimeSeries(filteredRows, chartRange).map((p) => ({
      date: formatTokenChartDayLabel(p.date),
      total: p.totalTokens,
      prompt: p.promptTokens,
      completion: p.completionTokens,
    })),
    [filteredRows, chartRange],
  );

  const xAxisInterval = series.length > 14 ? Math.max(0, Math.ceil(series.length / 8) - 1) : 0;

  const providerChart = useMemo(
    () => byProvider.slice(0, 8).map((p) => ({
      name: p.label,
      tokens: p.totalTokens,
    })),
    [byProvider],
  );

  const modelChart = useMemo(
    () => byModel.slice(0, 8).map((m) => ({
      name: m.label.length > 22 ? `${m.label.slice(0, 20)}…` : m.label,
      fullName: m.label,
      tokens: m.totalTokens,
    })),
    [byModel],
  );

  const recentRows = useMemo(() => periodRows.slice(0, 25), [periodRows]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  const kpis = [
    { label: t("tokens.kpi_total"), value: formatTokenCount(summary.totalTokens) },
    { label: t("tokens.kpi_prompt"), value: formatTokenCount(summary.promptTokens) },
    { label: t("tokens.kpi_completion"), value: formatTokenCount(summary.completionTokens) },
    { label: t("tokens.kpi_calls"), value: String(summary.callCount) },
  ];

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
              {t("tokens.back_settings")}
            </Link>
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" aria-hidden />
            {t("tokens.page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tokens.page_sub")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          disabled={loading}
          onClick={() => {
            const limitsProvider = limitsProviderFromTokenFilter(providerFilter);
            console.log("[suivi_tokens] header refresh click", {
              fetchRange,
              providerFilter,
              limitsProvider: limitsProvider ?? "(aucun)",
              limitsRefetchRegistered: typeof limitsRefetchRef.current === "function",
            });
            void load();
            if (limitsRefetchRef.current) {
              limitsRefetchRef.current();
            } else {
              console.warn("[suivi_tokens] limitsRefetchRef NULL — refetch limites non déclenché");
            }
          }}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <RefreshCw className="h-4 w-4" aria-hidden />}
          {t("tokens.refresh")}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
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
              {t(`tokens.period_${p}`)}
            </Button>
          ))}
          <Select
            value={providerFilter}
            onValueChange={setProviderFilter}
            disabled={loading && rows.length === 0}
          >
            <SelectTrigger className="h-8 w-[11rem] text-xs" aria-label={t("tokens.filter_provider")}>
              <SelectValue placeholder={t("tokens.filter_provider")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROVIDERS}>{t("tokens.filter_all_providers")}</SelectItem>
              {availableProviders.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            aria-label={t("tokens.period_prev")}
            onClick={() => setPeriodOffset((o) => o - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="min-w-[12rem] text-center text-xs text-muted-foreground">
            {t("tokens.range_label", {
              from: formatTokenUsageDate(range.dateFrom, locale),
              to: formatTokenUsageDate(range.dateTo, locale),
            })}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            aria-label={t("tokens.period_next")}
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
              {t("tokens.period_today")}
            </Button>
          )}
        </div>
      </div>

      {dataEarliest && (
        <p className="text-xs text-muted-foreground">
          {t("tokens.data_since", { date: formatTokenUsageDate(dataEarliest, locale) })}
        </p>
      )}

      {isBeforeEarliestData && (
        <Alert>
          <AlertDescription>
            {t("tokens.no_data_before", { date: formatTokenUsageDate(dataEarliest ?? "", locale) })}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <span className="block mt-2 text-xs opacity-90">{t("tokens.rls_hint")}</span>
          </AlertDescription>
        </Alert>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="glass-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-semibold mt-1 tabular-nums">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("tokens.chart_series_title")}</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              {summary.callCount === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("tokens.empty")}</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                    <defs>
                      <linearGradient id="tokenArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={xAxisInterval} />
                    <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => formatTokenCount(Number(v))} />
                    <Tooltip formatter={(v: number) => [formatTokenCount(v), t("tokens.kpi_total")]} />
                    <Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="url(#tokenArea)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("tokens.chart_provider_title")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[240px]">
                {providerChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t("tokens.empty")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={providerChart} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => formatTokenCount(Number(v))} />
                      <Tooltip formatter={(v: number) => [formatTokenCount(v), t("tokens.kpi_total")]} />
                      <Bar dataKey="tokens" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("tokens.chart_model_title")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[240px]">
                {modelChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t("tokens.empty")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelChart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatTokenCount(Number(v))} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: number) => [formatTokenCount(v), t("tokens.kpi_total")]}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as { fullName?: string } | undefined;
                          return row?.fullName ?? "";
                        }}
                      />
                      <Bar dataKey="tokens" fill="#E63946" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("tokens.table_title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {recentRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("tokens.empty")}</p>
              ) : (
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t("tokens.col_date")}</th>
                      <th className="py-2 pr-3 font-medium">{t("tokens.col_provider")}</th>
                      <th className="py-2 pr-3 font-medium">{t("tokens.col_model")}</th>
                      <th className="py-2 pr-3 font-medium">{t("tokens.col_operation")}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t("tokens.col_prompt")}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t("tokens.col_completion")}</th>
                      <th className="py-2 font-medium text-right">{t("tokens.col_total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRows.map((r) => {
                      const prompt = Math.max(0, Number(r.prompt_tokens ?? 0));
                      const completion = Math.max(0, Number(r.completion_tokens ?? 0));
                      const total = Number(r.total_tokens ?? 0) > 0
                        ? Number(r.total_tokens)
                        : prompt + completion;
                      return (
                        <tr key={r.id} className="border-b border-border/40">
                          <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                            {new Date(r.created_at).toLocaleString("fr-FR")}
                          </td>
                          <td className="py-2 pr-3">{r.provider}</td>
                          <td className="py-2 pr-3 max-w-[180px] truncate" title={r.model_id}>{r.model_id}</td>
                          <td className="py-2 pr-3">{jobTypeLabel(r.metadata)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatUsageTableCell(r.provider, "prompt", prompt)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatUsageTableCell(r.provider, "completion", completion)}
                          </td>
                          <td className="py-2 text-right tabular-nums font-medium">
                            {formatUsageTableCell(r.provider, "total", total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <section
        id="limites-ia"
        className="pt-8 mt-8 border-t border-border/60"
        aria-labelledby="limites-ia-heading"
      >
        <AILimitsMonitor
          provider={limitsProviderFromTokenFilter(providerFilter)}
          onRefetchRegister={(fn) => {
            limitsRefetchRef.current = fn;
          }}
        />
      </section>
    </div>
  );
}
