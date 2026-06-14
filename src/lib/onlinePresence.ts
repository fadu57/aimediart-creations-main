import { supabase } from "@/lib/supabase";
import {
  ALL_ORGANIZER_USERS,
  ALL_VISITORS,
  buildClientErrorFilterRange,
  fetchOrganizerUsersForFilter,
  fetchProfileNamesByUserIds,
  fetchVisitorsForFilter,
  formatConnectionDuration,
  type ClientErrorLogFilters,
} from "@/lib/clientErrorLogs";
import type { PresenceThresholdsMs } from "@/lib/presenceThresholds";
import { presenceSettingsToMs } from "@/lib/presenceThresholds";
import { DEFAULT_PRESENCE_THRESHOLDS } from "@/lib/settingsKeys";

export { ALL_ORGANIZER_USERS, ALL_VISITORS, fetchOrganizerUsersForFilter, fetchVisitorsForFilter };

export type OnlineAudience = "all" | "organizer" | "visitor";

/** Filtre d'affichage par état de présence. */
export type PresenceScope = "active_idle" | "active_only" | "all_open" | "all";

export type PresenceState = "active" | "idle" | "abandoned" | "closed";

/** Seuils par défaut (si app_settings indisponible). */
export const DEFAULT_PRESENCE_THRESHOLDS_MS = presenceSettingsToMs(DEFAULT_PRESENCE_THRESHOLDS);

export type OnlinePresenceFilters = {
  dateMode: "day" | "range";
  dateSingle: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  audience: OnlineAudience;
  /** `all`, `org:<uuid>` ou `vis:<client_id>`. */
  personFilter: string;
  presenceScope: PresenceScope;
};

export type OnlinePresenceRow = {
  id: string;
  audience: "organizer" | "visitor";
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  last_page_url: string | null;
  auth_user_id: string | null;
  visitor_client_id: string | null;
};

export type OnlinePresenceEnrichedRow = OnlinePresenceRow & {
  label: string;
  presenceState: PresenceState;
  durationLabel: string;
  lastActivityLabel: string;
};

export function defaultOnlinePresenceFilters(today = new Date()): OnlinePresenceFilters {
  const iso = today.toISOString().slice(0, 10);
  return {
    dateMode: "day",
    dateSingle: iso,
    dateFrom: iso,
    dateTo: iso,
    timeFrom: "00:00",
    timeTo: "23:59",
    audience: "all",
    personFilter: "all",
    presenceScope: "active_idle",
  };
}

function thresholdsFor(
  audience: "organizer" | "visitor",
  config: PresenceThresholdsMs = DEFAULT_PRESENCE_THRESHOLDS_MS,
) {
  return audience === "organizer" ? config.organizer : config.visitor;
}

export function computePresenceState(
  row: Pick<OnlinePresenceRow, "audience" | "ended_at" | "last_activity_at" | "started_at">,
  nowMs = Date.now(),
  thresholds: PresenceThresholdsMs = DEFAULT_PRESENCE_THRESHOLDS_MS,
): PresenceState {
  if (row.ended_at != null) return "closed";

  const activityIso = row.last_activity_at?.trim() || row.started_at;
  const idleMs = nowMs - new Date(activityIso).getTime();
  const { activeMs, abandonedMs } = thresholdsFor(row.audience, thresholds);

  if (idleMs <= activeMs) return "active";
  if (idleMs <= abandonedMs) return "idle";
  return "abandoned";
}

export function matchesPresenceScope(state: PresenceState, scope: PresenceScope): boolean {
  switch (scope) {
    case "active_idle":
      return state === "active" || state === "idle";
    case "active_only":
      return state === "active";
    case "all_open":
      return state !== "closed";
    case "all":
      return true;
    default:
      return true;
  }
}

function toDateFilterInput(filters: OnlinePresenceFilters): ClientErrorLogFilters {
  return {
    dateMode: filters.dateMode,
    dateSingle: filters.dateSingle,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    timeFrom: filters.timeFrom,
    timeTo: filters.timeTo,
    errorSource: "all",
    organizerUserId: ALL_ORGANIZER_USERS,
    visitorClientId: ALL_VISITORS,
  };
}

export function parsePersonFilter(value: string): {
  organizerUserId: string | null;
  visitorClientId: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "all") {
    return { organizerUserId: null, visitorClientId: null };
  }
  if (trimmed.startsWith("org:")) {
    return { organizerUserId: trimmed.slice(4).trim() || null, visitorClientId: null };
  }
  if (trimmed.startsWith("vis:")) {
    return { organizerUserId: null, visitorClientId: trimmed.slice(4).trim() || null };
  }
  return { organizerUserId: null, visitorClientId: null };
}

function applySessionDateFilters<T extends { lte: (c: string, v: string) => T; is: (c: string, v: null) => T; or: (f: string) => T }>(
  query: T,
  fromIso: string,
  toIso: string,
  includeClosed: boolean,
): T {
  query = query.lte("started_at", toIso);
  if (includeClosed) {
    // Guillemets obligatoires : les « : » de l'ISO8601 cassent le parseur PostgREST sinon.
    query = query.or(`ended_at.is.null,ended_at.gte."${fromIso}"`);
  } else {
    query = query.is("ended_at", null);
  }
  return query;
}

async function fetchOrganizerSessions(
  fromIso: string,
  toIso: string,
  filters: OnlinePresenceFilters,
): Promise<OnlinePresenceRow[]> {
  const includeClosed = filters.presenceScope === "all";

  let query = applySessionDateFilters(
    supabase
      .from("organizer_error_sessions")
      .select("id, started_at, ended_at, last_activity_at, last_page_url, auth_user_id"),
    fromIso,
    toIso,
    includeClosed,
  )
    .order("last_activity_at", { ascending: false })
    .limit(500);

  const { organizerUserId } = parsePersonFilter(filters.personFilter);
  if (organizerUserId) {
    query = query.eq("auth_user_id", organizerUserId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapSessionRow(row, "organizer"));
}

async function fetchVisitorSessions(
  fromIso: string,
  toIso: string,
  filters: OnlinePresenceFilters,
): Promise<OnlinePresenceRow[]> {
  const includeClosed = filters.presenceScope === "all";

  let query = applySessionDateFilters(
    supabase
      .from("visitor_error_sessions")
      .select("id, started_at, ended_at, last_activity_at, last_page_url, visitor_client_id"),
    fromIso,
    toIso,
    includeClosed,
  )
    .order("last_activity_at", { ascending: false })
    .limit(500);

  const { visitorClientId } = parsePersonFilter(filters.personFilter);
  if (visitorClientId) {
    query = query.eq("visitor_client_id", visitorClientId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapSessionRow(row, "visitor"));
}

function mapSessionRow(
  row: Record<string, unknown>,
  audience: "organizer" | "visitor",
): OnlinePresenceRow {
  const startedAt = String(row.started_at);
  return {
    id: String(row.id),
    audience,
    started_at: startedAt,
    ended_at: (row.ended_at as string | null | undefined) ?? null,
    last_activity_at: String(row.last_activity_at ?? startedAt),
    last_page_url: (row.last_page_url as string | null | undefined) ?? null,
    auth_user_id: audience === "organizer" ? ((row.auth_user_id as string | null | undefined) ?? null) : null,
    visitor_client_id:
      audience === "visitor" ? ((row.visitor_client_id as string | null | undefined) ?? null) : null,
  };
}

export async function fetchOnlinePresenceRows(
  filters: OnlinePresenceFilters,
): Promise<{ data: OnlinePresenceRow[]; error: string | null }> {
  try {
    const { fromIso, toIso } = buildClientErrorFilterRange(toDateFilterInput(filters));
    const tasks: Promise<OnlinePresenceRow[]>[] = [];

    if (filters.audience === "all" || filters.audience === "organizer") {
      tasks.push(fetchOrganizerSessions(fromIso, toIso, filters));
    }
    if (filters.audience === "all" || filters.audience === "visitor") {
      tasks.push(fetchVisitorSessions(fromIso, toIso, filters));
    }

    const chunks = await Promise.all(tasks);
    const merged = chunks.flat().sort(
      (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
    );
    return { data: merged, error: null };
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "Erreur de chargement.",
    };
  }
}

async function fetchVisitorLabels(clientIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(clientIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, string>();
  if (!unique.length) return result;

  const { data, error } = await supabase
    .from("visitors")
    .select("id, visitor_client_id, visitor_name, visitor_pseudo")
    .is("deleted_at", null);

  if (error) return result;

  for (const row of data ?? []) {
    const r = row as {
      id?: string | null;
      visitor_client_id?: string | null;
      visitor_name?: string | null;
      visitor_pseudo?: string | null;
    };
    const keys = [r.visitor_client_id?.trim(), r.id?.trim()].filter(Boolean) as string[];
    const name = r.visitor_name?.trim();
    const pseudo = r.visitor_pseudo?.trim();
    const label =
      (name && !["anonymous", "anonyme"].includes(name.toLowerCase()) ? name : null) ??
      pseudo ??
      null;
    if (!label) continue;
    for (const key of keys) {
      if (unique.includes(key)) result.set(key, label);
    }
  }
  return result;
}

export async function enrichOnlinePresenceRows(
  rows: OnlinePresenceRow[],
  filters: OnlinePresenceFilters,
  nowMs = Date.now(),
  thresholds: PresenceThresholdsMs = DEFAULT_PRESENCE_THRESHOLDS_MS,
): Promise<OnlinePresenceEnrichedRow[]> {
  const organizerIds = rows
    .filter((r) => r.audience === "organizer")
    .map((r) => r.auth_user_id)
    .filter((id): id is string => Boolean(id?.trim()));
  const visitorIds = rows
    .filter((r) => r.audience === "visitor")
    .map((r) => r.visitor_client_id)
    .filter((id): id is string => Boolean(id?.trim()));

  const [profileNames, visitorLabels] = await Promise.all([
    fetchProfileNamesByUserIds(organizerIds),
    fetchVisitorLabels(visitorIds),
  ]);

  const nowIso = new Date(nowMs).toISOString();

  return rows
    .map((row) => {
      const presenceState = computePresenceState(row, nowMs, thresholds);
      const endRef = row.ended_at ?? nowIso;
      const durationLabel = formatConnectionDuration(row.started_at, endRef) ?? "—";
      const lastActivityLabel =
        formatConnectionDuration(row.last_activity_at, nowIso) ?? "—";

      let label = "—";
      if (row.audience === "organizer") {
        const userId = row.auth_user_id?.trim();
        label = (userId && profileNames.get(userId)) || userId?.slice(0, 8) + "…" || "—";
      } else {
        const clientId = row.visitor_client_id?.trim();
        label =
          (clientId && visitorLabels.get(clientId)) ||
          clientId?.slice(0, 12) + "…" ||
          "—";
      }

      return {
        ...row,
        label,
        presenceState,
        durationLabel,
        lastActivityLabel,
      };
    })
    .filter((row) => matchesPresenceScope(row.presenceState, filters.presenceScope));
}

export type PersonFilterOption = {
  value: string;
  label: string;
};

export async function buildPersonFilterOptions(
  audience: OnlineAudience,
): Promise<PersonFilterOption[]> {
  if (audience === "organizer") {
    const { data } = await fetchOrganizerUsersForFilter();
    return data.map((u) => ({ value: `org:${u.id}`, label: u.label }));
  }
  if (audience === "visitor") {
    const { data } = await fetchVisitorsForFilter();
    return data.map((v) => ({ value: `vis:${v.id}`, label: v.label }));
  }

  const [{ data: orgs }, { data: visitors }] = await Promise.all([
    fetchOrganizerUsersForFilter(),
    fetchVisitorsForFilter(),
  ]);
  return [
    ...orgs.map((u) => ({ value: `org:${u.id}`, label: `${u.label} (org.)` })),
    ...visitors.map((v) => ({ value: `vis:${v.id}`, label: `${v.label} (vis.)` })),
  ].sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function isLivePresenceScope(scope: PresenceScope): boolean {
  return scope === "active_idle" || scope === "active_only" || scope === "all_open";
}
