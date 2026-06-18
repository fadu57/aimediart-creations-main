import { supabase } from "@/lib/supabase";

export type SwitchablePlanCode = "ATELIER" | "HORIZON";

export function getAlternatePlanCode(current: string | null | undefined): SwitchablePlanCode | null {
  const code = current?.trim().toUpperCase();
  if (code === "ATELIER") return "HORIZON";
  if (code === "HORIZON") return "ATELIER";
  return null;
}

export function getPlanDisplayLabel(planCode: SwitchablePlanCode): string {
  return planCode === "ATELIER" ? "Atelier" : "Horizon";
}

export async function switchOrganisationPlan(
  organisationId: string,
  subscriptionId: string,
  targetPlanCode: SwitchablePlanCode,
): Promise<{ error: string | null }> {
  const orgId = organisationId.trim();
  const subId = subscriptionId.trim();
  if (!orgId || !subId) return { error: "Organisation ou abonnement introuvable." };

  const { data: pricing, error: pricingErr } = await supabase
    .from("pricing")
    .select("pricing_id")
    .eq("plan_code", targetPlanCode)
    .eq("is_active", true)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (pricingErr) return { error: pricingErr.message };
  const pricingId = (pricing as { pricing_id?: number | null } | null)?.pricing_id;
  if (pricingId == null) return { error: `Plan ${targetPlanCode} introuvable.` };

  const { error } = await supabase
    .from("organisation_subscriptions")
    .update({ plan_code: targetPlanCode, pricing_id: pricingId })
    .eq("id", subId)
    .eq("organisation_id", orgId);

  return { error: error?.message ?? null };
}
