import { useCallback, useEffect, useMemo, useState } from "react";

import { Link, Navigate } from "react-router-dom";

import { useTranslation } from "react-i18next";

import {

  AlertTriangle,

  ArrowLeft,

  ChevronDown,

  ChevronUp,

  Loader2,

  RefreshCw,

  Trash2,

} from "lucide-react";

import { toast } from "sonner";



import {

  AlertDialog,

  AlertDialogAction,

  AlertDialogCancel,

  AlertDialogContent,

  AlertDialogDescription,

  AlertDialogFooter,

  AlertDialogHeader,

  AlertDialogTitle,

} from "@/components/ui/alert-dialog";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Checkbox } from "@/components/ui/checkbox";

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

  clientErrorSourceLabel,

  defaultClientErrorFilters,

  deleteClientErrorSessions,

  deleteClientErrorSessionsForFilters,

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

  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());

  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);

  const [clearFilteredOpen, setClearFilteredOpen] = useState(false);

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

      setSelectedSessionIds(new Set());

      return;

    }

    setGrouped(groupLogsBySession(data));

    setSelectedSessionIds(new Set());

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



  const allSessionIds = useMemo(() => grouped.map((g) => g.session.id), [grouped]);

  const allSelected = grouped.length > 0 && selectedSessionIds.size === grouped.length;

  const someSelected = selectedSessionIds.size > 0;



  const toggleSession = useCallback((sessionId: string, checked: boolean) => {

    setSelectedSessionIds((prev) => {

      const next = new Set(prev);

      if (checked) next.add(sessionId);

      else next.delete(sessionId);

      return next;

    });

  }, []);



  const toggleSelectAll = useCallback(

    (checked: boolean) => {

      setSelectedSessionIds(checked ? new Set(allSessionIds) : new Set());

    },

    [allSessionIds],

  );



  const handleDeleteSelected = useCallback(async () => {

    const ids = [...selectedSessionIds];

    if (!ids.length) return;

    setDeleting(true);

    const { error: delErr } = await deleteClientErrorSessions(audience, ids);

    setDeleting(false);

    setDeleteSelectedOpen(false);

    if (delErr) {

      toast.error(t("error_logs.delete_error"));

      return;

    }

    toast.success(t("error_logs.delete_success", { count: ids.length }));

    void load();

    void loadSources();

  }, [audience, load, loadSources, selectedSessionIds, t]);



  const handleClearFiltered = useCallback(async () => {

    setDeleting(true);

    const { deletedCount, error: delErr } = await deleteClientErrorSessionsForFilters(

      audience,

      filters,

    );

    setDeleting(false);

    setClearFilteredOpen(false);

    if (delErr) {

      toast.error(t("error_logs.delete_error"));

      return;

    }

    toast.success(t("error_logs.delete_success", { count: deletedCount }));

    void load();

    void loadSources();

  }, [audience, filters, load, loadSources, t]);



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

        <Button

          variant="outline"

          size="sm"

          className="text-destructive hover:text-destructive"

          disabled={loading || deleting || grouped.length === 0}

          onClick={() => setClearFilteredOpen(true)}

        >

          <Trash2 className="mr-2 h-4 w-4" aria-hidden />

          {t("error_logs.clear_filtered")}

        </Button>

        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || deleting}>

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

                      {clientErrorSourceLabel(src, t)}

                    </SelectItem>

                  ))}

                </SelectContent>

              </Select>

            </div>



            <Button type="button" onClick={() => void load()} disabled={loading || deleting}>

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

        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">

          <CardTitle className="text-base">

            {t("error_logs.sessions_title", { count: totalErrors })}

          </CardTitle>

          {grouped.length > 0 && (

            <div className="flex flex-wrap items-center gap-3">

              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">

                <Checkbox

                  checked={allSelected}

                  onCheckedChange={(v) => toggleSelectAll(v === true)}

                  aria-label={t("error_logs.select_all")}

                />

                {t("error_logs.select_all")}

              </label>

              {someSelected && (

                <Button

                  variant="destructive"

                  size="sm"

                  disabled={deleting}

                  onClick={() => setDeleteSelectedOpen(true)}

                >

                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />

                  {t("error_logs.delete_selected", { count: selectedSessionIds.size })}

                </Button>

              )}

            </div>

          )}

        </CardHeader>

        <CardContent className="pt-0">

          {loading ? (

            <div className="flex justify-center py-8">

              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />

            </div>

          ) : grouped.length === 0 ? (

            <p className="py-4 text-center text-sm text-muted-foreground">

              {t("error_logs.empty")}

            </p>

          ) : (

            <ul className="divide-y divide-border">

              {grouped.map(({ session, logs }) => {

                const expanded = expandedId === session.id;

                const sessionDates = session.ended_at

                  ? `${formatClientErrorDate(session.started_at, locale)} → ${formatClientErrorDate(session.ended_at, locale)}`

                  : `${formatClientErrorDate(session.started_at, locale)} · ${t("error_logs.session_open")}`;

                const metaLine = `${t(`${ns}.client_id`)}: ${sessionClientLabel(audience, session)} · ${t("error_logs.last_page")}: ${session.last_page_url || "—"}`;



                return (

                  <li key={session.id} className="py-0.5">

                    <div className="flex items-center gap-1.5 rounded-md px-1 hover:bg-muted/40">

                      <Checkbox

                        checked={selectedSessionIds.has(session.id)}

                        onCheckedChange={(v) => toggleSession(session.id, v === true)}

                        aria-label={t("error_logs.mark_resolved")}

                        className="shrink-0"

                      />

                      <button

                        type="button"

                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"

                        onClick={() => setExpandedId(expanded ? null : session.id)}

                      >

                        <span className="shrink-0 text-muted-foreground">

                          {expanded ? (

                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />

                          ) : (

                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />

                          )}

                        </span>

                        <span className="shrink-0 font-medium text-[#E63946]">

                          {t("error_logs.error_count", { count: logs.length })}

                        </span>

                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">

                          {sessionDates}

                        </span>

                        <span className="min-w-0 truncate text-xs text-muted-foreground">

                          {metaLine}

                        </span>

                      </button>

                    </div>



                    {expanded && (

                      <div className="ml-7 space-y-1 border-l border-border py-1 pl-3">

                        {logs.map((log) => (

                          <div

                            key={log.id}

                            className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-xs"

                          >

                            <div className="flex flex-wrap gap-x-1.5 gap-y-0 text-muted-foreground">

                              <span>{formatClientErrorDate(log.created_at, locale)}</span>

                              <span>·</span>

                              <span>{clientErrorSourceLabel(log.error_source, t)}</span>

                              {log.page_url && (

                                <>

                                  <span>·</span>

                                  <span className="truncate">{log.page_url}</span>

                                </>

                              )}

                            </div>

                            <p className="mt-0.5 font-medium leading-snug text-destructive">

                              {log.error_message}

                            </p>

                            {log.error_stack && (

                              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-tight text-muted-foreground">

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



      <AlertDialog open={deleteSelectedOpen} onOpenChange={setDeleteSelectedOpen}>

        <AlertDialogContent>

          <AlertDialogHeader>

            <AlertDialogTitle>{t("error_logs.delete_selected_title")}</AlertDialogTitle>

            <AlertDialogDescription>

              {t("error_logs.delete_selected_desc", { count: selectedSessionIds.size })}

            </AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>

            <AlertDialogCancel disabled={deleting}>{t("error_logs.cancel")}</AlertDialogCancel>

            <AlertDialogAction

              disabled={deleting}

              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"

              onClick={(e) => {

                e.preventDefault();

                void handleDeleteSelected();

              }}

            >

              {deleting ? (

                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />

              ) : null}

              {t("error_logs.confirm_delete")}

            </AlertDialogAction>

          </AlertDialogFooter>

        </AlertDialogContent>

      </AlertDialog>



      <AlertDialog open={clearFilteredOpen} onOpenChange={setClearFilteredOpen}>

        <AlertDialogContent>

          <AlertDialogHeader>

            <AlertDialogTitle>{t("error_logs.clear_filtered_title")}</AlertDialogTitle>

            <AlertDialogDescription>{t("error_logs.clear_filtered_desc")}</AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>

            <AlertDialogCancel disabled={deleting}>{t("error_logs.cancel")}</AlertDialogCancel>

            <AlertDialogAction

              disabled={deleting}

              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"

              onClick={(e) => {

                e.preventDefault();

                void handleClearFiltered();

              }}

            >

              {deleting ? (

                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />

              ) : null}

              {t("error_logs.confirm_delete")}

            </AlertDialogAction>

          </AlertDialogFooter>

        </AlertDialogContent>

      </AlertDialog>

    </div>

  );

}


