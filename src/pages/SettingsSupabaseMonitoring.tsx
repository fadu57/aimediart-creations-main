import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { SupabaseDbMonitoringCharts } from "@/components/settings/SupabaseDbMonitoringCharts";
import { SupabasePlanQuotas } from "@/components/settings/SupabasePlanQuotas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  fetchSupabaseDbMonitoring,
  formatBytes,
  kindLabel,
  type MonitoringRangeHours,
  type SupabaseDbMonitoringPayload,
} from "@/lib/supabaseDbMonitoring";
import {
  loadStoredPlanId,
  storePlanId,
  SUPABASE_PLAN_LIMITS,
  usageRatio,
  usageStatus,
  type SupabasePlanId,
} from "@/lib/supabasePlanLimits";
import { cn } from "@/lib/utils";

const PLAN_OPTIONS: SupabasePlanId[] = ["free", "pro"];

const RANGE_OPTIONS: { hours: MonitoringRangeHours; labelKey: string }[] = [
  { hours: 24, labelKey: "supabase_monitoring.range_24h" },
  { hours: 168, labelKey: "supabase_monitoring.range_7d" },
  { hours: 720, labelKey: "supabase_monitoring.range_30d" },
];

function dateLocale(lang: string): string {
  const code = (lang ?? "fr").slice(0, 2);
  const map: Record<string, string> = {
    fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT",
  };
  return map[code] ?? "fr-FR";
}

export default function SettingsSupabaseMonitoring() {
  const { t, i18n } = useTranslation("settings");
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = role_id === 1 || role_id === 2 || role_id === 3;

  const [rangeHours, setRangeHours] = useState<MonitoringRangeHours>(168);
  const [planId, setPlanId] = useState<SupabasePlanId>(() => loadStoredPlanId());
  const [data, setData] = useState<SupabaseDbMonitoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const locale = dateLocale(i18n.language);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: payload, error: err } = await fetchSupabaseDbMonitoring(rangeHours);
    setLoading(false);
    if (err) {
      setError(err);
      setData(null);
      return;
    }
    setData(payload);
  }, [rangeHours]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  const snapshot = data?.snapshot;
  const infra = data?.infra;
  const plan = SUPABASE_PLAN_LIMITS[planId];

  const handlePlanChange = (next: SupabasePlanId) => {
    setPlanId(next);
    storePlanId(next);
  };

  const kpis = useMemo(() => {
    if (!snapshot) return [];
    const dbRatio = usageRatio(snapshot.database_size_bytes, plan.database_bytes);
    const connRatio = usageRatio(snapshot.active_connections, plan.max_db_connections);
    const dbStat = usageStatus(dbRatio);
    const connStat = usageStatus(connRatio);

    return [
      {
        label: t("supabase_monitoring.kpi_db_size"),
        value: `${formatBytes(snapshot.database_size_bytes)} / ${formatBytes(plan.database_bytes)}`,
        sub: `${Math.round(dbRatio * 100)} % ${t("supabase_monitoring.quota_of_plan")}`,
        status: dbStat,
      },
      {
        label: t("supabase_monitoring.kpi_connections"),
        value: `${snapshot.active_connections} / ${plan.max_db_connections}`,
        sub: t("supabase_monitoring.kpi_connections_sub", {
          pgMax: snapshot.max_connections,
        }),
        status: connStat,
      },
      {
        label: t("supabase_monitoring.kpi_objects"),
        value: String(snapshot.large_objects?.length ?? 0),
        sub: t("supabase_monitoring.kpi_objects_sub"),
        status: "ok" as const,
      },
    ];
  }, [snapshot, plan, t]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  const fetchedAt = data?.fetched_at
    ? new Date(data.fetched_at).toLocaleString(locale)
    : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-12 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 text-muted-foreground" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("supabase_monitoring.back_settings")}
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Database className="h-7 w-7 text-primary" aria-hidden />
            {t("supabase_monitoring.page_title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("supabase_monitoring.page_sub")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            {PLAN_OPTIONS.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  planId === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handlePlanChange(id)}
              >
                {t(SUPABASE_PLAN_LIMITS[id].labelKey)}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            {RANGE_OPTIONS.map(({ hours, labelKey }) => (
              <button
                key={hours}
                type="button"
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  rangeHours === hours
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setRangeHours(hours)}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} aria-hidden />
            {t("supabase_monitoring.refresh")}
          </Button>
          {infra?.dashboard_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={infra.dashboard_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                {t("supabase_monitoring.open_studio")}
              </a>
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("supabase_monitoring.fetched_at", { at: fetchedAt })}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("supabase_monitoring.error_title")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!infra?.available && (
        <Alert>
          <AlertTitle>{t("supabase_monitoring.infra_unavailable_title")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{infra?.reason ?? t("supabase_monitoring.infra_unavailable_default")}</p>
            <p className="text-xs">{t("supabase_monitoring.config_hint")}</p>
          </AlertDescription>
        </Alert>
      )}

      {infra?.available && infra.reason && (
        <Alert>
          <AlertDescription>{infra.reason}</AlertDescription>
        </Alert>
      )}

      {infra?.history_hint && (
        <p className="text-xs text-muted-foreground">{infra.history_hint}</p>
      )}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {kpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={cn(
                    "text-xl font-semibold",
                    kpi.status === "critical" && "text-destructive",
                    kpi.status === "warn" && "text-amber-600 dark:text-amber-500",
                  )}
                  >
                    {kpi.value}
                  </p>
                  {kpi.sub && (
                    <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <SupabasePlanQuotas planId={planId} snapshot={snapshot} />
        </>
      )}

      {loading && !data && (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        </div>
      )}

      {infra?.available && infra.data.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("supabase_monitoring.section_infra")}</h2>
          <SupabaseDbMonitoringCharts infra={infra} locale={locale} planId={planId} />
        </section>
      )}

      {snapshot && snapshot.large_objects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("supabase_monitoring.large_objects_title")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("supabase_monitoring.col_object")}</TableHead>
                  <TableHead>{t("supabase_monitoring.col_kind")}</TableHead>
                  <TableHead className="text-right">{t("supabase_monitoring.col_size")}</TableHead>
                  <TableHead className="text-right">{t("supabase_monitoring.col_data")}</TableHead>
                  <TableHead className="text-right">{t("supabase_monitoring.col_index")}</TableHead>
                  <TableHead className="text-right">{t("supabase_monitoring.col_share")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.large_objects.map((obj) => (
                  <TableRow key={obj.object_name}>
                    <TableCell className="font-mono text-xs">{obj.object_name}</TableCell>
                    <TableCell>{kindLabel(obj.kind, t)}</TableCell>
                    <TableCell className="text-right">{formatBytes(Number(obj.total_bytes))}</TableCell>
                    <TableCell className="text-right">{formatBytes(Number(obj.data_bytes))}</TableCell>
                    <TableCell className="text-right">{formatBytes(Number(obj.index_bytes))}</TableCell>
                    <TableCell className="text-right">{Number(obj.share_pct).toFixed(1)} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!loading && snapshot && snapshot.large_objects.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">{t("supabase_monitoring.empty_objects")}</p>
      )}
    </div>
  );
}
