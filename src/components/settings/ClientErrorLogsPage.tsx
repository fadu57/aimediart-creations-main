import { useCallback, useEffect, useMemo, useState } from "react";

import { Link, Navigate } from "react-router-dom";

import { useTranslation } from "react-i18next";

import {

  AlertTriangle,

  ArrowLeft,

  ChevronDown,

  ChevronUp,

  ChevronsUpDown,

  Check,

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

  Popover,

  PopoverContent,

  PopoverTrigger,

} from "@/components/ui/popover";

import {

  Command,

  CommandEmpty,

  CommandGroup,

  CommandInput,

  CommandItem,

  CommandList,

} from "@/components/ui/command";

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

  ALL_ORGANIZER_USERS,

  ALL_VISITORS,

  clientErrorSourceLabel,

  defaultClientErrorFilters,

  deleteClientErrorSessions,

  deleteClientErrorSessionsForFilters,

  fetchClientErrorLogs,

  fetchDistinctErrorSources,

  fetchOrganizerUsersForFilter,

  fetchVisitorLabelsByClientIds,

  fetchVisitorsForFilter,

  formatClientErrorDate,

  formatConnectionDuration,

  fetchProfileNamesByUserIds,

  groupLogsBySession,

  isAuthEventSource,

  isDisconnectEventSource,

  sessionHasDisconnectEvent,

  splitLogsByAuthKind,

  sessionClientLabel,

  type ClientErrorLogFilters,

  type ClientErrorLogRow,

  type OrganizerUserFilterOption,

  type VisitorFilterOption,

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



const FILTER_LABEL_CLASS = "text-xs font-medium leading-none";

const FILTER_TIME_CLASS = "h-9 w-[96px] shrink-0 text-sm";

const FILTER_SELECT_TRIGGER_CLASS = "h-9 w-full text-sm";

const DATE_PICKER_INPUT_CLASS =
  "relative h-9 w-[112px] shrink-0 cursor-pointer px-1.5 text-sm [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";

function openDatePickerOnClick(e: React.MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // ignore (déjà ouvert ou navigateur non compatible)
  }
}



export function ClientErrorLogsPage({ audience }: ClientErrorLogsPageProps) {

  const ns = audience === "visitor" ? "visitor_errors" : "organizer_errors";

  const { t, i18n } = useTranslation("settings");

  const { loading: authLoading, role_id } = useAuthUser();

  const canAccess = typeof role_id === "number" && role_id < 4;

  const canDeleteLogs = role_id === 1;



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

  const [profileNames, setProfileNames] = useState<Map<string, string>>(() => new Map());

  const [visitorLabels, setVisitorLabels] = useState<Map<string, string>>(() => new Map());

  const [organizerUsers, setOrganizerUsers] = useState<OrganizerUserFilterOption[]>([]);

  const [visitorFilterOptions, setVisitorFilterOptions] = useState<VisitorFilterOption[]>([]);

  const [visitorFilterOpen, setVisitorFilterOpen] = useState(false);

  const [organizerFilterOpen, setOrganizerFilterOpen] = useState(false);



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

    if (!canAccess || audience !== "organizer") {

      setOrganizerUsers([]);

      return;

    }

    void fetchOrganizerUsersForFilter().then(({ data, error: userErr }) => {

      if (userErr) console.warn("[ClientErrorLogsPage] users filter:", userErr);

      setOrganizerUsers(data);

    });

  }, [canAccess, audience]);



  useEffect(() => {

    if (!canAccess || audience !== "visitor") {

      setVisitorFilterOptions([]);

      return;

    }

    void fetchVisitorsForFilter().then(({ data, error: visitorErr }) => {

      if (visitorErr) console.warn("[ClientErrorLogsPage] visitors filter:", visitorErr);

      setVisitorFilterOptions(data);

    });

  }, [canAccess, audience]);



  useEffect(() => {

    if (!canAccess) return;

    void load();

  }, [canAccess, load]);



  useEffect(() => {

    if (audience !== "organizer" || !grouped.length) {

      setProfileNames(new Map());

      return;

    }

    const userIds = grouped

      .map((g) => g.session.auth_user_id)

      .filter((id): id is string => Boolean(id?.trim()));

    void fetchProfileNamesByUserIds(userIds).then(setProfileNames);

  }, [audience, grouped]);



  useEffect(() => {

    if (audience !== "visitor" || !grouped.length) {

      setVisitorLabels(new Map());

      return;

    }

    const clientIds = grouped

      .map((g) => g.session.visitor_client_id)

      .filter((id): id is string => Boolean(id?.trim()));

    void fetchVisitorLabelsByClientIds(clientIds).then(setVisitorLabels);

  }, [audience, grouped]);



  const { totalErrors, totalAuthLogs } = useMemo(() => {
    let errors = 0;
    let auth = 0;
    for (const g of grouped) {
      const split = splitLogsByAuthKind(g.logs);
      errors += split.errors.length;
      auth += split.authLogs.length;
    }
    return { totalErrors: errors, totalAuthLogs: auth };
  }, [grouped]);



  const selectedOrganizerLabel = useMemo(() => {

    if (filters.organizerUserId === ALL_ORGANIZER_USERS) {

      return t("error_logs.filter_all_users");

    }

    return organizerUsers.find((u) => u.id === filters.organizerUserId)?.label ?? "—";

  }, [filters.organizerUserId, organizerUsers, t]);



  const selectedVisitorLabel = useMemo(() => {

    if (filters.visitorClientId === ALL_VISITORS) {

      return t("error_logs.filter_all_visitors");

    }

    return visitorFilterOptions.find((v) => v.id === filters.visitorClientId)?.label ?? "—";

  }, [filters.visitorClientId, t, visitorFilterOptions]);



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

    if (!canDeleteLogs) return;

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

  }, [audience, canDeleteLogs, load, loadSources, selectedSessionIds, t]);



  const handleClearFiltered = useCallback(async () => {

    if (!canDeleteLogs) return;

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

  }, [audience, canDeleteLogs, filters, load, loadSources, t]);



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

        {canDeleteLogs && (

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

        )}

        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || deleting}>

          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />

          {t("error_logs.refresh")}

        </Button>

      </div>



      <Card className="overflow-visible">

        <CardHeader className="pb-2">

          <CardTitle className="text-base">{t("error_logs.filters_title")}</CardTitle>

        </CardHeader>

        <CardContent className="overflow-visible flex flex-col gap-4">

          <div className="flex flex-nowrap items-end gap-2 overflow-visible pb-0.5">

            <div className="flex w-[108px] shrink-0 flex-col gap-1">

              <Label htmlFor="date-mode" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_date_mode")}</Label>

              <Select

                value={filters.dateMode}

                onValueChange={(v) => setFilters((f) => ({ ...f, dateMode: v as "day" | "range" }))}

              >

                <SelectTrigger id="date-mode" className={FILTER_SELECT_TRIGGER_CLASS}>

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  <SelectItem value="day">{t("error_logs.filter_date_mode_day")}</SelectItem>

                  <SelectItem value="range">{t("error_logs.filter_date_mode_range")}</SelectItem>

                </SelectContent>

              </Select>

            </div>



            {filters.dateMode === "day" ? (

              <div className="flex shrink-0 flex-col gap-1">

                <Label htmlFor="date-single" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_date")}</Label>

                <Input

                  id="date-single"

                  type="date"

                  value={filters.dateSingle}

                  className={DATE_PICKER_INPUT_CLASS}

                  onClick={openDatePickerOnClick}

                  onChange={(e) => setFilters((f) => ({ ...f, dateSingle: e.target.value }))}

                />

              </div>

            ) : (

              <div className="flex shrink-0 items-end gap-1">

                <div className="flex flex-col gap-1">

                  <Label htmlFor="date-from" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_date_from")}</Label>

                  <Input

                    id="date-from"

                    type="date"

                    value={filters.dateFrom}

                    className={DATE_PICKER_INPUT_CLASS}

                    onClick={openDatePickerOnClick}

                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}

                  />

                </div>

                <div className="flex flex-col gap-1">

                  <Label htmlFor="date-to" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_date_to")}</Label>

                  <Input

                    id="date-to"

                    type="date"

                    value={filters.dateTo}

                    className={DATE_PICKER_INPUT_CLASS}

                    onClick={openDatePickerOnClick}

                    onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}

                  />

                </div>

              </div>

            )}



            <div className="flex shrink-0 flex-col gap-1">

              <Label htmlFor="time-from" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_time_from")}</Label>

              <Input

                id="time-from"

                type="time"

                value={filters.timeFrom}

                className={FILTER_TIME_CLASS}

                onChange={(e) => setFilters((f) => ({ ...f, timeFrom: e.target.value }))}

              />

            </div>

            <div className="flex shrink-0 flex-col gap-1">

              <Label htmlFor="time-to" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_time_to")}</Label>

              <Input

                id="time-to"

                type="time"

                value={filters.timeTo}

                className={FILTER_TIME_CLASS}

                onChange={(e) => setFilters((f) => ({ ...f, timeTo: e.target.value }))}

              />

            </div>



            <div className="flex w-[168px] shrink-0 flex-col gap-1">

              <Label htmlFor="error-source" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_error_type")}</Label>

              <Select

                value={filters.errorSource}

                onValueChange={(v) => setFilters((f) => ({ ...f, errorSource: v }))}

              >

                <SelectTrigger id="error-source" className={FILTER_SELECT_TRIGGER_CLASS}>

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



            {audience === "organizer" && (

              <div className="flex w-[176px] shrink-0 flex-col gap-1">

                <Label htmlFor="organizer-user" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_user_name")}</Label>

                <Popover open={organizerFilterOpen} onOpenChange={setOrganizerFilterOpen}>

                  <PopoverTrigger asChild>

                    <Button

                      id="organizer-user"

                      type="button"

                      variant="outline"

                      role="combobox"

                      aria-expanded={organizerFilterOpen}

                      className={cn(FILTER_SELECT_TRIGGER_CLASS, "justify-between px-3 font-normal")}

                    >

                      <span className="truncate">{selectedOrganizerLabel}</span>

                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />

                    </Button>

                  </PopoverTrigger>

                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">

                    <Command>

                      <CommandInput placeholder={t("error_logs.filter_user_search")} className="h-9" />

                      <CommandList>

                        <CommandEmpty>{t("error_logs.filter_user_empty")}</CommandEmpty>

                        <CommandGroup>

                          <CommandItem

                            value="__all_users__"

                            onSelect={() => {

                              setFilters((f) => ({ ...f, organizerUserId: ALL_ORGANIZER_USERS }));

                              setOrganizerFilterOpen(false);

                            }}

                          >

                            <Check

                              className={cn(

                                "mr-2 h-4 w-4",

                                filters.organizerUserId === ALL_ORGANIZER_USERS ? "opacity-100" : "opacity-0",

                              )}

                              aria-hidden

                            />

                            {t("error_logs.filter_all_users")}

                          </CommandItem>

                          {organizerUsers.map((user) => (

                            <CommandItem

                              key={user.id}

                              value={`${user.label} ${user.id}`}

                              onSelect={() => {

                                setFilters((f) => ({ ...f, organizerUserId: user.id }));

                                setOrganizerFilterOpen(false);

                              }}

                            >

                              <Check

                                className={cn(

                                  "mr-2 h-4 w-4",

                                  filters.organizerUserId === user.id ? "opacity-100" : "opacity-0",

                                )}

                                aria-hidden

                              />

                              {user.label}

                            </CommandItem>

                          ))}

                        </CommandGroup>

                      </CommandList>

                    </Command>

                  </PopoverContent>

                </Popover>

              </div>

            )}



            {audience === "visitor" && (

              <div className="flex w-[176px] shrink-0 flex-col gap-1">

                <Label htmlFor="visitor-filter" className={FILTER_LABEL_CLASS}>{t("error_logs.filter_visitor")}</Label>

                <Popover open={visitorFilterOpen} onOpenChange={setVisitorFilterOpen}>

                  <PopoverTrigger asChild>

                    <Button

                      id="visitor-filter"

                      type="button"

                      variant="outline"

                      role="combobox"

                      aria-expanded={visitorFilterOpen}

                      className={cn(FILTER_SELECT_TRIGGER_CLASS, "justify-between px-3 font-normal")}

                    >

                      <span className="truncate">{selectedVisitorLabel}</span>

                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />

                    </Button>

                  </PopoverTrigger>

                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">

                    <Command>

                      <CommandInput placeholder={t("error_logs.filter_visitor_search")} className="h-9" />

                      <CommandList>

                        <CommandEmpty>{t("error_logs.filter_visitor_empty")}</CommandEmpty>

                        <CommandGroup>

                          <CommandItem

                            value="__all_visitors__"

                            onSelect={() => {

                              setFilters((f) => ({ ...f, visitorClientId: ALL_VISITORS }));

                              setVisitorFilterOpen(false);

                            }}

                          >

                            <Check

                              className={cn(

                                "mr-2 h-4 w-4",

                                filters.visitorClientId === ALL_VISITORS ? "opacity-100" : "opacity-0",

                              )}

                              aria-hidden

                            />

                            {t("error_logs.filter_all_visitors")}

                          </CommandItem>

                          {visitorFilterOptions.map((visitor) => (

                            <CommandItem

                              key={visitor.id}

                              value={`${visitor.label} ${visitor.id}`}

                              onSelect={() => {

                                setFilters((f) => ({ ...f, visitorClientId: visitor.id }));

                                setVisitorFilterOpen(false);

                              }}

                            >

                              <Check

                                className={cn(

                                  "mr-2 h-4 w-4",

                                  filters.visitorClientId === visitor.id ? "opacity-100" : "opacity-0",

                                )}

                                aria-hidden

                              />

                              {visitor.label}

                            </CommandItem>

                          ))}

                        </CommandGroup>

                      </CommandList>

                    </Command>

                  </PopoverContent>

                </Popover>

              </div>

            )}



            <Button type="button" className="h-9 shrink-0" onClick={() => void load()} disabled={loading || deleting}>

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
            {t("error_logs.period_summary", {
              errorCount: totalErrors,
              authCount: totalAuthLogs,
            })}
          </CardTitle>

          {canDeleteLogs && grouped.length > 0 && (

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
                const { errors: errorLogs, authLogs } = splitLogsByAuthKind(logs);

                const connectionDuration =
                  sessionHasDisconnectEvent(authLogs) && session.ended_at
                    ? formatConnectionDuration(session.started_at, session.ended_at)
                    : null;

                const sessionDates = session.ended_at

                  ? `${formatClientErrorDate(session.started_at, locale)} → ${formatClientErrorDate(session.ended_at, locale)}${connectionDuration ? ` · ${t("error_logs.session_duration", { duration: connectionDuration })}` : ""}`

                  : `${formatClientErrorDate(session.started_at, locale)} · ${t("error_logs.session_open")}`;

                const metaLine = sessionClientLabel(audience, session, profileNames, visitorLabels);



                return (

                  <li key={session.id} className="py-0.5">

                    <div className="flex items-center gap-1.5 rounded-md px-1 hover:bg-muted/40">

                      {canDeleteLogs && (

                      <Checkbox

                        checked={selectedSessionIds.has(session.id)}

                        onCheckedChange={(v) => toggleSession(session.id, v === true)}

                        aria-label={t("error_logs.mark_resolved")}

                        className="shrink-0"

                      />

                      )}

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

                        <span className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          {errorLogs.length > 0 ? (
                            <span className="font-medium text-[#E63946]">
                              {t("error_logs.error_count", { count: errorLogs.length })}
                            </span>
                          ) : null}
                          {authLogs.length > 0 ? (
                            <span className="font-medium text-sky-400">
                              {t("error_logs.auth_log_count", { count: authLogs.length })}
                            </span>
                          ) : null}
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

                      <div className={cn("space-y-1 border-l border-border py-1 pl-3", canDeleteLogs ? "ml-7" : "ml-1")}>

                        {logs.map((log) => {
                          const authEvent = isAuthEventSource(log.error_source);
                          const disconnectEvent = isDisconnectEventSource(log.error_source);
                          const logConnectionDuration =
                            disconnectEvent && session.ended_at
                              ? formatConnectionDuration(session.started_at, session.ended_at)
                              : null;
                          return (
                            <div
                              key={log.id}
                              className={cn(
                                "rounded border px-2 py-1.5 text-xs",
                                authEvent
                                  ? "border-sky-400/30 bg-sky-400/5"
                                  : "border-border/60 bg-muted/20",
                              )}
                            >
                              <div className="flex flex-wrap gap-x-1.5 gap-y-0 text-muted-foreground">
                                <span>{formatClientErrorDate(log.created_at, locale)}</span>
                                <span>·</span>
                                <span className={authEvent ? "text-sky-400" : undefined}>
                                  {clientErrorSourceLabel(log.error_source, t)}
                                </span>
                                {logConnectionDuration && (
                                  <>
                                    <span>·</span>
                                    <span className="text-sky-400">
                                      {t("error_logs.session_duration", { duration: logConnectionDuration })}
                                    </span>
                                  </>
                                )}
                                {log.page_url && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{log.page_url}</span>
                                  </>
                                )}
                              </div>
                              <p
                                className={cn(
                                  "mt-0.5 font-medium leading-snug",
                                  authEvent ? "text-sky-400" : "text-destructive",
                                )}
                              >
                                {log.error_message}
                              </p>
                              {log.error_stack && (
                                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-tight text-muted-foreground">
                                  {log.error_stack}
                                </pre>
                              )}
                            </div>
                          );
                        })}

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


