/**
 * check-cost-spike — cron horaire : alerte e-mail si le coût total IA/outils
 * augmente de plus de 20 % depuis le dernier contrôle.
 *
 * Variables d'env :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
 *   RESEND_API_KEY
 *   COST_SPIKE_ALERT_EMAIL (défaut : fadu57@gmail.com) ou ADMIN_EMAIL
 *   COST_SPIKE_THRESHOLD_PCT (défaut : 0.20)
 *   NOTIFY_FROM_EMAIL, APP_URL (optionnels)
 *
 * Déploiement : supabase functions deploy check-cost-spike --no-verify-jwt
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import { computeCostKpi } from "../_shared/costKpiCompute.ts";
import { sendResendEmail, isResendApiKeyConfigured } from "../_shared/resend.ts";

const SETTINGS_KEY = "cost_spike_monitor";
const DEFAULT_THRESHOLD = 0.2;
const DEFAULT_ALERT_EMAIL = "fadu57@gmail.com";

type MonitorState = {
  last_total_usd: number;
  last_checked_at: string;
  last_alert_at: string | null;
  last_alert_from_usd: number | null;
  last_alert_to_usd: number | null;
  last_alert_pct: number | null;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseThresholdPct(): number {
  const raw = Deno.env.get("COST_SPIKE_THRESHOLD_PCT")?.trim();
  if (!raw) return DEFAULT_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return DEFAULT_THRESHOLD;
  // Accepte 0.20 ou 20 (= 20 %)
  return n > 1 ? n / 100 : n;
}

function resolveAlertEmail(): string {
  return (
    Deno.env.get("COST_SPIKE_ALERT_EMAIL")?.trim() ||
    Deno.env.get("ADMIN_EMAIL")?.trim() ||
    DEFAULT_ALERT_EMAIL
  );
}

function parseMonitorState(raw: string | null | undefined): MonitorState | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const last = Number(o.last_total_usd);
    if (!Number.isFinite(last) || last < 0) return null;
    return {
      last_total_usd: last,
      last_checked_at: typeof o.last_checked_at === "string" ? o.last_checked_at : new Date().toISOString(),
      last_alert_at: typeof o.last_alert_at === "string" ? o.last_alert_at : null,
      last_alert_from_usd:
        typeof o.last_alert_from_usd === "number" && Number.isFinite(o.last_alert_from_usd)
          ? o.last_alert_from_usd
          : null,
      last_alert_to_usd:
        typeof o.last_alert_to_usd === "number" && Number.isFinite(o.last_alert_to_usd)
          ? o.last_alert_to_usd
          : null,
      last_alert_pct:
        typeof o.last_alert_pct === "number" && Number.isFinite(o.last_alert_pct)
          ? o.last_alert_pct
          : null,
    };
  } catch {
    return null;
  }
}

function buildAlertHtml(params: {
  previousUsd: number;
  currentUsd: number;
  increasePct: number;
  thresholdPct: number;
  monitoringUrl: string;
  checkedAt: string;
}): string {
  const pctLabel = (params.increasePct * 100).toFixed(1);
  const thrLabel = (params.thresholdPct * 100).toFixed(0);
  return `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f1f1f;">
  <h1 style="font-size:1.25rem;color:#b91c1c;">Alerte hausse des coûts AIMEDIArt</h1>
  <p>Le <strong>coût total</strong> (KPI Paramètres → Coûts) a augmenté de plus de ${escapeHtml(thrLabel)}&nbsp;% depuis le dernier contrôle automatique.</p>
  <table style="border-collapse:collapse;margin:1rem 0;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Avant</td><td style="padding:4px 0;font-weight:600;">${params.previousUsd.toFixed(2)}&nbsp;USD</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Maintenant</td><td style="padding:4px 0;font-weight:600;">${params.currentUsd.toFixed(2)}&nbsp;USD</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Hausse</td><td style="padding:4px 0;font-weight:600;color:#b91c1c;">+${escapeHtml(pctLabel)}&nbsp;%</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Contrôle</td><td style="padding:4px 0;">${escapeHtml(params.checkedAt)}</td></tr>
  </table>
  <p><a href="${escapeHtml(params.monitoringUrl)}" style="color:#1d4ed8;">Ouvrir le suivi des coûts</a></p>
  <p style="font-size:0.85rem;color:#666;">Message automatique AIMEDIArt (check-cost-spike).</p>
</body>
</html>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse({ ok: false, error: "Service role unavailable" }, 500);
  }

  const thresholdPct = parseThresholdPct();
  const alertEmail = resolveAlertEmail();
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() || "no-reply@aimediart.com";
  const appUrl = (Deno.env.get("APP_URL") ?? "https://www.aimediart.com").trim().replace(/\/$/, "");
  const checkedAt = new Date().toISOString();

  let currentUsd = 0;
  try {
    const kpi = await computeCostKpi(admin, {}, null);
    currentUsd = Number(kpi.summary.total_cost_usd);
    if (!Number.isFinite(currentUsd) || currentUsd < 0) currentUsd = 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[check-cost-spike] computeCostKpi:", msg);
    return jsonResponse({ ok: false, error: "compute_failed", details: msg }, 500);
  }

  const { data: settingRow, error: settingErr } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (settingErr) {
    console.error("[check-cost-spike] lecture app_settings:", settingErr.message);
    return jsonResponse({ ok: false, error: settingErr.message }, 500);
  }

  const previous = parseMonitorState(
    (settingRow as { value?: string } | null)?.value,
  );

  // Premier run : pose la référence, pas d'alerte.
  if (!previous || previous.last_total_usd <= 0) {
    const initial: MonitorState = {
      last_total_usd: currentUsd,
      last_checked_at: checkedAt,
      last_alert_at: null,
      last_alert_from_usd: null,
      last_alert_to_usd: null,
      last_alert_pct: null,
    };
    const { error: upsertErr } = await admin.from("app_settings").upsert({
      key: SETTINGS_KEY,
      value: JSON.stringify(initial),
    });
    if (upsertErr) {
      console.error("[check-cost-spike] upsert initial:", upsertErr.message);
      return jsonResponse({ ok: false, error: upsertErr.message }, 500);
    }
    return jsonResponse({
      ok: true,
      message: "Référence initiale enregistrée (pas d'alerte)",
      current_total_usd: currentUsd,
      baseline_set: true,
      alert_sent: false,
    });
  }

  const previousUsd = previous.last_total_usd;
  const increasePct = previousUsd > 0 ? (currentUsd - previousUsd) / previousUsd : 0;
  const spiked = increasePct >= thresholdPct;

  let alertSent = false;
  let emailError: string | null = null;

  if (spiked) {
    if (!isResendApiKeyConfigured(resendApiKey)) {
      emailError = "RESEND_API_KEY manquant ou invalide";
      console.warn("[check-cost-spike]", emailError);
    } else {
      const monitoringUrl = `${appUrl}/settings/couts`;
      const pctLabel = (increasePct * 100).toFixed(1);
      const mail = await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail,
        to: alertEmail,
        subject: `[AIMEDIArt] Hausse coûts +${pctLabel}% (${previousUsd.toFixed(2)} → ${currentUsd.toFixed(2)} USD)`,
        html: buildAlertHtml({
          previousUsd,
          currentUsd,
          increasePct,
          thresholdPct,
          monitoringUrl,
          checkedAt,
        }),
      });
      if (mail.ok) {
        alertSent = true;
      } else {
        emailError = mail.error ?? "Erreur Resend";
        console.error("[check-cost-spike] Resend:", emailError);
      }
    }
  }

  const nextState: MonitorState = {
    last_total_usd: currentUsd,
    last_checked_at: checkedAt,
    last_alert_at: alertSent ? checkedAt : previous.last_alert_at,
    last_alert_from_usd: alertSent ? previousUsd : previous.last_alert_from_usd,
    last_alert_to_usd: alertSent ? currentUsd : previous.last_alert_to_usd,
    last_alert_pct: alertSent ? increasePct : previous.last_alert_pct,
  };

  const { error: saveErr } = await admin.from("app_settings").upsert({
    key: SETTINGS_KEY,
    value: JSON.stringify(nextState),
  });
  if (saveErr) {
    console.error("[check-cost-spike] upsert état:", saveErr.message);
    return jsonResponse({
      ok: false,
      error: saveErr.message,
      alert_sent: alertSent,
      email_error: emailError,
    }, 500);
  }

  return jsonResponse({
    ok: true,
    message: spiked
      ? alertSent
        ? "Alerte envoyée"
        : "Hausse détectée, e-mail non envoyé"
      : "Pas de hausse significative",
    previous_total_usd: previousUsd,
    current_total_usd: currentUsd,
    increase_pct: Number((increasePct * 100).toFixed(4)),
    threshold_pct: Number((thresholdPct * 100).toFixed(2)),
    spiked,
    alert_sent: alertSent,
    alert_email: alertEmail,
    email_error: emailError,
  });
});
