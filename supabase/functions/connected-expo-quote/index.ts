import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { sendResendEmail, isResendApiKeyConfigured } from "../_shared/resend.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DEFAULT_QUOTE_NOTIFY_EMAIL = "hello@aimediart.com";

function clampText(value: FormDataEntryValue | null, max: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatOptional(value: string | null): string {
  return value ? escapeHtml(value) : "<em>—</em>";
}

function buildQuoteNotifyHtml(params: {
  id: string;
  org_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  preferred_contact_time: string | null;
  need_description: string;
  floor_plan_url: string | null;
}): string {
  const addressLine = [params.address, params.zip_code, params.city].filter(Boolean).join(", ");

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#222;max-width:700px;margin:0 auto;padding:24px;">
  <h2 style="color:#b8860b;margin:0 0 16px;">Nouvelle demande de devis</h2>
  <p style="color:#555;margin:0 0 20px;">Une demande vient d'être soumise depuis la vitrine AIMEDIArt.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Organisation</td><td style="padding:6px 8px;">${escapeHtml(params.org_name)}</td></tr>
    <tr style="background:#fafafa;"><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Contact</td><td style="padding:6px 8px;">${escapeHtml(params.contact_name)}</td></tr>
    <tr><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">E-mail</td><td style="padding:6px 8px;"><a href="mailto:${escapeHtml(params.contact_email)}">${escapeHtml(params.contact_email)}</a></td></tr>
    <tr style="background:#fafafa;"><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Téléphone</td><td style="padding:6px 8px;">${escapeHtml(params.contact_phone)}</td></tr>
    <tr><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Adresse</td><td style="padding:6px 8px;">${addressLine ? escapeHtml(addressLine) : "<em>—</em>"}</td></tr>
    <tr style="background:#fafafa;"><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Créneau souhaité</td><td style="padding:6px 8px;">${formatOptional(params.preferred_contact_time)}</td></tr>
    <tr><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Besoin</td><td style="padding:6px 8px;white-space:pre-wrap;">${escapeHtml(params.need_description)}</td></tr>
    <tr style="background:#fafafa;"><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Plan de salle</td><td style="padding:6px 8px;">${
    params.floor_plan_url
      ? `<a href="${escapeHtml(params.floor_plan_url)}">${escapeHtml(params.floor_plan_url)}</a>`
      : "<em>—</em>"
  }</td></tr>
    <tr><td style="padding:6px 8px;font-weight:bold;vertical-align:top;">Référence</td><td style="padding:6px 8px;font-family:monospace;">${escapeHtml(params.id)}</td></tr>
  </table>
</body>
</html>`;
}

function buildQuoteAckHtml(params: {
  contact_name: string;
  org_name: string;
  id: string;
}): string {
  const firstName = params.contact_name.trim().split(/\s+/)[0] || params.contact_name;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #c9a227;border-radius:12px;padding:24px;background:#fff;">
    <h1 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;">C'est noté, merci beaucoup !</h1>
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Bonjour ${escapeHtml(firstName)},
    </p>
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Votre message est bien arrivé jusqu'à nous. Nous reviendrons vers vous rapidement pour faire le point,
      en faisant tout notre possible pour vous contacter sur les plages horaires que vous nous avez éventuellement transmises.
    </p>
    <p style="color:#555;font-size:13px;line-height:1.5;margin:0;padding-top:12px;border-top:1px solid #eee;">
      Demande concernant : <strong>${escapeHtml(params.org_name)}</strong><br>
      Référence : <span style="font-family:monospace;">${escapeHtml(params.id)}</span>
    </p>
  </div>
  <p style="color:#888;font-size:12px;margin:20px 0 0;text-align:center;">
    AIMEDIArt — Médiation artistique numérique
  </p>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "FormData invalide." }, 400);
  }

  const org_name = clampText(formData.get("org_name"), 200);
  const contact_name = clampText(formData.get("contact_name"), 200);
  const contact_email = clampText(formData.get("contact_email"), 320);
  const contact_phone = clampText(formData.get("contact_phone"), 40);
  const need_description = clampText(formData.get("need_description"), 5000);

  if (!org_name || !contact_name || !contact_email || !contact_phone || !need_description) {
    return jsonResponse({ error: "Champs obligatoires manquants." }, 400);
  }
  if (!EMAIL_RE.test(contact_email)) {
    return jsonResponse({ error: "E-mail invalide." }, 400);
  }

  const address = clampText(formData.get("address"), 300);
  const zip_code = clampText(formData.get("zip_code"), 20);
  const city = clampText(formData.get("city"), 100);
  const preferred_contact_time = clampText(formData.get("preferred_contact_time"), 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration Supabase serveur incomplète." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: insertErr } = await admin
    .from("connected_expo_quote_requests")
    .insert({
      user_id: null,
      agency_id: null,
      org_name,
      contact_name,
      contact_email,
      address,
      zip_code,
      city,
      contact_phone,
      preferred_contact_time,
      need_description,
    })
    .select("id")
    .single();

  if (insertErr) {
    return jsonResponse({ error: insertErr.message }, 500);
  }

  let warn_floor_plan = false;
  let floor_plan_url: string | null = null;

  const floorPlan = formData.get("floor_plan");
  if (floorPlan instanceof File && floorPlan.size > 0 && row?.id) {
    if (floorPlan.size > MAX_FILE_BYTES) {
      warn_floor_plan = true;
    } else {
      const safeName = floorPlan.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const path = `connected-expo-quotes/public/${row.id}_${safeName}`;
      const buf = await floorPlan.arrayBuffer();
      const { error: upErr } = await admin.storage.from("photos").upload(path, buf, {
        contentType: floorPlan.type || "application/octet-stream",
        upsert: true,
      });
      if (!upErr) {
        const { data: urlData } = admin.storage.from("photos").getPublicUrl(path);
        floor_plan_url = urlData.publicUrl;
        await admin
          .from("connected_expo_quote_requests")
          .update({ floor_plan_url })
          .eq("id", row.id);
      } else {
        warn_floor_plan = true;
      }
    }
  }

    let warn_email = false;
    const email_errors: string[] = [];
    const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  const notifyTo = Deno.env.get("QUOTE_NOTIFY_EMAIL")?.trim() || DEFAULT_QUOTE_NOTIFY_EMAIL;
  const fromAddress = Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() || "hello@aimediart.com";

  if (resendApiKey && row?.id) {
    if (!isResendApiKeyConfigured(resendApiKey)) {
      warn_email = true;
      console.error("[connected-expo-quote] RESEND_API_KEY manquant ou invalide.");
    } else {
    const teamSubject = `[AIMEDIArt] Nouvelle demande de devis — ${org_name}`;
    const teamHtml = buildQuoteNotifyHtml({
      id: row.id,
      org_name,
      contact_name,
      contact_email,
      contact_phone,
      address,
      zip_code,
      city,
      preferred_contact_time,
      need_description,
      floor_plan_url,
    });

    const ackSubject = "C'est noté, merci beaucoup ! — AIMEDIArt";
    const ackHtml = buildQuoteAckHtml({
      contact_name,
      org_name,
      id: row.id,
    });

    const [teamMail, ackMail] = await Promise.all([
      sendResendEmail({
        apiKey: resendApiKey,
        fromEmail: fromAddress,
        to: notifyTo,
        subject: teamSubject,
        html: teamHtml,
        replyTo: contact_email,
      }),
      sendResendEmail({
        apiKey: resendApiKey,
        fromEmail: fromAddress,
        to: contact_email,
        subject: ackSubject,
        html: ackHtml,
      }),
    ]);

    if (!teamMail.ok) {
      warn_email = true;
      const err = teamMail.error ?? "notification équipe";
      email_errors.push(err);
      console.error("[connected-expo-quote] notification équipe échouée:", err);
    }
    if (!ackMail.ok) {
      warn_email = true;
      const err = ackMail.error ?? "accusé visiteur";
      email_errors.push(err);
      console.error("[connected-expo-quote] accusé de réception visiteur échoué:", err);
    }
    }
  } else if (!resendApiKey) {
    warn_email = true;
    console.warn("[connected-expo-quote] RESEND_API_KEY manquant — e-mails non envoyés.");
  }

  return jsonResponse({
    ok: true,
    id: row.id,
    ...(warn_floor_plan ? { warn_floor_plan: true } : {}),
    ...(warn_email ? { warn_email: true, email_errors: [...new Set(email_errors)] } : {}),
  });
});
