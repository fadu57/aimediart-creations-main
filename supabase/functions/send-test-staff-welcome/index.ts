/**
 * Envoi ponctuel d'un e-mail de bienvenue staff (aperçu Resend).
 * Protégé par service-role (Authorization Bearer = service role key).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_RESEND_FROM,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getPublicSiteOrigin(): string {
  const fromEnv = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").trim().replace(/\/$/, "");
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) return fromEnv;
  return "https://www.aimediart.com";
}

function brandAimediart(text: string): string {
  return text.replace(
    /AIMEDIArt/g,
    '<strong style="color:#ca2b2b;font-weight:700;">AIMEDIArt</strong>',
  );
}

function buildStaffWelcomeEmailHtml(params: {
  prenom: string;
  orgLabel: string;
  actionLink: string;
  profileUrl: string;
}): string {
  const name = params.prenom.trim() || "collègue";
  const font =
    "Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const passwordHref = params.actionLink.trim();
  const profileHref = params.profileUrl.trim();
  const org = params.orgLabel.trim() || "AIMEDIArt";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e5e5e5;">
        <tr><td style="color:#1a1a1a;font-family:${font};">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Bonjour ${name},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
            ${brandAimediart(`Bienvenue sur AIMEDIArt — vous avez été invité(e) à rejoindre l'espace <strong>${org}</strong>.`)}
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">
            Pour commencer, créez votre mot de passe personnel en cliquant sur le bouton ci-dessous.
          </p>
          <p style="margin:0 0 22px;text-align:center;">
            <a href="${passwordHref}" style="display:inline-block;background:#ca2b2b;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">
              Créer mon mot de passe
            </a>
          </p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
            Ensuite, complétez votre profil (photo, pseudo, date de naissance, adresse) pour finaliser votre espace.
          </p>
          <p style="margin:0 0 8px;text-align:center;">
            <a href="${profileHref}" style="display:inline-block;background:#1f1f1f;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 18px;border-radius:8px;">
              Compléter mon profil
            </a>
          </p>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.45;color:#666;">
            Si le bouton ne fonctionne pas, copiez ce lien&nbsp;:<br/>
            <a href="${passwordHref}" style="color:#888;word-break:break-all;">${passwordHref}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildPasswordSetupActionLink(linkPayload: unknown, nextPath: string): string {
  const props =
    linkPayload && typeof linkPayload === "object" && "properties" in linkPayload
      ? ((linkPayload as { properties?: Record<string, unknown> }).properties ?? {})
      : {};
  let hashedToken = typeof props.hashed_token === "string" ? props.hashed_token.trim() : "";
  if (!hashedToken) {
    const actionLinkRaw = typeof props.action_link === "string" ? props.action_link.trim() : "";
    if (actionLinkRaw) {
      try {
        const u = new URL(actionLinkRaw);
        hashedToken =
          u.searchParams.get("token")?.trim() ||
          u.searchParams.get("token_hash")?.trim() ||
          "";
      } catch { /* ignore */ }
    }
  }
  if (!hashedToken) return "";
  const url = new URL(`${getPublicSiteOrigin()}/reset-password`);
  url.searchParams.set("setup", "1");
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  if (nextPath.trim()) url.searchParams.set("next", nextPath.trim());
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Méthode non autorisée." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const isExactServiceKey = Boolean(serviceRoleKey && token === serviceRoleKey);
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
  if (!isExactServiceKey && !isServiceJwt) {
    return jsonResponse(401, { ok: false, error: "Service role requis." });
  }

  let body: { email?: string; prenom?: string; org_label?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "JSON invalide." });
  }

  const email = body.email?.trim().toLowerCase() || "";
  const prenom = body.prenom?.trim() || "Fabien";
  const orgLabel = body.org_label?.trim() || "AIMEDIArt";
  if (!email) return jsonResponse(400, { ok: false, error: "email requis." });

  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  if (!isResendApiKeyConfigured(resendApiKey)) {
    return jsonResponse(500, { ok: false, error: "RESEND_API_KEY manquant." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nextPath = "/dashboard?complete_profile=1";
  const origin = getPublicSiteOrigin();
  let actionLink = `${origin}/reset-password?setup=1&next=${encodeURIComponent(nextPath)}`;

  // Lien recovery réel si le compte existe déjà
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${origin}/reset-password?setup=1&next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (!linkErr && linkData) {
    const built = buildPasswordSetupActionLink(linkData, nextPath);
    if (built) actionLink = built;
  }

  const profileUrl = `${origin}/dashboard?complete_profile=1`;
  const html = buildStaffWelcomeEmailHtml({ prenom, orgLabel, actionLink, profileUrl });
  const fromEmail =
    Deno.env.get("RESEND_FROM")?.trim() ||
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
    Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() ||
    DEFAULT_RESEND_FROM;

  // Pas de fallback onboarding@resend.dev : on exige no-reply@aimediart.com (domaine vérifié Resend).
  const mail = await sendResendEmail({
    apiKey: resendApiKey,
    fromEmail,
    to: email,
    subject: "❤️ AIMEDIArt — bienvenue, créez votre mot de passe",
    html,
  });
  if (!mail.ok) {
    return jsonResponse(500, {
      ok: false,
      error: mail.error,
      from: fromEmail,
      origin,
      hint:
        "Vérifiez aimediart.com dans Resend (Domains → DNS DKIM/SPF), puis relancez Verify.",
    });
  }
  return jsonResponse(200, {
    ok: true,
    id: mail.id,
    from: fromEmail,
    origin,
    action_link_host: (() => {
      try { return new URL(actionLink).origin; } catch { return ""; }
    })(),
    recovery_link_generated: !linkErr,
  });
});
