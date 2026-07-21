/**
 * Diagnostic ponctuel : statut des domaines Resend liés à RESEND_API_KEY.
 * Auth : Bearer service_role.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  let isServiceJwt = false;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
      const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/"))));
      isServiceJwt = payload?.role === "service_role";
    }
  } catch {
    isServiceJwt = false;
  }
  if (!(serviceRoleKey && token === serviceRoleKey) && !isServiceJwt) {
    return jsonResponse(401, { ok: false, error: "Service role requis." });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    return jsonResponse(500, { ok: false, error: "RESEND_API_KEY manquant." });
  }

  const listRes = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const listText = await listRes.text();
  if (!listRes.ok) {
    return jsonResponse(listRes.status, { ok: false, error: listText.slice(0, 500) });
  }

  let parsed: { data?: Array<{ id: string; name: string; status: string; region?: string }> };
  try {
    parsed = JSON.parse(listText);
  } catch {
    return jsonResponse(500, { ok: false, error: "Réponse Resend invalide." });
  }

  const domains = parsed.data ?? [];
  const details: unknown[] = [];
  for (const d of domains) {
    const detailRes = await fetch(`https://api.resend.com/domains/${d.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const detailText = await detailRes.text();
    try {
      details.push(JSON.parse(detailText));
    } catch {
      details.push({ id: d.id, name: d.name, status: d.status, raw: detailText.slice(0, 300) });
    }
  }

  // POST ou ?verify=1 → relance la vérif DNS Resend, puis relecture du statut.
  const url = new URL(req.url);
  const doVerify = req.method === "POST" || url.searchParams.get("verify") === "1";
  const verifyResults: unknown[] = [];
  if (doVerify) {
    for (const d of domains) {
      const vRes = await fetch(`https://api.resend.com/domains/${d.id}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const vText = await vRes.text();
      try {
        verifyResults.push({ id: d.id, name: d.name, http: vRes.status, body: JSON.parse(vText) });
      } catch {
        verifyResults.push({ id: d.id, name: d.name, http: vRes.status, body: vText.slice(0, 300) });
      }
    }
    details.length = 0;
    for (const d of domains) {
      const detailRes = await fetch(`https://api.resend.com/domains/${d.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const detailText = await detailRes.text();
      try {
        details.push(JSON.parse(detailText));
      } catch {
        details.push({ id: d.id, name: d.name, status: d.status, raw: detailText.slice(0, 300) });
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    from_configured:
      Deno.env.get("RESEND_FROM") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      Deno.env.get("NOTIFY_FROM_EMAIL") ||
      null,
    domains: details,
    verify: doVerify ? verifyResults : undefined,
  });
});
