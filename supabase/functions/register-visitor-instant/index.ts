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
  role_id?: string | number | null;
  agency_id?: string | null;
  user_age?: string | null;
  user_phone?: string | null;
  user_photo_url?: string | null;
  user_expo_id?: string | null;
  visitor_uuid?: string | null;
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Méthode non autorisée." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Variables serveur Supabase manquantes." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Body JSON invalide." });
  }

  const email = body.email?.trim() || "";
  const password = body.password || "";
  const prenom = body.prenom?.trim() || "";
  const nom = body.nom?.trim() || "";
  const requestedRoleIdRaw = body.role_id;
  const requestedRoleId =
    requestedRoleIdRaw == null ? null : String(requestedRoleIdRaw).trim();
  const agencyIdFromBody = body.agency_id?.trim() || null;
  const userAge = body.user_age?.trim() || null;
  const userPhone = body.user_phone?.trim() || null;
  const userPhotoUrl = body.user_photo_url?.trim() || null;
  const expoId = body.user_expo_id?.trim() || null;
  const visitorUuid = body.visitor_uuid?.trim() || null;

  if (!isEmailLike(email)) {
    return jsonResponse(400, { ok: false, code: "invalid_email", error: "Adresse e-mail invalide." });
  }
  if (password.length < 6) {
    return jsonResponse(400, { ok: false, code: "weak_password", error: "Mot de passe trop court (minimum 6 caractères)." });
  }
  if (!prenom || !nom) {
    return jsonResponse(400, { ok: false, code: "invalid_profile", error: "Prénom et nom sont requis." });
  }
  if (requestedRoleId !== null && requestedRoleId !== "7") {
    return jsonResponse(403, {
      ok: false,
      code: "invalid_role_for_instant_registration",
      error: "Inscription instantanée autorisée uniquement pour role_id=7 (visiteur).",
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let resolvedAgencyId: string | null = agencyIdFromBody;
  let resolvedExpoId: string | null = expoId;
  if (expoId) {
    const byId = await admin.from("expos").select("id, agency_id").eq("id", expoId).maybeSingle();
    if (byId.error) {
      return jsonResponse(400, { ok: false, code: "invalid_expo_id", error: byId.error.message });
    }
    if (byId.data && typeof byId.data === "object") {
      const row = byId.data as { id?: string | null; agency_id?: string | null };
      resolvedExpoId = row.id?.trim() || expoId;
      resolvedAgencyId = row.agency_id?.trim() || null;
    } else {
      const byExternalId = await admin
        .from("expos")
        .select("id, agency_id")
        .eq("expo_id", expoId)
        .maybeSingle();
      if (byExternalId.error) {
        return jsonResponse(400, { ok: false, code: "invalid_expo_id", error: byExternalId.error.message });
      }
      if (byExternalId.data && typeof byExternalId.data === "object") {
        const row = byExternalId.data as { id?: string | null; agency_id?: string | null };
        resolvedExpoId = row.id?.trim() || expoId;
        resolvedAgencyId = row.agency_id?.trim() || null;
      }
    }
  }

  const userPrenom = prenom;
  const fullName = `${prenom} ${nom}`.trim();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      prenom,
      nom,
      user_prenom: userPrenom,
      full_name: fullName,
    },
  });

  if (createError) {
    const msg = createError.message || "Création utilisateur impossible.";
    const lower = msg.toLowerCase();
    if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
      return jsonResponse(409, { ok: false, code: "user_already_exists", error: msg });
    }
    return jsonResponse(400, { ok: false, code: createError.code || "create_failed", error: msg });
  }

  const userId = created.user?.id;
  if (!userId) {
    return jsonResponse(500, { ok: false, code: "missing_user_id", error: "ID utilisateur non retourné." });
  }

  const payload = {
    id: userId,
    role_id: "7",
    user_prenom: userPrenom || null,
    agency_id: resolvedAgencyId,
    user_expo_id: resolvedExpoId,
  };
  const payloadUsers = {
    ...payload,
    user_nom: nom || null,
    user_age: userAge,
    user_phone: userPhone,
    user_photo_url: userPhotoUrl,
    user_roles: "7",
    user_email: email,
  };

  const firstTry = await admin.from("user").upsert(payload, { onConflict: "id" });
  const secondTry = await admin.from("users").upsert(payloadUsers, { onConflict: "id" });
  if (firstTry.error && secondTry.error) {
    return jsonResponse(500, {
      ok: false,
      code: "profile_upsert_failed",
      error: `${firstTry.error.message} | ${secondTry.error.message}`,
    });
  }

  if (visitorUuid) {
    const { error: reconcileError } = await admin
      .from("guest_visits")
      .update({ user_id: userId })
      .eq("visitor_uuid", visitorUuid)
      .is("user_id", null);
    if (reconcileError && reconcileError.message && Deno.env.get("DENO_DEPLOYMENT_ID")) {
      // noop: rattachement des visites non bloquant
    }
  }

  return jsonResponse(200, {
    ok: true,
    user_id: userId,
    role_id: "7",
  });
});
