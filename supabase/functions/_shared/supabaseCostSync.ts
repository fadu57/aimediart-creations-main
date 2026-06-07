import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type SupabaseProviderMetadata = {
  plan?: string;
  amount_usd?: number;
  billing_day?: number;
  currency?: string;
  cost_mode?: string;
  project_ref?: string;
};

export type SupabaseMonthlyPeriod = {
  periodStart: string;
  periodEnd: string;
  periodStartIso: string;
  periodEndIso: string;
  periodLabel: string;
};

export type SyncSupabaseCostsResult =
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

export function currentMonthPeriodUtc(now = new Date()): SupabaseMonthlyPeriod {
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

export function supabaseMonthlyImportHash(periodLabel: string): string {
  return `supabase_fixed_monthly:${periodLabel}`;
}

export async function syncSupabaseMonthlyCosts(
  admin: SupabaseClient,
): Promise<SyncSupabaseCostsResult> {
  const { data: providerRow, error: providerErr } = await admin
    .from("cost_providers")
    .select("provider_key, status, metadata")
    .eq("provider_key", "supabase")
    .maybeSingle();

  if (providerErr) {
    throw new Error(`Lecture cost_providers supabase impossible: ${providerErr.message}`);
  }
  if (!providerRow) {
    return { status: "skipped", message: "Fournisseur supabase introuvable." };
  }

  if (providerRow.status !== "active") {
    return {
      status: "skipped",
      message: `Fournisseur supabase inactif (status=${providerRow.status}).`,
    };
  }

  const meta = (providerRow.metadata ?? {}) as SupabaseProviderMetadata;
  const amountUsd = Number(meta.amount_usd ?? 0);
  const plan = typeof meta.plan === "string" ? meta.plan : "Free";
  const currency = typeof meta.currency === "string" ? meta.currency.toUpperCase() : "USD";

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return {
      status: "skipped",
      message: `Plan ${plan} : aucun coût mensuel à enregistrer (0 $).`,
    };
  }

  const period = currentMonthPeriodUtc();
  const importHash = supabaseMonthlyImportHash(period.periodLabel);

  const { data: existing, error: existingErr } = await admin
    .from("ai_usage_events")
    .select("id")
    .eq("import_hash", importHash)
    .limit(1);

  if (existingErr) {
    throw new Error(`Vérification idempotence supabase impossible: ${existingErr.message}`);
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
      provider: "supabase",
      api_name: "supabase_subscription",
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
        project_ref: meta.project_ref ?? null,
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
    throw new Error(`Insertion ai_usage_events supabase impossible: ${insertErr.message}`);
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("cost_providers")
    .update({
      last_synced_at: now,
      last_sync_status: "success",
      last_sync_error: null,
    })
    .eq("provider_key", "supabase");

  if (updateErr) {
    throw new Error(`Mise à jour cost_providers supabase impossible: ${updateErr.message}`);
  }

  return {
    status: "success",
    message: "Coût mensuel Supabase enregistré.",
    period: period.periodLabel,
    amount: amountUsd,
    currency,
    id: inserted.id as string,
  };
}
