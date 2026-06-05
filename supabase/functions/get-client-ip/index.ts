// Supabase Edge Function: get-client-ip
// Retourne l'adresse IP client vue par l'edge.
// NOTE RGPD: conserver une base légale et anonymiser si nécessaire.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

function firstForwardedIp(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const first = headerValue.split(",")[0]?.trim();
  return first || null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const ip =
    firstForwardedIp(req.headers.get("x-forwarded-for")) ||
    req.headers.get("x-real-ip")?.trim() ||
    null;

  return jsonResponse({ ip_address: ip });
});
