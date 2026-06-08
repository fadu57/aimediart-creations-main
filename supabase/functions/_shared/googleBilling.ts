/**
 * Connecteur coûts Google via Cloud Billing Export → BigQuery.
 * Alimente google_gemini et google_tts depuis une même requête.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getGoogleAccessToken, parseServiceAccountJson } from "./googleAuth.ts";
import {
  insertCostEventsIdempotent,
  type CostEventInsert,
} from "./usageEventsInsert.ts";
import {
  resolveSyncDateRange,
  type ProviderSyncContext,
} from "./providerSyncContext.ts";
import type { ProviderSyncResult } from "./providerRegistry.ts";

export type GoogleBillingRow = {
  usage_start_time?: unknown;
  usage_end_time?: unknown;
  service_description?: string;
  sku_description?: string;
  service_id?: string;
  sku_id?: string;
  project_id?: string;
  location_region?: string;
  cost?: number;
  currency?: string;
  credits_amount?: number;
};

/**
 * BigQuery REST renvoie les TIMESTAMP en secondes epoch (souvent "1.7775792E9").
 * PostgreSQL timestamptz attend ISO 8601.
 */
export function parseBigQueryTimestampToIso(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    return epochNumberToIso(num);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return epochNumberToIso(value);
  }

  return null;
}

function epochNumberToIso(raw: number): string | null {
  let ms: number;
  const abs = Math.abs(raw);
  if (abs > 1e15) ms = raw / 1e6; // nanosecondes
  else if (abs > 1e12) ms = raw; // millisecondes
  else ms = raw * 1000; // secondes (format BigQuery REST)

  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export type GoogleBillingConfig = {
  projectId: string;
  dataset: string;
  table: string;
  serviceAccountJson: string;
};

export type GoogleBillingSyncStats = {
  queried: number;
  mapped: number;
  gemini: number;
  tts: number;
  inserted: number;
  skipped: number;
  dateFrom: string;
  dateTo: string;
};

/** Lit la config depuis les secrets Edge Function. */
export function getGoogleBillingConfig(): GoogleBillingConfig | null {
  const projectId = Deno.env.get("GOOGLE_CLOUD_PROJECT_ID")?.trim();
  const dataset = Deno.env.get("GOOGLE_BILLING_BQ_DATASET")?.trim();
  const table = Deno.env.get("GOOGLE_BILLING_BQ_TABLE")?.trim();
  const saJson = Deno.env.get("GOOGLE_BILLING_SERVICE_ACCOUNT_JSON")?.trim();
  if (!projectId || !dataset || !table || !saJson) return null;
  return { projectId, dataset, table, serviceAccountJson: saJson };
}

/** Vérifie si les prérequis billing BigQuery sont configurés. */
export function isGoogleBillingConfigured(): boolean {
  const cfg = getGoogleBillingConfig();
  if (!cfg) return false;
  return parseServiceAccountJson(cfg.serviceAccountJson) !== null;
}

/**
 * Mappe une ligne d'export billing vers un provider produit.
 * Retourne null si la ligne n'est pas Gemini ni Cloud TTS.
 */
export function mapBillingRowToProvider(
  row: GoogleBillingRow,
): "google_gemini" | "google_tts" | null {
  const service = (row.service_description ?? "").toLowerCase();
  const sku = (row.sku_description ?? "").toLowerCase();
  const combined = `${service} ${sku}`;

  if (
    combined.includes("text-to-speech") ||
    combined.includes("text to speech") ||
    combined.includes("cloud text-to-speech")
  ) {
    return "google_tts";
  }

  if (
    combined.includes("gemini") ||
    combined.includes("generative language") ||
    (combined.includes("vertex ai") &&
      (combined.includes("generative") || combined.includes("prediction") || combined.includes("ai platform")))
  ) {
    return "google_gemini";
  }

  return null;
}

function buildImportHash(row: GoogleBillingRow, provider: string): string {
  const usageStart =
    parseBigQueryTimestampToIso(row.usage_start_time) ?? String(row.usage_start_time ?? "");
  const usageEnd =
    parseBigQueryTimestampToIso(row.usage_end_time) ?? String(row.usage_end_time ?? "");
  const parts = [
    "google_billing",
    provider,
    row.project_id ?? "",
    row.sku_id ?? row.sku_description ?? "",
    usageStart,
    usageEnd,
    row.location_region ?? "",
    String(row.cost ?? 0),
    row.currency ?? "",
  ];
  return parts.join(":");
}

function rowToCostEvent(
  row: GoogleBillingRow,
  provider: "google_gemini" | "google_tts",
): CostEventInsert | null {
  const cost = Number(row.cost ?? 0);
  if (!Number.isFinite(cost)) return null;

  const usageStartIso =
    parseBigQueryTimestampToIso(row.usage_start_time) ?? new Date().toISOString();
  const usageEndIso = parseBigQueryTimestampToIso(row.usage_end_time);
  const toolType = provider === "google_tts" ? "tts" : "chat";

  return {
    import_hash: buildImportHash(row, provider),
    created_at: usageStartIso,
    tool_type: toolType,
    provider,
    api_name: row.service_description ?? null,
    model_name: row.sku_description ?? null,
    operation_name: "billing_export",
    unit_type: "calls",
    cost_estimated: cost,
    currency: (row.currency ?? "USD").toUpperCase(),
    status: "success",
    source: "google_billing_export",
    metadata: {
      billing_source: "gcp_bigquery_export",
      project_id: row.project_id ?? null,
      service_id: row.service_id ?? null,
      sku_id: row.sku_id ?? null,
      service_description: row.service_description ?? null,
      sku_description: row.sku_description ?? null,
      usage_start_time: usageStartIso,
      usage_end_time: usageEndIso,
      usage_start_time_raw: row.usage_start_time ?? null,
      usage_end_time_raw: row.usage_end_time ?? null,
      location_region: row.location_region ?? null,
      credits_amount: row.credits_amount ?? null,
      raw_cost: cost,
    },
  };
}

/** Requête BigQuery via REST API (jobs.query). */
export async function queryGoogleBillingExport(
  cfg: GoogleBillingConfig,
  dateFrom: string,
  dateTo: string,
): Promise<GoogleBillingRow[]> {
  const sa = parseServiceAccountJson(cfg.serviceAccountJson);
  if (!sa) throw new Error("GOOGLE_BILLING_SERVICE_ACCOUNT_JSON invalide.");

  const accessToken = await getGoogleAccessToken(sa);
  const tableFqn = `\`${cfg.projectId}.${cfg.dataset}.${cfg.table}\``;

  // Schéma standard / detailed usage cost export (noms de colonnes courants).
  const sql = `
    SELECT
      usage_start_time,
      usage_end_time,
      service.description AS service_description,
      sku.description AS sku_description,
      service.id AS service_id,
      sku.id AS sku_id,
      project.id AS project_id,
      location.region AS location_region,
      cost,
      currency,
      (SELECT SUM(c.amount) FROM UNNEST(IFNULL(credits, [])) AS c) AS credits_amount
    FROM ${tableFqn}
    WHERE DATE(usage_start_time) >= @date_from
      AND DATE(usage_start_time) <= @date_to
      AND cost IS NOT NULL
    ORDER BY usage_start_time
    LIMIT 50000
  `;

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${cfg.projectId}/queries`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      parameterMode: "NAMED",
      queryParameters: [
        { name: "date_from", parameterType: { type: "DATE" }, parameterValue: { value: dateFrom } },
        { name: "date_to", parameterType: { type: "DATE" }, parameterValue: { value: dateTo } },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`BigQuery query failed (${resp.status}): ${body.slice(0, 500)}`);
  }

  const result = await resp.json() as {
    errors?: Array<{ message?: string }>;
    schema?: { fields?: Array<{ name?: string }> };
    rows?: Array<{ f?: Array<{ v?: unknown }> }>;
  };

  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join("; "));
  }

  const fields = result.schema?.fields?.map((f) => f.name ?? "") ?? [];
  const rows: GoogleBillingRow[] = [];

  for (const r of result.rows ?? []) {
    const obj: Record<string, unknown> = {};
    r.f?.forEach((cell, idx) => {
      const key = fields[idx];
      if (key) obj[key] = cell.v;
    });
    rows.push(obj as GoogleBillingRow);
  }

  return rows;
}

/**
 * Sync billing Google → ai_usage_events pour google_gemini et/ou google_tts.
 */
export async function syncGoogleBillingCosts(
  ctx: ProviderSyncContext,
  targetProviders: Array<"google_gemini" | "google_tts">,
): Promise<ProviderSyncResult & { stats?: GoogleBillingSyncStats }> {
  const cfg = getGoogleBillingConfig();
  if (!cfg) {
    return {
      status: "not_implemented",
      message:
        "Prérequis Google Billing manquants. Configurer GOOGLE_CLOUD_PROJECT_ID, " +
        "GOOGLE_BILLING_BQ_DATASET, GOOGLE_BILLING_BQ_TABLE, GOOGLE_BILLING_SERVICE_ACCOUNT_JSON. " +
        "Voir docs/GOOGLE-BILLING-COSTS.md",
    };
  }

  let dateRange: { from: string; to: string };
  try {
    dateRange = resolveSyncDateRange(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "error", message: msg, error: msg };
  }

  try {
    const rawRows = await queryGoogleBillingExport(cfg, dateRange.from, dateRange.to);
    const targetSet = new Set(targetProviders);
    const events: CostEventInsert[] = [];
    let gemini = 0;
    let tts = 0;

    for (const row of rawRows) {
      const provider = mapBillingRowToProvider(row);
      if (!provider || !targetSet.has(provider)) continue;

      const event = rowToCostEvent(row, provider);
      if (!event) continue;

      events.push(event);
      if (provider === "google_gemini") gemini++;
      else tts++;
    }

    const insertResult = await insertCostEventsIdempotent(ctx.admin, events);

    const stats: GoogleBillingSyncStats = {
      queried: rawRows.length,
      mapped: events.length,
      gemini,
      tts,
      inserted: insertResult.inserted,
      skipped: insertResult.skipped,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    };

    if (insertResult.errors.length) {
      return {
        status: "partial",
        message:
          `${events.length} ligne(s) mappée(s), ${insertResult.inserted} insérée(s), ` +
          `${insertResult.errors.length} erreur(s).`,
        error: insertResult.errors.slice(0, 3).join("; "),
        rawData: stats,
      };
    }

    return {
      status: "success",
      message:
        `BigQuery : ${rawRows.length} ligne(s) lues, ${events.length} mappée(s) ` +
        `(gemini=${gemini}, tts=${tts}), ${insertResult.inserted} insérée(s), ` +
        `${insertResult.skipped} doublon(s) ignoré(s). Période ${dateRange.from} → ${dateRange.to}.`,
      rawData: stats,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", message: "Échec sync Google Billing", error: msg };
  }
}

/** Met à jour cost_providers pour les deux fournisseurs Google. */
export async function updateGoogleProviderSyncStatus(
  admin: SupabaseClient,
  result: ProviderSyncResult,
  stats?: GoogleBillingSyncStats,
): Promise<void> {
  const now = new Date().toISOString();
  const baseMeta = {
    billing_mode: "gcp_billing_export",
    last_stats: stats ?? null,
  };

  for (const key of ["google_gemini"] as const) {
    const notes =
      "Coûts Gemini via export billing BigQuery (si facturation liée au projet exporté).";

    await admin.from("cost_providers").update({
      last_synced_at: now,
      last_sync_status: result.status,
      last_sync_error: result.error ?? null,
      sync_supported: true,
      cost_import_supported: isGoogleBillingConfigured(),
      status: result.status === "success" ? "active" : result.status === "not_implemented" ? "detected_not_configured" : "error",
      notes,
      metadata: {
        ...baseMeta,
        provider_key: key,
        billing_configured: isGoogleBillingConfigured(),
      },
    }).eq("provider_key", key);
  }
}
