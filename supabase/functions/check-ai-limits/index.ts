/**
 * check-ai-limits — cron horaire : alertes e-mail Resend (limites IA).
 *
 * Variables d'env :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
 *   RESEND_API_KEY, ADMIN_EMAIL, APP_URL
 *   NOTIFY_FROM_EMAIL (optionnel, défaut no-reply@aimediart.app)
 *
 * Déploiement : supabase functions deploy check-ai-limits --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type LimitStatus = "ok" | "warning" | "critical" | "blocked" | "unknown";
type LimitSource = "auto" | "manual" | "unknown";
type AlertLevel = "warning" | "critical" | "blocked";

type LimitRow = {
  limit_id: string;
  provider: string;
  model: string | null;
  limit_type: string;
  limit_value: number | null;
  limit_source: LimitSource;
  current_usage: number;
  usage_pct: number;
  status: LimitStatus;
};

const ALERT_STATUSES = new Set<LimitStatus>(["warning", "critical", "blocked"]);
const ONE_HOUR_MS = 3_600_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseLimitSource(raw: unknown): LimitSource {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "auto" || s === "manual" || s === "unknown") return s;
  return "unknown";
}

function parseLimitStatus(raw: unknown): LimitStatus {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "ok" || s === "warning" || s === "critical" || s === "blocked" || s === "unknown") {
    return s;
  }
  return "unknown";
}

function mapLimitRow(raw: Record<string, unknown>): LimitRow {
  const limitValueRaw = raw.limit_value;
  const limitValue = limitValueRaw == null ? null : Number(limitValueRaw);

  return {
    limit_id: String(raw.limit_id),
    provider: String(raw.provider),
    model: raw.model == null ? null : String(raw.model),
    limit_type: String(raw.limit_type),
    limit_value: Number.isFinite(limitValue) ? limitValue : null,
    limit_source: parseLimitSource(raw.limit_source),
    current_usage: Number(raw.current_usage ?? 0),
    usage_pct: Number(raw.usage_pct ?? 0),
    status: parseLimitStatus(raw.status),
  };
}

function statusToAlertLevel(status: LimitStatus): AlertLevel | null {
  if (status === "warning" || status === "critical" || status === "blocked") return status;
  return null;
}

function rowStatusStyle(status: LimitStatus): string {
  if (status === "ok") return "color:#15803d;background:#f0fdf4;";
  if (status === "warning") return "color:#c2410c;background:#fff7ed;";
  if (status === "critical" || status === "blocked") return "color:#b91c1c;background:#fef2f2;font-weight:bold;";
  return "color:#6b7280;background:#f9fafb;";
}

function formatUsageCell(row: LimitRow): string {
  if (row.limit_value == null || row.limit_value <= 0) {
    return `${Math.round(row.current_usage)} / —`;
  }
  return `${Math.round(row.current_usage)} / ${row.limit_value}`;
}

function buildLimitsTableHtml(rows: LimitRow[]): string {
  const tr = rows
    .map((r) => {
      const model = escapeHtml(r.model ?? "—");
      const style = rowStatusStyle(r.status);
      const source = escapeHtml(r.limit_source);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(r.provider)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${model}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(r.limit_type)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatUsageCell(r)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${r.usage_pct.toFixed(1)} %</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;${style}">${escapeHtml(r.status)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${source}</td>
      </tr>`;
    })
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:6px 8px;text-align:left;">Fournisseur</th>
          <th style="padding:6px 8px;text-align:left;">Modèle</th>
          <th style="padding:6px 8px;text-align:left;">Type</th>
          <th style="padding:6px 8px;text-align:right;">Usage</th>
          <th style="padding:6px 8px;text-align:right;">%</th>
          <th style="padding:6px 8px;text-align:left;">Statut</th>
          <th style="padding:6px 8px;text-align:left;">Source</th>
        </tr>
      </thead>
      <tbody>${tr}</tbody>
    </table>`;
}

function buildEmailSubject(rows: LimitRow[]): string {
  const hasSevere = rows.some((r) => r.status === "blocked" || r.status === "critical");
  if (hasSevere) {
    const top = rows
      .filter((r) => r.status === "blocked" || r.status === "critical")
      .sort((a, b) => b.usage_pct - a.usage_pct)[0];
    const model = top?.model ?? "—";
    return `🚨 [AIMEDIArt] CRITIQUE — ${top?.provider ?? "IA"} ${model} ${top?.limit_type ?? ""} à ${top?.usage_pct.toFixed(0) ?? "0"} %`;
  }
  const top = rows.sort((a, b) => b.usage_pct - a.usage_pct)[0];
  const model = top?.model ?? "—";
  return `⚠️ [AIMEDIArt] Alerte IA — ${top?.provider ?? "IA"} ${model} ${top?.limit_type ?? ""} à ${top?.usage_pct.toFixed(0) ?? "0"} %`;
}

function buildEmailHtml(params: {
  allLimits: LimitRow[];
  alertRows: LimitRow[];
  monitoringUrl: string;
}): string {
  const severe = params.alertRows.some((r) => r.status === "blocked" || r.status === "critical");
  const title = severe
    ? "🚨 Limite critique IA — action requise"
    : "⚠️ Consommation IA élevée";
  const intro = severe
    ? "Au moins un plafond API a atteint un seuil critique. Des appels peuvent être bloqués par le garde-fou AIMEDIArt."
    : "Des plafonds API ont dépassé le seuil d'avertissement (≥ 80 %).";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#222;max-width:760px;margin:0 auto;padding:24px;">
  <h2 style="color:${severe ? "#c0392b" : "#e67e22"};">${title}</h2>
  <p style="color:#555;">${intro}</p>
  <p style="margin:16px 0;">
    <a href="${escapeHtml(params.monitoringUrl)}" style="display:inline-block;padding:10px 16px;background:#E63946;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
      Ouvrir le suivi des tokens IA
    </a>
  </p>
  <p style="font-size:12px;color:#888;margin-bottom:4px;">
    Légende : <span style="color:#15803d;">ok</span> ·
    <span style="color:#c2410c;">warning</span> ·
    <span style="color:#b91c1c;">critical/blocked</span> ·
    <span style="color:#6b7280;">unknown</span>
  </p>
  ${buildLimitsTableHtml(params.allLimits)}
  <hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
  <p style="font-size:11px;color:#aaa;">
    Notification automatique — AIMEDIArt ·
    Gérez vos limites sur
    <a href="https://console.groq.com/settings/limits">console.groq.com/settings/limits</a>
  </p>
</body>
</html>`;
}

async function wasAlertSentRecently(
  supabase: SupabaseClient,
  row: LimitRow,
  level: AlertLevel,
): Promise<boolean> {
  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  let q = supabase
    .from("ai_limit_alerts")
    .select("id")
    .eq("provider", row.provider)
    .eq("limit_type", row.limit_type)
    .eq("alert_level", level)
    .gte("sent_at", since)
    .limit(1);

  if (row.model) {
    q = q.eq("model", row.model);
  } else {
    q = q.is("model", null);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[check-ai-limits] lecture ai_limit_alerts:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Resend" };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(405, { ok: false, error: "Méthode non autorisée." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  const adminEmail = Deno.env.get("ADMIN_EMAIL")?.trim() ?? "";
  const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/$/, "");
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() ?? "no-reply@aimediart.app";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Variables Supabase manquantes." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: limitsRaw, error: limitsErr } = await supabase
    .from("ai_usage_vs_limits")
    .select("*")
    .order("provider")
    .order("model", { ascending: true, nullsFirst: true })
    .order("limit_type");

  if (limitsErr) {
    return jsonResponse(500, { ok: false, error: limitsErr.message });
  }

  const allLimits = (limitsRaw ?? []).map((r) => mapLimitRow(r as Record<string, unknown>));

  const alertCandidates = allLimits.filter(
    (r) => ALERT_STATUSES.has(r.status) && r.limit_source !== "unknown",
  );

  const toNotify: LimitRow[] = [];
  for (const row of alertCandidates) {
    const level = statusToAlertLevel(row.status);
    if (!level) continue;
    const already = await wasAlertSentRecently(supabase, row, level);
    if (!already) toNotify.push(row);
  }

  if (toNotify.length === 0) {
    return jsonResponse(200, {
      ok: true,
      message: "Rien à signaler",
      limits_checked: allLimits.length,
      alert_candidates: alertCandidates.length,
      alerts_to_send: 0,
      emails_sent: 0,
    });
  }

  const insertedIds: string[] = [];
  for (const row of toNotify) {
    const level = statusToAlertLevel(row.status);
    if (!level) continue;

    const { data: inserted, error: insErr } = await supabase
      .from("ai_limit_alerts")
      .insert({
        provider: row.provider,
        model: row.model,
        limit_type: row.limit_type,
        usage_pct: row.usage_pct,
        alert_level: level,
        notified_email: false,
      })
      .select("id")
      .single();

    if (insErr) {
      console.warn("[check-ai-limits] insert ai_limit_alerts:", insErr.message);
      continue;
    }
    if (inserted?.id) insertedIds.push(String(inserted.id));
  }

  let emailSent = false;
  let emailError: string | null = null;

  if (resendApiKey && adminEmail) {
    const monitoringUrl = appUrl ? `${appUrl}/suivi_tokens` : "/suivi_tokens";
    const subject = buildEmailSubject(toNotify);
    const html = buildEmailHtml({
      allLimits,
      alertRows: toNotify,
      monitoringUrl,
    });

    const mail = await sendResendEmail({
      apiKey: resendApiKey,
      from: fromEmail,
      to: adminEmail,
      subject,
      html,
    });

    if (mail.ok) {
      emailSent = true;
      if (insertedIds.length > 0) {
        const { error: updErr } = await supabase
          .from("ai_limit_alerts")
          .update({ notified_email: true })
          .in("id", insertedIds);
        if (updErr) {
          console.warn("[check-ai-limits] update notified_email:", updErr.message);
        }
      }
    } else {
      emailError = mail.error ?? "Erreur Resend inconnue";
      console.error("[check-ai-limits] envoi Resend échoué:", emailError);
    }
  } else {
    console.warn("[check-ai-limits] RESEND_API_KEY ou ADMIN_EMAIL manquant — e-mail non envoyé");
  }

  return jsonResponse(200, {
    ok: true,
    message: emailSent
      ? "Alerte envoyée"
      : insertedIds.length > 0
        ? "Alertes enregistrées, e-mail non envoyé"
        : "Rien à signaler",
    limits_checked: allLimits.length,
    alert_candidates: alertCandidates.length,
    alerts_to_send: toNotify.length,
    alerts_logged: insertedIds.length,
    emails_sent: emailSent ? 1 : 0,
    email_error: emailError,
    resend_configured: Boolean(resendApiKey && adminEmail),
  });
});
