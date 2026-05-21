import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  user_id?: string;
  email?: string;
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isEmailLike(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

function parseAppRole(appMetadata: Record<string, unknown> | undefined): number | null {
  const raw = appMetadata?.role_id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function callerAgencyIds(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<Array<{ agency_id: string; role_id: number }>> {
  const { data } = await admin
    .from("agency_users")
    .select("agency_id, role_id")
    .eq("user_id", userId);
  const rows = (data as Array<{ agency_id?: string | null; role_id?: unknown }> | null) ?? [];
  return rows
    .map((row) => {
      const agency_id = typeof row.agency_id === "string" ? row.agency_id.trim() : "";
      const role_id = Number(row.role_id);
      if (!agency_id || !Number.isFinite(role_id)) return null;
      return { agency_id, role_id };
    })
    .filter((row): row is { agency_id: string; role_id: number } => row != null);
}

/** Même logique d'accès que get_user_edit_details, avec cible équipe 5–6 pour admin org. */
async function canUpdateTargetEmail(
  admin: ReturnType<typeof createClient>,
  callerId: string,
  targetId: string,
): Promise<boolean> {
  if (callerId === targetId) return true;

  const { data: callerAuth, error: callerAuthErr } = await admin.auth.admin.getUserById(callerId);
  if (callerAuthErr || !callerAuth.user) return false;

  const callerAppRole = parseAppRole(
    (callerAuth.user.app_metadata as Record<string, unknown> | undefined) ?? {},
  );
  if (callerAppRole != null && callerAppRole >= 1 && callerAppRole <= 3) return true;

  const callerAgencies = await callerAgencyIds(admin, callerId);
  const isOrgAdmin = callerAgencies.some((row) => row.role_id === 4);
  if (!isOrgAdmin) return false;

  const callerAgencySet = new Set(callerAgencies.map((row) => row.agency_id));
  const targetAgencies = await callerAgencyIds(admin, targetId);
  return targetAgencies.some(
    (row) => callerAgencySet.has(row.agency_id) && row.role_id >= 5 && row.role_id <= 6,
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Méthode non autorisée." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { ok: false, error: "Variables Supabase serveur manquantes." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(401, { ok: false, error: "Token manquant." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Body JSON invalide." });
  }

  const targetUserId = body.user_id?.trim() || "";
  const email = body.email?.trim().toLowerCase() || "";
  if (!targetUserId || !isEmailLike(email)) {
    return jsonResponse(400, { ok: false, error: "user_id et email valide sont requis." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: callerUser },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return jsonResponse(401, { ok: false, error: "Utilisateur appelant introuvable." });
  }

  if (callerUser.id !== targetUserId) {
    const allowed = await canUpdateTargetEmail(admin, callerUser.id, targetUserId);
    if (!allowed) {
      return jsonResponse(403, { ok: false, error: "Vous ne pouvez pas modifier l'e-mail de cet utilisateur." });
    }
  }

  const { data: targetAuth, error: targetAuthErr } = await admin.auth.admin.getUserById(targetUserId);
  if (targetAuthErr || !targetAuth.user) {
    return jsonResponse(404, { ok: false, error: "Utilisateur cible introuvable dans Auth." });
  }

  const currentEmail = (targetAuth.user.email ?? "").trim().toLowerCase();
  if (currentEmail === email) {
    return jsonResponse(200, { ok: true, user_id: targetUserId, email, unchanged: true });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, {
    email,
    email_confirm: true,
  });
  if (updateErr) {
    const msg = updateErr.message || "Mise à jour e-mail impossible.";
    const lower = msg.toLowerCase();
    if (lower.includes("already") || lower.includes("exists") || lower.includes("registered")) {
      return jsonResponse(409, { ok: false, code: "email_already_used", error: msg });
    }
    return jsonResponse(400, { ok: false, error: msg });
  }

  return jsonResponse(200, { ok: true, user_id: targetUserId, email });
});
