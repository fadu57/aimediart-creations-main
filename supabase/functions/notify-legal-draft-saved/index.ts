/**
 * Notifie par e-mail qu’une version provisoire de page légale a été enregistrée.
 * Appelable par JWT utilisateur (juriste / admin général).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_RESEND_FROM,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_TO = "fadu57@gmail.com";

function parseRoleId(user: { app_metadata?: Record<string, unknown> } | null): number {
  const raw = user?.app_metadata?.role_id;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Méthode non autorisée." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ ok: false, error: "Variables Supabase serveur manquantes." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "Token manquant." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ ok: false, error: "Utilisateur non authentifié." }, 401);
  }

  const roleId = parseRoleId(user);
  if (roleId !== 1 && roleId !== 8) {
    return jsonResponse({ ok: false, error: "Non autorisé (juriste / admin général)." }, 403);
  }

  let body: {
    slug?: string;
    locale?: string;
    comment_count?: number;
    page_url?: string | null;
    to?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Body JSON invalide." }, 400);
  }

  const slug = (body.slug ?? "cgv").trim() || "cgv";
  const locale = (body.locale ?? "fr").trim() || "fr";
  const commentCount = Number(body.comment_count ?? 0) || 0;
  const pageUrl = (body.page_url ?? "").trim();
  const to = (body.to ?? DEFAULT_TO).trim() || DEFAULT_TO;

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  if (!isResendApiKeyConfigured(apiKey)) {
    return jsonResponse({ ok: false, error: "RESEND_API_KEY manquant." }, 500);
  }

  const fromEmail =
    Deno.env.get("RESEND_FROM")?.trim() ||
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
    Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() ||
    DEFAULT_RESEND_FROM;

  const editorEmail = user.email ?? "(inconnu)";
  const subject = `[AIMEDIArt] Version provisoire enregistrée — ${slug.toUpperCase()} (${locale})`;
  const linkBlock = pageUrl
    ? `<p style="margin:16px 0;"><a href="${escapeHtml(pageUrl)}" style="color:#0b5fff;">Ouvrir la page</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:Georgia,serif;color:#1f1f1f;line-height:1.5;">
  <h1 style="font-size:18px;">Version provisoire enregistrée</h1>
  <p>Une version <strong>provisoire</strong> de la page légale a été enregistrée.</p>
  <ul>
    <li><strong>Page</strong> : ${escapeHtml(slug)}</li>
    <li><strong>Langue</strong> : ${escapeHtml(locale)}</li>
    <li><strong>Commentaires</strong> : ${commentCount}</li>
    <li><strong>Éditeur</strong> : ${escapeHtml(editorEmail)}</li>
  </ul>
  ${linkBlock}
  <p style="font-size:12px;color:#666;">Notification automatique AIMEDIArt — ne pas répondre.</p>
</body>
</html>`;

  const mail = await sendResendEmail({
    apiKey,
    fromEmail,
    to,
    subject,
    html,
  });

  if (!mail.ok) {
    return jsonResponse({ ok: false, error: mail.error || "Échec Resend." }, 502);
  }
  return jsonResponse({ ok: true, id: mail.id ?? null });
});
