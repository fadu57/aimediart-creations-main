import { supabase } from "@/lib/supabase";
import { getOrCreateVisitorUuid, getStoredVisitorUuid } from "@/lib/visitorIdentity";

/** Clé sessionStorage : une visite active par expo dans l'onglet courant. */
const VISIT_STORAGE_PREFIX = "aimediart_visitor_expo_visit:";
/** Œuvres scannées pendant la visite active (par expo). */
const SCANNED_ARTWORKS_PREFIX = "aimediart_visitor_expo_scanned:";

/** Inactivité au-delà de laquelle le RPC marque une visite comme abandoned (aligné migration SQL). */
export const VISITOR_EXPO_VISIT_STALE_HOURS = 12;

export type VisitorExpoVisitEntrySource =
  | "visitor_welcome"
  | "first_scan"
  | "direct_link"
  | "resume"
  | "artwork_page"
  | "feedback"
  | "unknown";

function devWarn(tag: string, message: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[visitorExpoVisit] ${tag}:`, message);
  }
}

export function getVisitorExpoVisitStorageKey(expoId: string): string {
  return `${VISIT_STORAGE_PREFIX}${expoId.trim()}`;
}

export function getVisitorScannedArtworksStorageKey(expoId: string): string {
  return `${SCANNED_ARTWORKS_PREFIX}${expoId.trim()}`;
}

/** Mémorise qu'une œuvre a été scannée / ouverte pendant la visite de l'expo. */
export function markVisitorArtworkScanned(expoId: string, artworkId: string): void {
  const expo = expoId.trim();
  const art = artworkId.trim();
  if (!expo || !art) return;
  try {
    const key = getVisitorScannedArtworksStorageKey(expo);
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const ids = new Set<string>(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [],
    );
    ids.add(art);
    sessionStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* quota / mode privé */
  }
}

export function hasVisitorScannedArtworkInSession(expoId: string): boolean {
  const expo = expoId.trim();
  if (!expo) return false;
  try {
    const raw = sessionStorage.getItem(getVisitorScannedArtworksStorageKey(expo));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.some((id) => typeof id === "string" && id.trim().length > 0)
    );
  } catch {
    return false;
  }
}

export function clearVisitorScannedArtworks(expoId: string): void {
  const expo = expoId.trim();
  if (!expo) return;
  try {
    sessionStorage.removeItem(getVisitorScannedArtworksStorageKey(expo));
  } catch {
    /* ignore */
  }
}

/**
 * Au moins une œuvre scannée pendant la visite courante ?
 * Session (page œuvre / QR) puis repli feedback lié au visit_id actif.
 */
export async function resolveVisitorHasScannedArtwork(options: {
  expoId: string;
  visitorId?: string | null;
}): Promise<boolean> {
  const expo = options.expoId.trim();
  if (!expo) return false;
  if (hasVisitorScannedArtworkInSession(expo)) return true;

  const visitId = getStoredVisitorExpoVisitId(expo);
  const visitorId = options.visitorId?.trim();
  if (!visitId || !visitorId) return false;

  const { count, error } = await supabase
    .from("visitor_feedback")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", visitId)
    .eq("visitor_id", visitorId);

  return !error && (count ?? 0) > 0;
}

/** Expo(s) avec une visite encore active en sessionStorage (avant clôture). */
export function resolveStoredVisitorExpoIdsFromSession(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(VISIT_STORAGE_PREFIX)) continue;
      const expoId = key.slice(VISIT_STORAGE_PREFIX.length).trim();
      if (expoId && sessionStorage.getItem(key)?.trim()) ids.push(expoId);
    }
  } catch {
    /* mode privé / quota */
  }
  return ids;
}

/**
 * Résout l'expo pour le carnet : URL → session visite → dernier feedback.
 * À appeler avant endVisitorExpoVisit (qui efface la session).
 */
export async function resolveVisitorExpoIdForDiary(options: {
  hint?: string | null;
  visitorId?: string | null;
}): Promise<string> {
  const hint = options.hint?.trim();
  if (hint) return hint;

  const fromSession = resolveStoredVisitorExpoIdsFromSession();
  if (fromSession.length > 0) return fromSession[fromSession.length - 1];

  const visitorId = options.visitorId?.trim();
  if (!visitorId) return "";

  const { data } = await supabase
    .from("visitor_feedback")
    .select("expo_id")
    .eq("visitor_id", visitorId)
    .not("expo_id", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { expo_id?: string | null } | null;
  return row?.expo_id?.trim() || "";
}

export function getStoredVisitorExpoVisitId(expoId: string): string | null {
  const key = expoId.trim();
  if (!key) return null;
  try {
    return sessionStorage.getItem(getVisitorExpoVisitStorageKey(key))?.trim() || null;
  } catch {
    return null;
  }
}

export function setStoredVisitorExpoVisitId(expoId: string, visitId: string): void {
  const expo = expoId.trim();
  const id = visitId.trim();
  if (!expo || !id) return;
  try {
    sessionStorage.setItem(getVisitorExpoVisitStorageKey(expo), id);
  } catch {
    /* quota / mode privé */
  }
}

export function clearStoredVisitorExpoVisitId(expoId: string): void {
  const expo = expoId.trim();
  if (!expo) return;
  try {
    sessionStorage.removeItem(getVisitorExpoVisitStorageKey(expo));
  } catch {
    /* ignore */
  }
}

function resolveVisitorClientIdForStart(override?: string): string | null {
  const id = override?.trim() || getOrCreateVisitorUuid();
  return id?.trim() || null;
}

function resolveStoredVisitorClientId(override?: string): string | null {
  const id = override?.trim() || getStoredVisitorUuid();
  return id?.trim() || null;
}

export type StartVisitorExpoVisitParams = {
  expoId: string;
  visitorClientId?: string;
  entrySource?: VisitorExpoVisitEntrySource;
};

/**
 * Démarre ou reprend une visite active via RPC.
 * @returns UUID de la visite ou null si échec silencieux.
 */
export async function startVisitorExpoVisit(
  params: StartVisitorExpoVisitParams,
): Promise<string | null> {
  const expo = params.expoId?.trim();
  if (!expo) return null;

  const existing = getStoredVisitorExpoVisitId(expo);
  if (existing) return existing;

  const visitorClientId = resolveVisitorClientIdForStart(params.visitorClientId);
  if (!visitorClientId) return null;

  const { data, error } = await supabase.rpc("start_visitor_expo_visit", {
    p_visitor_client_id: visitorClientId,
    p_expo_id: expo,
    p_entry_source: params.entrySource ?? "unknown",
  });

  if (error) {
    devWarn("start", error.message);
    return null;
  }

  const visitId = typeof data === "string" ? data.trim() : null;
  if (visitId) {
    setStoredVisitorExpoVisitId(expo, visitId);
  }
  return visitId;
}

export type TouchVisitorExpoVisitParams = {
  visitId?: string | null;
  expoId?: string | null;
  visitorClientId?: string;
};

/** Met à jour last_activity_at (no-op si visitId absent ou échec RPC). */
export async function touchVisitorExpoVisit(
  params: TouchVisitorExpoVisitParams,
): Promise<boolean> {
  const visitId =
    params.visitId?.trim() ||
    (params.expoId ? getStoredVisitorExpoVisitId(params.expoId.trim()) : null);
  if (!visitId) return false;

  const visitorClientId = resolveStoredVisitorClientId(params.visitorClientId);
  if (!visitorClientId) return false;

  const { data, error } = await supabase.rpc("touch_visitor_expo_visit", {
    p_visit_id: visitId,
    p_visitor_client_id: visitorClientId,
  });

  if (error) {
    devWarn("touch", error.message);
    return false;
  }
  return data === true;
}

export type EndVisitorExpoVisitParams = {
  expoId: string;
  visitId?: string | null;
  visitorClientId?: string;
};

/** Clôture la visite active de l'expo (sortie explicite). */
export async function endVisitorExpoVisit(
  params: EndVisitorExpoVisitParams,
): Promise<boolean> {
  const expo = params.expoId?.trim();
  if (!expo) return false;

  const visitId = params.visitId?.trim() || getStoredVisitorExpoVisitId(expo);
  if (!visitId) return false;

  const visitorClientId = resolveStoredVisitorClientId(params.visitorClientId);
  if (!visitorClientId) return false;

  const { data, error } = await supabase.rpc("end_visitor_expo_visit", {
    p_visit_id: visitId,
    p_visitor_client_id: visitorClientId,
  });

  if (error) {
    devWarn("end", error.message);
    return false;
  }

  const ok = data === true;
  if (ok) {
    clearStoredVisitorExpoVisitId(expo);
    clearVisitorScannedArtworks(expo);
  }
  return ok;
}

/** Alias lecture sessionStorage pour lier un feedback. */
export function resolveCurrentVisitIdForExpo(expoId: string): string | null {
  return getStoredVisitorExpoVisitId(expoId);
}
