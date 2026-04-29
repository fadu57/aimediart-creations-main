import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  email?: string;
  password?: string;
  prenom?: string;
  nom?: string;
  role_id?: number | string;
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
  if (callerRoleId === 1 || callerRoleId === 2) return [2, 3];
  return [];
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

  const email = body.email?.trim().toLowerCase() || "";
  const password = body.password || "";
  const prenom = body.prenom?.trim() || "";
  const nom = body.nom?.trim() || "";
  const targetRoleId = Number(body.role_id);
  if (!email || !password || !prenom || !nom || !Number.isFinite(targetRoleId)) {
    return jsonResponse(400, { ok: false, error: "Email, mot de passe, prénom, nom et rôle sont requis." });
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
  if (!allowedRoleIds.includes(targetRoleId)) {
    return jsonResponse(403, { ok: false, error: "Rôle cible non autorisé pour cet appelant." });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      prenom,
      nom,
      user_prenom: prenom,
      full_name: `${prenom} ${nom}`.trim(),
    },
  });
  if (createError || !created.user?.id) {
    const msg = createError?.message || "Création Auth impossible.";
    return jsonResponse(400, { ok: false, error: msg });
  }

  const newUserId = created.user.id;
  const profilePayload = {
    id: newUserId,
    role_id: targetRoleId,
    user_roles: String(targetRoleId),
    user_prenom: prenom,
    user_nom: nom,
    user_email: email,
  };

  const { error: upErr } = await admin.from("users").upsert(profilePayload, { onConflict: "id" });
  if (upErr) {
    return jsonResponse(500, { ok: false, error: upErr.message });
  }

  return jsonResponse(200, { ok: true, user_id: newUserId });
});
