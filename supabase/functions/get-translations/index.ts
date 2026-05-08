import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPPORTED_LANGS = ["fr", "en", "de", "es", "it"] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

function jsonResponse(status: number, payload: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const url = new URL(req.url);
  // Accepte /get-translations?lng=fr  OU  /get-translations/fr
  const lngParam =
    url.searchParams.get("lng") ??
    url.pathname.split("/").filter(Boolean).pop() ??
    "";

  const lng = lngParam.toLowerCase();

  if (!(SUPPORTED_LANGS as readonly string[]).includes(lng)) {
    return jsonResponse(400, {
      error: `Langue non supportée : "${lng}". Valeurs acceptées : ${SUPPORTED_LANGS.join(", ")}.`,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Variables d'environnement Supabase manquantes." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("translations")
    .select("key, value")
    .eq("lng", lng as SupportedLang);

  if (error) {
    return jsonResponse(500, { error: "Erreur lors de la lecture des traductions.", details: error.message });
  }

  return jsonResponse(200, data ?? [], {
    // Cache 5 min côté client, 1 h en CDN — les traductions changent rarement
    "Cache-Control": "public, max-age=300, s-maxage=3600",
  });
});
