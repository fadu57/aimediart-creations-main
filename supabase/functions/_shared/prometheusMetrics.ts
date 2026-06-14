/**
 * prometheusMetrics.ts — parse Metrics API Supabase + dérivation des séries Studio.
 */

export type PromSample = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

export type MetricsSnapshotRow = {
  captured_at: string;
  values: Record<string, number>;
  counters?: Record<string, number>;
};

/** Parse le format texte Prometheus (sous-ensemble). */
export function parsePrometheusText(text: string): PromSample[] {
  const samples: PromSample[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const spaceIdx = line.lastIndexOf(" ");
    if (spaceIdx <= 0) continue;

    const value = Number(line.slice(spaceIdx + 1));
    if (!Number.isFinite(value)) continue;

    const head = line.slice(0, spaceIdx);
    const brace = head.indexOf("{");
    const name = brace >= 0 ? head.slice(0, brace) : head;
    const labels: Record<string, string> = {};

    if (brace >= 0 && head.endsWith("}")) {
      const inner = head.slice(brace + 1, -1);
      if (inner) {
        for (const part of inner.split(",")) {
          const eq = part.indexOf("=");
          if (eq <= 0) continue;
          const k = part.slice(0, eq).trim();
          const v = part.slice(eq + 1).trim().replace(/^"|"$/g, "");
          labels[k] = v;
        }
      }
    }

    samples.push({ name, labels, value });
  }
  return samples;
}

function sampleKey(name: string, labels: Record<string, string>): string {
  const parts = Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`);
  return parts.length ? `${name}{${parts.join(",")}}` : name;
}

function isDbService(labels: Record<string, string>): boolean {
  const st = labels.service_type;
  return !st || st === "db";
}

function sumSamples(samples: PromSample[], name: string, filter?: (s: PromSample) => boolean): number {
  return samples
    .filter((s) => s.name === name && (!filter || filter(s)))
    .reduce((acc, s) => acc + s.value, 0);
}

function sumCpuMode(samples: PromSample[], mode: string): number {
  return sumSamples(samples, "node_cpu_seconds_total", (s) =>
    isDbService(s.labels) && s.labels.mode === mode
  );
}

function extractCounterMap(samples: PromSample[]): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const s of samples) {
    if (!s.name.startsWith("node_") && !s.name.startsWith("pg_")) continue;
    if (!isDbService(s.labels)) continue;
    counters[sampleKey(s.name, s.labels)] = s.value;
  }
  return counters;
}

function counterRate(
  curr: Record<string, number>,
  prev: Record<string, number> | undefined,
  deltaSec: number,
  keyPrefix: string,
): number {
  if (!prev || deltaSec <= 0) return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(curr)) {
    if (!k.startsWith(keyPrefix)) continue;
    const p = prev[k];
    if (p == null) continue;
    const d = v - p;
    if (d >= 0) sum += d / deltaSec;
  }
  return sum;
}

function cpuModePercent(
  mode: string,
  counters: Record<string, number>,
  prevCounters: Record<string, number> | undefined,
  deltaSec: number,
): number {
  if (!prevCounters || deltaSec <= 0) return 0;

  const modes = ["user", "system", "iowait", "irq", "softirq", "steal", "nice", "idle"];
  let totalDelta = 0;
  let modeDelta = 0;

  for (const m of modes) {
    const keys = Object.keys(counters).filter((k) =>
      k.startsWith("node_cpu_seconds_total{") && k.includes(`mode=${m}`)
    );
    for (const k of keys) {
      const d = (counters[k] ?? 0) - (prevCounters[k] ?? 0);
      if (d >= 0) {
        totalDelta += d;
        if (m === mode || (mode === "irq" && m === "softirq")) {
          modeDelta += d;
        }
      }
    }
  }

  if (mode === "other") {
    const tracked = ["user", "system", "iowait", "irq"].reduce(
      (acc, m) => acc + cpuModePercent(m, counters, prevCounters, deltaSec),
      0,
    );
    return Math.max(0, 100 - tracked);
  }

  return totalDelta > 0 ? (modeDelta / totalDelta) * 100 : 0;
}

/** Dérive les attributs graphiques à partir d'un scrape (+ snapshot précédent pour les taux). */
export function deriveMonitoringValues(
  samples: PromSample[],
  prev: { counters: Record<string, number>; captured_at: string } | null,
  capturedAt: Date,
  sqlDbSizeBytes?: number,
  sqlConnections?: number,
): { values: Record<string, number>; counters: Record<string, number> } {
  const counters = extractCounterMap(samples);
  const deltaSec = prev
    ? Math.max(1, (capturedAt.getTime() - new Date(prev.captured_at).getTime()) / 1000)
    : 0;
  const prevCounters = prev?.counters;

  const memTotal = sumSamples(samples, "node_memory_MemTotal_bytes", (s) => isDbService(s.labels));
  const memFree = sumSamples(samples, "node_memory_MemFree_bytes", (s) => isDbService(s.labels));
  const memCached = sumSamples(samples, "node_memory_Cached_bytes", (s) => isDbService(s.labels));
  const memBuffers = sumSamples(samples, "node_memory_Buffers_bytes", (s) => isDbService(s.labels));
  const memAvailable = sumSamples(samples, "node_memory_MemAvailable_bytes", (s) => isDbService(s.labels));

  const fsSize = sumSamples(samples, "node_filesystem_size_bytes", (s) =>
    isDbService(s.labels) && s.labels.mountpoint === "/"
  );
  const fsAvail = sumSamples(samples, "node_filesystem_avail_bytes", (s) =>
    isDbService(s.labels) && s.labels.mountpoint === "/"
  );
  const fsUsed = fsSize > 0 && fsAvail >= 0 ? fsSize - fsAvail : 0;

  const pgSize = sqlDbSizeBytes ?? sumSamples(samples, "pg_database_size_bytes", (s) => isDbService(s.labels));

  const netIn = counterRate(counters, prevCounters, deltaSec, "node_network_receive_bytes_total{");
  const netOut = counterRate(counters, prevCounters, deltaSec, "node_network_transmit_bytes_total{");

  const readIops = counterRate(counters, prevCounters, deltaSec, "node_disk_reads_completed_total{");
  const writeIops = counterRate(counters, prevCounters, deltaSec, "node_disk_writes_completed_total{");
  const readBytes = counterRate(counters, prevCounters, deltaSec, "node_disk_read_bytes_total{");
  const writeBytes = counterRate(counters, prevCounters, deltaSec, "node_disk_written_bytes_total{");

  const ramUsed = memAvailable > 0
    ? Math.max(0, memTotal - memAvailable)
    : Math.max(0, memTotal - memFree - memCached - memBuffers);

  const values: Record<string, number> = {
    disk_fs_size: fsSize,
    disk_fs_used_system: Math.max(0, fsUsed - pgSize),
    disk_fs_used_wal: 0,
    pg_database_size: pgSize,
    ram_usage_total: memTotal,
    ram_usage_free: memFree,
    ram_usage_cache_and_buffers: memCached + memBuffers,
    ram_usage_used: ramUsed,
    ram_commit_used: ramUsed,
    ram_commit_limit: memTotal,
    cpu_usage_busy_user: cpuModePercent("user", counters, prevCounters, deltaSec),
    cpu_usage_busy_system: cpuModePercent("system", counters, prevCounters, deltaSec),
    cpu_usage_busy_iowait: cpuModePercent("iowait", counters, prevCounters, deltaSec),
    cpu_usage_busy_irqs: cpuModePercent("irq", counters, prevCounters, deltaSec),
    cpu_usage_busy_other: cpuModePercent("other", counters, prevCounters, deltaSec),
    network_receive_bytes: netIn,
    network_transmit_bytes: netOut,
    disk_iops_read: readIops,
    disk_iops_write: writeIops,
    disk_bytes_read: readBytes,
    disk_bytes_written: writeBytes,
    pg_stat_database_num_backends: sqlConnections ?? 0,
    client_connections_postgres: sqlConnections ?? 0,
  };

  return { values, counters };
}

export function snapshotsToInfraPoints(
  rows: MetricsSnapshotRow[],
): Array<{ period_start: string; values: Record<string, number | null> }> {
  return rows.map((row) => ({
    period_start: row.captured_at,
    values: Object.fromEntries(
      Object.entries(row.values).map(([k, v]) => [k, Number.isFinite(v) ? v : null]),
    ),
  }));
}

export function buildSeriesMeta(
  points: Array<{ period_start: string; values: Record<string, number | null> }>,
  attributes: readonly string[],
): Record<string, { totalAverage?: number | string }> {
  const series: Record<string, { totalAverage?: number | string }> = {};
  for (const attr of attributes) {
    const nums = points
      .map((p) => p.values[attr])
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (!nums.length) continue;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    series[attr] = { totalAverage: avg };
  }
  return series;
}
