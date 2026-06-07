import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type VercelProviderMetadata = {
  plan?: string;
  amount_usd?: number;
  billing_day?: number;
  currency?: string;
  cost_mode?: string;
};

export type VercelMonthlyPeriod = {
  periodStart: string;
  periodEnd: string;
  periodStartIso: string;
  periodEndIso: string;
  periodLabel: string;
};

export type SyncVercelCostsResult =
  | { status: "skipped"; message: string }
  | { status: "already_synced"; message: string; period: string }
  | {
    status: "success";
    message: string;
    period: string;
    amount: number;
    currency: string;
    id: string;
  };

export function currentMonthPeriodUtc(now = new Date()): VercelMonthlyPeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  const periodStart = `${y}-${mm}-01`;
  const periodEnd = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return {
    periodStart,
    periodEnd,
    periodStartIso: `${periodStart}T00:00:00.000Z`,
    periodEndIso: `${periodEnd}T23:59:59.999Z`,
    periodLabel: `${y}-${mm}`,
  };
}

export function vercelMonthlyImportHash(periodLabel: string): string {
  return `vercel_fixed_monthly:${periodLabel}`;
}

export async function syncVercelMonthlyCosts(
  admin: SupabaseClient,
): Promise<SyncVercelCostsResult> {
  const { data: providerRow, error: providerErr } = await admin
    .from("cost_providers")
    .select("provider_key, status, metadata")
    .eq("provider_key", "vercel")
    .maybeSingle();

  if (providerErr) {
    throw new Error(`Lecture cost_providers vercel impossible: ${providerErr.message}`);
  }
  if (!providerRow) {
    return { status: "skipped", message: "Fournisseur vercel introuvable." };
  }

  if (providerRow.status !== "active") {
    return {
      status: "skipped",
      message: `Fournisseur vercel inactif (status=${providerRow.status}).`,
    };
  }

  const meta = (providerRow.metadata ?? {}) as VercelProviderMetadata;
  const amountUsd = Number(meta.amount_usd ?? 0);
  const plan = typeof meta.plan === "string" ? meta.plan : "Hobby";
  const currency = typeof meta.currency === "string" ? meta.currency.toUpperCase() : "USD";

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return {
      status: "skipped",
      message: `Plan ${plan} : aucun coût mensuel à enregistrer (0 $).`,
    };
  }

  const period = currentMonthPeriodUtc();
  const importHash = vercelMonthlyImportHash(period.periodLabel);

  const { data: existing, error: existingErr } = await admin
    .from("ai_usage_events")
    .select("id")
    .eq("import_hash", importHash)
    .limit(1);

  if (existingErr) {
    throw new Error(`Vérification idempotence vercel impossible: ${existingErr.message}`);
  }
  if (existing?.length) {
    return {
      status: "already_synced",
      message: "already synced",
      period: period.periodLabel,
    };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("ai_usage_events")
    .insert({
      import_hash: importHash,
      created_at: period.periodStartIso,
      tool_type: "infrastructure",
      provider: "vercel",
      api_name: "vercel_subscription",
      model_name: plan,
      operation_name: "monthly_subscription",
      cost_estimated: amountUsd,
      currency,
      status: "success",
      source: "fixed_monthly",
      metadata: {
        period_start: period.periodStart,
        period_end: period.periodEnd,
        plan,
        cost_mode: meta.cost_mode ?? "fixed_monthly",
      },
    })
    .select("id")
    .single();

  if (insertErr) {
    if (/duplicate|unique|23505/i.test(insertErr.message)) {
      return {
        status: "already_synced",
        message: "already synced",
        period: period.periodLabel,
      };
    }
    throw new Error(`Insertion ai_usage_events vercel impossible: ${insertErr.message}`);
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("cost_providers")
    .update({
      last_synced_at: now,
      last_sync_status: "success",
      last_sync_error: null,
    })
    .eq("provider_key", "vercel");

  if (updateErr) {
    throw new Error(`Mise à jour cost_providers vercel impossible: ${updateErr.message}`);
  }

  return {
    status: "success",
    message: "Coût mensuel Vercel enregistré.",
    period: period.periodLabel,
    amount: amountUsd,
    currency,
    id: inserted.id as string,
  };
}
