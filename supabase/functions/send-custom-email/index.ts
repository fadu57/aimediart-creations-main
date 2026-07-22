/**
 * Envoi ponctuel d’un e-mail HTML via Resend (service-role uniquement).
 * Body JSON : { to, subject, html, text? }
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  DEFAULT_RESEND_FROM,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const isExactServiceKey = Boolean(serviceKey && auth === serviceKey);
  let isServiceJwt = false;
  try {
    const parts = auth.split(".");
    if (parts.length === 3) {
      const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
      const payload = JSON.parse(
        atob(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/"))),
      );
      isServiceJwt = payload?.role === "service_role";
    }
  } catch {
    isServiceJwt = false;
  }
  if (!isExactServiceKey && !isServiceJwt) {
    return jsonResponse({ error: "Non autorisé (service-role requis)." }, 401);
  }

  let body: { to?: string; subject?: string; html?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Body JSON invalide." }, 400);
  }

  const to = body.to?.trim() ?? "";
  const subject = body.subject?.trim() ?? "";
  const html = body.html?.trim() ?? "";
  if (!to || !subject || !html) {
    return jsonResponse({ error: "Champs to, subject et html requis." }, 400);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  if (!isResendApiKeyConfigured(apiKey)) {
    return jsonResponse({ error: "RESEND_API_KEY manquant." }, 500);
  }

  const fromEmail =
    Deno.env.get("RESEND_FROM")?.trim() ||
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
    Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() ||
    DEFAULT_RESEND_FROM;

  const result = await sendResendEmail({
    apiKey,
    fromEmail,
    to,
    subject,
    html,
    text: body.text,
  });

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 502);
  }
  return jsonResponse({ ok: true, id: result.id ?? null });
});
