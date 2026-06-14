import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Circle,
  Loader2,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatClientErrorDate } from "@/lib/clientErrorLogs";
import {
  fetchPresenceThresholdSettings,
  formatPresenceHoursLabel,
  formatPresenceMinutesLabel,
} from "@/lib/presenceThresholds";
import {
  buildPersonFilterOptions,
  defaultOnlinePresenceFilters,
  enrichOnlinePresenceRows,
  fetchOnlinePresenceRows,
  isLivePresenceScope,
  type OnlinePresenceEnrichedRow,
  type OnlinePresenceFilters,
  type PersonFilterOption,
  type PresenceScope,
  type PresenceState,
} from "@/lib/onlinePresence";
import { cn } from "@/lib/utils";

const FILTER_LABEL_CLASS = "text-xs font-medium leading-none";
const FILTER_DATE_CLASS =
  "relative h-9 w-[112px] shrink-0 cursor-pointer px-1.5 text-sm [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";
const FILTER_TIME_CLASS = "h-9 w-[96px] shrink-0 text-sm";
const FILTER_SELECT_TRIGGER_CLASS = "h-9 w-full text-sm";

const PRESENCE_STATE_STYLE: Record<
  PresenceState,
  { className: string; pulse: boolean }
> = {
  active: { className: "text-emerald-400", pulse: true },
  idle: { className: "text-amber-400", pulse: false },
  abandoned: { className: "text-orange-500/90", pulse: false },
  closed: { className: "text-muted-foreground", pulse: false },
};

function dateLocale(lang: string): string {
  const code = (lang ?? "fr").slice(0, 2);
  const map: Record<string, string> = {
    fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES", it: "it-IT",
  };
  return map[code] ?? "fr-FR";
}

function openDatePickerOnClick(e: React.MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // ignore
  }
}

export function OnlinePresencePage() {
  const { t, i18n } = useTranslation("settings");
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = role_id === 1;

  const [filters, setFilters] = useState<OnlinePresenceFilters>(() => defaultOnlinePresenceFilters());
  const [rows, setRows] = useState<OnlinePresenceEnrichedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personOptions, setPersonOptions] = useState<PersonFilterOption[]>([]);
  const [personFilterOpen, setPersonFilterOpen] = useState(false);
  const [thresholdLabels, setThresholdLabels] = useState<{
    orgActive: string;
    orgAbandoned: string;
    visActive: string;
    visAbandoned: string;
  } | null>(null);

  const locale = dateLocale(i18n.language);

  const loadPersonOptions = useCallback(async () => {
    const options = await buildPersonFilterOptions(filters.audience);
    setPersonOptions(options);
  }, [filters.audience]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data, error: err }, { data: thresholdSettings, ms: thresholdsMs }] = await Promise.all([
      fetchOnlinePresenceRows(filters),
      fetchPresenceThresholdSettings(),
    ]);
    setThresholdLabels({
      orgActive: formatPresenceMinutesLabel(thresholdSettings.organizer.activeMinutes, t),
      orgAbandoned: formatPresenceHoursLabel(thresholdSettings.organizer.abandonedHours, t),
      visActive: formatPresenceMinutesLabel(thresholdSettings.visitor.activeMinutes, t),
      visAbandoned: formatPresenceHoursLabel(thresholdSettings.visitor.abandonedHours, t),
    });
    if (err) {
      setLoading(false);
      setError(err);
      setRows([]);
      return;
    }
    const enriched = await enrichOnlinePresenceRows(data, filters, Date.now(), thresholdsMs);
    setRows(enriched);
    setLoading(false);
  }, [filters, t]);

  useEffect(() => {
    if (!canAccess) return;
    void loadPersonOptions();
  }, [canAccess, loadPersonOptions]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  useEffect(() => {
    if (!canAccess || !isLivePresenceScope(filters.presenceScope)) return;
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [canAccess, filters.presenceScope, load]);

  const selectedPersonLabel = useMemo(() => {
    if (filters.personFilter === "all") {
      return t("online_presence.filter_all_persons");
    }
    return personOptions.find((o) => o.value === filters.personFilter)?.label ?? "—";
  }, [filters.personFilter, personOptions, t]);

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.presenceState === "active").length,
      idle: rows.filter((r) => r.presenceState === "idle").length,
      abandoned: rows.filter((r) => r.presenceState === "abandoned").length,
      closed: rows.filter((r) => r.presenceState === "closed").length,
    }),
    [rows],
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
            {t("online_presence.back_settings")}
          </Link>
        </Button>
        <h1 className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight">
          <Users className="h-6 w-6 shrink-0 text-sky-400" aria-hidden />
          <span className="shrink-0">{t("online_presence.page_title")}</span>
          <span className="text-sm font-normal text-muted-foreground">{t("online_presence.page_sub")}</span>
        </h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings?section=presence-seuils">
            <Settings2 className="mr-2 h-4 w-4" aria-hidden />
            {t("online_presence.link_thresholds")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
          {t("online_presence.refresh")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {thresholdLabels
          ? t("online_presence.thresholds_hint_dynamic", thresholdLabels)
          : t("online_presence.thresholds_hint")}
      </p>

      <Card className="overflow-visible">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("online_presence.filters_title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-visible flex flex-col gap-4">
          <div className="flex flex-nowrap items-end gap-2 overflow-visible pb-0.5">
            <div className="flex w-[108px] shrink-0 flex-col gap-1">
              <Label htmlFor="online-date-mode" className={FILTER_LABEL_CLASS}>
                {t("online_presence.filter_date_mode")}
              </Label>
              <Select
                value={filters.dateMode}
                onValueChange={(v) => setFilters((f) => ({ ...f, dateMode: v as "day" | "range" }))}
              >
                <SelectTrigger id="online-date-mode" className={FILTER_SELECT_TRIGGER_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t("online_presence.filter_date_mode_day")}</SelectItem>
                  <SelectItem value="range">{t("online_presence.filter_date_mode_range")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filters.dateMode === "day" ? (
              <div className="flex shrink-0 flex-col gap-1">
                <Label htmlFor="online-date-single" className={FILTER_LABEL_CLASS}>
                  {t("online_presence.filter_date")}
                </Label>
                <Input
                  id="online-date-single"
                  type="date"
                  value={filters.dateSingle}
                  className={FILTER_DATE_CLASS}
                  onClick={openDatePickerOnClick}
                  onChange={(e) => setFilters((f) => ({ ...f, dateSingle: e.target.value }))}
                />
              </div>
            ) : (
              <div className="flex shrink-0 items-end gap-1">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="online-date-from" className={FILTER_LABEL_CLASS}>
                    {t("online_presence.filter_date_from")}
                  </Label>
                  <Input
                    id="online-date-from"
                    type="date"
                    value={filters.dateFrom}
                    className={FILTER_DATE_CLASS}
                    onClick={openDatePickerOnClick}
                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="online-date-to" className={FILTER_LABEL_CLASS}>
                    {t("online_presence.filter_date_to")}
                  </Label>
                  <Input
                    id="online-date-to"
                    type="date"
                    value={filters.dateTo}
                    className={FILTER_DATE_CLASS}
                    onClick={openDatePickerOnClick}
                    onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="flex shrink-0 flex-col gap-1">
              <Label htmlFor="online-time-from" className={FILTER_LABEL_CLASS}>
                {t("online_presence.filter_time_from")}
              </Label>
              <Input
                id="online-time-from"
                type="time"
                value={filters.timeFrom}
                className={FILTER_TIME_CLASS}
                onChange={(e) => setFilters((f) => ({ ...f, timeFrom: e.target.value }))}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Label htmlFor="online-time-to" className={FILTER_LABEL_CLASS}>
                {t("online_presence.filter_time_to")}
              </Label>
              <Input
                id="online-time-to"
                type="time"
                value={filters.timeTo}
                className={FILTER_TIME_CLASS}
                onChange={(e) => setFilters((f) => ({ ...f, timeTo: e.target.value }))}
              />
            </div>

            <div className="flex w-[140px] shrink-0 flex-col gap-1">
              <Label htmlFor="online-audience" className={FILTER_LABEL_CLASS}>
                {t("online_presence.filter_audience")}
              </Label>
              <Select
                value={filters.audience}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    audience: v as OnlinePresenceFilters["audience"],
                    personFilter: "all",
                  }))
                }
              >
                <SelectTrigger id="online-audience" className={FILTER_SELECT_TRIGGER_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("online_presence.filter_audience_all")}</SelectItem>
                  <SelectItem value="organizer">{t("online_presence.filter_audience_organizer")}</SelectItem>
                  <SelectItem value="visitor">{t("online_presence.filter_audience_visitor")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex w-[176px] shrink-0 flex-col gap-1">
              <Label htmlFor="online-person" className={FILTER_LABEL_CLASS}>
                {t("online_presence.filter_person")}
              </Label>
              <Popover open={personFilterOpen} onOpenChange={setPersonFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="online-person"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={personFilterOpen}
                    className={cn(FILTER_SELECT_TRIGGER_CLASS, "justify-between px-3 font-normal")}
                  >
                    <span className="truncate">{selectedPersonLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("online_presence.filter_person_search")} className="h-9" />
                    <CommandList>
                      <CommandEmpty>{t("online_presence.filter_person_empty")}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__all__"
                          onSelect={() => {
                            setFilters((f) => ({ ...f, personFilter: "all" }));
                            setPersonFilterOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              filters.personFilter === "all" ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden
                          />
                          {t("online_presence.filter_all_persons")}
                        </CommandItem>
                        {personOptions.map((option) => (
                          <CommandItem
                            key={option.value}
                            value={`${option.label} ${option.value}`}
                            onSelect={() => {
                              setFilters((f) => ({ ...f, personFilter: option.value }));
                              setPersonFilterOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                filters.personFilter === option.value ? "opacity-100" : "opacity-0",
                              )}
                              aria-hidden
                            />
                            {option.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex w-[168px] shrink-0 flex-col gap-1">
              <Label htmlFor="online-presence-scope" className={FILTER_LABEL_CLASS}>
                {t("online_presence.filter_presence_scope")}
              </Label>
              <Select
                value={filters.presenceScope}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, presenceScope: v as PresenceScope }))
                }
              >
                <SelectTrigger id="online-presence-scope" className={FILTER_SELECT_TRIGGER_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active_idle">{t("online_presence.scope_active_idle")}</SelectItem>
                  <SelectItem value="active_only">{t("online_presence.scope_active_only")}</SelectItem>
                  <SelectItem value="all_open">{t("online_presence.scope_all_open")}</SelectItem>
                  <SelectItem value="all">{t("online_presence.scope_all")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="button" className="h-9 shrink-0" onClick={() => void load()} disabled={loading}>
              {t("online_presence.apply_filters")}
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
            {t("online_presence.summary", {
              total: rows.length,
              active: counts.active,
              idle: counts.idle,
              abandoned: counts.abandoned,
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("online_presence.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2">{t("online_presence.col_status")}</th>
                    <th className="px-2 py-2">{t("online_presence.col_type")}</th>
                    <th className="px-2 py-2">{t("online_presence.col_name")}</th>
                    <th className="px-2 py-2">{t("online_presence.col_since")}</th>
                    <th className="px-2 py-2">{t("online_presence.col_last_activity")}</th>
                    <th className="px-2 py-2">{t("online_presence.col_duration")}</th>
                    <th className="px-2 py-2">{t("online_presence.col_page")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const style = PRESENCE_STATE_STYLE[row.presenceState];
                    return (
                      <tr key={`${row.audience}-${row.id}`} className="border-b border-border/60">
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs font-medium",
                              style.className,
                            )}
                          >
                            <Circle
                              className={cn("h-2 w-2 fill-current", style.pulse && "animate-pulse")}
                              aria-hidden
                            />
                            {t(`online_presence.status_${row.presenceState}`)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {row.audience === "organizer"
                            ? t("online_presence.type_organizer")
                            : t("online_presence.type_visitor")}
                        </td>
                        <td className="px-2 py-2 font-medium">{row.label}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                          {formatClientErrorDate(row.started_at, locale)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs">
                          {row.presenceState === "closed" ? (
                            formatClientErrorDate(row.last_activity_at, locale)
                          ) : (
                            <span
                              className={cn(
                                row.presenceState === "active" && "font-medium text-sky-400",
                                row.presenceState === "idle" && "text-amber-400/90",
                                row.presenceState === "abandoned" && "text-muted-foreground",
                              )}
                            >
                              {t("online_presence.last_activity_ago", { duration: row.lastActivityLabel })}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs">
                          {row.presenceState === "active" ? (
                            <span className="font-medium text-sky-400">{row.durationLabel}</span>
                          ) : (
                            row.durationLabel
                          )}
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-2 text-xs text-muted-foreground">
                          {row.last_page_url || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
