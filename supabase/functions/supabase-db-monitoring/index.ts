/**
 * supabase-db-monitoring — observabilité base Supabase (admin rôles 1–3).
 * POST /functions/v1/supabase-db-monitoring
 * Body: { hours?: 24 | 168 | 720 }
 *
 * Source des graphiques : Metrics API Prometheus (service_role, déjà disponible en Edge Function).
 * Historique : table supabase_metrics_snapshots (migration_76).
 *
 * Note : SB_MGMT_ACCESS_TOKEN (sbp_…) ne fonctionne PAS sur l'API /platform/ du Studio
 * (JWT session requis). Il n'est plus nécessaire pour cette page.
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import {
  buildSeriesMeta,
  deriveMonitoringValues,
  parsePrometheusText,
  snapshotsToInfraPoints,
} from "../_shared/prometheusMetrics.ts";

const INFRA_ATTRIBUTES = [
  "disk_fs_used_system",
  "disk_fs_used_wal",
  "pg_database_size",
  "disk_fs_size",
  "ram_commit_used",
  "ram_commit_limit",
  "ram_usage_used",
  "ram_usage_cache_and_buffers",
  "ram_usage_free",
  "ram_usage_total",
  "cpu_usage_busy_system",
  "cpu_usage_busy_user",
  "cpu_usage_busy_iowait",
  "cpu_usage_busy_irqs",
  "cpu_usage_busy_other",
  "network_receive_bytes",
  "network_transmit_bytes",
  "disk_iops_read",
  "disk_iops_write",
  "disk_bytes_read",
  "disk_bytes_written",
  "pg_stat_database_num_backends",
  "client_connections_postgres",
] as const;

const MIN_SNAPSHOT_INTERVAL_MS = 4 * 60 * 1000;
const RETENTION_DAYS = 31;

function extractProjectRef(supabaseUrl: string | undefined): string | null {
  const explicit = Deno.env.get("SUPABASE_PROJECT_REF")?.trim();
  if (explicit) return explicit;
  if (!supabaseUrl) return null;
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(supabaseUrl.trim());
  return m?.[1] ?? null;
}

function toIso(d: Date): string {
  return d.toISOString();
}

async function fetchPrometheusMetrics(
  projectRef: string,
  serviceRoleKey: string,
): Promise<{ text: string } | { error: string }> {
  const url = `https://${projectRef}.supabase.co/customer/v1/privileged/metrics`;
  const basic = btoa(`service_role:${serviceRoleKey}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "text/plain; version=0.0.4",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      error: res.status === 401
        ? "Metrics API 401 : vérifiez SUPABASE_SERVICE_ROLE_KEY (clé secrète du projet)."
        : `Metrics API ${res.status}: ${text.slice(0, 300)}`,
    };
  }
  return { text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const admin = getServiceRoleClient();
  const auth = await requireAdminUser(req, admin);
  if (!auth.authorized) {
    return jsonResponse({ error: auth.reason }, 403);
  }

  let body: { hours?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const hoursRaw = Number(body.hours ?? 24);
  const hours = [24, 168, 720].includes(hoursRaw) ? hoursRaw : 24;

  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const startDate = toIso(start);
  const endDate = toIso(end);

  try {
    const { data: snapshot, error: rpcError } = await admin.rpc("get_supabase_db_relation_sizes", {
      p_limit: 50,
    });

    if (rpcError) {
      console.error("[supabase-db-monitoring] RPC", rpcError.message);
      return jsonResponse({ error: `RPC: ${rpcError.message}` }, 500);
    }

    const projectRef = extractProjectRef(Deno.env.get("SUPABASE_URL"));
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const dashboardUrl = projectRef
      ? `https://supabase.com/dashboard/project/${projectRef}/reports/database`
      : null;

    let infra: Record<string, unknown> = {
      available: false,
      reason: "Ref projet ou clé service_role indisponible.",
      project_ref: projectRef,
      dashboard_url: dashboardUrl,
      interval: "snapshot",
      start_date: startDate,
      end_date: endDate,
      data: [],
      series: {},
      snapshot_count: 0,
      history_hint: null,
    };

    if (projectRef && serviceRoleKey) {
      const prom = await fetchPrometheusMetrics(projectRef, serviceRoleKey);

      if ("error" in prom) {
        infra = {
          ...infra,
          reason: prom.error,
        };
      } else {
        const samples = parsePrometheusText(prom.text);
        const now = new Date();

        const snapObj = snapshot as {
          database_size_bytes?: number;
          active_connections?: number;
        } | null;

        const { data: prevRow } = await admin
          .from("supabase_metrics_snapshots")
          .select("captured_at, counters")
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const prev = prevRow
          ? {
            captured_at: String(prevRow.captured_at),
            counters: (prevRow.counters ?? {}) as Record<string, number>,
          }
          : null;

        const shouldInsert = !prev
          || (now.getTime() - new Date(prev.captured_at).getTime()) >= MIN_SNAPSHOT_INTERVAL_MS;

        const { values, counters } = deriveMonitoringValues(
          samples,
          prev,
          now,
          Number(snapObj?.database_size_bytes ?? 0) || undefined,
          Number(snapObj?.active_connections ?? 0) || undefined,
        );

        if (shouldInsert) {
          const { error: insErr } = await admin.from("supabase_metrics_snapshots").insert({
            values,
            counters,
          });
          if (insErr) {
            console.warn("[supabase-db-monitoring] insert snapshot", insErr.message);
          }

          const retentionBefore = new Date(now.getTime() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
          await admin.from("supabase_metrics_snapshots").delete().lt("captured_at", retentionBefore);
        }

        const { data: historyRows, error: histErr } = await admin
          .from("supabase_metrics_snapshots")
          .select("captured_at, values")
          .gte("captured_at", startDate)
          .lte("captured_at", endDate)
          .order("captured_at", { ascending: true });

        if (histErr) {
          infra = {
            ...infra,
            reason: `Historique métriques : ${histErr.message} (migration_76 exécutée ?)`,
          };
        } else {
          const rows = (historyRows ?? []).map((r) => ({
            captured_at: String(r.captured_at),
            values: (r.values ?? {}) as Record<string, number>,
          }));

          const points = snapshotsToInfraPoints(rows);
          const series = buildSeriesMeta(points, INFRA_ATTRIBUTES);

          infra = {
            available: points.length > 0,
            reason: points.length === 0
              ? "Aucun snapshot enregistré pour cette période."
              : points.length === 1
              ? "Historique en cours : un seul point pour l'instant. Actualisez dans quelques minutes pour voir l'évolution."
              : null,
            project_ref: projectRef,
            dashboard_url: dashboardUrl,
            interval: "snapshot",
            start_date: startDate,
            end_date: endDate,
            data: points,
            series,
            snapshot_count: points.length,
            history_hint: points.length < 2
              ? "Les graphiques s'enrichissent à chaque actualisation (1 snapshot / 4 min max)."
              : null,
          };
        }
      }
    }

    return jsonResponse({
      snapshot: snapshot ?? {},
      infra,
      range_hours: hours,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[supabase-db-monitoring]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
