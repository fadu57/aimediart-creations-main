import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

async function parseInvokeError(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "Erreur inconnue.";
  const err = error as { message?: string; context?: Response };
  let detail = err.message ?? "Erreur inconnue.";
  try {
    const res = err.context;
    if (res) {
      const body = await res.clone().json() as Record<string, string | undefined>;
      detail = body.details || body.hint || body.error || body.message || detail;
    }
  } catch {
    try {
      const text = await err.context?.clone().text();
      if (text) detail = text.slice(0, 500);
    } catch { /* ignore */ }
  }
  return detail;
}

type SyncResponse = {
  success?: boolean;
  error?: string;
  details?: string;
  hint?: string;
  errors?: string[];
};

export interface BillingBudget {
  id: string;
  budget_name: string;
  budget_amount: number;
  budget_currency: string;
  cost_amount: number;
  usage_pct: number | null;
  period_start: string | null;
  period_end: string | null;
  last_fetched_at: string;
}

export interface UseGoogleBillingCache {
  budgets: BillingBudget[];
  isLoading: boolean;
  isSyncing: boolean;
  lastFetchedAt: string | null;
  error: string | null;
  refetch: () => Promise<void>;
}

function mapRow(raw: Record<string, unknown>): BillingBudget {
  return {
    id: String(raw.id),
    budget_name: String(raw.budget_name),
    budget_amount: Number(raw.budget_amount ?? 0),
    budget_currency: String(raw.budget_currency ?? "EUR"),
    cost_amount: Number(raw.cost_amount ?? 0),
    usage_pct: raw.usage_pct == null ? null : Number(raw.usage_pct),
    period_start: raw.period_start == null ? null : String(raw.period_start),
    period_end: raw.period_end == null ? null : String(raw.period_end),
    last_fetched_at: String(raw.last_fetched_at),
  };
}

async function loadFromCache(): Promise<BillingBudget[]> {
  const { data, error } = await supabase
    .from("google_billing_cache")
    .select(
      "id, budget_name, budget_amount, budget_currency, cost_amount, usage_pct, period_start, period_end, last_fetched_at",
    )
    .order("budget_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export function useGoogleBillingCache(): UseGoogleBillingCache {
  const [budgets, setBudgets] = useState<BillingBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readCache = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await loadFromCache();
      setBudgets(rows);
      const latest = rows.reduce<string | null>((acc, r) => {
        if (!acc || r.last_fetched_at > acc) return r.last_fetched_at;
        return acc;
      }, null);
      setLastFetchedAt(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture du cache impossible.");
      setBudgets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void readCache();
  }, [readCache]);

  const refetch = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sync-google-billing", {
        method: "POST",
        body: {},
      });

      if (fnError) {
        throw new Error(await parseInvokeError(fnError));
      }

      const payload = (data ?? null) as SyncResponse | null;
      if (payload?.success === false) {
        const parts = [payload.details ?? payload.error, payload.hint].filter(Boolean);
        throw new Error(parts.join(" — ") || "Synchronisation échouée.");
      }
      if (payload?.error) {
        throw new Error(payload.details ?? payload.error);
      }

      await readCache();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synchronisation impossible.");
    } finally {
      setIsSyncing(false);
    }
  }, [readCache]);

  return {
    budgets,
    isLoading,
    isSyncing,
    lastFetchedAt,
    error,
    refetch,
  };
}
