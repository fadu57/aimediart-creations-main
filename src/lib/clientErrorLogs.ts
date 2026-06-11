import { supabase } from "@/lib/supabase";
import type { ErrorLogAudience } from "@/lib/clientErrorLogging";

export type ClientErrorSessionRow = {
  id: string;
  visitor_client_id?: string | null;
  auth_user_id: string | null;
  agency_id?: string | null;
  expo_id?: string | null;
  started_at: string;
  ended_at: string | null;
  user_agent: string | null;
  last_page_url: string | null;
  locale: string | null;
  timezone: string | null;
};

export type ClientErrorLogRow = {
  id: string;
  session_id: string;
  error_message: string;
  error_stack: string | null;
  error_source: string;
  page_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ClientErrorLogWithSession = ClientErrorLogRow & {
  session: ClientErrorSessionRow | null;
};

export type ClientErrorDateMode = "day" | "range";

export type ClientErrorLogFilters = {
  dateMode: ClientErrorDateMode;
  dateSingle: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  errorSource: string;
};

export const ALL_ERROR_SOURCES = "all";

/** Clés i18n (`settings.error_logs.source_*`) pour les codes `error_source` connus. */
export const CLIENT_ERROR_SOURCE_I18N_KEYS: Record<string, string> = {
  "toast.error": "error_logs.source_toast",
  unhandledrejection: "error_logs.source_unhandledrejection",
  "window.error": "error_logs.source_window_error",
};

export function clientErrorSourceLabel(
  source: string,
  t: (key: string) => string,
): string {
  const key = CLIENT_ERROR_SOURCE_I18N_KEYS[source.trim()];
  return key ? t(key) : source;
}

function tablesForAudience(audience: ErrorLogAudience): {
  sessions: string;
  logs: string;
  sessionFk: string;
} {
  if (audience === "organizer") {
    return {
      sessions: "organizer_error_sessions",
      logs: "organizer_error_logs",
      sessionFk: "organizer_error_sessions",
    };
  }
  return {
    sessions: "visitor_error_sessions",
    logs: "visitor_error_logs",
    sessionFk: "visitor_error_sessions",
  };
}

/** Combine date + heure locale en ISO UTC pour filtre Supabase. */
export function buildClientErrorFilterRange(filters: ClientErrorLogFilters): {
  fromIso: string;
  toIso: string;
} {
  const pad = (v: string) => v.padStart(2, "0");
  const [hFrom, mFrom] = (filters.timeFrom || "00:00").split(":").map((x) => pad(x || "0"));
  const [hTo, mTo] = (filters.timeTo || "23:59").split(":").map((x) => pad(x || "0"));

  let dateStart = filters.dateSingle;
  let dateEnd = filters.dateSingle;
  if (filters.dateMode === "range") {
    dateStart = filters.dateFrom || filters.dateSingle;
    dateEnd = filters.dateTo || filters.dateFrom || filters.dateSingle;
  }

  const fromLocal = new Date(`${dateStart}T${hFrom}:${mFrom}:00`);
  const toLocal = new Date(`${dateEnd}T${hTo}:${mTo}:59.999`);

  return {
    fromIso: fromLocal.toISOString(),
    toIso: toLocal.toISOString(),
  };
}

export function defaultClientErrorFilters(today = new Date()): ClientErrorLogFilters {
  const iso = today.toISOString().slice(0, 10);
  return {
    dateMode: "day",
    dateSingle: iso,
    dateFrom: iso,
    dateTo: iso,
    timeFrom: "00:00",
    timeTo: "23:59",
    errorSource: ALL_ERROR_SOURCES,
  };
}

export async function fetchDistinctErrorSources(
  audience: ErrorLogAudience,
): Promise<{ data: string[]; error: string | null }> {
  const { logs } = tablesForAudience(audience);
  const { data, error } = await supabase.from(logs).select("error_source").limit(5000);
  if (error) return { data: [], error: error.message };

  const set = new Set<string>();
  for (const row of data ?? []) {
    const src = (row as { error_source?: string }).error_source?.trim();
    if (src) set.add(src);
  }
  return { data: [...set].sort(), error: null };
}

export async function fetchClientErrorLogs(
  audience: ErrorLogAudience,
  filters: ClientErrorLogFilters,
  limit = 500,
): Promise<{ data: ClientErrorLogWithSession[]; error: string | null }> {
  const { logs, sessionFk } = tablesForAudience(audience);
  const { fromIso, toIso } = buildClientErrorFilterRange(filters);

  let query = supabase
    .from(logs)
    .select(`*, ${sessionFk}(*)`)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.errorSource !== ALL_ERROR_SOURCES) {
    query = query.eq("error_source", filters.errorSource);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  const mapped = (data ?? []).map((row) => {
    const r = row as ClientErrorLogRow & Record<string, ClientErrorSessionRow | null>;
    const session = r[sessionFk] ?? null;
    const { [sessionFk]: _drop, ...log } = r;
    return { ...log, session } as ClientErrorLogWithSession;
  });

  return { data: mapped, error: null };
}

export async function deleteClientErrorSessions(
  audience: ErrorLogAudience,
  sessionIds: string[],
): Promise<{ error: string | null }> {
  if (!sessionIds.length) return { error: null };
  const { sessions } = tablesForAudience(audience);
  const { error } = await supabase.from(sessions).delete().in("id", sessionIds);
  return { error: error?.message ?? null };
}

/** Supprime les sessions contenant au moins un log correspondant aux filtres courants. */
export async function deleteClientErrorSessionsForFilters(
  audience: ErrorLogAudience,
  filters: ClientErrorLogFilters,
): Promise<{ deletedCount: number; error: string | null }> {
  const { data, error: fetchErr } = await fetchClientErrorLogs(audience, filters, 5000);
  if (fetchErr) return { deletedCount: 0, error: fetchErr };

  const sessionIds = [...new Set(data.map((row) => row.session_id).filter(Boolean))];
  if (!sessionIds.length) return { deletedCount: 0, error: null };

  const { error } = await deleteClientErrorSessions(audience, sessionIds);
  return { deletedCount: error ? 0 : sessionIds.length, error };
}

export function formatClientErrorDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function groupLogsBySession(
  logs: ClientErrorLogWithSession[],
): Array<{ session: ClientErrorSessionRow; logs: ClientErrorLogRow[] }> {
  const map = new Map<string, { session: ClientErrorSessionRow; logs: ClientErrorLogRow[] }>();

  for (const row of logs) {
    const session = row.session;
    if (!session) continue;
    const existing = map.get(session.id);
    const { session: _s, ...logRow } = row;
    if (existing) {
      existing.logs.push(logRow);
    } else {
      map.set(session.id, { session, logs: [logRow] });
    }
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.session.started_at).getTime() - new Date(a.session.started_at).getTime(),
  );
}

export function sessionClientLabel(
  audience: ErrorLogAudience,
  session: ClientErrorSessionRow,
): string {
  if (audience === "visitor") {
    const id = session.visitor_client_id?.trim();
    return id ? id.slice(0, 12) + (id.length > 12 ? "…" : "") : "—";
  }
  const id = session.auth_user_id?.trim();
  return id ? id.slice(0, 8) + "…" : "—";
}

/** @deprecated */
export type VisitorErrorSessionRow = ClientErrorSessionRow & {
  visitor_error_logs: { count: number }[];
};
/** @deprecated */
export type VisitorErrorLogRow = ClientErrorLogRow;

export {
  fetchClientErrorLogs as fetchVisitorErrorLogsFiltered,
  formatClientErrorDate as formatVisitorErrorDate,
};
