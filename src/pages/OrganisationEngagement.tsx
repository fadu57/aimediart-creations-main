import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  commercialKindLabel,
  hasCommercialDiscount,
  previewCommercialTerms,
  resolveAgencyCommercialPresetForPlan,
  resolveListPriceForBilling,
  type AgencyCommercialPreset,
} from "@/lib/organisation/commercialTerms";
import {
  normalizeSubscribePlanCode,
  subscribePlanDisplayName,
} from "@/lib/organisation/planLimits";
import {
  fetchPricingByPlanCode,
  toPricingNumber,
  type PricingRow,
} from "@/lib/organisation/publicHomeData";
import {
  fetchAgencyCommercialPreset,
  subscribeOrganisationPlan,
} from "@/lib/organisation/subscribeOrganisationPlan";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type BillingCycle = "monthly" | "annual";

function formatEur(value: unknown): string {
  const n = toPricingNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function resolveEngagementPrices(pricing: PricingRow | null) {
  const monthly = pricing?.pricing_monthly_ttc_eur ?? null;
  const annualDiscounted =
    pricing?.pricing_annual_remis ?? (monthly != null ? monthly * 11 : null);
  const annualList = pricing?.pricing_annuel ?? (monthly != null ? monthly * 12 : null);
  const annualSavings =
    pricing?.eco_annuel ??
    (monthly != null && annualDiscounted != null
      ? Math.max(0, monthly * 12 - annualDiscounted)
      : null);
  const maxVisitors = pricing?.princing_max_visitors ?? null;

  return { monthly, annualDiscounted, annualList, annualSavings, maxVisitors };
}

async function resolveUserAgencyId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("agency_users")
    .select("agency_id")
    .eq("user_id", userId)
    .eq("role_id", 4)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const agencyId = (data as { agency_id?: string | null } | null)?.agency_id?.trim();
  return agencyId || null;
}

/**
 * Souscription self-service : Étincelle (essai) ou passage / souscription Atelier / Horizon.
 */
export default function OrganisationEngagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = normalizeSubscribePlanCode(searchParams.get("plan"));
  const { session, loading: authLoading } = useAuthUser();
  const [pricing, setPricing] = useState<PricingRow | null>(null);
  const [commercialPreset, setCommercialPreset] = useState<AgencyCommercialPreset | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [submitting, setSubmitting] = useState(false);

  const isEtincelle = plan === "ETINCELLE";

  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    setLoadingPricing(true);
    void (async () => {
      try {
        const row = await fetchPricingByPlanCode(plan);
        if (cancelled) return;
        setPricing(row);
        if (!isEtincelle && !row?.pricing_monthly_ttc_eur) {
          toast.message("Tarifs indisponibles", {
            description: "Les prix TTC n'ont pas pu être chargés pour ce plan.",
          });
        }
      } catch (e) {
        if (cancelled) return;
        toast.error("Impossible de charger les tarifs", {
          description: e instanceof Error ? e.message : "Erreur inconnue",
        });
        setPricing(null);
      } finally {
        if (!cancelled) setLoadingPricing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, isEtincelle]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setCommercialPreset(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const agencyId = await resolveUserAgencyId(userId);
      if (cancelled || !agencyId) {
        if (!cancelled) setCommercialPreset(null);
        return;
      }
      const preset = await fetchAgencyCommercialPreset(agencyId);
      if (!cancelled) setCommercialPreset(preset);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const planLabel = useMemo(() => {
    if (!plan) return "";
    return pricing?.display_name?.trim() || pricing?.pricing_label?.trim() || subscribePlanDisplayName(plan);
  }, [plan, pricing]);

  const { monthly, annualDiscounted, annualList, annualSavings, maxVisitors } = useMemo(
    () => resolveEngagementPrices(pricing),
    [pricing],
  );

  const selectedListPrice = useMemo(() => {
    if (!plan) return null;
    return resolveListPriceForBilling(pricing, billingCycle, plan);
  }, [billingCycle, plan, pricing]);

  const activeCommercialPreset = useMemo(
    () => resolveAgencyCommercialPresetForPlan(commercialPreset, plan),
    [commercialPreset, plan],
  );

  const commercialPreview = useMemo(
    () => previewCommercialTerms(selectedListPrice, activeCommercialPreset),
    [activeCommercialPreset, selectedListPrice],
  );

  if (!plan) {
    return <Navigate to="/organisation#tarifs" replace />;
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await subscribeOrganisationPlan({
        planCode: plan,
        billingCycle: isEtincelle ? "monthly" : billingCycle,
      });
      if (error || !data) {
        toast.error("Souscription impossible", { description: error ?? "Erreur inconnue" });
        return;
      }

      toast.success(
        isEtincelle ? "Essai Étincelle activé" : `Abonnement ${planLabel} activé`,
        {
          description: hasCommercialDiscount(commercialPreview)
            ? `Tarif net après remise : ${formatEur(data.net_price_eur)}`
            : "Votre tableau de bord a été mis à jour.",
        },
      );
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const pageTitle = isEtincelle
    ? "Activer l'essai Étincelle"
    : `Passer à l'abonnement ${planLabel}`;

  return (
    <div className="relative min-h-screen bg-white text-[#1f1f1f]">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(230,57,70,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative z-10">
        <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto grid max-w-[1060px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 sm:px-6">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 justify-self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              Retour au tableau de bord
            </Link>
            <p className="justify-self-center text-center text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
              {isEtincelle ? "Première souscription" : "Passage depuis Étincelle"}
            </p>
            <Link
              to="/organisation"
              className="inline-flex shrink-0 justify-self-end"
              aria-label="AIMEDIArt — accueil vitrine"
            >
              <AimediartBrandLogoBlock size="sm" />
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[720px] px-5 py-10 sm:px-6 sm:py-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#E63946]">Abonnement</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.1rem]">
            {pageTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {isEtincelle
              ? "Activez l'essai gratuit d'un mois pour votre organisation. Les remises commerciales éventuelles s'appliqueront automatiquement lors d'un passage à un plan payant."
              : "Choisissez votre mode de facturation. L'offre annuelle applique la réduction affichée par rapport à 12 mois au tarif mensuel."}
          </p>

          {loadingPricing ? (
            <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Chargement des tarifs…
            </p>
          ) : isEtincelle ? (
            <div className="mt-8 rounded-2xl border border-neutral-200 bg-[#faf9f7] p-5">
              <p className="text-2xl font-serif font-bold text-[#9d2525]">Essai gratuit · 1 mois</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {pricing?.trial_duration_days ?? 30} jours pour découvrir AIMediArt avec les limites du plan
                Étincelle.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border p-5 text-left transition-colors",
                    billingCycle === "monthly"
                      ? "border-[#9d2525] bg-[#faf9f7] ring-2 ring-[#9d2525]/20"
                      : "border-neutral-200 bg-white hover:border-neutral-300",
                  )}
                  onClick={() => setBillingCycle("monthly")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">Facturation mensuelle</span>
                    {billingCycle === "monthly" ? (
                      <Check className="h-4 w-4 text-[#9d2525]" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-3 text-2xl font-serif font-bold text-[#9d2525]">
                    {formatEur(monthly)}
                    <span className="text-sm font-sans font-normal text-muted-foreground"> / mois</span>
                  </p>
                </button>

                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border p-5 text-left transition-colors",
                    billingCycle === "annual"
                      ? "border-[#9d2525] bg-[#faf9f7] ring-2 ring-[#9d2525]/20"
                      : "border-neutral-200 bg-white hover:border-neutral-300",
                  )}
                  onClick={() => setBillingCycle("annual")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">Facturation annuelle</span>
                    {billingCycle === "annual" ? (
                      <Check className="h-4 w-4 text-[#9d2525]" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-3 text-2xl font-serif font-bold text-[#9d2525]">
                    {formatEur(annualDiscounted)}
                    <span className="text-sm font-sans font-normal text-muted-foreground"> / an</span>
                  </p>
                  {annualList != null && annualDiscounted != null && annualList > annualDiscounted ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="line-through">{formatEur(annualList)}</span>
                      {annualSavings != null && annualSavings > 0 ? (
                        <span className="ml-2 font-medium text-[#9d2525]">
                          Économie {formatEur(annualSavings)}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </button>
              </div>
            </>
          )}

          {hasCommercialDiscount(commercialPreview) || commercialKindLabel(commercialPreview.commercial_kind) ? (
            <div className="mt-8 overflow-hidden rounded-2xl border-2 border-[#9d2525] bg-gradient-to-br from-[#fff9f7] via-white to-[#ffeceb] p-5 shadow-[0_12px_40px_rgba(157,37,37,0.18)] ring-1 ring-[#9d2525]/15 sm:p-6">
              <div className="flex flex-col gap-4">
                {commercialKindLabel(commercialPreview.commercial_kind) ? (
                  <span className="inline-flex w-fit items-center rounded-full border border-[#9d2525]/30 bg-[#9d2525] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                    {commercialKindLabel(commercialPreview.commercial_kind)}
                  </span>
                ) : null}

                {!isEtincelle && commercialPreview.list_price_eur != null ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
                        Votre tarif partenaire
                      </p>
                      <p className="font-serif text-4xl font-bold leading-none text-[#9d2525] sm:text-[2.75rem]">
                        {formatEur(commercialPreview.net_price_eur)}
                        <span className="ml-2 font-sans text-base font-medium text-muted-foreground">
                          {billingCycle === "annual" ? "/ an TTC" : "/ mois TTC"}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 rounded-xl border border-[#9d2525]/20 bg-white/80 px-4 py-3 text-sm">
                      <p className="text-muted-foreground">
                        Tarif catalogue{" "}
                        <span className="font-medium line-through decoration-[#9d2525]/60">
                          {formatEur(commercialPreview.list_price_eur)}
                        </span>
                      </p>
                      {(commercialPreview.discount_percent ?? 0) > 0 ? (
                        <p className="font-semibold text-[#9d2525]">
                          Remise {commercialPreview.discount_percent} %
                        </p>
                      ) : null}
                      {(commercialPreview.discount_amount_eur ?? 0) > 0 ? (
                        <p className="font-semibold text-[#9d2525]">
                          Remise {formatEur(commercialPreview.discount_amount_eur)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : commercialKindLabel(commercialPreview.commercial_kind) ? (
                  <p className="text-sm font-medium text-foreground">
                    Conditions commerciales partenaires appliquées à votre organisation.
                  </p>
                ) : null}

                {activeCommercialPreset?.commercial_notes ? (
                  <p className="rounded-xl border border-[#9d2525]/15 bg-white/70 px-4 py-3 text-sm leading-relaxed text-foreground/90">
                    {activeCommercialPreset.commercial_notes}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {!loadingPricing && !isEtincelle ? (
            <ul className="mt-6 space-y-2 rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4 text-sm text-foreground/90">
              {pricing?.pricing_max_oeuvres != null ? (
                <li>Jusqu&apos;à {pricing.pricing_max_oeuvres} œuvres</li>
              ) : null}
              {maxVisitors != null ? <li>Jusqu&apos;à {maxVisitors} visiteurs / mois</li> : null}
              <li>Médiation dialoguée et outils backoffice complets</li>
            </ul>
          ) : null}

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {!session?.user && !authLoading ? (
              <Button asChild className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90">
                <Link to={`/login?redirect=${encodeURIComponent(`/organisation/engagement?plan=${plan}`)}`}>
                  Connexion pour confirmer
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90"
                disabled={loadingPricing || submitting || (!isEtincelle && (!pricing || monthly == null))}
                onClick={() => void handleConfirm()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Souscription…
                  </>
                ) : isEtincelle ? (
                  "Activer mon essai Étincelle"
                ) : (
                  "Confirmer mon abonnement"
                )}
              </Button>
            )}
            <Button asChild variant="outline" className="rounded-xl border-neutral-300">
              <Link to="/organisation#tarifs">Comparer les offres</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {isEtincelle
              ? "L'essai est activé immédiatement pour votre organisation. Le règlement en ligne des plans payants sera finalisé prochainement."
              : "Votre abonnement est enregistré immédiatement. Le règlement en ligne sera activé prochainement ; la remise commerciale est figée dans votre contrat."}
          </p>
        </main>
      </div>
    </div>
  );
}
