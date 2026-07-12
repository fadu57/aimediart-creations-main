import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Coins, Download, Loader2, RefreshCw } from "lucide-react";

import { AILimitsMonitor } from "@/components/admin/AILimitsMonitor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  breakdownByModel,
  breakdownByProvider,
  costFiltersToTokenEntity,
  EMPTY_TOKEN_ENTITY_FILTERS,
  fetchTokenUsageDateBounds,
  fetchTokenUsageLogs,
  fetchTtsUsageEvents,
  filterTokenRowsByEntity,
  filterTokenRowsByProvider,
  filterTokenRowsToAnchorDay,
  formatTokenCount,
  getTokenArtworkContextByIds,
  getTokenRowToolType,
  listDistinctProviders,
  formatTokenUsageDate,
  formatTokenChartDayLabel,
  formatUsageTableCell,
  exportTokenUsageCsv,
  getTokenChartRange,
  getTokenFetchRange,
  getTokenPeriodRange,
  jobTypeLabel,
  mergeUsageRows,
  nextTokenTableSort,
  sortTokenUsageRows,
  summarizeTokenUsage,
  summarizeTtsUsageRecap,
  tokenEntityFiltersToCostFilters,
  tokenTimeSeries,
  usageProviderLabel,
  DEFAULT_TOKEN_TABLE_SORT,
  type TokenArtworkContext,
  type TokenEntityFilters,
  type TokenPeriod,
  type TokenTableSort,
  type TokenTableSortColumn,
} from "@/lib/aiTokenUsage";
import {
  EMPTY_COST_LINKED_FILTER_OPTIONS,
  getCostLinkedFilterOptions,
  sanitizeCostFilters,
  type CostLinkedFilterOptions,
} from "@/lib/costs";
import { BACKOFFICE_FORM_CONTROL_CLASS, costToolTypeLabel } from "@/lib/costLabels";
import { WAKA_PERIODS } from "@/lib/wakatimePeriod";
import { formatCost } from "@/lib/costs";
import { cn } from "@/lib/utils";

const PERIODS: TokenPeriod[] = WAKA_PERIODS;
const ALL_PROVIDERS = "all";
const filterSelectClass = cn(BACKOFFICE_FORM_CONTROL_CLASS, "h-9 w-full min-w-0 text-xs");

type SortableThProps = {
  label: string;
  column: TokenTableSortColumn;
  sort: TokenTableSort;
  onSort: (column: TokenTableSortColumn) => void;
  align?: "left" | "right";
};

function SortableTh({ label, column, sort, onSort, align = "left" }: SortableThProps) {
  const active = sort.column === column;
  const SortIcon = active ? (sort.ascending ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      className={cn(
        "py-2 pr-3 font-medium",
        align === "right" && "text-right",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" ? "w-full justify-end" : "text-left",
          active && "text-foreground",
        )}
        aria-sort={active ? (sort.ascending ? "ascending" : "descending") : "none"}
      >
        {label}
        <SortIcon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  );
}

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
  const [entityFilters, setEntityFilters] = useState<TokenEntityFilters>(EMPTY_TOKEN_ENTITY_FILTERS);
  const [linkedFilterOptions, setLinkedFilterOptions] = useState<CostLinkedFilterOptions>(
    EMPTY_COST_LINKED_FILTER_OPTIONS,
  );
  const [artworkCtx, setArtworkCtx] = useState<Record<string, TokenArtworkContext>>({});
  const [exportingCsv, setExportingCsv] = useState(false);
  const [tableSort, setTableSort] = useState<TokenTableSort>(DEFAULT_TOKEN_TABLE_SORT);
  const limitsRefetchRef = useRef<(() => void) | null>(null);
  const loadSeqRef = useRef(0);

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
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    setRows([]);

    const [logsRes, eventsRes] = await Promise.all([
      fetchTokenUsageLogs(fetchRange),
      fetchTtsUsageEvents(fetchRange),
    ]);

    if (seq !== loadSeqRef.current) return;

    setLoading(false);
    if (logsRes.error) {
      setError(logsRes.error);
      setRows([]);
      return;
    }
    if (eventsRes.error) {
      setError(eventsRes.error);
      setRows([]);
      return;
    }
    setRows(mergeUsageRows(logsRes.data, eventsRes.data));
  }, [fetchRange.dateFrom, fetchRange.dateTo]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, period, periodOffset, load]);

  useEffect(() => {
    if (!canAccess) return;
    void fetchTokenUsageDateBounds().then(({ earliest, error: boundsErr }) => {
      if (!boundsErr) setDataEarliest(earliest);
    });
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    void getCostLinkedFilterOptions(tokenEntityFiltersToCostFilters(entityFilters)).then((linked) => {
      if (cancelled) return;
      setLinkedFilterOptions(linked);
      setEntityFilters((prev) => {
        const sanitized = costFiltersToTokenEntity(
          sanitizeCostFilters(tokenEntityFiltersToCostFilters(prev), linked),
        );
        const changed = (Object.keys(sanitized) as (keyof TokenEntityFilters)[]).some(
          (k) => sanitized[k] !== prev[k],
        );
        return changed ? sanitized : prev;
      });
    });
    return () => { cancelled = true; };
  }, [canAccess, entityFilters]);

  useEffect(() => {
    const ids = [...new Set(rows.map((r) => r.artwork_id?.trim()).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) {
      setArtworkCtx({});
      return;
    }
    let cancelled = false;
    void getTokenArtworkContextByIds(ids).then((ctx) => {
      if (!cancelled) setArtworkCtx(ctx);
    });
    return () => { cancelled = true; };
  }, [rows]);

  const setEntityFilter = (key: keyof TokenEntityFilters, value: string) => {
    setEntityFilters((prev) => ({ ...prev, [key]: value }));
  };

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

  const entityFilteredRows = useMemo(
    () => filterTokenRowsByEntity(filteredRows, entityFilters, artworkCtx),
    [filteredRows, entityFilters, artworkCtx],
  );

  const periodRows = useMemo(
    () => (period === "day" ? filterTokenRowsToAnchorDay(entityFilteredRows, range.dateTo) : entityFilteredRows),
    [entityFilteredRows, period, range.dateTo],
  );

  const summary = useMemo(() => summarizeTokenUsage(periodRows), [periodRows]);
  const byProvider = useMemo(() => breakdownByProvider(periodRows), [periodRows]);
  const byModel = useMemo(() => breakdownByModel(periodRows), [periodRows]);
  const ttsRecap = useMemo(() => summarizeTtsUsageRecap(periodRows), [periodRows]);
  const series = useMemo(
    () => tokenTimeSeries(entityFilteredRows, chartRange).map((p) => ({
      date: formatTokenChartDayLabel(p.date),
      total: p.totalTokens,
      prompt: p.promptTokens,
      completion: p.completionTokens,
    })),
    [entityFilteredRows, chartRange],
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

  const sortedPeriodRows = useMemo(
    () => sortTokenUsageRows(periodRows, tableSort, artworkCtx),
    [periodRows, tableSort, artworkCtx],
  );

  const recentRows = useMemo(() => sortedPeriodRows.slice(0, 25), [sortedPeriodRows]);

  const handleTableSort = useCallback((column: TokenTableSortColumn) => {
    setTableSort((prev) => nextTokenTableSort(column, prev));
  }, []);

  const handleExportCsv = useCallback(() => {
    if (sortedPeriodRows.length === 0) return;
    setExportingCsv(true);
    try {
      exportTokenUsageCsv(sortedPeriodRows, artworkCtx);
    } finally {
      setExportingCsv(false);
    }
  }, [sortedPeriodRows, artworkCtx]);

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
                if (period === p && periodOffset === 0) return;
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
                <SelectItem key={p} value={p}>{usageProviderLabel(p)}</SelectItem>
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

          {ttsRecap.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("tokens.recap_tts_title")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t("tokens.col_provider")}</th>
                      <th className="py-2 pr-3 font-medium">{t("tokens.col_tool")}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t("tokens.col_units")}</th>
                      <th className="py-2 font-medium text-right">{t("tokens.col_cost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ttsRecap.map((row) => (
                      <tr key={`${row.provider}-${row.tool}`} className="border-b border-border/40">
                        <td className="py-2 pr-3">{usageProviderLabel(row.provider)}</td>
                        <td className="py-2 pr-3 uppercase">{row.tool}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatTokenCount(row.inputUnits)} {t("tokens.unit_characters")}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {formatCost(row.costUsd, "USD", 4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

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
              <div className="mb-3 flex flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("couts.filter_artwork")}
                    </label>
                    <select
                      value={entityFilters.artworkId ?? ""}
                      onChange={(e) => setEntityFilter("artworkId", e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="">{t("couts.filter_all")}</option>
                      {linkedFilterOptions.artworks.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("couts.filter_expo")}
                    </label>
                    <select
                      value={entityFilters.expoId ?? ""}
                      onChange={(e) => setEntityFilter("expoId", e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="">{t("couts.filter_all")}</option>
                      {linkedFilterOptions.expos.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("couts.filter_agency")}
                    </label>
                    <select
                      value={entityFilters.agencyId ?? ""}
                      onChange={(e) => setEntityFilter("agencyId", e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="">{t("couts.filter_all")}</option>
                      {linkedFilterOptions.agencies.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("couts.filter_tool_type")}
                    </label>
                    <select
                      value={entityFilters.toolType ?? ""}
                      onChange={(e) => setEntityFilter("toolType", e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="">{t("couts.filter_all")}</option>
                      {linkedFilterOptions.selectOptions.toolTypes.map((v) => (
                        <option key={v} value={v}>{costToolTypeLabel(v, t)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("couts.filter_mediation_lang_count")}
                    </label>
                    <select
                      value={entityFilters.mediationLangCount ?? ""}
                      onChange={(e) => setEntityFilter("mediationLangCount", e.target.value)}
                      className={filterSelectClass}
                    >
                      <option value="">{t("couts.filter_all")}</option>
                      {linkedFilterOptions.mediationLangCounts.map((n) => (
                        <option key={n} value={String(n)}>
                          {t("couts.filter_mediation_lang_count_option", { count: n })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {periodRows.length.toLocaleString("fr-FR")} {t("tokens.table_rows_count")}
                    {periodRows.length > recentRows.length && (
                      <span className="text-muted-foreground/80">
                        {" "}({t("tokens.table_preview_limit", { count: recentRows.length })})
                      </span>
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    disabled={exportingCsv || periodRows.length === 0}
                    onClick={handleExportCsv}
                  >
                    {exportingCsv
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      : <Download className="h-3.5 w-3.5" aria-hidden />}
                    {t("tokens.btn_export_csv")}
                  </Button>
                </div>
              </div>

              {recentRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("tokens.empty")}</p>
              ) : (
                <table className="w-full min-w-[1100px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <SortableTh column="created_at" label={t("tokens.col_date")} sort={tableSort} onSort={handleTableSort} />
                      <SortableTh column="provider" label={t("tokens.col_provider")} sort={tableSort} onSort={handleTableSort} />
                      <SortableTh column="model_id" label={t("tokens.col_model")} sort={tableSort} onSort={handleTableSort} />
                      <SortableTh column="operation" label={t("tokens.col_operation")} sort={tableSort} onSort={handleTableSort} />
                      <SortableTh column="artwork_title" label={t("tokens.col_artwork")} sort={tableSort} onSort={handleTableSort} />
                      <SortableTh column="tool_type" label={t("tokens.col_tool_type")} sort={tableSort} onSort={handleTableSort} />
                      <SortableTh column="prompt_tokens" label={t("tokens.col_tokens_in")} sort={tableSort} onSort={handleTableSort} align="right" />
                      <SortableTh column="completion_tokens" label={t("tokens.col_tokens_out")} sort={tableSort} onSort={handleTableSort} align="right" />
                      <SortableTh column="total_tokens" label={t("tokens.col_tokens_total")} sort={tableSort} onSort={handleTableSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentRows.map((r) => {
                      const prompt = Math.max(0, Number(r.prompt_tokens ?? 0));
                      const completion = Math.max(0, Number(r.completion_tokens ?? 0));
                      const total = Number(r.total_tokens ?? 0) > 0
                        ? Number(r.total_tokens)
                        : prompt + completion;
                      const artworkId = r.artwork_id?.trim() ?? "";
                      const artworkTitle = artworkId ? (artworkCtx[artworkId]?.title ?? "—") : "—";
                      const toolType = getTokenRowToolType(r);
                      return (
                        <tr key={r.id} className="border-b border-border/40">
                          <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                            {new Date(r.created_at).toLocaleString("fr-FR")}
                          </td>
                          <td className="py-2 pr-3">{usageProviderLabel(r.provider)}</td>
                          <td className="py-2 pr-3 max-w-[140px] truncate" title={r.model_id}>{r.model_id}</td>
                          <td className="py-2 pr-3">{jobTypeLabel(r.metadata)}</td>
                          <td className="py-2 pr-3 max-w-[160px] truncate" title={artworkTitle}>{artworkTitle}</td>
                          <td className="py-2 pr-3">{toolType ? costToolTypeLabel(toolType, t) : "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatUsageTableCell(r.provider, "prompt", prompt, r)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatUsageTableCell(r.provider, "completion", completion, r)}
                          </td>
                          <td className="py-2 text-right tabular-nums font-medium">
                            {formatUsageTableCell(r.provider, "total", total, r)}
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
