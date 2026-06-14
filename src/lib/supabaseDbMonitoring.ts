import { supabase } from "@/lib/supabase";

/** Objet volumineux (table, index, toast…). */
export type DbLargeObject = {
  object_name: string;
  schema_name: string;
  relation_name: string;
  kind: string;
  total_bytes: number;
  data_bytes: number;
  index_bytes: number;
  share_pct: number;
};

export type DbMonitoringSnapshot = {
  database_name: string;
  database_size_bytes: number;
  active_connections: number;
  max_connections: number;
  fetched_at: string;
  large_objects: DbLargeObject[];
};

export type InfraMonitoringPoint = {
  period_start: string;
  values: Record<string, number | null>;
};

export type InfraSeriesMeta = {
  format?: string;
  total?: number;
  totalAverage?: number | string;
};

export type DbMonitoringInfra = {
  available: boolean;
  reason?: string | null;
  history_hint?: string | null;
  snapshot_count?: number;
  project_ref?: string | null;
  dashboard_url?: string | null;
  interval: string;
  start_date: string;
  end_date: string;
  data: InfraMonitoringPoint[];
  series: Record<string, InfraSeriesMeta>;
};

export type SupabaseDbMonitoringPayload = {
  snapshot: DbMonitoringSnapshot;
  infra: DbMonitoringInfra;
  range_hours: number;
  fetched_at: string;
};

export type MonitoringRangeHours = 24 | 168 | 720;

export type MonitoringChartKind = "stackedBar" | "line" | "area";

export type MonitoringChartSeries = {
  attribute: string;
  color: string;
  stackId?: string;
  omitFromStack?: boolean;
};

export type MonitoringChartDef = {
  id: string;
  titleKey: string;
  kind: MonitoringChartKind;
  format: "bytes" | "bytesPerSecond" | "percent" | "count" | "iops";
  series: MonitoringChartSeries[];
  /** Attribut affiché en en-tête (dernier point ou moyenne série). */
  headlineAttribute?: string;
};

/** Définitions des graphiques (libellés via i18n settings.supabase_monitoring.charts.*). */
export const MONITORING_CHART_DEFS: MonitoringChartDef[] = [
  {
    id: "disk-size",
    titleKey: "supabase_monitoring.charts.disk_size",
    kind: "stackedBar",
    format: "bytes",
    headlineAttribute: "pg_database_size",
    series: [
      { attribute: "disk_fs_used_system", color: "#94a3b8", stackId: "disk" },
      { attribute: "disk_fs_used_wal", color: "#f59e0b", stackId: "disk" },
      { attribute: "pg_database_size", color: "#3b82f6", stackId: "disk" },
      { attribute: "disk_fs_size", color: "#64748b", omitFromStack: true },
    ],
  },
  {
    id: "memory-commitment",
    titleKey: "supabase_monitoring.charts.memory_commitment",
    kind: "stackedBar",
    format: "bytes",
    headlineAttribute: "ram_commit_used",
    series: [
      { attribute: "ram_commit_used", color: "#8b5cf6", stackId: "mem" },
      { attribute: "ram_commit_limit", color: "#cbd5e1", omitFromStack: true },
    ],
  },
  {
    id: "ram-usage",
    titleKey: "supabase_monitoring.charts.ram_usage",
    kind: "stackedBar",
    format: "bytes",
    headlineAttribute: "ram_usage_used",
    series: [
      { attribute: "ram_usage_used", color: "#2563eb", stackId: "ram" },
      { attribute: "ram_usage_cache_and_buffers", color: "#06b6d4", stackId: "ram" },
      { attribute: "ram_usage_free", color: "#22c55e", stackId: "ram" },
      { attribute: "ram_usage_total", color: "#94a3b8", omitFromStack: true },
    ],
  },
  {
    id: "cpu-usage",
    titleKey: "supabase_monitoring.charts.cpu_usage",
    kind: "stackedBar",
    format: "percent",
    series: [
      { attribute: "cpu_usage_busy_user", color: "#2563eb", stackId: "cpu" },
      { attribute: "cpu_usage_busy_system", color: "#eab308", stackId: "cpu" },
      { attribute: "cpu_usage_busy_iowait", color: "#ef4444", stackId: "cpu" },
      { attribute: "cpu_usage_busy_irqs", color: "#f97316", stackId: "cpu" },
      { attribute: "cpu_usage_busy_other", color: "#a855f7", stackId: "cpu" },
    ],
  },
  {
    id: "network-throughput",
    titleKey: "supabase_monitoring.charts.network",
    kind: "line",
    format: "bytesPerSecond",
    series: [
      { attribute: "network_receive_bytes", color: "#2563eb" },
      { attribute: "network_transmit_bytes", color: "#22c55e" },
    ],
  },
  {
    id: "disk-iops",
    titleKey: "supabase_monitoring.charts.disk_iops",
    kind: "stackedBar",
    format: "iops",
    series: [
      { attribute: "disk_iops_read", color: "#3b82f6", stackId: "iops" },
      { attribute: "disk_iops_write", color: "#22c55e", stackId: "iops" },
    ],
  },
  {
    id: "disk-throughput",
    titleKey: "supabase_monitoring.charts.disk_throughput",
    kind: "line",
    format: "bytesPerSecond",
    series: [
      { attribute: "disk_bytes_read", color: "#3b82f6" },
      { attribute: "disk_bytes_written", color: "#22c55e" },
    ],
  },
  {
    id: "connections",
    titleKey: "supabase_monitoring.charts.connections",
    kind: "stackedBar",
    format: "count",
    headlineAttribute: "pg_stat_database_num_backends",
    series: [
      { attribute: "client_connections_postgres", color: "#2563eb", stackId: "conn" },
      { attribute: "client_connections_authenticator", color: "#06b6d4", stackId: "conn" },
      { attribute: "client_connections_supabase_auth_admin", color: "#8b5cf6", stackId: "conn" },
      { attribute: "client_connections_supabase_storage_admin", color: "#f59e0b", stackId: "conn" },
      { attribute: "client_connections_supabase_admin", color: "#64748b", stackId: "conn" },
      { attribute: "client_connections_other", color: "#94a3b8", stackId: "conn" },
      { attribute: "pg_stat_database_num_backends", color: "#0f172a", omitFromStack: true },
    ],
  },
];

async function parseInvokeError(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).text === "function") {
      const text = await (ctx as Response).text().catch(() => "");
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string };
          return [json.message, json.error].filter(Boolean).join(" — ");
        } catch {
          return text;
        }
      }
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Erreur lors de l'appel supabase-db-monitoring.";
}

export async function fetchSupabaseDbMonitoring(
  rangeHours: MonitoringRangeHours = 24,
): Promise<{ data: SupabaseDbMonitoringPayload | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("supabase-db-monitoring", {
    method: "POST",
    body: { hours: rangeHours },
  });

  if (error) {
    return { data: null, error: await parseInvokeError(error) };
  }

  const payload = data as { error?: string } | SupabaseDbMonitoringPayload | null;
  if (!payload || typeof payload !== "object") {
    return { data: null, error: "Réponse vide." };
  }
  if ("error" in payload && payload.error) {
    return { data: null, error: payload.error };
  }

  const result = payload as SupabaseDbMonitoringPayload;
  const snap = result.snapshot ?? {} as DbMonitoringSnapshot;
  return {
    data: {
      ...result,
      snapshot: {
        database_name: String(snap.database_name ?? ""),
        database_size_bytes: Number(snap.database_size_bytes ?? 0),
        active_connections: Number(snap.active_connections ?? 0),
        max_connections: Number(snap.max_connections ?? 0),
        fetched_at: String(snap.fetched_at ?? result.fetched_at ?? ""),
        large_objects: Array.isArray(snap.large_objects) ? snap.large_objects : [],
      },
      infra: {
        available: Boolean(result.infra?.available),
        reason: result.infra?.reason ?? null,
        history_hint: result.infra?.history_hint ?? null,
        snapshot_count: Number(result.infra?.snapshot_count ?? 0),
        project_ref: result.infra?.project_ref,
        dashboard_url: result.infra?.dashboard_url,
        interval: String(result.infra?.interval ?? "1h"),
        start_date: String(result.infra?.start_date ?? ""),
        end_date: String(result.infra?.end_date ?? ""),
        data: Array.isArray(result.infra?.data) ? result.infra.data : [],
        series: result.infra?.series ?? {},
      },
    },
    error: null,
  };
}

/** Octets → libellé lisible (Ko, Mo, Go). */
export function formatBytes(value: number, digits = 1): string {
  if (!Number.isFinite(value) || value <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatBytesPerSecond(value: number): string {
  return `${formatBytes(value)}/s`;
}

export function formatChartAxisTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildChartRows(
  infra: DbMonitoringInfra,
  chart: MonitoringChartDef,
): Array<Record<string, string | number | null>> {
  return infra.data.map((point) => {
    const row: Record<string, string | number | null> = {
      period_start: point.period_start,
      label: point.period_start,
    };
    for (const s of chart.series) {
      row[s.attribute] = point.values[s.attribute] ?? null;
    }
    return row;
  });
}

export function headlineValue(
  infra: DbMonitoringInfra,
  chart: MonitoringChartDef,
): string | null {
  const attr = chart.headlineAttribute
    ?? chart.series.find((s) => !s.omitFromStack)?.attribute;
  if (!attr) return null;
  const meta = infra.series[attr];
  if (meta?.totalAverage != null && meta.totalAverage !== "") {
    const n = Number(meta.totalAverage);
    if (Number.isFinite(n)) {
      return formatByChart(chart.format, n);
    }
  }
  const last = [...infra.data].reverse().find((p) => p.values[attr] != null);
  if (!last) return null;
  const v = last.values[attr];
  return v == null ? null : formatByChart(chart.format, v);
}

export function formatByChart(format: MonitoringChartDef["format"], value: number): string {
  switch (format) {
    case "bytes":
      return formatBytes(value);
    case "bytesPerSecond":
      return formatBytesPerSecond(value);
    case "percent":
      return `${value.toFixed(2)} %`;
    case "iops":
      return `${Math.round(value)} IOPS`;
    case "count":
      return String(Math.round(value));
    default:
      return String(value);
  }
}

export function kindLabel(kind: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    table: t("supabase_monitoring.kind_table"),
    index: t("supabase_monitoring.kind_index"),
    toast: t("supabase_monitoring.kind_toast"),
    materialized_view: t("supabase_monitoring.kind_matview"),
    sequence: t("supabase_monitoring.kind_sequence"),
  };
  return map[kind] ?? kind;
}
