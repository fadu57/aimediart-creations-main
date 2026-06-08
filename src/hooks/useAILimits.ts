import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

export type AILimitStatus = "ok" | "warning" | "critical" | "blocked" | "unknown";

export type AILimitSource = "auto" | "manual" | "unknown";

export type AILimitRow = {
  limit_id: string;
  provider: string;
  model: string | null;
  limit_type: string;
  limit_value: number | null;
  limit_value_observed: number | null;
  limit_value_manual: number | null;
  limit_source: AILimitSource;
  current_usage: number;
  usage_pct: number | null;
  status: AILimitStatus;
  observed_at: string | null;
  observed_source: string | null;
  manual_updated_at: string | null;
  alert_threshold_warning: number;
  alert_threshold_critical: number;
  is_active: boolean;
};

type UseAILimitsOptions = {
  /** Filtre optionnel par fournisseur (ex. depuis le sélecteur de la page tokens). */
  provider?: string;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_MS = 30_000;

const LIMIT_TYPE_ORDER = ["RPM", "RPD", "TPM", "TPD", "ASH", "ASD"] as const;

function parseLimitSource(raw: unknown): AILimitSource {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "auto" || s === "manual" || s === "unknown") return s;
  return "unknown";
}

function parseLimitStatus(raw: unknown): AILimitStatus {
  const s = String(raw ?? "unknown").toLowerCase();
  if (s === "ok" || s === "warning" || s === "critical" || s === "blocked" || s === "unknown") {
    return s;
  }
  return "unknown";
}

function parseNullableNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapLimitRow(raw: Record<string, unknown>): AILimitRow {
  return {
    limit_id: String(raw.limit_id),
    provider: String(raw.provider),
    model: raw.model == null ? null : String(raw.model),
    limit_type: String(raw.limit_type),
    limit_value: parseNullableNumber(raw.limit_value),
    limit_value_observed: parseNullableNumber(raw.limit_value_observed),
    limit_value_manual: parseNullableNumber(raw.limit_value_manual),
    limit_source: parseLimitSource(raw.limit_source),
    current_usage: Number(raw.current_usage ?? 0),
    usage_pct: parseNullableNumber(raw.usage_pct),
    status: parseLimitStatus(raw.status),
    observed_at: raw.observed_at == null ? null : String(raw.observed_at),
    observed_source: raw.observed_source == null ? null : String(raw.observed_source),
    manual_updated_at: raw.manual_updated_at == null ? null : String(raw.manual_updated_at),
    alert_threshold_warning: Number(raw.alert_threshold_warning ?? 0.8),
    alert_threshold_critical: Number(raw.alert_threshold_critical ?? 0.95),
    is_active: Boolean(raw.is_active ?? true),
  };
}

function sortLimits(rows: AILimitRow[]): AILimitRow[] {
  const typeRank = (t: string): number => {
    const idx = LIMIT_TYPE_ORDER.indexOf(t as (typeof LIMIT_TYPE_ORDER)[number]);
    return idx === -1 ? 999 : idx;
  };

  return [...rows].sort((a, b) => {
    const p = a.provider.localeCompare(b.provider, "fr");
    if (p !== 0) return p;
    const ma = a.model ?? "";
    const mb = b.model ?? "";
    const m = ma.localeCompare(mb, "fr");
    if (m !== 0) return m;
    return typeRank(a.limit_type) - typeRank(b.limit_type);
  });
}

function groupByProvider(rows: AILimitRow[]): Record<string, AILimitRow[]> {
  const map: Record<string, AILimitRow[]> = {};
  for (const row of rows) {
    if (!map[row.provider]) map[row.provider] = [];
    map[row.provider].push(row);
  }
  return map;
}

export function useAILimits(options: UseAILimitsOptions = {}) {
  const { provider, pollIntervalMs = DEFAULT_POLL_MS } = options;

  const [limits, setLimits] = useState<AILimitRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLimits = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    let q = supabase.from("ai_usage_vs_limits").select("*");

    if (provider) {
      q = q.eq("provider", provider);
    }

    const { data, error: err } = await q;

    if (!silent) setIsLoading(false);

    if (err) {
      setError(err.message);
      if (!silent) setLimits([]);
      return;
    }

    const rows = sortLimits(
      (data ?? []).map((r) => mapLimitRow(r as Record<string, unknown>)),
    );
    setLimits(rows);
    if (!silent) setError(null);
  }, [provider]);

  const refetch = useCallback(() => {
    void loadLimits(false);
  }, [loadLimits]);

  const updateManualLimit = useCallback(async (limitId: string, value: number | null) => {
    const manualValue = value != null && value > 0 ? Math.round(value) : null;

    const { error: err } = await supabase
      .from("ai_provider_limits")
      .update({
        limit_value_manual: manualValue,
        manual_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", limitId);

    if (err) {
      throw new Error(err.message);
    }

    await loadLimits(true);
  }, [loadLimits]);

  useEffect(() => {
    void loadLimits(false);
  }, [loadLimits]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadLimits(true);
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [loadLimits, pollIntervalMs]);

  const hasWarning = useMemo(
    () => limits.some((l) => l.status === "warning"),
    [limits],
  );

  const hasCritical = useMemo(
    () => limits.some((l) => l.status === "critical" || l.status === "blocked"),
    [limits],
  );

  const hasUnknown = useMemo(
    () => limits.some((l) => l.limit_source === "unknown"),
    [limits],
  );

  const groupedByProvider = useMemo(
    () => groupByProvider(limits),
    [limits],
  );

  return {
    limits,
    isLoading,
    error,
    hasWarning,
    hasCritical,
    hasUnknown,
    refetch,
    updateManualLimit,
    groupedByProvider,
  };
}
