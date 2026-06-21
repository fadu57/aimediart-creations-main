import { useCallback, useEffect, useState } from "react";

import {
  applyEtincelleLimitDefaults,
  buildPlanLimitsSnapshot,
  type PlanLimitsSnapshot,
} from "@/lib/organisation/planLimits";
import { countAgencyArtworks } from "@/lib/organisation/countAgencyArtworks";
import { supabase } from "@/lib/supabase";

type HookState = {
  limits: PlanLimitsSnapshot | null;
  loading: boolean;
  refresh: () => void;
};

async function countAgencyVisitorsThisMonth(agencyId: string): Promise<number> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data } = await supabase
    .from("daily_stats")
    .select("visits_count")
    .eq("agency_id", agencyId)
    .gte("day", monthStart);
  let total = 0;
  for (const row of (data as Array<{ visits_count?: number | null }> | null) ?? []) {
    total += Number(row.visits_count) || 0;
  }
  return total;
}

export function useOrganisationPlanLimits(agencyId: string | null | undefined): HookState {
  const [limits, setLimits] = useState<PlanLimitsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const aid = agencyId?.trim();
    if (!aid) {
      setLimits(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [subRes, artworksUsed, visitorsThisMonth] = await Promise.all([
          supabase
            .from("organisation_subscriptions")
            .select(
              "plan_code, status, is_trial, started_at, trial_ends_at, ends_at, next_renewal_at, pricing_id",
            )
            .eq("organisation_id", aid)
            .in("status", ["trial", "active", "standby"])
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          countAgencyArtworks(aid),
          countAgencyVisitorsThisMonth(aid),
        ]);

        const subRow = subRes.data as {
          plan_code?: string | null;
          trial_ends_at?: string | null;
          ends_at?: string | null;
          started_at?: string | null;
          pricing_id?: number | null;
        } | null;

        let pricing: {
          pricing_label?: string | null;
          pricing_plan?: string | null;
          plan_code?: string | null;
          pricing_max_oeuvres?: number | null;
          pricing_max_visitors?: number | null;
          princing_max_visitors?: number | null;
          pricing_is_unlimited?: boolean | null;
          trial_duration_days?: number | null;
        } | null = null;

        if (subRow?.pricing_id != null) {
          const { data } = await supabase
            .from("pricing")
            .select(
              "pricing_label, pricing_plan, plan_code, pricing_max_oeuvres, pricing_max_visitors, princing_max_visitors, pricing_is_unlimited, trial_duration_days",
            )
            .eq("pricing_id", subRow.pricing_id)
            .maybeSingle();
          pricing = (data as typeof pricing) ?? null;
        } else if (subRow?.plan_code) {
          const { data } = await supabase
            .from("pricing")
            .select(
              "pricing_label, pricing_plan, plan_code, pricing_max_oeuvres, pricing_max_visitors, princing_max_visitors, pricing_is_unlimited, trial_duration_days",
            )
            .eq("plan_code", subRow.plan_code)
            .maybeSingle();
          pricing = (data as typeof pricing) ?? null;
        }

        let daysRemaining: number | null = null;
        const endIso = subRow?.trial_ends_at ?? subRow?.ends_at ?? null;
        if (endIso) {
          const end = new Date(endIso);
          if (!Number.isNaN(end.getTime())) {
            daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          }
        } else if (subRow?.started_at) {
          const trialDays = pricing?.trial_duration_days ?? 30;
          const start = new Date(subRow.started_at);
          if (!Number.isNaN(start.getTime())) {
            const end = new Date(start.getTime());
            end.setDate(end.getDate() + trialDays);
            daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          }
        }

        const snapshot = applyEtincelleLimitDefaults(
          buildPlanLimitsSnapshot({
            plan_code: subRow?.plan_code ?? pricing?.plan_code ?? null,
            pricing_plan: pricing?.pricing_plan ?? pricing?.pricing_label ?? null,
            pricing_label: pricing?.pricing_label ?? null,
            max_oeuvres: pricing?.pricing_max_oeuvres ?? null,
            max_visitors: pricing?.pricing_max_visitors ?? pricing?.princing_max_visitors ?? null,
            is_unlimited: pricing?.pricing_is_unlimited ?? null,
            days_remaining: daysRemaining,
            artworksUsed,
            visitorsThisMonth,
          }),
        );

        if (!cancelled) setLimits(snapshot);
      } catch {
        if (!cancelled) setLimits(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId, tick]);

  return { limits, loading, refresh };
}
