export function isEtincellePlanCode(planCode: string | null | undefined): boolean {
  const code = (planCode ?? "").trim().toUpperCase();
  return code === "ETINCELLE" || code.includes("ETINCELLE") || code.includes("ÉTINCELLE");
}

export type PlanLimitsSnapshot = {
  isEtincelle: boolean;
  maxArtworks: number | null;
  maxVisitors: number | null;
  artworksUsed: number;
  visitorsThisMonth: number;
  artworksRemaining: number | null;
  visitorsRemaining: number | null;
  canCreateArtwork: boolean;
  isArtworkQuotaReached: boolean;
  isVisitorQuotaReached: boolean;
  trialDaysRemaining: number | null;
};

export const ETINCELLE_LIMITS = {
  maxArtworks: 10,
  maxVisitors: 100,
} as const;

export const ETINCELLE_UI = {
  trialLabel: "Essai gratuit · 1 mois",
  optionalLangBlocked:
    'Votre abonnement gratuit "Etincelle" ne permet pas plus d\'une langue de médiation',
  audioBlocked: 'Votre abonnement gratuit "Etincelle" ne permet pas la génération de l\'audio',
  expoLimitBlocked:
    'Votre abonnement gratuit "Etincelle" ne permet pas de créer une autre exposition (1 exposition incluse).',
} as const;

export function subscriptionIsEtincellePlan(input: {
  plan_code?: string | null;
  pricing_plan?: string | null;
  pricing_label?: string | null;
} | null | undefined): boolean {
  if (!input) return false;
  return (
    isEtincellePlanCode(input.plan_code) ||
    isEtincellePlanCode(input.pricing_plan) ||
    isEtincellePlanCode(input.pricing_label)
  );
}

export function computeRemaining(used: number, max: number | null | undefined): number | null {
  if (max == null || Number.isNaN(max)) return null;
  return Math.max(0, max - used);
}

export function buildPlanLimitsSnapshot(input: {
  plan_code?: string | null;
  pricing_plan?: string | null;
  pricing_label?: string | null;
  max_oeuvres?: number | null;
  max_visitors?: number | null;
  is_unlimited?: boolean | null;
  days_remaining?: number | null;
  artworksUsed: number;
  visitorsThisMonth: number;
}): PlanLimitsSnapshot {
  const isEtincelle = subscriptionIsEtincellePlan(input);
  const maxArtworks = input.max_oeuvres ?? null;
  const maxVisitors = input.max_visitors ?? null;
  const artworksRemaining = computeRemaining(input.artworksUsed, maxArtworks);
  const visitorsRemaining = computeRemaining(input.visitorsThisMonth, maxVisitors);
  const isArtworkQuotaReached =
    isEtincelle && maxArtworks != null && input.artworksUsed >= maxArtworks;
  const isVisitorQuotaReached =
    isEtincelle && maxVisitors != null && input.visitorsThisMonth >= maxVisitors;

  return {
    isEtincelle,
    maxArtworks,
    maxVisitors,
    artworksUsed: input.artworksUsed,
    visitorsThisMonth: input.visitorsThisMonth,
    artworksRemaining,
    visitorsRemaining,
    canCreateArtwork: !isArtworkQuotaReached,
    isArtworkQuotaReached,
    isVisitorQuotaReached,
    trialDaysRemaining: isEtincelle ? input.days_remaining ?? null : null,
  };
}

export function applyEtincelleLimitDefaults(snapshot: PlanLimitsSnapshot): PlanLimitsSnapshot {
  if (!snapshot.isEtincelle) return snapshot;
  const maxArtworks = snapshot.maxArtworks ?? ETINCELLE_LIMITS.maxArtworks;
  const maxVisitors = snapshot.maxVisitors ?? ETINCELLE_LIMITS.maxVisitors;
  return {
    ...snapshot,
    maxArtworks,
    maxVisitors,
    artworksRemaining: computeRemaining(snapshot.artworksUsed, maxArtworks),
    visitorsRemaining: computeRemaining(snapshot.visitorsThisMonth, maxVisitors),
    canCreateArtwork: snapshot.artworksUsed < maxArtworks,
    isArtworkQuotaReached: snapshot.artworksUsed >= maxArtworks,
    isVisitorQuotaReached: snapshot.visitorsThisMonth >= maxVisitors,
  };
}

export type UpgradePlanCode = "ATELIER" | "HORIZON";

export type SubscribePlanCode = "ETINCELLE" | UpgradePlanCode;

export function normalizeUpgradePlanCode(raw: string | null | undefined): UpgradePlanCode | null {
  const code = (raw ?? "").trim().toUpperCase();
  if (code === "ATELIER" || code === "HORIZON") return code;
  return null;
}

export function normalizeSubscribePlanCode(raw: string | null | undefined): SubscribePlanCode | null {
  const code = (raw ?? "").trim().toUpperCase();
  if (code === "ETINCELLE" || code === "ATELIER" || code === "HORIZON") return code;
  return null;
}

export function subscribePlanHref(plan: SubscribePlanCode): string {
  return `/organisation/engagement?plan=${plan}`;
}

export function subscribePlanDisplayName(plan: SubscribePlanCode): string {
  if (plan === "ETINCELLE") return "Étincelle";
  return upgradePlanDisplayName(plan);
}

export type SubscribeButtonSpec = {
  plan: SubscribePlanCode;
  label: string;
  variant: "primary" | "outline";
};

/** Boutons de souscription filtrés selon le plan commercial accordé. */
export function resolveGrantedPlanSubscribeButtons(
  commercialPlanCode: string | null | undefined,
  hasGrantedTerms: boolean,
  inCommercialTermsBlock = false,
): SubscribeButtonSpec[] {
  const defaultButtons: SubscribeButtonSpec[] = [
    { plan: "ETINCELLE", label: "Activer l'essai Étincelle", variant: "primary" },
    { plan: "ATELIER", label: "Souscrire Atelier", variant: "outline" },
    { plan: "HORIZON", label: "Souscrire Horizon", variant: "outline" },
  ];
  if (!hasGrantedTerms) return defaultButtons;

  const granted = (commercialPlanCode ?? "").trim().toUpperCase();
  if (!granted) return inCommercialTermsBlock ? [] : defaultButtons;

  if (granted === "ATELIER") {
    return [{ plan: "ATELIER", label: "Souscrire Atelier", variant: "primary" }];
  }
  if (granted === "HORIZON") {
    return [{ plan: "HORIZON", label: "Souscrire Horizon", variant: "primary" }];
  }
  if (granted === "ETINCELLE") {
    return [{ plan: "ETINCELLE", label: "Activer l'essai Étincelle", variant: "primary" }];
  }
  return [];
}

export function upgradePlanDisplayName(plan: UpgradePlanCode): string {
  return plan === "ATELIER" ? "Atelier" : "Horizon";
}

export function engagementPlanHref(plan: UpgradePlanCode): string {
  return `/organisation/engagement?plan=${plan}`;
}
