import { getStoredVisitorUuid } from "@/lib/visitorIdentity";
import { supabase } from "@/lib/supabase";

export type TravelDiaryShareAccess = {
  valid: boolean;
  visitorId: string | null;
  expoId: string | null;
  expiresAt: string | null;
};

type ShareLinkRpcRow = {
  token?: string | null;
  expires_at?: unknown;
};

type ResolveShareRpcRow = {
  valid?: boolean;
  visitor_id?: string | null;
  expo_id?: string | null;
  expires_at?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function parseShareLinkRpcRow(data: unknown): { token: string; expiresAt: string } | null {
  let row: unknown = data;
  if (typeof row === "string") {
    try {
      row = JSON.parse(row) as unknown;
    } catch {
      return null;
    }
  }
  if (!row || typeof row !== "object") return null;

  const payload = row as ShareLinkRpcRow;
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token) return null;

  let expiresAt = "";
  if (typeof payload.expires_at === "string") {
    expiresAt = payload.expires_at.trim();
  } else if (payload.expires_at != null) {
    expiresAt = String(payload.expires_at).trim();
  }

  return { token, expiresAt };
}

function shareOwnerIdCandidates(primaryVisitorId: string): string[] {
  const ids = [primaryVisitorId.trim(), getStoredVisitorUuid()?.trim() ?? ""].filter(Boolean);
  return [...new Set(ids)];
}

function shareExpoCandidates(expoId?: string | null): Array<string | null> {
  const trimmed = expoId?.trim() ?? "";
  if (trimmed && isUuid(trimmed)) return [trimmed, null];
  return [null];
}

async function requestTravelDiaryShareLink(
  visitorId: string,
  expoId: string | null,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const params: { p_visitor_id: string; p_expo_id?: string | null } = {
    p_visitor_id: visitorId,
  };
  if (expoId) params.p_expo_id = expoId;

  const { data, error } = await supabase.rpc("create_travel_diary_share_link", params);
  return { data, error: error ? { message: error.message } : null };
}

export async function createTravelDiaryShareLink(
  visitorId: string,
  expoId?: string | null,
): Promise<{ token: string; expiresAt: string } | null> {
  for (const candidateId of shareOwnerIdCandidates(visitorId)) {
    for (const expoFilter of shareExpoCandidates(expoId)) {
      const { data, error } = await requestTravelDiaryShareLink(candidateId, expoFilter);
      if (error) continue;

      const parsed = parseShareLinkRpcRow(data);
      if (parsed) return parsed;
    }
  }

  return null;
}

export async function resolveTravelDiaryShareToken(token: string): Promise<TravelDiaryShareAccess> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false, visitorId: null, expoId: null, expiresAt: null };
  }

  const { data, error } = await supabase.rpc("resolve_travel_diary_share_token", {
    p_token: trimmed,
  });

  if (error || !data || typeof data !== "object") {
    return { valid: false, visitorId: null, expoId: null, expiresAt: null };
  }

  const row = data as ResolveShareRpcRow;
  return {
    valid: row.valid === true,
    visitorId: row.visitor_id?.trim() || null,
    expoId: row.expo_id?.trim() || null,
    expiresAt: row.expires_at?.trim() || null,
  };
}

export function buildTravelDiaryShareUrl(token: string, pageIndex = 0): string {
  const url = new URL(`${window.location.origin}/summary`);
  url.searchParams.set("share", token.trim());
  if (pageIndex > 0) {
    url.searchParams.set("page", String(pageIndex + 1));
  }
  return url.toString();
}
