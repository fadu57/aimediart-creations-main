/** Envoi transactionnel via Resend — https://resend.com/docs/api-reference/emails/send-email */

const RESEND_API_URL = "https://api.resend.com/emails";

export const DEFAULT_RESEND_FROM = "Aimediart <hello@aimediart.com>";

export function isResendApiKeyConfigured(apiKey: string): boolean {
  const key = apiKey.trim();
  if (!key) return false;
  if (key === "votre_cle" || key === "your_key") return false;
  return true;
}

/** « hello@aimediart.com » → « Aimediart <hello@aimediart.com> » */
export function formatResendFrom(fromEmail: string): string {
  const trimmed = fromEmail.trim();
  if (!trimmed) return DEFAULT_RESEND_FROM;
  if (trimmed.includes("<") && trimmed.includes("@")) return trimmed;
  const match = trimmed.match(/<?([^<>\s]+@[^<>\s]+)>?$/);
  const address = match?.[1] ?? trimmed;
  return `Aimediart <${address}>`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatResendError(body: string, status?: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; name?: string };
    if (parsed.message) {
      return `Resend : ${parsed.message}`;
    }
  } catch {
    // unchanged
  }
  if (status === 401) {
    return "Resend : clé API invalide (vérifiez RESEND_API_KEY).";
  }
  if (status === 403) {
    return "Resend : domaine aimediart.com non vérifié dans Resend (DKIM/DNS requis).";
  }
  if (status === 422) {
    return "Resend : adresse expéditeur ou destinataire refusée.";
  }
  const snippet = body.trim().slice(0, 300);
  return snippet ? `Resend : ${snippet}` : `Erreur Resend HTTP ${status ?? "inconnue"}`;
}

export async function sendResendEmail(params: {
  apiKey: string;
  fromEmail?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const apiKey = params.apiKey.trim();
  if (!isResendApiKeyConfigured(apiKey)) {
    return { ok: false, error: "RESEND_API_KEY manquant ou invalide." };
  }

  const to = params.to.trim();
  if (!to) {
    return { ok: false, error: "Destinataire e-mail manquant." };
  }

  const payload: Record<string, unknown> = {
    from: formatResendFrom(params.fromEmail ?? "hello@aimediart.com"),
    to: [to],
    subject: params.subject,
    html: params.html,
    text: params.text?.trim() || htmlToPlainText(params.html),
  };
  if (params.replyTo?.trim()) {
    payload.reply_to = params.replyTo.trim();
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    if (!res.ok) {
      console.error("[resend] échec HTTP", res.status, responseText.slice(0, 500));
      return { ok: false, error: formatResendError(responseText, res.status) };
    }

    try {
      const parsed = JSON.parse(responseText) as { id?: string };
      return { ok: true, id: parsed.id };
    } catch {
      return { ok: true };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur réseau Resend.";
    console.error("[resend] exception:", message);
    return { ok: false, error: message };
  }
}
