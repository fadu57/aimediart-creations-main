import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CursorProviderMetadata = {
  plan?: string;
  amount_usd?: number;
  billing_day?: number;
  currency?: string;
  cost_mode?: string;
};

export type CursorMonthlyPeriod = {
  periodStart: string;
  periodEnd: string;
  periodStartIso: string;
  periodEndIso: string;
  periodLabel: string;
};

export type SyncCursorCostsResult =
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

/** Premier / dernier jour du mois UTC courant. */
export function currentMonthPeriodUtc(now = new Date()): CursorMonthlyPeriod {
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

export function cursorMonthlyImportHash(periodLabel: string): string {
  return `cursor_fixed_monthly:${periodLabel}`;
}

export async function syncCursorMonthlyCosts(
  admin: SupabaseClient,
): Promise<SyncCursorCostsResult> {
  const { data: providerRow, error: providerErr } = await admin
    .from("cost_providers")
    .select("provider_key, status, metadata")
    .eq("provider_key", "cursor")
    .maybeSingle();

  if (providerErr) {
    throw new Error(`Lecture cost_providers cursor impossible: ${providerErr.message}`);
  }
  if (!providerRow) {
    return { status: "skipped", message: "Fournisseur cursor introuvable." };
  }

  if (providerRow.status !== "active") {
    return {
      status: "skipped",
      message: `Fournisseur cursor inactif (status=${providerRow.status}).`,
    };
  }

  const meta = (providerRow.metadata ?? {}) as CursorProviderMetadata;
  const amountUsd = Number(meta.amount_usd ?? 0);
  const plan = typeof meta.plan === "string" ? meta.plan : "Pro+";
  const currency = typeof meta.currency === "string" ? meta.currency.toUpperCase() : "USD";

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { status: "skipped", message: "metadata.amount_usd invalide ou absent." };
  }

  const period = currentMonthPeriodUtc();

  const { data: existing, error: existingErr } = await admin
    .from("ai_usage_events")
    .select("id")
    .eq("provider", "cursor")
    .eq("source", "fixed_monthly")
    .gte("created_at", period.periodStartIso)
    .lte("created_at", period.periodEndIso)
    .limit(1);

  if (existingErr) {
    throw new Error(`Vérification idempotence cursor impossible: ${existingErr.message}`);
  }
  if (existing?.length) {
    return {
      status: "already_synced",
      message: "already synced",
      period: period.periodLabel,
    };
  }

  const importHash = cursorMonthlyImportHash(period.periodLabel);

  const { data: inserted, error: insertErr } = await admin
    .from("ai_usage_events")
    .insert({
      import_hash: importHash,
      created_at: period.periodStartIso,
      tool_type: "ide",
      provider: "cursor",
      api_name: "cursor_subscription",
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
    throw new Error(`Insertion ai_usage_events cursor impossible: ${insertErr.message}`);
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("cost_providers")
    .update({
      last_synced_at: now,
      last_sync_status: "success",
      last_sync_error: null,
    })
    .eq("provider_key", "cursor");

  if (updateErr) {
    throw new Error(`Mise à jour cost_providers cursor impossible: ${updateErr.message}`);
  }

  return {
    status: "success",
    message: `Coût Cursor ${plan} enregistré pour ${period.periodLabel}.`,
    period: period.periodLabel,
    amount: amountUsd,
    currency,
    id: (inserted as { id: string }).id,
  };
}
