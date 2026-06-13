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
  /** Organisateur : filtre par utilisateur (profiles.id). */
  organizerUserId: string;
  /** Visiteur : filtre par visitor_client_id. */
  visitorClientId: string;
};

export const ALL_ERROR_SOURCES = "all";
export const ALL_ORGANIZER_USERS = "all";
export const ALL_VISITORS = "all";

/** Codes `error_source` pour connexion / déconnexion / session. */
export const AUTH_EVENT_SOURCES = [
  "auth.sign_in",
  "auth.sign_out",
  "auth.session_start",
  "auth.session_end",
] as const;

export type AuthEventSource = (typeof AUTH_EVENT_SOURCES)[number];

/** Clés i18n (`settings.error_logs.source_*`) pour les codes `error_source` connus. */
export const CLIENT_ERROR_SOURCE_I18N_KEYS: Record<string, string> = {
  "toast.error": "error_logs.source_toast",
  unhandledrejection: "error_logs.source_unhandledrejection",
  "window.error": "error_logs.source_window_error",
  "auth.sign_in": "error_logs.source_auth_sign_in",
  "auth.sign_out": "error_logs.source_auth_sign_out",
  "auth.session_start": "error_logs.source_auth_session_start",
  "auth.session_end": "error_logs.source_auth_session_end",
};

export function isAuthEventSource(source: string): boolean {
  return (AUTH_EVENT_SOURCES as readonly string[]).includes(source.trim());
}

export function splitLogsByAuthKind(logs: ClientErrorLogRow[]): {
  errors: ClientErrorLogRow[];
  authLogs: ClientErrorLogRow[];
} {
  const errors: ClientErrorLogRow[] = [];
  const authLogs: ClientErrorLogRow[] = [];
  for (const log of logs) {
    if (isAuthEventSource(log.error_source)) authLogs.push(log);
    else errors.push(log);
  }
  return { errors, authLogs };
}

const DISCONNECT_EVENT_SOURCES = new Set(["auth.sign_out", "auth.session_end"]);

export function sessionHasDisconnectEvent(logs: ClientErrorLogRow[]): boolean {
  return logs.some((log) => DISCONNECT_EVENT_SOURCES.has(log.error_source.trim()));
}

export function isDisconnectEventSource(source: string): boolean {
  return DISCONNECT_EVENT_SOURCES.has(source.trim());
}

/** Durée lisible entre début et fin de session (ex. « 5 min », « 1 h 12 min »). */
export function formatConnectionDuration(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;

  const totalSeconds = Math.floor((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
}

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
    organizerUserId: ALL_ORGANIZER_USERS,
    visitorClientId: ALL_VISITORS,
  };
}

export async function fetchDistinctErrorSources(
  audience: ErrorLogAudience,
): Promise<{ data: string[]; error: string | null }> {
  const { logs } = tablesForAudience(audience);
  const { data, error } = await supabase.from(logs).select("error_source").limit(5000);
  if (error) return { data: [], error: error.message };

  const set = new Set<string>(AUTH_EVENT_SOURCES);
  for (const row of data ?? []) {
    const src = (row as { error_source?: string }).error_source?.trim();
    if (src) set.add(src);
  }
  return { data: [...set].sort(), error: null };
}

function syntheticAuthLogsForSession(
  session: ClientErrorSessionRow,
  existingBySource: Set<string>,
): ClientErrorLogRow[] {
  const rows: ClientErrorLogRow[] = [];
  if (!existingBySource.has("auth.session_start")) {
    rows.push({
      id: `syn-start-${session.id}`,
      session_id: session.id,
      error_message: "Début de session (connexion au parcours)",
      error_stack: null,
      error_source: "auth.session_start",
      page_url: session.last_page_url,
      metadata: null,
      created_at: session.started_at,
    });
  }
  if (session.ended_at && !existingBySource.has("auth.session_end")) {
    rows.push({
      id: `syn-end-${session.id}`,
      session_id: session.id,
      error_message: "Fin de session (déconnexion ou fermeture onglet)",
      error_stack: null,
      error_source: "auth.session_end",
      page_url: session.last_page_url,
      metadata: null,
      created_at: session.ended_at,
    });
  }
  return rows;
}

function shouldIncludeAuthSynthetic(filters: ClientErrorLogFilters): boolean {
  if (filters.errorSource === ALL_ERROR_SOURCES) return true;
  return filters.errorSource === "auth.session_start" || filters.errorSource === "auth.session_end";
}

async function fetchSessionsForAuthSynthetic(
  audience: ErrorLogAudience,
  fromIso: string,
  toIso: string,
): Promise<ClientErrorSessionRow[]> {
  const { sessions } = tablesForAudience(audience);
  const [{ data: started }, { data: ended }] = await Promise.all([
    supabase
      .from(sessions)
      .select("*")
      .gte("started_at", fromIso)
      .lte("started_at", toIso)
      .limit(2000),
    supabase
      .from(sessions)
      .select("*")
      .not("ended_at", "is", null)
      .gte("ended_at", fromIso)
      .lte("ended_at", toIso)
      .limit(2000),
  ]);

  const byId = new Map<string, ClientErrorSessionRow>();
  for (const row of [...(started ?? []), ...(ended ?? [])] as ClientErrorSessionRow[]) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export type OrganizerUserFilterOption = {
  id: string;
  label: string;
};

/** Liste des utilisateurs organisateurs pour le filtre déroulant. */
export async function fetchOrganizerUsersForFilter(): Promise<{
  data: OrganizerUserFilterOption[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("get_all_users_with_roles");
  if (error) return { data: [], error: error.message };

  const options: OrganizerUserFilterOption[] = [];
  for (const row of data ?? []) {
    const r = row as {
      id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      role_id?: number | null;
    };
    const id = r.id?.trim();
    if (!id) continue;
    if (r.role_id === 7) continue;
    const label =
      formatProfileFullName(r.first_name, r.last_name) ??
      r.username?.trim() ??
      id.slice(0, 8);
    options.push({ id, label });
  }

  options.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return { data: options, error: null };
}

function sessionMatchesOrganizerUserFilter(
  session: ClientErrorSessionRow | null,
  matchingUserIds: Set<string> | null,
): boolean {
  if (!matchingUserIds) return true;
  const userId = session?.auth_user_id?.trim();
  return Boolean(userId && matchingUserIds.has(userId));
}

function sessionMatchesVisitorClientFilter(
  session: ClientErrorSessionRow | null,
  matchingClientIds: Set<string> | null,
): boolean {
  if (!matchingClientIds) return true;
  const clientId = session?.visitor_client_id?.trim();
  return Boolean(clientId && matchingClientIds.has(clientId));
}

function sessionMatchesAudienceFilter(
  audience: ErrorLogAudience,
  session: ClientErrorSessionRow | null,
  matchingOrganizerUserIds: Set<string> | null,
  matchingVisitorClientIds: Set<string> | null,
): boolean {
  if (audience === "organizer") {
    return sessionMatchesOrganizerUserFilter(session, matchingOrganizerUserIds);
  }
  if (audience === "visitor") {
    return sessionMatchesVisitorClientFilter(session, matchingVisitorClientIds);
  }
  return true;
}

export async function fetchClientErrorLogs(
  audience: ErrorLogAudience,
  filters: ClientErrorLogFilters,
  limit = 500,
): Promise<{ data: ClientErrorLogWithSession[]; error: string | null }> {
  const { logs, sessionFk } = tablesForAudience(audience);
  const { fromIso, toIso } = buildClientErrorFilterRange(filters);

  const userIdFilter = filters.organizerUserId?.trim() ?? "";
  const matchingOrganizerUserIds =
    audience === "organizer" && userIdFilter && userIdFilter !== ALL_ORGANIZER_USERS
      ? new Set([userIdFilter])
      : null;

  const visitorIdFilter = filters.visitorClientId?.trim() ?? "";
  const matchingVisitorClientIds =
    audience === "visitor" && visitorIdFilter && visitorIdFilter !== ALL_VISITORS
      ? new Set([visitorIdFilter])
      : null;

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
  }).filter((row) =>
    sessionMatchesAudienceFilter(
      audience,
      row.session,
      matchingOrganizerUserIds,
      matchingVisitorClientIds,
    ),
  );

  if (shouldIncludeAuthSynthetic(filters)) {
    const sessions = (await fetchSessionsForAuthSynthetic(audience, fromIso, toIso)).filter(
      (session) =>
        sessionMatchesAudienceFilter(
          audience,
          session,
          matchingOrganizerUserIds,
          matchingVisitorClientIds,
        ),
    );
    const logsBySession = new Map<string, ClientErrorLogRow[]>();
    for (const row of mapped) {
      const list = logsBySession.get(row.session_id) ?? [];
      list.push(row);
      logsBySession.set(row.session_id, list);
    }

    for (const session of sessions) {
      const existingSources = new Set(
        (logsBySession.get(session.id) ?? []).map((l) => l.error_source),
      );
      const synthetic = syntheticAuthLogsForSession(session, existingSources).filter((log) => {
        if (filters.errorSource === ALL_ERROR_SOURCES) return true;
        return log.error_source === filters.errorSource;
      });
      if (!synthetic.length) continue;

      for (const log of synthetic) {
        mapped.push({ ...log, session });
      }
    }
  }

  mapped.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { data: mapped.slice(0, limit), error: null };
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
  profileNames?: ReadonlyMap<string, string>,
  visitorLabels?: ReadonlyMap<string, string>,
): string {
  if (audience === "visitor") {
    const id = session.visitor_client_id?.trim();
    if (!id) return "—";
    const label = visitorLabels?.get(id);
    if (label) return label;
    return id.slice(0, 12) + "…";
  }
  const userId = session.auth_user_id?.trim();
  if (!userId) return "—";
  const name = profileNames?.get(userId);
  if (name) return name;
  return userId.slice(0, 8) + "…";
}

export function formatProfileFullName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function readNameFromLogMetadata(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== "object") return null;
  return (
    formatProfileFullName(
      typeof meta.first_name === "string"
        ? meta.first_name
        : typeof meta.prenom === "string"
          ? meta.prenom
          : null,
      typeof meta.last_name === "string"
        ? meta.last_name
        : typeof meta.nom === "string"
          ? meta.nom
          : null,
    ) ?? null
  );
}

/** Prénom + nom pour les logs auth organisateur (session ou metadata du log). */
export function authLogOrganizerDisplayName(
  session: ClientErrorSessionRow,
  log: ClientErrorLogRow,
  profileNames: ReadonlyMap<string, string>,
): string | null {
  const fromMeta = readNameFromLogMetadata(log.metadata);
  if (fromMeta) return fromMeta;
  const userId = session.auth_user_id?.trim();
  if (!userId) return null;
  return profileNames.get(userId) ?? null;
}

export type VisitorFilterOption = {
  id: string;
  label: string;
};

const ANONYMOUS_VISITOR_NAMES = new Set(["anonymous", "anonyme"]);

/** Libellé visiteur : prénom + nom (ou nom complet), sinon pseudo. */
export function formatVisitorDisplayLabel(
  visitorName?: string | null,
  visitorPseudo?: string | null,
  profileFirstName?: string | null,
  profileLastName?: string | null,
): string | null {
  const fromProfile = formatProfileFullName(profileFirstName, profileLastName);
  if (fromProfile) return fromProfile;

  const name = visitorName?.trim();
  if (name && !ANONYMOUS_VISITOR_NAMES.has(name.toLowerCase())) return name;

  const pseudo = visitorPseudo?.trim();
  if (pseudo) return pseudo;

  return null;
}

function applyVisitorRowLabel(
  result: Map<string, string>,
  clientId: string,
  visitorName?: string | null,
  visitorPseudo?: string | null,
): void {
  const label = formatVisitorDisplayLabel(visitorName, visitorPseudo);
  if (label) result.set(clientId, label);
}

/** Labels visiteur pour affichage (sessions / logs). */
export async function fetchVisitorLabelsByClientIds(
  clientIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(clientIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, string>();
  if (!unique.length) return result;

  const { data: byClientId, error } = await supabase
    .from("visitors")
    .select("id, visitor_client_id, visitor_name, visitor_pseudo")
    .in("visitor_client_id", unique);

  if (error) return result;

  const unresolved = new Set(unique);
  for (const row of byClientId ?? []) {
    const r = row as {
      id?: string | null;
      visitor_client_id?: string | null;
      visitor_name?: string | null;
      visitor_pseudo?: string | null;
    };
    const clientId = r.visitor_client_id?.trim();
    if (!clientId || !unresolved.has(clientId)) continue;
    unresolved.delete(clientId);
    applyVisitorRowLabel(result, clientId, r.visitor_name, r.visitor_pseudo);
  }

  if (unresolved.size > 0) {
    const { data: byId } = await supabase
      .from("visitors")
      .select("id, visitor_client_id, visitor_name, visitor_pseudo")
      .in("id", [...unresolved]);
    for (const row of byId ?? []) {
      const r = row as {
        id?: string | null;
        visitor_name?: string | null;
        visitor_pseudo?: string | null;
      };
      const id = r.id?.trim();
      if (!id || !unresolved.has(id)) continue;
      applyVisitorRowLabel(result, id, r.visitor_name, r.visitor_pseudo);
    }
  }

  return result;
}

/** Liste des visiteurs pour le filtre déroulant (autocomplétion). */
export async function fetchVisitorsForFilter(): Promise<{
  data: VisitorFilterOption[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("visitors")
    .select("id, visitor_client_id, visitor_name, visitor_pseudo")
    .is("deleted_at", null)
    .limit(3000);

  if (error) return { data: [], error: error.message };

  const options: VisitorFilterOption[] = [];
  const seen = new Set<string>();

  for (const row of data ?? []) {
    const r = row as {
      id?: string | null;
      visitor_client_id?: string | null;
      visitor_name?: string | null;
      visitor_pseudo?: string | null;
    };
    const clientId = (r.visitor_client_id ?? r.id)?.trim();
    if (!clientId || seen.has(clientId)) continue;
    seen.add(clientId);
    const label =
      formatVisitorDisplayLabel(r.visitor_name, r.visitor_pseudo) ??
      `${clientId.slice(0, 12)}…`;
    options.push({ id: clientId, label });
  }

  options.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return { data: options, error: null };
}

export async function fetchProfileNamesByUserIds(
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, string>();
  if (!unique.length) return result;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", unique);

  if (error) return result;

  for (const row of data ?? []) {
    const id = (row as { id?: string }).id?.trim();
    if (!id) continue;
    const name = formatProfileFullName(
      (row as { first_name?: string | null }).first_name,
      (row as { last_name?: string | null }).last_name,
    );
    if (name) result.set(id, name);
  }
  return result;
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
