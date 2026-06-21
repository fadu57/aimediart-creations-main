export type CommercialKind = "standard" | "partner_showcase" | "sponsoring" | "internal_test";

export const COMMERCIAL_KIND_OPTIONS: { value: CommercialKind; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "partner_showcase", label: "Partenaire vitrine" },
  { value: "sponsoring", label: "Sponsoring AIMediArt" },
  { value: "internal_test", label: "Organisation test" },
];

export type CommercialPlanCode = "ATELIER" | "HORIZON" | "RAYONNEMENT";

export const COMMERCIAL_PLAN_OPTIONS: { value: CommercialPlanCode; label: string }[] = [
  { value: "ATELIER", label: "Atelier" },
  { value: "HORIZON", label: "Horizon" },
  { value: "RAYONNEMENT", label: "Rayonnement" },
];

export type AgencyCommercialPreset = {
  commercial_kind: CommercialKind | null;
  commercial_plan_code: CommercialPlanCode | null;
  discount_percent: number | null;
  discount_amount_eur: number | null;
  sponsor_valid_until: string | null;
  commercial_notes: string | null;
};

export type SubscriptionCommercialTerms = {
  list_price_eur: number | null;
  discount_percent: number | null;
  discount_amount_eur: number | null;
  net_price_eur: number | null;
  commercial_kind: CommercialKind | null;
  sponsor_valid_until: string | null;
};

export function commercialPlanLabel(planCode: CommercialPlanCode | null | undefined): string | null {
  return COMMERCIAL_PLAN_OPTIONS.find((option) => option.value === planCode)?.label ?? null;
}

export function commercialPlanAppliesToPreset(
  preset: AgencyCommercialPreset | null | undefined,
  planCode: string | null | undefined,
): boolean {
  if (!preset) return false;
  const target = preset.commercial_plan_code?.trim().toUpperCase();
  if (!target) return true;
  return target === (planCode ?? "").trim().toUpperCase();
}

export function resolveAgencyCommercialPresetForPlan(
  preset: AgencyCommercialPreset | null | undefined,
  planCode: string | null | undefined,
): AgencyCommercialPreset | null {
  if (!preset || !commercialPlanAppliesToPreset(preset, planCode)) return null;
  return preset;
}

export function computeNetPriceEur(
  listPrice: number | null | undefined,
  discountPercent: number | null | undefined,
  discountAmountEur: number | null | undefined,
): number | null {
  if (listPrice == null || Number.isNaN(listPrice)) return null;
  const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const fixed = Math.max(0, Number(discountAmountEur) || 0);
  return Math.max(0, Math.round((listPrice * (1 - pct / 100) - fixed) * 100) / 100);
}

export function commercialKindLabel(kind: CommercialKind | null | undefined): string | null {
  switch (kind) {
    case "partner_showcase":
      return "Partenaire vitrine";
    case "sponsoring":
      return "Sponsoring AIMediArt";
    case "internal_test":
      return "Organisation test";
    case "standard":
    default:
      return null;
  }
}

export function hasCommercialDiscount(terms: SubscriptionCommercialTerms | null | undefined): boolean {
  if (!terms) return false;
  const pct = Number(terms.discount_percent) || 0;
  const fixed = Number(terms.discount_amount_eur) || 0;
  return pct > 0 || fixed > 0;
}

/** Remise preset enregistrée sur la fiche organisation (agencies). */
export function hasAgencyPresetDiscount(agency: {
  discount_percent?: number | null;
  discount_amount_eur?: number | null;
} | null | undefined): boolean {
  if (!agency) return false;
  const pct = Number(agency.discount_percent) || 0;
  const fixed = Number(agency.discount_amount_eur) || 0;
  return pct > 0 || fixed > 0;
}

/** Conditions commerciales preset renseignées sur l'organisation (hors standard vide). */
export function hasGrantedCommercialTerms(agency: {
  discount_percent?: number | null;
  discount_amount_eur?: number | null;
  commercial_kind?: string | null;
  commercial_plan_code?: string | null;
} | null | undefined): boolean {
  if (!agency) return false;
  if (hasAgencyPresetDiscount(agency)) return true;
  const kind = (agency.commercial_kind ?? "").trim();
  if (kind && kind !== "standard") return true;
  return Boolean((agency.commercial_plan_code ?? "").trim());
}

export type CommercialDiscountDriver = "percent" | "eur";

export function parseCommercialDiscountInput(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatCommercialDiscountInput(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

/** Affichage champ remise € : toujours 2 décimales. */
export function formatCommercialDiscountEurInput(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** Montant € TTC équivalent à une remise en %. */
export function computeDiscountEurFromPercent(
  listPrice: number,
  discountPercent: number,
): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  return Math.round(listPrice * (pct / 100) * 100) / 100;
}

/** Remise en % équivalente à un montant € TTC sur le tarif catalogue. */
export function computeDiscountPercentFromEur(listPrice: number, discountAmountEur: number): number {
  if (listPrice <= 0) return 0;
  const eur = Math.max(0, discountAmountEur);
  return Math.min(100, Math.round((eur / listPrice) * 10000) / 100);
}

/**
 * Affichage formulaire : complète le champ dérivé quand un seul type de remise est renseigné en base.
 */
export function syncCommercialDiscountDisplayValues(
  values: Record<string, string>,
  listPrice: number | null | undefined,
): Record<string, string> {
  if (listPrice == null || listPrice <= 0) return values;
  const pct = parseCommercialDiscountInput(values.discount_percent);
  const eur = parseCommercialDiscountInput(values.discount_amount_eur);
  if (pct != null && pct > 0 && (eur == null || eur === 0)) {
    return {
      ...values,
      discount_amount_eur: formatCommercialDiscountEurInput(computeDiscountEurFromPercent(listPrice, pct)),
    };
  }
  if (eur != null && eur > 0 && (pct == null || pct === 0)) {
    return {
      ...values,
      discount_amount_eur: formatCommercialDiscountEurInput(eur),
      discount_percent: formatCommercialDiscountInput(computeDiscountPercentFromEur(listPrice, eur)),
    };
  }
  return values;
}

/**
 * Persistance : une seule remise active (% ou €) pour éviter le double comptage SQL.
 * Si les deux champs ont été saisis manuellement (legacy), les deux sont conservés.
 */
export function resolveCommercialDiscountForSave(
  values: Record<string, string>,
  driver: CommercialDiscountDriver | null,
): { discount_percent: number; discount_amount_eur: number } {
  const pct = parseCommercialDiscountInput(values.discount_percent) ?? 0;
  const eur = parseCommercialDiscountInput(values.discount_amount_eur) ?? 0;
  if (driver === "percent") {
    return { discount_percent: pct, discount_amount_eur: 0 };
  }
  if (driver === "eur") {
    return { discount_percent: 0, discount_amount_eur: eur };
  }
  return { discount_percent: pct, discount_amount_eur: eur };
}

export function resolveListPriceForBilling(
  pricing: {
    pricing_monthly_ttc_eur?: number | null;
    pricing_annual_remis?: number | null;
    pricing_annuel?: number | null;
  } | null,
  billingCycle: "monthly" | "annual",
  planCode: string,
): number | null {
  if (planCode === "ETINCELLE") return 0;
  const monthly = pricing?.pricing_monthly_ttc_eur ?? null;
  if (billingCycle === "annual") {
    return pricing?.pricing_annual_remis ?? pricing?.pricing_annuel ?? (monthly != null ? monthly * 12 : null);
  }
  return monthly;
}

export function previewCommercialTerms(
  listPrice: number | null,
  preset: AgencyCommercialPreset | null | undefined,
): SubscriptionCommercialTerms {
  const discount_percent = preset?.discount_percent ?? 0;
  const discount_amount_eur = preset?.discount_amount_eur ?? 0;
  return {
    list_price_eur: listPrice,
    discount_percent,
    discount_amount_eur,
    net_price_eur: computeNetPriceEur(listPrice, discount_percent, discount_amount_eur),
    commercial_kind: preset?.commercial_kind ?? "standard",
    sponsor_valid_until: preset?.sponsor_valid_until ?? null,
  };
}
