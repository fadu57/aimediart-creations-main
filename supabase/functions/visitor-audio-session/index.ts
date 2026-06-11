/**
 * visitor-audio-session — heartbeat visiteur + bannissement audio admin.
 *
 * Actions publiques (anon) : heartbeat, ban_status
 * Actions admin (JWT role_id < 5) : list, ban, unban
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TABLE = "visitor_audio_presence";
const ACTIVE_WITHIN_MS = 5 * 60 * 1000;

type Action = "heartbeat" | "ban_status" | "list" | "ban" | "unban";

type RequestBody = {
  action?: Action;
  visitor_client_id?: string | null;
  expo_id?: string | null;
  artwork_id?: string | null;
  artwork_title?: string | null;
  page_url?: string | null;
  headphones_detected?: boolean | null;
  session_id?: string | null;
  reason?: string | null;
};

function clampText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Admins globaux (role < 4) ou admin agence (role 4). */
async function requireExpoStaff(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: true; userId: string; roleId: number | null } | { ok: false; reason: string }> {
  const base = await requireAdminUser(req, admin);
  if (base.authorized) {
    return { ok: true, userId: base.userId, roleId: base.roleId };
  }

  // Tentative admin agence : role_id = 4 dans profiles
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, reason: base.reason };
  }

  const { data: userData, error } = await admin.auth.getUser(authHeader.slice(7).trim());
  if (error || !userData.user?.id) {
    return { ok: false, reason: "JWT invalide." };
  }

  const userId = userData.user.id;
  const { data: profileRow } = await admin.from("profiles").select("role_id").eq("id", userId).maybeSingle();
  const roleId = Number((profileRow as { role_id?: number } | null)?.role_id ?? NaN);

  if (Number.isFinite(roleId) && roleId >= 1 && roleId <= 4) {
    return { ok: true, userId, roleId };
  }

  return { ok: false, reason: base.reason };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Body JSON invalide." }, 400);
  }

  const action = body.action;
  if (!action) {
    return jsonResponse({ error: "action requise." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration Supabase serveur incomplète." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const visitorClientId = clampText(body.visitor_client_id, 120);
  const expoId = body.expo_id?.trim() && UUID_RE.test(body.expo_id.trim()) ? body.expo_id.trim() : null;
  const artworkId =
    body.artwork_id?.trim() && UUID_RE.test(body.artwork_id.trim()) ? body.artwork_id.trim() : null;
  const now = new Date().toISOString();

  if (action === "heartbeat") {
    if (!visitorClientId) {
      return jsonResponse({ error: "visitor_client_id requis." }, 400);
    }

    let artworkTitle = clampText(body.artwork_title, 300);
    if (artworkId && !artworkTitle) {
      const { data: awRow } = await admin
        .from("artworks")
        .select("artwork_title")
        .eq("artwork_id", artworkId)
        .maybeSingle();
      artworkTitle = clampText((awRow as { artwork_title?: string } | null)?.artwork_title, 300);
    }

    const row = {
      visitor_client_id: visitorClientId,
      expo_id: expoId,
      artwork_id: artworkId,
      artwork_title: artworkTitle,
      page_url: clampText(body.page_url, 2000),
      headphones_detected:
        typeof body.headphones_detected === "boolean" ? body.headphones_detected : null,
      last_seen_at: now,
    };

    const { data, error } = await admin
      .from(TABLE)
      .upsert(row, { onConflict: "visitor_client_id" })
      .select("id, banned_at")
      .single();

    if (error) {
      console.error("[visitor-audio-session] heartbeat:", error.message);
      return jsonResponse({ error: "Échec heartbeat.", details: error.message }, 500);
    }

    const session = data as { id?: string; banned_at?: string | null };
    return jsonResponse({
      ok: true,
      session_id: session.id ?? null,
      banned: Boolean(session.banned_at),
      banned_at: session.banned_at ?? null,
    });
  }

  if (action === "ban_status") {
    if (!visitorClientId) {
      return jsonResponse({ error: "visitor_client_id requis." }, 400);
    }

    const { data, error } = await admin
      .from(TABLE)
      .select("id, banned_at")
      .eq("visitor_client_id", visitorClientId)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    const row = data as { id?: string; banned_at?: string | null } | null;
    return jsonResponse({
      banned: Boolean(row?.banned_at),
      session_id: row?.id ?? null,
      banned_at: row?.banned_at ?? null,
    });
  }

  // Actions admin
  const staff = await requireExpoStaff(req, admin);
  if (!staff.ok) {
    return jsonResponse({ error: staff.reason }, 403);
  }

  if (action === "list") {
    if (!expoId) {
      return jsonResponse({ error: "expo_id requis." }, 400);
    }

    const cutoff = new Date(Date.now() - ACTIVE_WITHIN_MS).toISOString();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("expo_id", expoId)
      .gte("last_seen_at", cutoff)
      .order("last_seen_at", { ascending: false });

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ rows: data ?? [] });
  }

  const sessionId = body.session_id?.trim() ?? "";
  if (!UUID_RE.test(sessionId)) {
    return jsonResponse({ error: "session_id (UUID) requis." }, 400);
  }

  if (action === "ban") {
    const { error } = await admin
      .from(TABLE)
      .update({
        banned_at: now,
        banned_by: staff.userId,
        ban_reason: clampText(body.reason, 500) ?? "Audio haut-parleur en salle",
      })
      .eq("id", sessionId);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true, banned_at: now });
  }

  if (action === "unban") {
    const { error } = await admin
      .from(TABLE)
      .update({
        banned_at: null,
        banned_by: null,
        ban_reason: null,
      })
      .eq("id", sessionId);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "action invalide." }, 400);
});
