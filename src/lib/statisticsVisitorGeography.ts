import { supabase } from "@/lib/supabase";
import { normalizeStoragePublicUrl } from "@/lib/storagePaths";

export type VisitorGeoTableRow = {
  visitorKey: string;
  label: string;
  pseudo: string | null;
  avatarUrl: string | null;
  selfieUrl: string | null;
  city: string | null;
  zipCode: string | null;
  country: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "ip" | "place" | "ip_pending" | "unavailable";
  ipAddress: string | null;
  /** Bleu = table visitors ; rouge = table profiles (organisateurs). */
  participantKind: "visitor" | "profile";
};

type GeoPoint = {
  lat: number;
  lon: number;
  city?: string | null;
  country?: string | null;
  region?: string | null;
};

type FeedbackScopeRow = {
  visitor_id?: string | number | null;
  visit_id?: string | null;
  artwork_id?: string | number | null;
};

type VisitorRecord = {
  id?: string;
  ip_address?: string | null;
  country?: string | null;
  city?: string | null;
  zip_code?: string | null;
  visitor_pseudo?: string | null;
  visitor_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  country_code?: string | null;
  avatar_url?: string | null;
  selfie_url?: string | null;
  visitor_client_id?: string | null;
  auth_user_id?: string | null;
  visitor_db_id?: string | null;
};

const PROFILE_SELECT =
  "id, first_name, last_name, username, avatar_url, city, country_code, zip_code";

type GeographyRpcRow = {
  visitor_key?: string | null;
  visitor_pseudo?: string | null;
  visitor_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  selfie_url?: string | null;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  zip_code?: string | null;
  ip_address?: string | null;
  auth_user_id?: string | null;
  visitor_client_id?: string | null;
  visitor_db_id?: string | null;
};

function isMissingGeographyRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const msg = `${error.message ?? ""}`.toLowerCase();
  return msg.includes("get_statistics_geography_visitors") || msg.includes("not found");
}

function rpcRowToRecord(row: GeographyRpcRow): VisitorRecord {
  const profileId = asTrimmed(row.auth_user_id);
  const dbId = asTrimmed(row.visitor_db_id);
  return {
    id: dbId || profileId || asTrimmed(row.visitor_client_id) || undefined,
    auth_user_id: profileId || null,
    visitor_client_id: asTrimmed(row.visitor_client_id) || null,
    visitor_pseudo: asTrimmed(row.visitor_pseudo) || null,
    visitor_name: asTrimmed(row.visitor_name) || null,
    first_name: asTrimmed(row.first_name) || null,
    last_name: asTrimmed(row.last_name) || null,
    username: asTrimmed(row.username) || null,
    avatar_url: asTrimmed(row.avatar_url) || null,
    selfie_url: asTrimmed(row.selfie_url) || null,
    city: asTrimmed(row.city) || null,
    country: asTrimmed(row.country) || null,
    country_code: asTrimmed(row.country_code) || null,
    zip_code: asTrimmed(row.zip_code) || null,
    ip_address: asTrimmed(row.ip_address) || null,
    visitor_db_id: dbId || null,
  };
}

async function loadParticipantsViaRpc(params: {
  targetAgencyId: string | null;
  targetExpoId: string | null;
  expoDateRange: { start: Date; end: Date } | null;
}): Promise<VisitorRecord[] | null> {
  const rangeStart = params.expoDateRange
    ? (() => {
        const d = new Date(params.expoDateRange.start);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      })()
    : null;
  const rangeEnd = params.expoDateRange
    ? (() => {
        const d = new Date(params.expoDateRange.end);
        d.setHours(23, 59, 59, 999);
        return d.toISOString();
      })()
    : null;

  const { data, error } = await supabase.rpc("get_statistics_geography_visitors", {
    p_agency_id: params.targetAgencyId,
    p_expo_id: params.targetExpoId,
    p_date_from: rangeStart,
    p_date_to: rangeEnd,
  });

  if (isMissingGeographyRpcError(error)) return null;
  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[geography] RPC get_statistics_geography_visitors :", error.message, error.code);
    }
    return null;
  }

  return ((data ?? []) as GeographyRpcRow[]).map(rpcRowToRecord);
}

const geoCache = new Map<string, GeoPoint | null>();
const VISITOR_SELECT =
  "id, visitor_client_id, auth_user_id, ip_address, country, city, visitor_pseudo, visitor_name, avatar_url, selfie_url";

function asTrimmed(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return "";
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPrivateIp(ip: string): boolean {
  const v = ip.trim();
  if (!v || v === "127.0.0.1" || v === "::1") return true;
  if (v.startsWith("10.") || v.startsWith("192.168.") || v.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeIp(ip: string): Promise<GeoPoint | null> {
  const key = `ip:${ip}`;
  if (geoCache.has(key)) return geoCache.get(key) ?? null;

  if (isPrivateIp(ip)) {
    geoCache.set(key, null);
    return null;
  }

  try {
    const res = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`);
    if (!res.ok) {
      geoCache.set(key, null);
      return null;
    }
    const geo = (await res.json()) as {
      latitude?: string | number;
      longitude?: string | number;
      city?: string;
      country?: string;
      region?: string;
    };
    const lat = Number.parseFloat(String(geo.latitude ?? ""));
    const lon = Number.parseFloat(String(geo.longitude ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      geoCache.set(key, null);
      return null;
    }
    const point: GeoPoint = {
      lat,
      lon,
      city: geo.city ?? null,
      country: geo.country ?? null,
      region: geo.region ?? null,
    };
    geoCache.set(key, point);
    return point;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

async function geocodePlace(
  city: string,
  country?: string | null,
  zipCode?: string | null,
): Promise<GeoPoint | null> {
  const query = [zipCode?.trim(), city.trim(), country?.trim()].filter(Boolean).join(", ");
  if (!query) return null;
  const key = `place:${query.toLowerCase()}`;
  if (geoCache.has(key)) return geoCache.get(key) ?? null;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "fr",
        "User-Agent": "AIMEDIart/1.0 (statistics geography; hello@aimediart.com)",
      },
    });
    if (!res.ok) {
      geoCache.set(key, null);
      return null;
    }
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = rows[0];
    if (!hit?.lat || !hit.lon) {
      geoCache.set(key, null);
      return null;
    }
    const lat = Number.parseFloat(hit.lat);
    const lon = Number.parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      geoCache.set(key, null);
      return null;
    }
    const point: GeoPoint = { lat, lon, city: city.trim(), country: country?.trim() || null };
    geoCache.set(key, point);
    return point;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

function filterFeedbackRows<T extends { artwork_id?: string | number | null }>(
  rows: T[],
  artworkIds: Set<string> | null,
): T[] {
  if (!artworkIds) return rows;
  if (artworkIds.size === 0) return [];
  return rows.filter((row) => {
    const id = asTrimmed(row.artwork_id);
    return id.length > 0 && artworkIds.has(id);
  });
}

function applyScope<T extends { eq: (col: string, val: string) => T; gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  params: {
    targetAgencyId: string | null;
    targetExpoId: string | null;
    expoDateRange: { start: Date; end: Date } | null;
    dateColumn?: string;
  },
): T {
  let scoped = query;
  if (params.targetAgencyId) scoped = scoped.eq("agency_id", params.targetAgencyId);
  if (params.targetExpoId) scoped = scoped.eq("expo_id", params.targetExpoId);
  if (params.expoDateRange) {
    const rangeStart = new Date(params.expoDateRange.start);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(params.expoDateRange.end);
    rangeEnd.setHours(23, 59, 59, 999);
    const col = params.dateColumn ?? "entered_at";
    scoped = scoped.gte(col, rangeStart.toISOString()).lte(col, rangeEnd.toISOString());
  }
  return scoped;
}

async function loadVisitorsByIds(ids: string[]): Promise<VisitorRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("visitors").select(VISITOR_SELECT).in("id", ids);
  if (error) return [];
  return (data ?? []) as VisitorRecord[];
}

async function loadAllVisitors(): Promise<VisitorRecord[]> {
  const { data, error } = await supabase.from("visitors").select(VISITOR_SELECT);
  if (error) return [];
  return (data ?? []) as VisitorRecord[];
}

async function loadVisitorsByClientIds(clientIds: string[]): Promise<VisitorRecord[]> {
  if (clientIds.length === 0) return [];
  const { data, error } = await supabase.from("visitors").select(VISITOR_SELECT).in("visitor_client_id", clientIds);
  if (error) return [];
  return (data ?? []) as VisitorRecord[];
}

async function loadVisitorsByAuthUserIds(authUserIds: string[]): Promise<VisitorRecord[]> {
  if (authUserIds.length === 0) return [];
  const { data, error } = await supabase.from("visitors").select(VISITOR_SELECT).in("auth_user_id", authUserIds);
  if (error) return [];
  return (data ?? []) as VisitorRecord[];
}

async function loadProfilesByIds(ids: string[]): Promise<Map<string, VisitorRecord>> {
  const map = new Map<string, VisitorRecord>();
  if (ids.length === 0) return map;

  const { data } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", ids);
  for (const row of (data ?? []) as Array<VisitorRecord & { id?: string }>) {
    const id = asTrimmed(row.id);
    if (id) map.set(id, row);
  }
  return map;
}

async function loadScopedVisitors(
  params: {
    targetAgencyId: string | null;
    targetExpoId: string | null;
    expoDateRange: { start: Date; end: Date } | null;
  },
  feedbackKeys: string[],
): Promise<VisitorRecord[]> {
  const hasScope = Boolean(params.targetAgencyId || params.targetExpoId || params.expoDateRange);
  const scopedIds = await collectVisitorDbIdsFromScope(params);
  const uuidKeys = feedbackKeys.filter(isUuidLike);
  const clientKeys = feedbackKeys.filter((key) => !isUuidLike(key));

  const [byPk, byClient, byAuth, allVisitors] = await Promise.all([
    loadVisitorsByIds([...scopedIds]),
    loadVisitorsByClientIds([...new Set([...clientKeys, ...uuidKeys])]),
    loadVisitorsByAuthUserIds(uuidKeys),
    !hasScope && scopedIds.size === 0 && feedbackKeys.length === 0 ? loadAllVisitors() : Promise.resolve([]),
  ]);

  const byId = new Map<string, VisitorRecord>();
  for (const record of [...byPk, ...byClient, ...byAuth, ...allVisitors]) {
    const pk = asTrimmed(record.id);
    if (!pk) continue;
    byId.set(pk, mergeVisitorRecords(byId.get(pk), record));
  }
  return [...byId.values()];
}

async function collectProfileIdsForScope(
  params: {
    targetAgencyId: string | null;
    targetExpoId: string | null;
    expoDateRange: { start: Date; end: Date } | null;
  },
  feedbackKeys: string[],
): Promise<string[]> {
  const profileIds = new Set<string>(feedbackKeys.filter(isUuidLike));

  let vevQuery = supabase.from("visitor_expo_visits").select("auth_user_id");
  vevQuery = applyScope(vevQuery, params);
  const { data: vevData } = await vevQuery;
  for (const row of (vevData ?? []) as Array<{ auth_user_id?: string }>) {
    const id = asTrimmed(row.auth_user_id);
    if (id) profileIds.add(id);
  }

  return [...profileIds];
}

function mergeVisitorRecords(base: VisitorRecord | undefined, next: VisitorRecord): VisitorRecord {
  if (!base) return { ...next };
  const authId = asTrimmed(next.auth_user_id) || asTrimmed(base.auth_user_id);
  return {
    ...base,
    ...next,
    auth_user_id: authId || undefined,
    ip_address: asTrimmed(next.ip_address) || asTrimmed(base.ip_address) || null,
    avatar_url: asTrimmed(next.avatar_url) || asTrimmed(base.avatar_url) || null,
    selfie_url: asTrimmed(next.selfie_url) || asTrimmed(base.selfie_url) || null,
    visitor_pseudo: asTrimmed(next.visitor_pseudo) || asTrimmed(base.visitor_pseudo) || null,
    visitor_name: asTrimmed(next.visitor_name) || asTrimmed(base.visitor_name) || null,
    first_name: asTrimmed(next.first_name) || asTrimmed(base.first_name) || null,
    last_name: asTrimmed(next.last_name) || asTrimmed(base.last_name) || null,
    username: asTrimmed(next.username) || asTrimmed(base.username) || null,
    city: asTrimmed(next.city) || asTrimmed(base.city) || null,
    zip_code: asTrimmed(next.zip_code) || asTrimmed(base.zip_code) || null,
    visitor_db_id: asTrimmed(next.visitor_db_id) || asTrimmed(base.visitor_db_id) || null,
    country: asTrimmed(next.country) || asTrimmed(base.country) || null,
    country_code: asTrimmed(next.country_code) || asTrimmed(base.country_code) || null,
  };
}

function mergeParticipantRecords(records: VisitorRecord[]): VisitorRecord[] {
  const merged: VisitorRecord[] = [];

  const findIndex = (record: VisitorRecord): number => {
    const keys = new Set(
      [asTrimmed(record.auth_user_id), asTrimmed(record.visitor_client_id), asTrimmed(record.id)].filter(Boolean),
    );
    return merged.findIndex((existing) => {
      const existingKeys = [
        asTrimmed(existing.auth_user_id),
        asTrimmed(existing.visitor_client_id),
        asTrimmed(existing.id),
      ].filter(Boolean);
      return existingKeys.some((key) => keys.has(key));
    });
  };

  for (const record of records) {
    const idx = findIndex(record);
    if (idx >= 0) merged[idx] = mergeVisitorRecords(merged[idx], record);
    else merged.push({ ...record });
  }

  return merged;
}

async function enrichProfilesWithVisitorData(profiles: VisitorRecord[]): Promise<VisitorRecord[]> {
  const authIds = [
    ...new Set(profiles.map((row) => asTrimmed(row.auth_user_id) || asTrimmed(row.id)).filter(Boolean)),
  ];
  if (authIds.length === 0) return profiles;

  const linkedVisitors = await loadVisitorsByAuthUserIds(authIds);
  const byAuthId = new Map<string, VisitorRecord>();
  for (const visitor of linkedVisitors) {
    const authId = asTrimmed(visitor.auth_user_id);
    if (authId) byAuthId.set(authId, visitor);
  }

  return profiles.map((profile) => {
    const authId = asTrimmed(profile.auth_user_id) || asTrimmed(profile.id);
    const linked = authId ? byAuthId.get(authId) : undefined;
    if (!linked) return profile;
    const profileIp = asTrimmed(profile.ip_address);
    const linkedIp = asTrimmed(linked.ip_address);
    return {
      ...profile,
      ...linked,
      auth_user_id: authId,
      id: asTrimmed(linked.id) || authId,
      ip_address: linkedIp || profileIp || null,
      avatar_url: asTrimmed(linked.avatar_url) || asTrimmed(profile.avatar_url) || null,
      selfie_url: asTrimmed(linked.selfie_url) || asTrimmed(profile.selfie_url) || null,
    };
  });
}

async function collectVisitorDbIdsFromScope(params: {
  targetAgencyId: string | null;
  targetExpoId: string | null;
  expoDateRange: { start: Date; end: Date } | null;
}): Promise<Set<string>> {
  const ids = new Set<string>();

  let vevQuery = supabase.from("visitor_expo_visits").select("visitor_id");
  vevQuery = applyScope(vevQuery, params);
  const { data: vevData } = await vevQuery;
  for (const row of (vevData ?? []) as Array<{ visitor_id?: string }>) {
    const id = asTrimmed(row.visitor_id);
    if (id) ids.add(id);
  }

  let fbQuery = supabase
    .from("visitor_feedback")
    .select("visitor_id, visit_id, visitor_expo_visits(visitor_id)");
  fbQuery = applyScope(fbQuery, { ...params, dateColumn: "submitted_at" });
  const { data: fbData } = await fbQuery;
  const feedbackRows = (fbData ?? []) as Array<{
    visitor_id?: string | number | null;
    visit_id?: string | null;
    visitor_expo_visits?: { visitor_id?: string | null } | Array<{ visitor_id?: string | null }> | null;
  }>;

  const feedbackKeys = [
    ...new Set(feedbackRows.map((row) => asTrimmed(row.visitor_id)).filter(Boolean)),
  ];

  for (const row of feedbackRows) {
    const vev = row.visitor_expo_visits;
    const vevRow = Array.isArray(vev) ? vev[0] : vev;
    const visitVisitorId = asTrimmed(vevRow?.visitor_id);
    if (visitVisitorId) ids.add(visitVisitorId);
  }

  if (feedbackKeys.length > 0) {
    const [byClient, byAuth, byId] = await Promise.all([
      loadVisitorsByClientIds(feedbackKeys),
      loadVisitorsByAuthUserIds(feedbackKeys.filter(isUuidLike)),
      loadVisitorsByIds(feedbackKeys.filter(isUuidLike)),
    ]);
    for (const record of [...byClient, ...byAuth, ...byId]) {
      const id = asTrimmed(record.id);
      if (id) ids.add(id);
    }
  }

  return ids;
}

async function loadFeedbackParticipantKeys(
  params: {
    targetAgencyId: string | null;
    targetExpoId: string | null;
    expoDateRange: { start: Date; end: Date } | null;
  },
  artistArtworkIds: Set<string> | null,
): Promise<string[]> {
  let query = supabase.from("visitor_feedback").select("visitor_id, artwork_id");
  query = applyScope(query, { ...params, dateColumn: "submitted_at" });
  const { data, error } = await query;
  if (error) return [];

  const rows = filterFeedbackRows((data ?? []) as FeedbackScopeRow[], artistArtworkIds);
  return [...new Set(rows.map((row) => asTrimmed(row.visitor_id)).filter(Boolean))];
}

async function loadParticipantsClientSide(params: {
  targetAgencyId: string | null;
  targetExpoId: string | null;
  expoDateRange: { start: Date; end: Date } | null;
}): Promise<VisitorRecord[]> {
  const feedbackKeys = await loadFeedbackParticipantKeys(params, null);
  const profileIds = await collectProfileIdsForScope(params, feedbackKeys);
  const profilesById = await loadProfilesByIds(profileIds);
  const profileRecords = await enrichProfilesWithVisitorData(
    [...profilesById.values()].map((row) => {
      const id = asTrimmed(row.id);
      return { ...row, auth_user_id: id, id };
    }),
  );
  const tableVisitors = await loadScopedVisitors(params, feedbackKeys);
  return mergeParticipantRecords([...tableVisitors, ...profileRecords]);
}

async function loadAllParticipants(params: {
  targetAgencyId: string | null;
  targetExpoId: string | null;
  expoDateRange: { start: Date; end: Date } | null;
  artistArtworkIds: Set<string> | null;
}): Promise<VisitorRecord[]> {
  const scope = {
    targetAgencyId: params.targetAgencyId,
    targetExpoId: params.targetExpoId,
    expoDateRange: params.expoDateRange,
  };

  const [rpcRows, clientRows] = await Promise.all([
    loadParticipantsViaRpc(scope),
    loadParticipantsClientSide(scope),
  ]);

  const merged = mergeParticipantRecords([...(rpcRows ?? []), ...clientRows]);
  return merged.filter(shouldIncludeVisitorRecord);
}

function resolvePseudo(record: VisitorRecord): string | null {
  return asTrimmed(record.visitor_pseudo) || asTrimmed(record.username) || null;
}

function resolveLabel(visitorKey: string, record: VisitorRecord): string {
  const pseudo = resolvePseudo(record);
  if (pseudo) return pseudo;
  const fullName = `${asTrimmed(record.first_name)} ${asTrimmed(record.last_name)}`.trim();
  if (fullName) return fullName;
  const name = asTrimmed(record.visitor_name);
  if (name) return name;
  return visitorKey.length > 12 ? `${visitorKey.slice(0, 8)}…` : visitorKey;
}

function hasVisitorIdentity(record: VisitorRecord): boolean {
  if (resolvePseudo(record)) return true;
  const fullName = `${asTrimmed(record.first_name)} ${asTrimmed(record.last_name)}`.trim();
  if (fullName) return true;
  return asTrimmed(record.visitor_name).length > 0;
}

function isSelfieStorageUrl(url: string): boolean {
  return url.includes("/selfies/") || url.includes("/photos/visitors/");
}

function normalizePhotoUrl(url: string | null | undefined): string | null {
  const normalized = normalizeStoragePublicUrl(url);
  return normalized || null;
}

function resolveSelfieUrl(record: VisitorRecord): string | null {
  const selfie = normalizePhotoUrl(record.selfie_url);
  if (selfie) return selfie;
  const avatar = normalizePhotoUrl(record.avatar_url);
  if (avatar && isSelfieStorageUrl(avatar)) return avatar;
  return null;
}

function resolveProfilePoolAvatar(record: VisitorRecord): string | null {
  const avatar = normalizePhotoUrl(record.avatar_url);
  const selfie = resolveSelfieUrl(record);
  if (!avatar || isSelfieStorageUrl(avatar)) return null;
  if (selfie && avatar === selfie) return null;
  return avatar;
}

function resolvePoolAvatar(record: VisitorRecord): string | null {
  const avatar = normalizePhotoUrl(record.avatar_url);
  const selfie = resolveSelfieUrl(record);
  if (!avatar) return null;
  if (selfie && avatar === selfie) return null;
  if (isSelfieStorageUrl(avatar)) return null;
  return avatar;
}

function resolveTableAvatarUrl(record: VisitorRecord): string | null {
  const pool = resolvePoolAvatar(record) || resolveProfilePoolAvatar(record);
  if (pool) return pool;
  const avatar = normalizePhotoUrl(record.avatar_url);
  const selfie = resolveSelfieUrl(record);
  if (avatar && avatar !== selfie && !isSelfieStorageUrl(avatar)) return avatar;
  return null;
}


function shouldIncludeVisitorRecord(record: VisitorRecord): boolean {
  const visitorKey = visitorKeyFromRecord(record);
  if (!visitorKey) return false;

  // Profil auth enregistré (table profiles) : toujours afficher
  if (asTrimmed(record.auth_user_id)) return true;

  if (hasVisitorIdentity(record)) return true;
  if (resolveSelfieUrl(record)) return true;
  if (asTrimmed(record.city) || asTrimmed(record.zip_code)) return true;
  if (asTrimmed(record.ip_address)) return true;

  const avatar = asTrimmed(record.avatar_url);
  if (avatar && !isSelfieStorageUrl(avatar)) return true;

  if (isUuidLike(visitorKey)) return false;

  return false;
}

function visitorKeyFromRecord(record: VisitorRecord): string {
  return (
    asTrimmed(record.id) ||
    asTrimmed(record.auth_user_id) ||
    asTrimmed(record.visitor_client_id) ||
    ""
  );
}

function resolveInitialSource(record: VisitorRecord): VisitorGeoTableRow["source"] {
  if (asTrimmed(record.city) || asTrimmed(record.zip_code)) return "place";
  const ip = asTrimmed(record.ip_address);
  if (ip && !isPrivateIp(ip)) return "ip";
  return "ip_pending";
}

function resolveParticipantKind(record: VisitorRecord): VisitorGeoTableRow["participantKind"] {
  if (asTrimmed(record.visitor_db_id) || asTrimmed(record.visitor_pseudo) || asTrimmed(record.visitor_name)) {
    return "visitor";
  }
  return "profile";
}

function recordToRow(record: VisitorRecord, fallbackKey?: string): VisitorGeoTableRow | null {
  const visitorKey = visitorKeyFromRecord(record) || asTrimmed(fallbackKey);
  if (!visitorKey) return null;

  return {
    visitorKey,
    label: resolveLabel(visitorKey, record),
    pseudo: resolvePseudo(record),
    avatarUrl: resolveTableAvatarUrl(record),
    selfieUrl: resolveSelfieUrl(record),
    city: asTrimmed(record.city) || null,
    zipCode: asTrimmed(record.zip_code) || null,
    country: asTrimmed(record.country) || asTrimmed(record.country_code) || null,
    region: null,
    latitude: null,
    longitude: null,
    source: resolveInitialSource(record),
    ipAddress: asTrimmed(record.ip_address) || null,
    participantKind: resolveParticipantKind(record),
  };
}

async function resolveCoords(
  record: VisitorRecord,
): Promise<{ point: GeoPoint | null; source: VisitorGeoTableRow["source"] }> {
  const ip = asTrimmed(record.ip_address);
  const city = asTrimmed(record.city);
  const zipCode = asTrimmed(record.zip_code);
  const country = asTrimmed(record.country) || asTrimmed(record.country_code);

  if (zipCode || city) {
    const fromPlace = await geocodePlace(city, country || "France", zipCode);
    if (fromPlace) return { point: fromPlace, source: "place" };
    return { point: null, source: "place" };
  }

  if (ip && !isPrivateIp(ip)) {
    const fromIp = await geocodeIp(ip);
    if (fromIp) return { point: fromIp, source: "ip" };
    return { point: null, source: "ip_pending" };
  }

  return { point: null, source: "ip_pending" };
}

export async function fetchVisitorGeographyForStatistics(params: {
  targetAgencyId: string | null;
  targetExpoId: string | null;
  expoDateRange: { start: Date; end: Date } | null;
  artistArtworkIds?: Set<string> | null;
}): Promise<{ rows: VisitorGeoTableRow[]; error: string | null }> {
  const visitorRecords = await loadAllParticipants({
    targetAgencyId: params.targetAgencyId,
    targetExpoId: params.targetExpoId,
    expoDateRange: params.expoDateRange,
    artistArtworkIds: null,
  });
  const rows = visitorRecords
    .map((record) => recordToRow(record))
    .filter((row): row is VisitorGeoTableRow => row != null);

  rows.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return { rows, error: null };
}

/** Géocode chaque ligne : ville/pays en priorité, puis IP publique. */
export async function geocodeVisitorGeoRows(
  rows: VisitorGeoTableRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<VisitorGeoTableRow[]> {
  const enriched: VisitorGeoTableRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const { point, source } = await resolveCoords({
      ip_address: row.ipAddress,
      city: row.city,
      zip_code: row.zipCode,
      country: row.country,
      country_code: row.country,
    });
    onProgress?.(index + 1, rows.length);
    enriched.push({
      ...row,
      city: row.city || (point?.city ?? null),
      country: row.country || (point?.country ?? null),
      region: point?.region ?? row.region ?? null,
      latitude: point?.lat ?? null,
      longitude: point?.lon ?? null,
      source,
    });
    if (index < rows.length - 1) await sleep(300);
  }

  return enriched;
}
