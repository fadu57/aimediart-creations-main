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
  password?: string;
  prenom?: string;
  nom?: string;
  role_id?: number | string | null;
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

function getAllowedRoleIds(callerRoleId: number): number[] {
  if (callerRoleId === 4) return [4, 5, 6];
  if (callerRoleId === 2) return [3, 4, 5, 6, 7];
  if (callerRoleId === 1) return [2, 3, 4, 5, 6, 7];
  return [];
}

function isEmailAlreadyUsedError(message: string | null | undefined): boolean {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("already in use") ||
    msg.includes("duplicate key") ||
    msg.includes("email_exists") ||
    msg.includes("email address")
  );
}

function buildRepairAliasEmail(baseEmail: string): string {
  const normalized = baseEmail.trim().toLowerCase();
  const at = normalized.indexOf("@");
  const local = at > 0 ? normalized.slice(0, at) : normalized || "user";
  const domain = at > 0 ? normalized.slice(at + 1) : "example.com";
  const safeLocal = local.replace(/[^a-z0-9._+-]/gi, "") || "user";
  const safeDomain = domain.replace(/[^a-z0-9.-]/gi, "") || "example.com";
  return `${safeLocal}+repair-${Date.now()}@${safeDomain}`;
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
  const password = body.password || "";
  const prenom = body.prenom?.trim() || "";
  const nom = body.nom?.trim() || "";
  let loginEmail = email;

  if (!targetUserId || !email || !password) {
    return jsonResponse(400, { ok: false, error: "user_id, email et password sont requis." });
  }
  if (password.length < 6) {
    return jsonResponse(400, { ok: false, error: "Mot de passe trop court (min 6)." });
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

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("users")
    .select("role_id")
    .eq("id", callerUser.id)
    .maybeSingle();
  if (callerProfileError || !callerProfile) {
    return jsonResponse(403, { ok: false, error: "Profil appelant non autorisé." });
  }

  const callerRoleId = Number((callerProfile as { role_id?: number | string | null }).role_id ?? NaN);
  const allowedRoleIds = getAllowedRoleIds(callerRoleId);
  if (allowedRoleIds.length === 0) {
    return jsonResponse(403, { ok: false, error: "Appelant non autorisé." });
  }

  const { data: targetProfile, error: targetProfileError } = await admin
    .from("users")
    .select("role_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetProfileError || !targetProfile) {
    return jsonResponse(404, { ok: false, error: "Profil cible introuvable dans public.users." });
  }

  const bodyRoleId = Number(body.role_id ?? NaN);
  const targetRoleId = Number(
    Number.isFinite(bodyRoleId) ? bodyRoleId : (targetProfile as { role_id?: number | string | null }).role_id ?? NaN,
  );
  if (!Number.isFinite(targetRoleId) || !allowedRoleIds.includes(targetRoleId)) {
    return jsonResponse(403, { ok: false, error: "Rôle cible non autorisé pour cet appelant." });
  }

  const metadata = {
    prenom,
    nom,
    user_prenom: prenom,
    full_name: `${prenom} ${nom}`.trim(),
  };

  const { data: existingById, error: existingByIdErr } = await admin.auth.admin.getUserById(targetUserId);
  if (existingByIdErr) {
    const msg = existingByIdErr.message || "";
    const notFound = msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("user not found");
    if (!notFound) {
      return jsonResponse(400, { ok: false, error: msg });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      id: targetUserId,
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { role_id: targetRoleId },
    });
    if (createErr || !created.user?.id) {
      if (isEmailAlreadyUsedError(createErr?.message)) {
        loginEmail = buildRepairAliasEmail(email);
        const { data: createdWithAlias, error: createAliasErr } = await admin.auth.admin.createUser({
          id: targetUserId,
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: metadata,
          app_metadata: { role_id: targetRoleId },
        });
        if (createAliasErr || !createdWithAlias.user?.id) {
          return jsonResponse(400, {
            ok: false,
            error: createAliasErr?.message || "Création Auth impossible (alias).",
          });
        }
      } else {
        return jsonResponse(400, { ok: false, error: createErr?.message || "Création Auth impossible." });
      }
    }
  } else {
    const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { role_id: targetRoleId },
    });
    if (updErr) {
      if (isEmailAlreadyUsedError(updErr.message)) {
        loginEmail = buildRepairAliasEmail(email);
        const { error: updAliasErr } = await admin.auth.admin.updateUserById(targetUserId, {
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: metadata,
          app_metadata: { role_id: targetRoleId },
        });
        if (updAliasErr) {
          return jsonResponse(400, {
            ok: false,
            error: updAliasErr.message || "Mise à jour Auth impossible (alias).",
          });
        }
      } else {
        return jsonResponse(400, { ok: false, error: updErr.message || "Mise à jour Auth impossible." });
      }
    }
  }

  const { error: profileSyncErr } = await admin
    .from("users")
    .update({
      user_email: loginEmail,
      user_prenom: prenom || null,
      user_nom: nom || null,
      role_id: targetRoleId,
      user_roles: String(targetRoleId),
    })
    .eq("id", targetUserId);
  if (profileSyncErr) {
    return jsonResponse(500, { ok: false, error: `Auth OK mais sync profil impossible: ${profileSyncErr.message}` });
  }

  return jsonResponse(200, { ok: true, user_id: targetUserId, login_email: loginEmail });
});
