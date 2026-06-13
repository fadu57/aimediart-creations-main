import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

type Action = "session_start" | "session_end" | "error";
type Audience = "visitor" | "organizer";

type RequestBody = {
  audience?: Audience;
  action?: Action;
  session_id?: string;
  visitor_client_id?: string | null;
  auth_user_id?: string | null;
  agency_id?: string | null;
  expo_id?: string | null;
  error_message?: string | null;
  error_stack?: string | null;
  error_source?: string | null;
  page_url?: string | null;
  user_agent?: string | null;
  locale?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown> | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clampText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function tablesForAudience(audience: Audience): { sessions: string; logs: string } {
  if (audience === "organizer") {
    return { sessions: "organizer_error_sessions", logs: "organizer_error_logs" };
  }
  return { sessions: "visitor_error_sessions", logs: "visitor_error_logs" };
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

  const audience: Audience = body.audience === "organizer" ? "organizer" : "visitor";
  const { sessions: sessionsTable, logs: logsTable } = tablesForAudience(audience);
  const action = body.action;
  const sessionId = body.session_id?.trim() ?? "";
  if (!action || !UUID_RE.test(sessionId)) {
    return jsonResponse({ error: "action et session_id (UUID) requis." }, 400);
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
  const authUserId = body.auth_user_id?.trim() && UUID_RE.test(body.auth_user_id.trim())
    ? body.auth_user_id.trim()
    : null;
  const agencyId = body.agency_id?.trim() && UUID_RE.test(body.agency_id.trim())
    ? body.agency_id.trim()
    : null;
  const expoId = body.expo_id?.trim() && UUID_RE.test(body.expo_id.trim()) ? body.expo_id.trim() : null;
  const pageUrl = clampText(body.page_url, 2000);
  const userAgent = clampText(body.user_agent ?? req.headers.get("user-agent"), 500);
  const locale = clampText(body.locale, 32);
  const timezone = clampText(body.timezone, 64);

  if (action === "session_start") {
    const { data: existing } = await admin.from(sessionsTable).select("id").eq("id", sessionId).maybeSingle();

    if (existing) {
      await admin
        .from(sessionsTable)
        .update({
          last_page_url: pageUrl ?? undefined,
          auth_user_id: authUserId ?? undefined,
          agency_id: agencyId ?? undefined,
        })
        .eq("id", sessionId);
      return jsonResponse({ ok: true, action, audience, reused: true });
    }

    const insertRow: Record<string, unknown> = {
      id: sessionId,
      auth_user_id: authUserId,
      user_agent: userAgent,
      last_page_url: pageUrl,
      locale,
      timezone,
    };
    if (audience === "visitor") {
      insertRow.visitor_client_id = visitorClientId;
      insertRow.expo_id = expoId;
    } else {
      insertRow.agency_id = agencyId;
    }

    const { error } = await admin.from(sessionsTable).insert(insertRow);
    if (error) {
      console.error("[log-client-error] session_start:", error.message);
      return jsonResponse({ error: "Échec enregistrement session.", details: error.message }, 500);
    }

    const { error: logErr } = await admin.from(logsTable).insert({
      session_id: sessionId,
      error_message: "Début de session (connexion au parcours)",
      error_source: "auth.session_start",
      page_url: pageUrl,
      metadata: {},
    });
    if (logErr) {
      console.error("[log-client-error] session_start log:", logErr.message);
    }

    return jsonResponse({ ok: true, action, audience });
  }

  if (action === "session_end") {
    const { error } = await admin
      .from(sessionsTable)
      .update({
        ended_at: new Date().toISOString(),
        last_page_url: pageUrl ?? undefined,
      })
      .eq("id", sessionId);
    if (error) {
      console.error("[log-client-error] session_end:", error.message);
      return jsonResponse({ error: "Échec clôture session.", details: error.message }, 500);
    }

    const { error: logErr } = await admin.from(logsTable).insert({
      session_id: sessionId,
      error_message: "Fin de session (déconnexion ou fermeture onglet)",
      error_source: "auth.session_end",
      page_url: pageUrl,
      metadata: {},
    });
    if (logErr) {
      console.error("[log-client-error] session_end log:", logErr.message);
    }

    return jsonResponse({ ok: true, action, audience });
  }

  if (action === "error") {
    const message = clampText(body.error_message, 4000);
    if (!message) {
      return jsonResponse({ error: "error_message requis pour action=error." }, 400);
    }

    const { data: existing } = await admin.from(sessionsTable).select("id").eq("id", sessionId).maybeSingle();

    if (!existing) {
      const insertRow: Record<string, unknown> = {
        id: sessionId,
        auth_user_id: authUserId,
        user_agent: userAgent,
        last_page_url: pageUrl,
        locale,
        timezone,
      };
      if (audience === "visitor") {
        insertRow.visitor_client_id = visitorClientId;
        insertRow.expo_id = expoId;
      } else {
        insertRow.agency_id = agencyId;
      }
      await admin.from(sessionsTable).insert(insertRow);
    }

    const { error } = await admin.from(logsTable).insert({
      session_id: sessionId,
      error_message: message,
      error_stack: clampText(body.error_stack, 8000),
      error_source: clampText(body.error_source, 64) ?? "unknown",
      page_url: pageUrl,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    if (error) {
      console.error("[log-client-error] error insert:", error.message);
      return jsonResponse({ error: "Échec enregistrement erreur.", details: error.message }, 500);
    }

    await admin.from(sessionsTable).update({ last_page_url: pageUrl ?? undefined }).eq("id", sessionId);

    return jsonResponse({ ok: true, action, audience });
  }

  return jsonResponse({ error: "action invalide." }, 400);
});
