// Supabase Edge Function: get-client-ip
// Retourne l'adresse IP client vue par l'edge.
// NOTE RGPD: conserver une base légale et anonymiser si nécessaire.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function firstForwardedIp(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const first = headerValue.split(",")[0]?.trim();
  return first || null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const ip =
    firstForwardedIp(req.headers.get("x-forwarded-for")) ||
    req.headers.get("x-real-ip")?.trim() ||
    null;

  return new Response(JSON.stringify({ ip_address: ip }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
});

