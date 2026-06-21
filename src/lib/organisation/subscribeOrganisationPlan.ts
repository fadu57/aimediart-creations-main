import type { AgencyCommercialPreset } from "@/lib/organisation/commercialTerms";
import { supabase } from "@/lib/supabase";

export type SubscribePlanCode = "ETINCELLE" | "ATELIER" | "HORIZON";
export type SubscribeBillingCycle = "monthly" | "annual";

export type SubscribeOrganisationPlanResult = {
  subscription_id: string;
  organisation_id: string;
  plan_code: SubscribePlanCode;
  billing_cycle: SubscribeBillingCycle;
  status: string;
  list_price_eur: number | null;
  discount_percent: number | null;
  discount_amount_eur: number | null;
  net_price_eur: number | null;
  commercial_kind: string | null;
  started_at: string | null;
  trial_ends_at: string | null;
  next_renewal_at: string | null;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Connectez-vous pour souscrire un abonnement.",
  organisation_admin_required:
    "Seul l'administrateur organisation (rôle 4) peut souscrire pour cette structure.",
  organisation_not_found: "Organisation introuvable.",
  forbidden: "Vous n'avez pas les droits pour souscrire pour cette organisation.",
  subscription_already_active: "Un abonnement actif existe déjà pour ce plan.",
  subscription_change_not_allowed:
    "Changement de plan non autorisé. Passez d'abord par Étincelle ou contactez AIMediArt.",
  plan_not_found: "Plan tarifaire introuvable.",
  plan_not_self_service: "Ce plan nécessite un devis — contactez AIMediArt.",
  plan_quote_only: "Ce plan est sur devis uniquement.",
};

function mapRpcError(message: string | undefined): string {
  const raw = (message ?? "").trim();
  for (const [code, label] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (raw.includes(code)) return label;
  }
  return raw || "Souscription impossible.";
}

export async function subscribeOrganisationPlan(input: {
  planCode: SubscribePlanCode;
  billingCycle?: SubscribeBillingCycle;
  organisationId?: string | null;
}): Promise<{ data: SubscribeOrganisationPlanResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc("subscribe_organisation_plan", {
    p_plan_code: input.planCode,
    p_billing_cycle: input.billingCycle ?? "monthly",
    p_organisation_id: input.organisationId?.trim() || null,
  });

  if (error) {
    return { data: null, error: mapRpcError(error.message) };
  }

  if (!data || typeof data !== "object") {
    return { data: null, error: "Réponse de souscription invalide." };
  }

  const row = data as Record<string, unknown>;
  return {
    data: {
      subscription_id: String(row.subscription_id ?? ""),
      organisation_id: String(row.organisation_id ?? ""),
      plan_code: String(row.plan_code ?? input.planCode) as SubscribePlanCode,
      billing_cycle: (row.billing_cycle === "annual" ? "annual" : "monthly") as SubscribeBillingCycle,
      status: String(row.status ?? ""),
      list_price_eur: row.list_price_eur != null ? Number(row.list_price_eur) : null,
      discount_percent: row.discount_percent != null ? Number(row.discount_percent) : null,
      discount_amount_eur: row.discount_amount_eur != null ? Number(row.discount_amount_eur) : null,
      net_price_eur: row.net_price_eur != null ? Number(row.net_price_eur) : null,
      commercial_kind: row.commercial_kind != null ? String(row.commercial_kind) : null,
      started_at: row.started_at != null ? String(row.started_at) : null,
      trial_ends_at: row.trial_ends_at != null ? String(row.trial_ends_at) : null,
      next_renewal_at: row.next_renewal_at != null ? String(row.next_renewal_at) : null,
    },
    error: null,
  };
}

export async function fetchAgencyCommercialPreset(
  agencyId: string | null | undefined,
): Promise<AgencyCommercialPreset | null> {
  const id = agencyId?.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("agencies")
    .select(
      "commercial_kind, commercial_plan_code, discount_percent, discount_amount_eur, sponsor_valid_until, commercial_notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    commercial_kind?: string | null;
    commercial_plan_code?: string | null;
    discount_percent?: number | null;
    discount_amount_eur?: number | null;
    sponsor_valid_until?: string | null;
    commercial_notes?: string | null;
  };

  const planCode = row.commercial_plan_code?.trim().toUpperCase();
  const commercial_plan_code =
    planCode === "ATELIER" || planCode === "HORIZON" || planCode === "RAYONNEMENT"
      ? planCode
      : null;

  return {
    commercial_kind: (row.commercial_kind as AgencyCommercialPreset["commercial_kind"]) ?? "standard",
    commercial_plan_code,
    discount_percent: row.discount_percent ?? 0,
    discount_amount_eur: row.discount_amount_eur ?? 0,
    sponsor_valid_until: row.sponsor_valid_until ?? null,
    commercial_notes: row.commercial_notes ?? null,
  };
}
