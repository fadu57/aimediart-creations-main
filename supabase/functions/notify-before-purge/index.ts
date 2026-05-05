/**
 * notify-before-purge
 *
 * Edge Function destinée à être appelée via un cron job Supabase (pg_cron)
 * ou manuellement via supabase.functions.invoke("notify-before-purge").
 *
 * Logique :
 *   1. Charge retention_settings (toutes les entités avec auto_purge = true
 *      et notify_email + notify_before_days renseignés).
 *   2. Pour chaque entité, calcule les fiches dont la purge approche :
 *        deleted_at <= now() - (retention_days - notify_before_days) jours
 *   3. Si des fiches sont concernées, envoie un email via Resend.
 *
 * Variables d'environnement requises :
 *   SUPABASE_URL                — automatique dans les Edge Functions
 *   SUPABASE_SERVICE_ROLE_KEY   — automatique dans les Edge Functions
 *   RESEND_API_KEY              — clé API Resend (https://resend.com)
 *   NOTIFY_FROM_EMAIL           — expéditeur ex: "no-reply@votre-domaine.com"
 *                                 (optionnel, défaut : "no-reply@aimediart.app")
 *
 * Déploiement :
 *   supabase functions deploy notify-before-purge --no-verify-jwt
 *
 * Cron Supabase (pg_cron, chaque nuit à 1h UTC) :
 *   SELECT cron.schedule(
 *     'notify-before-purge-daily',
 *     '0 1 * * *',
 *     $$
 *       SELECT net.http_post(
 *         url := 'https://<project-ref>.functions.supabase.co/notify-before-purge',
 *         headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
 *       )
 *     $$
 *   );
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RetentionRow = {
  id: number;
  entity: string;
  table_name: string;
  retention_days: number;
  auto_purge: boolean;
  notify_before_days: number | null;
  notify_email: string | null;
};

type PendingPurgeItem = {
  id: string | number;
  deleted_at: string;
  label: string;
};

type EntityReport = {
  entity: string;
  table_name: string;
  retention_days: number;
  notify_before_days: number;
  notify_email: string;
  purge_date_threshold: string;
  items: PendingPurgeItem[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/** Soustrait N jours à une date ISO et retourne une date ISO UTC. */
function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Formate une date ISO en DD/MM/YYYY pour les emails. */
function formatDateFR(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Paris",
    });
  } catch {
    return iso;
  }
}

/** Calcule la date de purge prévue = deleted_at + retention_days. */
function purgeDate(deletedAt: string, retentionDays: number): string {
  const d = new Date(deletedAt);
  d.setUTCDate(d.getUTCDate() + retentionDays);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Récupération des fiches proches de la purge pour une entité
// ---------------------------------------------------------------------------

async function fetchPendingPurgeItems(
  // deno-lint-ignore no-explicit-any
  admin: ReturnType<typeof createClient<any>>,
  retention: RetentionRow,
  now: string,
): Promise<PendingPurgeItem[]> {
  if (!retention.notify_before_days) return [];

  // Seuil : fiches dont la purge est dans moins de notify_before_days jours
  // deleted_at <= now - (retention_days - notify_before_days)
  const daysElapsedThreshold = retention.retention_days - retention.notify_before_days;
  const thresholdDate = subtractDays(now, daysElapsedThreshold);

  // Récupère les fiches archivées proches de l'expiration
  const { data, error } = await admin
    .from(retention.table_name)
    .select("*")
    .not("deleted_at", "is", null)
    .lte("deleted_at", thresholdDate)
    .order("deleted_at", { ascending: true })
    .limit(100);

  if (error || !data) {
    console.error(
      `[notify-before-purge] Erreur lecture ${retention.table_name}:`,
      error?.message,
    );
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    // Détermine l'identifiant (PK variable selon la table)
    const id =
      (row["artist_id"] as string | number | undefined) ??
      (row["artwork_id"] as string | number | undefined) ??
      (row["id"] as string | number | undefined) ??
      "?";

    // Détermine un libellé lisible
    const label =
      ((row["artist_firstname"] as string | null | undefined) ?? "" +
       " " +
       (row["artist_lastname"] as string | null | undefined) ?? "").trim() ||
      ((row["first_name"] as string | null | undefined) ?? "" +
       " " +
       (row["last_name"] as string | null | undefined) ?? "").trim() ||
      (row["name_agency"] as string | undefined) ||
      (row["expo_name"] as string | undefined) ||
      (row["artwork_title"] as string | undefined) ||
      String(id);

    return {
      id: String(id),
      deleted_at: String(row["deleted_at"] ?? ""),
      label: label.trim() || String(id),
    };
  });
}

// ---------------------------------------------------------------------------
// Envoi email via Resend
// ---------------------------------------------------------------------------

async function sendEmailResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Resend." };
  }
}

// ---------------------------------------------------------------------------
// Génération du HTML de l'email
// ---------------------------------------------------------------------------

function buildEmailHtml(reports: EntityReport[]): string {
  const rows = reports
    .map((r) => {
      const itemsHtml = r.items
        .map(
          (item) =>
            `<tr>
              <td style="padding:4px 8px;border-bottom:1px solid #eee;">${item.label}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #eee;">${formatDateFR(item.deleted_at)}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #eee;color:#c0392b;font-weight:bold;">
                ${formatDateFR(purgeDate(item.deleted_at, r.retention_days))}
              </td>
            </tr>`,
        )
        .join("");

      return `
        <h3 style="margin:24px 0 8px;color:#333;">${r.entity}
          <span style="font-size:12px;font-weight:normal;color:#888;">(${r.items.length} fiche${r.items.length > 1 ? "s" : ""})</span>
        </h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Fiche</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Archivée le</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Purge prévue le</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>`;
    })
    .join("");

  const totalItems = reports.reduce((sum, r) => sum + r.items.length, 0);

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"></head>
    <body style="font-family:sans-serif;color:#222;max-width:700px;margin:0 auto;padding:24px;">
      <h2 style="color:#c0392b;">⚠️ Alerte purge imminente — ${totalItems} fiche${totalItems > 1 ? "s" : ""}</h2>
      <p style="color:#555;">
        Les fiches ci-dessous seront définitivement supprimées dans les prochains jours.
        Restaurez-les depuis la corbeille si nécessaire.
      </p>
      ${rows}
      <hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
      <p style="font-size:11px;color:#aaa;">
        Notification automatique — AiMediArt · purge générée le ${formatDateFR(new Date().toISOString())}
      </p>
    </body>
    </html>`;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  console.log("[notify-before-purge] démarrage");
  console.log("[notify-before-purge] RESEND_API_KEY présente =", !!Deno.env.get("RESEND_API_KEY"));
  console.log("[notify-before-purge] SUPABASE_URL =", Deno.env.get("SUPABASE_URL"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(405, { ok: false, error: "Méthode non autorisée." });
  }

  // ── Variables d'environnement ──────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail =
    Deno.env.get("NOTIFY_FROM_EMAIL") || "no-reply@aimediart.app";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      ok: false,
      error: "Variables Supabase serveur manquantes.",
    });
  }
  if (!resendApiKey) {
    return jsonResponse(500, {
      ok: false,
      error: "RESEND_API_KEY manquant — impossible d'envoyer des notifications.",
    });
  }

  // ── Client service_role (accès total, no RLS) ──────────────────────────
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  // ── 1. Charger les entrées de rétention actives ────────────────────────
  const { data: retentionData, error: retentionErr } = await admin
    .from("retention_settings")
    .select(
      "id, entity, table_name, retention_days, auto_purge, notify_before_days, notify_email",
    )
    .eq("auto_purge", true)
    .not("notify_email", "is", null)
    .not("notify_before_days", "is", null);

  if (retentionErr) {
    return jsonResponse(500, {
      ok: false,
      error: `Lecture retention_settings impossible : ${retentionErr.message}`,
    });
  }

  const retentionRows = (retentionData as RetentionRow[] | null) ?? [];

  if (retentionRows.length === 0) {
    return jsonResponse(200, {
      ok: true,
      message: "Aucune entité avec purge auto + notification configurée.",
      notified: [],
    });
  }

  // ── 2. Pour chaque entité, chercher les fiches proches de la purge ─────
  const reports: EntityReport[] = [];

  for (const retention of retentionRows) {
    if (!retention.notify_email || !retention.notify_before_days) continue;

    const items = await fetchPendingPurgeItems(admin, retention, now);

    if (items.length > 0) {
      reports.push({
        entity: retention.entity,
        table_name: retention.table_name,
        retention_days: retention.retention_days,
        notify_before_days: retention.notify_before_days,
        notify_email: retention.notify_email,
        purge_date_threshold: subtractDays(
          now,
          retention.retention_days - retention.notify_before_days,
        ),
        items,
      });
    }
  }

  if (reports.length === 0) {
    return jsonResponse(200, {
      ok: true,
      message: "Aucune fiche proche de la purge. Pas d'email envoyé.",
      checked_entities: retentionRows.map((r) => r.entity),
    });
  }

  // ── 3. Regrouper par email de destination et envoyer ──────────────────
  const byEmail = new Map<string, EntityReport[]>();
  for (const report of reports) {
    const existing = byEmail.get(report.notify_email) ?? [];
    existing.push(report);
    byEmail.set(report.notify_email, existing);
  }

  const emailResults: Array<{ to: string; ok: boolean; error?: string }> = [];

  for (const [toEmail, entityReports] of byEmail.entries()) {
    const totalItems = entityReports.reduce((sum, r) => sum + r.items.length, 0);
    const subject = `⚠️ AiMediArt — ${totalItems} fiche${totalItems > 1 ? "s" : ""} proche${totalItems > 1 ? "s" : ""} de la purge définitive`;
    const html = buildEmailHtml(entityReports);

    const result = await sendEmailResend(resendApiKey, fromEmail, toEmail, subject, html);
    emailResults.push({ to: toEmail, ...result });

    if (!result.ok) {
      console.error(`[notify-before-purge] Email vers ${toEmail} échoué :`, result.error);
    } else {
      console.log(`[notify-before-purge] Email envoyé vers ${toEmail} (${totalItems} fiches)`);
    }
  }

  // ── 4. Rapport de sortie ───────────────────────────────────────────────
  return jsonResponse(200, {
    ok: true,
    checked_entities: retentionRows.map((r) => r.entity),
    reports: reports.map((r) => ({
      entity: r.entity,
      table_name: r.table_name,
      items_count: r.items.length,
      notify_email: r.notify_email,
    })),
    emails_sent: emailResults,
  });
});
