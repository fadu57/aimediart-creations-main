/**
 * Lien de partage public GED : GET ?t=<share_token>
 * Redirige vers une URL signée Storage (pas d’auth requise).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** TTL de l’URL signée générée à chaque accès (1 h). Le lien /share reste stable. */
const SIGNED_URL_TTL_SEC = 3600;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  if (req.method !== "GET") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  if (!UUID_RE.test(token)) {
    return jsonResponse({ error: "Token invalide." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration serveur incomplète." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: doc, error } = await admin
    .from("aimediart_documents")
    .select("bucket, path, name")
    .eq("share_token", token)
    .maybeSingle();

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!doc?.bucket || !doc?.path) {
    return jsonResponse({ error: "Document introuvable." }, 404);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(doc.bucket)
    .createSignedUrl(doc.path, SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    return jsonResponse({ error: signErr?.message ?? "URL signée impossible." }, 500);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
