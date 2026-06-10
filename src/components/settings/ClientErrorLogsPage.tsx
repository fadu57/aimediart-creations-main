import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthUser } from "@/hooks/useAuthUser";
import type { ErrorLogAudience } from "@/lib/clientErrorLogging";
import {
  ALL_ERROR_SOURCES,
  defaultClientErrorFilters,
  fetchClientErrorLogs,
  fetchDistinctErrorSources,
  formatClientErrorDate,
  groupLogsBySession,
  sessionClientLabel,
  type ClientErrorLogFilters,
  type ClientErrorLogRow,
} from "@/lib/clientErrorLogs";
import { cn } from "@/lib/utils";

type ClientErrorLogsPageProps = {
  audience: ErrorLogAudience;
};

function dateLocale(lang: string): string {
  const code = (lang ?? "fr").slice(0, 2);
  const map: Record<string, string> = {
    fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT",
  };
  return map[code] ?? "fr-FR";
}

export function ClientErrorLogsPage({ audience }: ClientErrorLogsPageProps) {
  const ns = audience === "visitor" ? "visitor_errors" : "organizer_errors";
  const { t, i18n } = useTranslation("settings");
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = typeof role_id === "number" && role_id < 4;

  const [filters, setFilters] = useState<ClientErrorLogFilters>(() => defaultClientErrorFilters());
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grouped, setGrouped] = useState<
    Array<{ session: { id: string; started_at: string; ended_at: string | null; last_page_url: string | null; visitor_client_id?: string | null; auth_user_id: string | null }; logs: ClientErrorLogRow[] }>
  >([]);

  const locale = dateLocale(i18n.language);

  const loadSources = useCallback(async () => {
    const { data } = await fetchDistinctErrorSources(audience);
    setSources(data);
  }, [audience]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchClientErrorLogs(audience, filters);
    setLoading(false);
    if (err) {
      setError(err);
      setGrouped([]);
      return;
    }
    setGrouped(groupLogsBySession(data));
  }, [audience, filters]);

  useEffect(() => {
    if (!canAccess) return;
    void loadSources();
  }, [canAccess, loadSources]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  const totalErrors = useMemo(
    () => grouped.reduce((acc, g) => acc + g.logs.length, 0),
    [grouped],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 p-4 pb-10 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link to="/settings">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t(`${ns}.back_settings`)}
          </Link>
        </Button>
        <h1 className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight">
          <AlertTriangle className="h-6 w-6 shrink-0 text-[#E63946]" aria-hidden />
          <span className="shrink-0">{t(`${ns}.page_title`)}</span>
          <span className="text-sm font-normal text-muted-foreground">{t(`${ns}.page_sub`)}</span>
        </h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
          {t("error_logs.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("error_logs.filters_title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <Label htmlFor="date-mode">{t("error_logs.filter_date_mode")}</Label>
              <Select
                value={filters.dateMode}
                onValueChange={(v) => setFilters((f) => ({ ...f, dateMode: v as "day" | "range" }))}
              >
                <SelectTrigger id="date-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t("error_logs.filter_date_mode_day")}</SelectItem>
                  <SelectItem value="range">{t("error_logs.filter_date_mode_range")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filters.dateMode === "day" ? (
              <div className="flex min-w-[160px] flex-col gap-1.5">
                <Label htmlFor="date-single">{t("error_logs.filter_date")}</Label>
                <Input
                  id="date-single"
                  type="date"
                  value={filters.dateSingle}
                  onChange={(e) => setFilters((f) => ({ ...f, dateSingle: e.target.value }))}
                />
              </div>
            ) : (
              <>
                <div className="flex min-w-[160px] flex-col gap-1.5">
                  <Label htmlFor="date-from">{t("error_logs.filter_date_from")}</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="flex min-w-[160px] flex-col gap-1.5">
                  <Label htmlFor="date-to">{t("error_logs.filter_date_to")}</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="flex min-w-[120px] flex-col gap-1.5">
              <Label htmlFor="time-from">{t("error_logs.filter_time_from")}</Label>
              <Input
                id="time-from"
                type="time"
                value={filters.timeFrom}
                onChange={(e) => setFilters((f) => ({ ...f, timeFrom: e.target.value }))}
              />
            </div>
            <div className="flex min-w-[120px] flex-col gap-1.5">
              <Label htmlFor="time-to">{t("error_logs.filter_time_to")}</Label>
              <Input
                id="time-to"
                type="time"
                value={filters.timeTo}
                onChange={(e) => setFilters((f) => ({ ...f, timeTo: e.target.value }))}
              />
            </div>

            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <Label htmlFor="error-source">{t("error_logs.filter_error_type")}</Label>
              <Select
                value={filters.errorSource}
                onValueChange={(v) => setFilters((f) => ({ ...f, errorSource: v }))}
              >
                <SelectTrigger id="error-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ERROR_SOURCES}>{t("error_logs.filter_all_types")}</SelectItem>
                  {sources.map((src) => (
                    <SelectItem key={src} value={src}>
                      {src}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="button" onClick={() => void load()} disabled={loading}>
              {t("error_logs.apply_filters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("error_logs.sessions_title", { count: totalErrors })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("error_logs.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {grouped.map(({ session, logs }) => {
                const expanded = expandedId === session.id;
                return (
                  <li key={session.id} className="py-3">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/40"
                      onClick={() => setExpandedId(expanded ? null : session.id)}
                    >
                      <span className="mt-0.5 text-muted-foreground">
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[#E63946]">
                            {t("error_logs.error_count", { count: logs.length })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatClientErrorDate(session.started_at, locale)}
                            {session.ended_at
                              ? ` → ${formatClientErrorDate(session.ended_at, locale)}`
                              : ` · ${t("error_logs.session_open")}`}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {t(`${ns}.client_id`)} : {sessionClientLabel(audience, session)}
                          {" · "}
                          {t("error_logs.last_page")} : {session.last_page_url || "—"}
                        </p>
                      </div>
                    </button>

                    {expanded && (
                      <div className="ml-6 mt-2 space-y-2 border-l border-border pl-4">
                        {logs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                          >
                            <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{formatClientErrorDate(log.created_at, locale)}</span>
                              <span>·</span>
                              <span>{log.error_source}</span>
                              {log.page_url && (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{log.page_url}</span>
                                </>
                              )}
                            </div>
                            <p className="font-medium text-destructive">{log.error_message}</p>
                            {log.error_stack && (
                              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                                {log.error_stack}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
