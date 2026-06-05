import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { persistVisitorProfile } from "../_shared/visitorProfile.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  prenom?: string;
  nom?: string;
  agency_id?: string | null;
  user_age?: string | null;
  user_phone?: string | null;
  user_photo_url?: string | null;
  user_expo_id?: string | null;
  visitor_uuid?: string | null;
  device_fingerprint?: string | null;
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
    return jsonResponse(500, { ok: false, error: "Variables serveur Supabase manquantes." });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(401, { ok: false, code: "missing_auth", error: "Session requise." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse(401, { ok: false, code: "invalid_auth", error: "Session invalide ou expirée." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Body JSON invalide." });
  }

  const prenom = body.prenom?.trim() || "";
  const nom = body.nom?.trim() || "";
  const agencyIdFromBody = body.agency_id?.trim() || null;
  const userAge = body.user_age?.trim() || null;
  const userPhone = body.user_phone?.trim() || null;
  const userPhotoUrl = body.user_photo_url?.trim() || null;
  const expoId = body.user_expo_id?.trim() || null;
  const visitorUuid = body.visitor_uuid?.trim() || null;
  const deviceFingerprint = body.device_fingerprint?.trim().slice(0, 128) || null;

  if (!prenom || !nom) {
    return jsonResponse(400, { ok: false, code: "invalid_profile", error: "Prénom et nom sont requis." });
  }

  const userId = authData.user.id;
  const email = authData.user.email?.trim() || "";
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

  const profileResult = await persistVisitorProfile(admin, {
    userId,
    email: email || null,
    prenom,
    nom,
    agencyId: resolvedAgencyId,
    expoId: resolvedExpoId,
    userAge,
    userPhone,
    userPhotoUrl,
    deviceFingerprint,
  });
  if (!profileResult.ok) {
    return jsonResponse(500, {
      ok: false,
      code: "profile_upsert_failed",
      error: profileResult.error,
    });
  }

  if (visitorUuid) {
    await admin
      .from("guest_visits")
      .update({ user_id: userId })
      .eq("visitor_uuid", visitorUuid)
      .is("user_id", null);

    await admin.rpc("link_visitor_to_auth_user", {
      p_visitor_client_id: visitorUuid,
      p_auth_user_id: userId,
    });
  }

  return jsonResponse(200, {
    ok: true,
    user_id: userId,
    role_id: "7",
  });
});
