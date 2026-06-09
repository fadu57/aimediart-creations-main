/**
 * Cloud Billing Budget API — liste budgets + parsing pour google_billing_cache.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { getGoogleAccessToken, parseServiceAccountJson } from "./googleAuth.ts";

const BILLING_SCOPE = "https://www.googleapis.com/auth/cloud-billing";
const DEFAULT_BILLING_ACCOUNT = "01EC18-4C4AFF-602C34";
const BUDGETS_API = "https://billingbudgets.googleapis.com/v1";

export type ParsedGoogleBudget = {
  budget_name: string;
  budget_id: string;
  billing_account: string;
  budget_amount: number;
  budget_currency: string;
  cost_amount: number;
  cost_currency: string;
  usage_pct: number | null;
  period_start: string | null;
  period_end: string | null;
  raw_data: Record<string, unknown>;
};

type GoogleMoney = {
  currencyCode?: string;
  units?: string;
  nanos?: number;
};

function parseMoney(m: GoogleMoney | null | undefined): { amount: number; currency: string } {
  if (!m) return { amount: 0, currency: "EUR" };
  const units = Number(m.units ?? 0);
  const nanos = Number(m.nanos ?? 0) / 1e9;
  const amount = units + nanos;
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    currency: (m.currencyCode ?? "EUR").trim() || "EUR",
  };
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Période calendaire courante selon budgetFilter.calendarPeriod. */
function calendarPeriodBounds(calendarPeriod: string | undefined): {
  period_start: string | null;
  period_end: string | null;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (calendarPeriod === "YEAR") {
    return {
      period_start: `${y}-01-01`,
      period_end: `${y}-12-31`,
    };
  }
  if (calendarPeriod === "QUARTER") {
    const qStart = Math.floor(m / 3) * 3;
    const start = new Date(y, qStart, 1);
    const end = new Date(y, qStart + 3, 0);
    return { period_start: isoDateLocal(start), period_end: isoDateLocal(end) };
  }
  // MONTH (défaut GCP)
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { period_start: isoDateLocal(start), period_end: isoDateLocal(end) };
}

function extractSpend(budget: Record<string, unknown>): GoogleMoney | null {
  const status = budget.budgetStatus as Record<string, unknown> | undefined;
  if (status) {
    const current = status.currentSpend as GoogleMoney | undefined;
    if (current && (current.units != null || current.nanos != null)) return current;
    const forecast = status.forecastedSpend as GoogleMoney | undefined;
    if (forecast && (forecast.units != null || forecast.nanos != null)) return forecast;
  }
  const legacy = budget.currentSpend as GoogleMoney | undefined;
  if (legacy && (legacy.units != null || legacy.nanos != null)) return legacy;
  return null;
}

export function parseBudgetRow(
  budget: Record<string, unknown>,
  billingAccountId: string,
): ParsedGoogleBudget {
  const name = String(budget.name ?? "");
  const budgetId = name || String(budget.budget_id ?? "");
  const displayName = String(budget.displayName ?? budgetId);

  const amountWrap = budget.amount as Record<string, unknown> | undefined;
  const specified = amountWrap?.specifiedAmount as GoogleMoney | undefined;
  const budgetMoney = parseMoney(specified);

  const spendMoney = parseMoney(extractSpend(budget));

  const filter = budget.budgetFilter as Record<string, unknown> | undefined;
  const calendarPeriod = filter?.calendarPeriod as string | undefined;
  const { period_start, period_end } = calendarPeriodBounds(calendarPeriod);

  const usage_pct = budgetMoney.amount > 0
    ? Math.round((spendMoney.amount / budgetMoney.amount) * 10000) / 100
    : null;

  return {
    budget_name: displayName,
    budget_id: budgetId,
    billing_account: billingAccountId,
    budget_amount: budgetMoney.amount,
    budget_currency: budgetMoney.currency,
    cost_amount: spendMoney.amount,
    cost_currency: spendMoney.currency || budgetMoney.currency,
    usage_pct,
    period_start,
    period_end,
    raw_data: budget,
  };
}

async function fetchAllBudgets(
  accessToken: string,
  billingAccountId: string,
  signal: AbortSignal,
  serviceAccountEmail?: string,
): Promise<Record<string, unknown>[]> {
  const parent = `billingAccounts/${billingAccountId}`;
  const all: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BUDGETS_API}/${parent}/budgets`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("pageSize", "100");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = `Budget API ${res.status}: ${body.slice(0, 400)}`;
      if (res.status === 403 && serviceAccountEmail) {
        msg += ` — compte de service appelant : ${serviceAccountEmail}`;
      }
      throw new Error(msg);
    }

    const json = await res.json() as {
      budgets?: Record<string, unknown>[];
      nextPageToken?: string;
    };
    all.push(...(json.budgets ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return all;
}

export async function syncGoogleBillingBudgets(
  admin: SupabaseClient,
  options: { billingAccountId?: string; serviceAccountJson: string },
): Promise<{ budgets: ParsedGoogleBudget[]; errors: string[] }> {
  const billingAccountId = options.billingAccountId?.trim()
    || Deno.env.get("GOOGLE_BILLING_ACCOUNT_ID")?.trim()
    || DEFAULT_BILLING_ACCOUNT;

  const sa = parseServiceAccountJson(options.serviceAccountJson);
  if (!sa) throw new Error("GOOGLE_BILLING_SERVICE_ACCOUNT_JSON invalide.");

  const signal = AbortSignal.timeout(30_000);
  const accessToken = await getGoogleAccessToken(sa, BILLING_SCOPE);
  const rawBudgets = await fetchAllBudgets(
    accessToken,
    billingAccountId,
    signal,
    sa.client_email,
  );

  const budgets: ParsedGoogleBudget[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const raw of rawBudgets) {
    try {
      const parsed = parseBudgetRow(raw, billingAccountId);
      const { error } = await admin.from("google_billing_cache").upsert(
        {
          budget_name: parsed.budget_name,
          budget_id: parsed.budget_id,
          billing_account: parsed.billing_account,
          budget_amount: parsed.budget_amount,
          budget_currency: parsed.budget_currency,
          cost_amount: parsed.cost_amount,
          cost_currency: parsed.cost_currency,
          usage_pct: parsed.usage_pct,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          last_fetched_at: now,
          raw_data: parsed.raw_data,
          updated_at: now,
        },
        { onConflict: "budget_id" },
      );

      if (error) {
        errors.push(`${parsed.budget_name}: ${error.message}`);
        console.warn("[sync-google-billing] upsert failed:", parsed.budget_id, error.message);
      } else {
        budgets.push(parsed);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      console.warn("[sync-google-billing] budget parse/sync error:", msg);
    }
  }

  return { budgets, errors };
}
