import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { SponsoringConventionPlaceholders } from "./sponsoringConventionDocx.ts";

const LEGAL_REP_ROLE_LABELS: Record<string, string> = {
  gerant: "Gérant(e)",
  president: "Président(e)",
  president_dg: "Président(e)-Directeur(trice) général(e)",
  president_ca: "Président(e) du conseil d'administration",
  directeur_general: "Directeur(trice) Général(e)",
  maire: "Maire",
  president_conseil_departemental: "Président(e) du Conseil départemental",
  president_conseil_regional: "Président(e) du Conseil régional",
  dgs: "Directeur(trice) Général(e) des Services (DGS)",
  directeur: "Directeur(trice)",
};

const PLAN_LABELS: Record<string, string> = {
  ATELIER: "Atelier",
  HORIZON: "Horizon",
  RAYONNEMENT: "Rayonnement",
};

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatAmountFr(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSiretDisplay(digits: string | null | undefined): string {
  const d = (digits ?? "").replace(/\D/g, "").slice(0, 14);
  if (!d) return "—";
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean).join(" ");
}

function resolveSubscriptionEndDate(
  row: {
    started_at?: string | null;
    trial_ends_at?: string | null;
    ends_at?: string | null;
    next_renewal_at?: string | null;
    plan_code?: string | null;
  },
): string | null {
  const plan = (row.plan_code ?? "").toUpperCase();
  if (plan.includes("ETINCELLE")) {
    return row.trial_ends_at ?? row.ends_at ?? null;
  }
  return row.next_renewal_at ?? row.ends_at ?? row.trial_ends_at ?? null;
}

export function agencyHasPresetDiscount(agency: {
  discount_percent?: number | null;
  discount_amount_eur?: number | null;
} | null): boolean {
  if (!agency) return false;
  return (Number(agency.discount_percent) || 0) > 0 || (Number(agency.discount_amount_eur) || 0) > 0;
}

export async function requireOrganisationAccess(
  admin: SupabaseClient,
  userId: string,
  organisationId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: membership } = await admin
    .from("agency_users")
    .select("role_id")
    .eq("user_id", userId)
    .eq("agency_id", organisationId)
    .maybeSingle();

  if (membership?.role_id === 4) {
    return { ok: true };
  }

  const { data: authUserData } = await admin.auth.admin.getUserById(userId);
  const appRole = Number(authUserData.user?.app_metadata?.role_id ?? NaN);
  if (Number.isFinite(appRole) && appRole >= 1 && appRole <= 3) {
    return { ok: true };
  }

  return { ok: false, reason: "Accès réservé à l'administrateur de l'organisation." };
}

export async function loadSponsoringConventionPlaceholders(
  admin: SupabaseClient,
  organisationId: string,
): Promise<SponsoringConventionPlaceholders> {
  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .select(
      "name_agency, logo_agency, adresse_agency, compl_adresse_agency, zip_agency, city_agency, siret, legal_rep_firstname, legal_rep_lastname, legal_rep_role, commercial_plan_code, discount_amount_eur, discount_percent",
    )
    .eq("id", organisationId)
    .maybeSingle();

  if (agencyError) throw agencyError;
  if (!agency) throw new Error("organisation_not_found");
  if (!agencyHasPresetDiscount(agency)) throw new Error("no_commercial_discount");

  const { data: subscription } = await admin
    .from("organisation_subscriptions")
    .select("plan_code, started_at, trial_ends_at, ends_at, next_renewal_at")
    .eq("organisation_id", organisationId)
    .in("status", ["trial", "active", "standby"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const monthlyDiscount = Number(agency.discount_amount_eur) || 0;
  const annualDiscount = Math.round(monthlyDiscount * 12 * 100) / 100;
  const addressParts = [agency.adresse_agency, agency.compl_adresse_agency].filter(
    (part) => typeof part === "string" && part.trim(),
  );
  const repName = [agency.legal_rep_firstname, agency.legal_rep_lastname]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();

  const planCode = (agency.commercial_plan_code ?? subscription?.plan_code ?? "").toString().toUpperCase();

  return {
    "Nom de l'agency": agency.name_agency?.trim() || "—",
    Adresse: addressParts.join(", ") || "—",
    zipcode: agency.zip_agency?.trim() || "—",
    city: agency.city_agency?.trim() || "—",
    Numéro: formatSiretDisplay(agency.siret),
    "Nom du représentant": repName || "—",
    "Président(e), etc.":
      LEGAL_REP_ROLE_LABELS[agency.legal_rep_role != null ? String(agency.legal_rep_role) : ""] || "—",
    commercial_plan_code: PLAN_LABELS[planCode] || planCode || "—",
    "discount_amount_eur x 12": formatAmountFr(annualDiscount),
    "subscription.started_at": formatDateFr(subscription?.started_at),
    "subscription.expires_at": formatDateFr(resolveSubscriptionEndDate(subscription ?? {})),
    "Date du jour": formatDateFr(new Date().toISOString()),
  };
}
