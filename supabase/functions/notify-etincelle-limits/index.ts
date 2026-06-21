/**
 * notify-etincelle-limits
 *
 * Envoie les e-mails de seuil pour les abonnements ETINCELLE :
 * - visiteurs : 80 %, 90 %, 100 % du quota mensuel
 * - essai : 20 %, 10 % de temps restant, veille de la fin
 *
 * Déploiement : supabase functions deploy notify-etincelle-limits --no-verify-jwt
 * Cron recommandé : 0 7 * * * (quotidien 7h UTC)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendResendEmail } from "../_shared/resend.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type SubRow = {
  id: string;
  organisation_id: string;
  plan_code: string;
  started_at: string;
  trial_ends_at: string | null;
  ends_at: string | null;
  pricing_id: number | null;
};

type PricingRow = {
  pricing_max_oeuvres: number | null;
  pricing_max_visitors: number | null;
  princing_max_visitors: number | null;
  trial_duration_days: number | null;
};

function maxVisitors(p: PricingRow | null): number {
  return Number(p?.pricing_max_visitors ?? p?.princing_max_visitors ?? 100);
}

function trialDays(p: PricingRow | null): number {
  return Number(p?.trial_duration_days ?? 30);
}

function trialEndIso(sub: SubRow, p: PricingRow | null): string | null {
  if (sub.trial_ends_at) return sub.trial_ends_at;
  if (sub.ends_at) return sub.ends_at;
  if (!sub.started_at) return null;
  const start = new Date(sub.started_at);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + trialDays(p));
  return end.toISOString();
}

function daysRemaining(endIso: string | null): number | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function alreadySent(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  key: string,
): Promise<boolean> {
  const { data } = await admin
    .from("etincelle_notification_log")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("notification_key", key)
    .maybeSingle();
  return Boolean(data);
}

async function markSent(admin: ReturnType<typeof createClient>, orgId: string, key: string) {
  await admin.from("etincelle_notification_log").insert({
    organisation_id: orgId,
    notification_key: key,
  });
}

async function orgAdminEmails(admin: ReturnType<typeof createClient>, orgId: string): Promise<string[]> {
  const { data: members } = await admin
    .from("agency_users")
    .select("user_id")
    .eq("agency_id", orgId)
    .eq("role_id", 4);
  const ids = (members ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean);
  const emails: string[] = [];
  for (const uid of ids) {
    const { data, error } = await admin.auth.admin.getUserById(uid);
    if (!error && data.user?.email) emails.push(data.user.email);
  }
  return [...new Set(emails)];
}

async function countVisitors(admin: ReturnType<typeof createClient>, orgId: string): Promise<number> {
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data } = await admin
    .from("daily_stats")
    .select("visits_count")
    .eq("agency_id", orgId)
    .gte("day", monthStart);
  let total = 0;
  for (const row of data ?? []) {
    total += Number((row as { visits_count?: number }).visits_count) || 0;
  }
  return total;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") ?? "hello@aimediart.com";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Config Supabase manquante" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const sent: string[] = [];
  const skipped: string[] = [];

  const { data: subs, error: subsErr } = await admin
    .from("organisation_subscriptions")
    .select("id, organisation_id, plan_code, started_at, trial_ends_at, ends_at, pricing_id")
    .eq("plan_code", "ETINCELLE")
    .in("status", ["trial", "active"]);

  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  for (const sub of (subs ?? []) as SubRow[]) {
    const orgId = sub.organisation_id;
    let pricing: PricingRow | null = null;
    if (sub.pricing_id != null) {
      const { data } = await admin
        .from("pricing")
        .select("pricing_max_oeuvres, pricing_max_visitors, princing_max_visitors, trial_duration_days")
        .eq("pricing_id", sub.pricing_id)
        .maybeSingle();
      pricing = (data as PricingRow | null) ?? null;
    }

    const recipients = await orgAdminEmails(admin, orgId);
    if (recipients.length === 0) {
      skipped.push(`${orgId}:no_admin_email`);
      continue;
    }

    const maxVis = maxVisitors(pricing);
    const usedVis = await countVisitors(admin, orgId);
    const visRatio = maxVis > 0 ? usedVis / maxVis : 0;

    const visChecks: Array<{ key: string; when: boolean; subject: string; html: string }> = [
      {
        key: "visitors_80",
        when: visRatio >= 0.8 && visRatio < 0.9,
        subject: "Étincelle — 20 % de visiteurs restants ce mois",
        html: `<p>Bonjour,</p><p>Il ne vous reste plus qu'environ <strong>20&nbsp;%</strong> de visiteurs disponibles sur votre essai Étincelle (${usedVis} / ${maxVis} utilisés ce mois).</p><p>Pensez à passer à un abonnement supérieur pour continuer à accueillir vos visiteurs.</p>`,
      },
      {
        key: "visitors_90",
        when: visRatio >= 0.9 && usedVis < maxVis,
        subject: "Étincelle — 10 % de visiteurs restants ce mois",
        html: `<p>Bonjour,</p><p>Il ne vous reste plus qu'environ <strong>10&nbsp;%</strong> de visiteurs disponibles (${usedVis} / ${maxVis}).</p>`,
      },
      {
        key: "visitors_100",
        when: usedVis >= maxVis,
        subject: "Étincelle — quota visiteurs atteint",
        html: `<p>Bonjour,</p><p>Vous avez atteint la limite de <strong>${maxVis} visiteurs</strong> pour ce mois avec l'essai Étincelle.</p><p><strong>Vos visiteurs ne pourront plus accéder à l'application</strong> tant que vous n'aurez pas souscrit à un abonnement supérieur.</p>`,
      },
    ];

    for (const check of visChecks) {
      if (!check.when) continue;
      if (await alreadySent(admin, orgId, check.key)) {
        skipped.push(`${orgId}:${check.key}`);
        continue;
      }
      for (const to of recipients) {
        const result = await sendResendEmail({
          apiKey: resendKey,
          fromEmail,
          to,
          subject: check.subject,
          html: check.html,
        });
        if (!result.ok) {
          skipped.push(`${orgId}:${check.key}:${result.error}`);
          continue;
        }
      }
      await markSent(admin, orgId, check.key);
      sent.push(`${orgId}:${check.key}`);
    }

    const endIso = trialEndIso(sub, pricing);
    const daysLeft = daysRemaining(endIso);
    const totalDays = trialDays(pricing);
    if (daysLeft == null || totalDays <= 0) continue;

    const trialChecks: Array<{ key: string; when: boolean; subject: string; html: string }> = [
      {
        key: "trial_80",
        when: daysLeft <= Math.ceil(totalDays * 0.2) && daysLeft > Math.ceil(totalDays * 0.1),
        subject: "Étincelle — 20 % de temps d'essai restant",
        html: `<p>Bonjour,</p><p>Il ne vous reste plus qu'environ <strong>20&nbsp;%</strong> de votre période d'essai Étincelle (${daysLeft} jour(s) restant(s)).</p>`,
      },
      {
        key: "trial_90",
        when: daysLeft <= Math.ceil(totalDays * 0.1) && daysLeft > 1,
        subject: "Étincelle — 10 % de temps d'essai restant",
        html: `<p>Bonjour,</p><p>Il ne vous reste plus qu'environ <strong>10&nbsp;%</strong> de votre essai (${daysLeft} jour(s) restant(s)).</p>`,
      },
      {
        key: "trial_eve",
        when: daysLeft === 1,
        subject: "Étincelle — votre essai se termine demain",
        html: `<p>Bonjour,</p><p>Votre essai Étincelle se termine <strong>demain</strong>.</p><p>Sans passage à un abonnement supérieur, <strong>vous ne pourrez plus accéder à l'application</strong> et <strong>vos données saisies seront effacées</strong> conformément aux conditions de l'offre d'essai.</p>`,
      },
    ];

    for (const check of trialChecks) {
      if (!check.when) continue;
      if (await alreadySent(admin, orgId, check.key)) {
        skipped.push(`${orgId}:${check.key}`);
        continue;
      }
      for (const to of recipients) {
        const result = await sendResendEmail({
          apiKey: resendKey,
          fromEmail,
          to,
          subject: check.subject,
          html: check.html,
        });
        if (!result.ok) {
          skipped.push(`${orgId}:${check.key}:${result.error}`);
          continue;
        }
      }
      await markSent(admin, orgId, check.key);
      sent.push(`${orgId}:${check.key}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
