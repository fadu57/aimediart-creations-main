import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthUser } from "@/hooks/useAuthUser";
import { MEDIATION_UI_LANGS, type MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";
import {
  commercialKindLabel,
  hasCommercialDiscount,
  previewCommercialTerms,
  resolveAgencyCommercialPresetForPlan,
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

const MEDIATION_LANG_TOOLTIPS: Record<MediationUiLang, string> = {
  fr: "Français / French",
  en: "Anglais / English",
  de: "Allemand / German",
  es: "Espagnol / Spanish",
  it: "Italien / Italian",
};

/** Langues européennes hors catalogue FR/EN/DE/ES/IT — demande de devis Rayonnement. */
const EUROPEAN_QUOTE_LANG_CODES = [
  "pt", "nl", "pl", "ro", "el", "cs", "hu", "sv", "da", "fi", "no",
  "bg", "hr", "sk", "sl", "lt", "lv", "et", "ga", "mt", "uk", "ca",
] as const;

type EuropeanQuoteLangCode = (typeof EUROPEAN_QUOTE_LANG_CODES)[number];

/** Nom localisé d'une langue via Intl.DisplayNames (auto-traduit selon la locale UI). */
function getEuropeanLangLabel(code: string, locale: string): string {
  try {
    const label = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    // navigateur non compatible
  }
  return code.toUpperCase();
}

function EngagementEuropeanLangMultiSelect({
  selectedCodes,
  onChange,
}: {
  selectedCodes: EuropeanQuoteLangCode[];
  onChange: (codes: EuropeanQuoteLangCode[]) => void;
}) {
  const { t, i18n } = useTranslation("home");
  const locale = i18n.language.slice(0, 2);
  const [open, setOpen] = useState(false);

  const summary =
    selectedCodes.length === 0
      ? t("engagement.select_langs_placeholder")
      : selectedCodes.length === 1
        ? getEuropeanLangLabel(selectedCodes[0], locale)
        : t("engagement.n_langs_selected", { count: selectedCodes.length });

  const toggleLang = (code: EuropeanQuoteLangCode) => {
    onChange(
      selectedCodes.includes(code)
        ? selectedCodes.filter((item) => item !== code)
        : [...selectedCodes, code],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id="extra-languages-quote-request"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls="extra-languages-quote-request-list"
          className="h-10 w-full justify-between rounded-xl border-neutral-300 bg-white px-3 text-sm font-normal text-foreground hover:bg-neutral-50"
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        id="extra-languages-quote-request-list"
        className="w-[var(--radix-popover-trigger-width)] p-2"
        align="start"
      >
        <div className="flex max-h-[240px] flex-col gap-0.5 overflow-y-auto">
          {EUROPEAN_QUOTE_LANG_CODES.map((code) => {
            const isSelected = selectedCodes.includes(code);
            const label = getEuropeanLangLabel(code, locale);
            return (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-neutral-100"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleLang(code)}
                  aria-label={label}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatEur(value: unknown): string {
  const n = toPricingNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatStandbyEurDisplay(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

function standbyUnitPriceFromOption(unitPrice: number): number {
  return Math.round(unitPrice * 0.33 * 10) / 10;
}

/** Langues suppl. sélectionnables hors langue de connexion, incluses dans le plan sans surcoût. */
function includedExtraMediationLangSlots(pricing: PricingRow | null): number {
  const max = pricing?.included_mediation_langs_max ?? pricing?.included_mediation_langs_min ?? 1;
  return Math.max(0, max - 1);
}

/** Langues audio suppl. incluses dans le plan (hors langue de connexion déjà couverte). */
function includedExtraAudioLangSlots(pricing: PricingRow | null): number {
  const included = pricing?.included_audio_langs ?? 0;
  return Math.max(0, included - 1);
}

function billableExtraLangCount(selectedCount: number, includedFreeCount: number): number {
  return Math.max(0, selectedCount - includedFreeCount);
}

function formatMediationLangsIncluded(
  min: number | null | undefined,
  max: number | null | undefined,
  t: TFunction,
): string | null {
  if (min == null && max == null) return null;
  const resolvedMin = min ?? max;
  const resolvedMax = max ?? min;
  if (resolvedMin == null || resolvedMax == null) return null;
  if (resolvedMin === resolvedMax) {
    return t("engagement.langs_count", { count: resolvedMin });
  }
  return t("engagement.langs_range", { min: resolvedMin, max: resolvedMax });
}

function formatAudioLangsIncluded(count: number | null | undefined, t: TFunction): string {
  if (count == null || count <= 0) return t("engagement.no");
  return t("engagement.langs_count", { count });
}

function optionUnitPrice(row: PricingRow | null, optionCode: string): number | null {
  if (!row) return null;
  const fromOptions = row.pricing_options.find((o) => o.option_code === optionCode)?.unit_price_ttc_eur;
  if (typeof fromOptions === "number") return fromOptions;
  if (optionCode === "STANDBY") return row.standby_monthly_price_ttc_eur;
  return null;
}

function toggleExtraLang(current: MediationUiLang[], lang: MediationUiLang): MediationUiLang[] {
  return current.includes(lang) ? current.filter((code) => code !== lang) : [...current, lang];
}

function normalizeConnectionLang(value: string | null | undefined): MediationUiLang {
  if (value === "fr" || value === "en" || value === "de" || value === "es" || value === "it") return value;
  return "fr";
}

function computeEngagementAnnualPrice(
  adjustedMonthly: number | null,
  pricing: PricingRow | null,
): number | null {
  if (adjustedMonthly == null) return null;
  const baseMonthly = pricing?.pricing_monthly_ttc_eur ?? null;
  const baseAnnual = pricing?.pricing_annual_remis ?? null;
  if (baseMonthly != null && baseMonthly > 0 && baseAnnual != null) {
    const monthsPaid =
      Math.abs(baseAnnual - baseMonthly * 11) < 1.5
        ? 11
        : Math.max(1, Math.round(baseAnnual / baseMonthly));
    return Math.round(adjustedMonthly * monthsPaid);
  }
  return Math.round(adjustedMonthly * 11);
}

function applyExtraLangToggle(
  mediation: MediationUiLang[],
  audio: MediationUiLang[],
  target: "mediation" | "audio",
  lang: MediationUiLang,
): { mediation: MediationUiLang[]; audio: MediationUiLang[] } {
  if (target === "mediation") {
    const nextMed = toggleExtraLang(mediation, lang);
    return { mediation: nextMed, audio: audio.filter((code) => nextMed.includes(code)) };
  }

  if (audio.includes(lang)) {
    return { mediation, audio: audio.filter((code) => code !== lang) };
  }

  const nextMed = mediation.includes(lang) ? mediation : [...mediation, lang];
  return { mediation: nextMed, audio: [...audio, lang] };
}

type ExtraLangOptionsState = {
  mediation: MediationUiLang[];
  audio: MediationUiLang[];
};

type ExtraLangOptionsAction =
  | { type: "toggle_mediation"; lang: MediationUiLang }
  | { type: "toggle_audio"; lang: MediationUiLang }
  | { type: "remove_default"; lang: MediationUiLang };

function extraLangOptionsReducer(
  state: ExtraLangOptionsState,
  action: ExtraLangOptionsAction,
): ExtraLangOptionsState {
  if (action.type === "remove_default") {
    return {
      mediation: state.mediation.filter((code) => code !== action.lang),
      audio: state.audio.filter((code) => code !== action.lang),
    };
  }
  if (action.type === "toggle_mediation") {
    return applyExtraLangToggle(state.mediation, state.audio, "mediation", action.lang);
  }
  if (action.type === "toggle_audio") {
    if (state.mediation.length > 0 && !state.mediation.includes(action.lang)) {
      return state;
    }
    return applyExtraLangToggle(state.mediation, state.audio, "audio", action.lang);
  }
  return state;
}

function EngagementExtraLangOptionRow({
  title,
  selectedLangs,
  unitPrice,
  defaultLang,
  includedFreeCount = 0,
  helperText,
  isLangSelectable = () => true,
  maxSelectableCount,
  pricingVariant = "priced",
  onToggleLang,
}: {
  title: string;
  selectedLangs: MediationUiLang[];
  unitPrice: number | null;
  defaultLang: MediationUiLang;
  includedFreeCount?: number;
  helperText?: string;
  isLangSelectable?: (lang: MediationUiLang) => boolean;
  maxSelectableCount?: number;
  pricingVariant?: "priced" | "included";
  onToggleLang: (lang: MediationUiLang) => void;
}) {
  const { t } = useTranslation("home");
  const count = selectedLangs.length;
  const billableCount =
    pricingVariant === "included" ? 0 : billableExtraLangCount(count, includedFreeCount);
  const includedSelectedCount =
    pricingVariant === "included" ? count : Math.min(count, includedFreeCount);
  const totalMonthly = typeof unitPrice === "number" ? unitPrice * billableCount : null;
  const isIncludedPlan = pricingVariant === "included";

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-semibold text-foreground">
        {title}
        <span className="text-[#9d2525]">*</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {t("engagement.select_extra_langs")}
      </p>
      {helperText ? <p className="text-xs italic text-muted-foreground">{helperText}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-[260px] flex-wrap items-center gap-2">
          {MEDIATION_UI_LANGS.map((lang) => {
            const isDefaultLang = lang === defaultLang;
            const isSelected = selectedLangs.includes(lang);
            const isWithinSelectableLimit =
              maxSelectableCount == null ||
              isSelected ||
              selectedLangs.length < maxSelectableCount;
            const isSelectable = !isDefaultLang && isLangSelectable(lang) && isWithinSelectableLimit;
            const isLocked = isDefaultLang || !isSelectable;
            return (
              <Tooltip key={lang}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "h-8 min-w-[2.75rem] px-2 text-xs font-semibold",
                        isLocked
                          ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-muted-foreground opacity-60"
                          : isSelected
                            ? "border-[#9d2525] bg-[#9d2525] text-white hover:bg-[#9d2525]/90"
                            : "border-neutral-300 bg-white text-foreground hover:bg-neutral-50",
                      )}
                      disabled={isLocked}
                      aria-disabled={isLocked}
                      aria-label={MEDIATION_LANG_TOOLTIPS[lang]}
                      onClick={() => {
                        if (!isLocked) onToggleLang(lang);
                      }}
                    >
                      {lang.toUpperCase()}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {MEDIATION_LANG_TOOLTIPS[lang]}
                  {isDefaultLang ? t("engagement.connection_lang_suffix") : ""}
                  {!isDefaultLang && !isSelectable && isLangSelectable(lang)
                    ? t("engagement.limit_reached")
                    : !isDefaultLang && !isSelectable
                    ? t("engagement.only_if_mediation")
                    : ""}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/90">
          {!isIncludedPlan ? (
            <span>
              <span className="font-medium text-foreground">{t("engagement.unit_price")}</span>{" "}
              {typeof unitPrice === "number" ? (
                <>
                  {formatEur(unitPrice)} {t("engagement.per_lang_suffix")}{" "}
                  <span className="text-muted-foreground">
                    {t("engagement.standby_per_month", { price: formatStandbyEurDisplay(standbyUnitPriceFromOption(unitPrice)) })}
                  </span>
                </>
              ) : (
                "—"
              )}
            </span>
          ) : (
            <span className="font-medium text-foreground">{t("engagement.no_supplement")}</span>
          )}
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap">
            <span>
              <span className="font-medium text-foreground">{t("engagement.extra_langs_label")}</span> {count}
              {maxSelectableCount != null ? (
                <span className="text-muted-foreground"> {t("engagement.max_suffix", { max: maxSelectableCount })}</span>
              ) : null}
              {includedSelectedCount > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  {t("engagement.included_in_subscription", { count: includedSelectedCount })}
                </span>
              ) : null}
            </span>
            {!isIncludedPlan ? (
              <span>
                <span className="font-medium text-foreground">{t("engagement.total_label")}</span>{" "}
                <span className="font-bold text-[#9d2525]">
                  {typeof totalMonthly === "number" ? t("engagement.per_month_ttc", { price: formatEur(totalMonthly) }) : "—"}
                </span>
              </span>
            ) : (
              <span className="font-bold text-[#9d2525]">{t("engagement.included")}</span>
            )}
          </span>
        </div>
      </div>
      <p className="text-xs italic text-[#9d2525]">
        {t("engagement.default_lang_note")}
      </p>
    </div>
  );
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
 * Souscription self-service : Étincelle (essai), Atelier / Horizon / Rayonnement.
 */
export default function OrganisationEngagement() {
  const { t } = useTranslation("home");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = normalizeSubscribePlanCode(searchParams.get("plan"));
  const { session, loading: authLoading } = useAuthUser();
  const { language: uiLanguage } = useUiLanguage();
  const [pricing, setPricing] = useState<PricingRow | null>(null);
  const [commercialPreset, setCommercialPreset] = useState<AgencyCommercialPreset | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [extraLangOptions, dispatchExtraLangOptions] = useReducer(extraLangOptionsReducer, {
    mediation: [],
    audio: [],
  });
  const extraMediationLangs = extraLangOptions.mediation;
  const extraAudioLangs = extraLangOptions.audio;
  const [profileLanguage, setProfileLanguage] = useState<UiLanguage | null>(null);
  const [extraQuoteEuropeanLangs, setExtraQuoteEuropeanLangs] = useState<EuropeanQuoteLangCode[]>([]);

  const isEtincelle = plan === "ETINCELLE";
  const isRayonnement = plan === "RAYONNEMENT";
  const defaultConnectionLang = normalizeConnectionLang(profileLanguage ?? uiLanguage);

  useEffect(() => {
    dispatchExtraLangOptions({ type: "remove_default", lang: defaultConnectionLang });
  }, [defaultConnectionLang]);

  const handleToggleExtraMediationLang = (lang: MediationUiLang) => {
    if (lang === defaultConnectionLang) return;
    dispatchExtraLangOptions({ type: "toggle_mediation", lang });
  };

  const handleToggleExtraAudioLang = (lang: MediationUiLang) => {
    if (lang === defaultConnectionLang) return;
    dispatchExtraLangOptions({ type: "toggle_audio", lang });
  };

  const isAudioLangSelectable = (lang: MediationUiLang) =>
    extraMediationLangs.length === 0 || extraMediationLangs.includes(lang);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfileLanguage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("profiles").select("language").eq("id", userId).maybeSingle();
      if (cancelled) return;
      const lang = (data as { language?: string | null } | null)?.language;
      setProfileLanguage(lang === "fr" || lang === "en" || lang === "de" || lang === "es" || lang === "it" ? lang : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    setLoadingPricing(true);
    void (async () => {
      try {
        const row = await fetchPricingByPlanCode(plan);
        if (cancelled) return;
        setPricing(row);
        if (!isEtincelle && !isRayonnement && !row?.pricing_monthly_ttc_eur) {
          toast.message(t("engagement.toast_prices_unavailable_title"), {
            description: t("engagement.toast_prices_unavailable_desc"),
          });
        }
      } catch (e) {
        if (cancelled) return;
        toast.error(t("engagement.toast_prices_load_failed"), {
          description: e instanceof Error ? e.message : t("engagement.unknown_error"),
        });
        setPricing(null);
      } finally {
        if (!cancelled) setLoadingPricing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, isEtincelle, isRayonnement, t]);

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

  const { monthly, maxVisitors } = useMemo(() => resolveEngagementPrices(pricing), [pricing]);

  const extraMediationUnitPrice = useMemo(
    () => optionUnitPrice(pricing, "EXTRA_MEDIATION_LANG"),
    [pricing],
  );

  const extraAudioUnitPrice = useMemo(() => optionUnitPrice(pricing, "EXTRA_AUDIO_LANG"), [pricing]);

  const standbyMonthlyPrice = useMemo(() => optionUnitPrice(pricing, "STANDBY"), [pricing]);

  const includedExtraMediationSlots = useMemo(
    () => includedExtraMediationLangSlots(pricing),
    [pricing],
  );

  const includedExtraAudioSlots = useMemo(() => includedExtraAudioLangSlots(pricing), [pricing]);

  const billableExtraMediationLangs = useMemo(() => {
    if (isRayonnement) return 0;
    return billableExtraLangCount(extraMediationLangs.length, includedExtraMediationSlots);
  }, [extraMediationLangs.length, includedExtraMediationSlots, isRayonnement]);

  const billableExtraAudioLangs = useMemo(() => {
    if (isRayonnement) return 0;
    return billableExtraLangCount(extraAudioLangs.length, includedExtraAudioSlots);
  }, [extraAudioLangs.length, includedExtraAudioSlots, isRayonnement]);

  const subscribedOptionsCount = extraMediationLangs.length + extraAudioLangs.length;

  const billableSubscribedOptionsCount = billableExtraMediationLangs + billableExtraAudioLangs;

  const standbyOptionsMonthlyTotal = useMemo(() => {
    let total = 0;
    if (typeof extraMediationUnitPrice === "number") {
      total += standbyUnitPriceFromOption(extraMediationUnitPrice) * billableExtraMediationLangs;
    }
    if (typeof extraAudioUnitPrice === "number") {
      total += standbyUnitPriceFromOption(extraAudioUnitPrice) * billableExtraAudioLangs;
    }
    return total;
  }, [
    billableExtraAudioLangs,
    billableExtraMediationLangs,
    extraAudioUnitPrice,
    extraMediationUnitPrice,
  ]);

  const extraOptionsMonthlyTotal = useMemo(() => {
    let total = 0;
    if (typeof extraMediationUnitPrice === "number") {
      total += extraMediationUnitPrice * billableExtraMediationLangs;
    }
    if (typeof extraAudioUnitPrice === "number") {
      total += extraAudioUnitPrice * billableExtraAudioLangs;
    }
    return total;
  }, [billableExtraAudioLangs, billableExtraMediationLangs, extraAudioUnitPrice, extraMediationUnitPrice]);

  const displayStandbyMonthlyPrice = useMemo(() => {
    if (typeof standbyMonthlyPrice !== "number") return null;
    if (billableSubscribedOptionsCount === 0) return standbyMonthlyPrice;
    return Math.round((standbyMonthlyPrice + standbyOptionsMonthlyTotal) * 10) / 10;
  }, [billableSubscribedOptionsCount, standbyMonthlyPrice, standbyOptionsMonthlyTotal]);

  const adjustedMonthly = useMemo(() => {
    if (monthly == null) return null;
    return monthly + extraOptionsMonthlyTotal;
  }, [extraOptionsMonthlyTotal, monthly]);

  const adjustedAnnualDiscounted = useMemo(
    () => computeEngagementAnnualPrice(adjustedMonthly, pricing),
    [adjustedMonthly, pricing],
  );

  const adjustedAnnualList = useMemo(
    () => (adjustedMonthly != null ? adjustedMonthly * 12 : null),
    [adjustedMonthly],
  );

  const adjustedAnnualSavings = useMemo(() => {
    if (adjustedAnnualList == null || adjustedAnnualDiscounted == null) return null;
    return Math.max(0, adjustedAnnualList - adjustedAnnualDiscounted);
  }, [adjustedAnnualDiscounted, adjustedAnnualList]);

  const selectedListPrice = useMemo(() => {
    if (!plan) return null;
    if (plan === "ETINCELLE") return 0;
    if (billingCycle === "annual") return adjustedAnnualDiscounted;
    return adjustedMonthly;
  }, [adjustedAnnualDiscounted, adjustedMonthly, billingCycle, plan]);

  const activeCommercialPreset = useMemo(
    () => resolveAgencyCommercialPresetForPlan(commercialPreset, plan),
    [commercialPreset, plan],
  );

  const commercialPreview = useMemo(
    () => previewCommercialTerms(selectedListPrice, activeCommercialPreset),
    [activeCommercialPreset, selectedListPrice],
  );

  const mediationLangsLabel = useMemo(
    () =>
      formatMediationLangsIncluded(
        pricing?.included_mediation_langs_min,
        pricing?.included_mediation_langs_max,
        t,
      ),
    [pricing, t],
  );

  const audioLangsLabel = useMemo(
    () => formatAudioLangsIncluded(pricing?.included_audio_langs, t),
    [pricing, t],
  );

  const showSubscribedOptions =
    isRayonnement ||
    typeof extraMediationUnitPrice === "number" ||
    typeof extraAudioUnitPrice === "number";

  const rayonnementMaxMediationLangs = includedExtraMediationSlots;
  const rayonnementMaxAudioLangs = useMemo(() => {
    if (!isRayonnement) return undefined;
    const audioCap = includedExtraAudioSlots;
    if (audioCap > 0) return audioCap;
    return rayonnementMaxMediationLangs;
  }, [includedExtraAudioSlots, isRayonnement, rayonnementMaxMediationLangs]);

  if (!plan) {
    return <Navigate to="/organisation#tarifs" replace />;
  }

  const handleConfirm = async () => {
    if (isRayonnement) {
      toast.success(t("engagement.toast_request_saved", { plan: planLabel }), {
        description: extraQuoteEuropeanLangs.length > 0
          ? t("engagement.toast_request_desc_quote")
          : t("engagement.toast_request_desc_default"),
      });
      navigate("/dashboard", { replace: true });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await subscribeOrganisationPlan({
        planCode: plan,
        billingCycle: isEtincelle ? "monthly" : billingCycle,
      });
      if (error || !data) {
        toast.error(t("engagement.toast_subscribe_failed"), { description: error ?? t("engagement.unknown_error") });
        return;
      }

      toast.success(
        isEtincelle ? t("engagement.toast_trial_activated") : t("engagement.toast_subscription_activated", { plan: planLabel }),
        {
          description: hasCommercialDiscount(commercialPreview)
            ? t("engagement.toast_net_price", { price: formatEur(data.net_price_eur) })
            : t("engagement.toast_dashboard_updated"),
        },
      );
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

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
              {t("engagement.back_to_dashboard")}
            </Link>
            <p className="justify-self-center text-center text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
              {isEtincelle ? t("engagement.first_subscription") : t("engagement.switch_from_etincelle")}
            </p>
            <Link
              to="/organisation"
              className="inline-flex shrink-0 justify-self-end"
              aria-label={t("engagement.brand_home_aria")}
            >
              <AimediartBrandLogoBlock size="sm" />
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[720px] px-5 py-10 sm:px-6 sm:py-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#E63946]">{t("engagement.subscription")}</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.1rem]">
            {isEtincelle ? (
              <Trans i18nKey="engagement.activate_trial" ns="home" components={{ accent: <span className="text-[#9d2525]" /> }} />
            ) : (
              <Trans
                i18nKey="engagement.switch_to_plan"
                ns="home"
                values={{ plan: planLabel }}
                components={{ accent: <span className="text-[#9d2525]" /> }}
              />
            )}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {isEtincelle
              ? t("engagement.intro_etincelle")
              : isRayonnement
                ? t("engagement.intro_rayonnement")
                : t("engagement.intro_default")}
          </p>

          {loadingPricing ? (
            <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("engagement.loading_prices")}
            </p>
          ) : isEtincelle ? (
            <div className="mt-8 rounded-2xl border border-neutral-200 bg-[#faf9f7] p-5">
              <p className="text-2xl font-serif font-bold text-[#9d2525]">{t("engagement.free_trial_1month")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("engagement.trial_days_desc", { days: pricing?.trial_duration_days ?? 30 })}
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
                    <span className="text-sm font-semibold text-foreground">{t("engagement.billing_monthly")}</span>
                    {billingCycle === "monthly" ? (
                      <Check className="h-4 w-4 text-[#9d2525]" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-3 text-2xl font-serif font-bold text-[#9d2525]">
                    {isRayonnement && monthly == null ? (
                      <>
                        {t("engagement.on_quote")}
                        <span className="mt-1 block font-sans text-sm font-normal text-muted-foreground">
                          {t("engagement.negotiated_price")}
                        </span>
                      </>
                    ) : (
                      <>
                        {formatEur(adjustedMonthly)}
                        <span className="text-sm font-sans font-normal text-muted-foreground"> {t("engagement.per_month")}</span>
                      </>
                    )}
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
                    <span className="text-sm font-semibold text-foreground">{t("engagement.billing_annual")}</span>
                    {billingCycle === "annual" ? (
                      <Check className="h-4 w-4 text-[#9d2525]" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-3 text-2xl font-serif font-bold text-[#9d2525]">
                    {isRayonnement && adjustedAnnualDiscounted == null ? (
                      <>
                        {t("engagement.on_quote")}
                        <span className="mt-1 block font-sans text-sm font-normal text-muted-foreground">
                          {t("engagement.custom_annual_billing")}
                        </span>
                      </>
                    ) : (
                      <>
                        {formatEur(adjustedAnnualDiscounted)}
                        <span className="text-sm font-sans font-normal text-muted-foreground"> {t("engagement.per_year")}</span>
                      </>
                    )}
                  </p>
                  {adjustedAnnualList != null &&
                  adjustedAnnualDiscounted != null &&
                  adjustedAnnualList > adjustedAnnualDiscounted ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="line-through">{formatEur(adjustedAnnualList)}</span>
                      {adjustedAnnualSavings != null && adjustedAnnualSavings > 0 ? (
                        <span className="ml-2 font-medium text-[#9d2525]">
                          {t("engagement.savings", { price: formatEur(adjustedAnnualSavings) })}
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
                        {t("engagement.your_partner_price")}
                      </p>
                      <p className="font-serif text-4xl font-bold leading-none text-[#9d2525] sm:text-[2.75rem]">
                        {formatEur(commercialPreview.net_price_eur)}
                        <span className="ml-2 font-sans text-base font-medium text-muted-foreground">
                          {billingCycle === "annual" ? t("engagement.per_year_ttc") : t("engagement.per_month_ttc_short")}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 rounded-xl border border-[#9d2525]/20 bg-white/80 px-4 py-3 text-sm">
                      <p className="text-muted-foreground">
                        {t("engagement.catalog_price")}{" "}
                        <span className="font-medium line-through decoration-[#9d2525]/60">
                          {formatEur(commercialPreview.list_price_eur)}
                        </span>
                      </p>
                      {(commercialPreview.discount_percent ?? 0) > 0 ? (
                        <p className="font-semibold text-[#9d2525]">
                          {t("engagement.discount_percent", { percent: commercialPreview.discount_percent })}
                        </p>
                      ) : null}
                      {(commercialPreview.discount_amount_eur ?? 0) > 0 ? (
                        <p className="font-semibold text-[#9d2525]">
                          {t("engagement.discount_amount", { amount: formatEur(commercialPreview.discount_amount_eur) })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : commercialKindLabel(commercialPreview.commercial_kind) ? (
                  <p className="text-sm font-medium text-foreground">
                    {t("engagement.partner_terms_applied")}
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
                <li>{t("engagement.up_to_artworks", { count: pricing.pricing_max_oeuvres })}</li>
              ) : null}
              {maxVisitors != null ? <li>{t("engagement.up_to_visitors", { count: maxVisitors })}</li> : null}
              {mediationLangsLabel ? (
                <li>{t("engagement.included_mediation_langs", { value: mediationLangsLabel })}</li>
              ) : null}
              <li>{t("engagement.included_audio_langs", { value: audioLangsLabel })}</li>
              {typeof displayStandbyMonthlyPrice === "number" && displayStandbyMonthlyPrice > 0 ? (
                <li>
                  {t("engagement.standby_plan_label")}{" "}
                  <span className="text-base font-bold text-[#9d2525]">
                    {billableSubscribedOptionsCount > 0
                      ? formatStandbyEurDisplay(displayStandbyMonthlyPrice)
                      : formatEur(displayStandbyMonthlyPrice)}{" "}
                    {t("engagement.per_month")}
                  </span>
                  {showSubscribedOptions && subscribedOptionsCount === 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      {t("engagement.excl_options")}
                    </span>
                  ) : null}
                </li>
              ) : null}
              <li>{t("engagement.dialogue_mediation")}</li>
            </ul>
          ) : null}

          {!loadingPricing && !isEtincelle && showSubscribedOptions ? (
            <div className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4">
              <p className="text-sm font-semibold text-foreground">{t("engagement.subscribed_options")}</p>
              {typeof extraMediationUnitPrice === "number" || isRayonnement ? (
                <EngagementExtraLangOptionRow
                  title={t("engagement.mediation")}
                  selectedLangs={extraMediationLangs}
                  unitPrice={extraMediationUnitPrice}
                  defaultLang={defaultConnectionLang}
                  includedFreeCount={isRayonnement ? rayonnementMaxMediationLangs : includedExtraMediationSlots}
                  maxSelectableCount={isRayonnement ? rayonnementMaxMediationLangs : undefined}
                  pricingVariant={isRayonnement ? "included" : "priced"}
                  helperText={
                    isRayonnement
                      ? t("engagement.helper_rayonnement_mediation")
                      : t("engagement.helper_priced_mediation")
                  }
                  onToggleLang={handleToggleExtraMediationLang}
                />
              ) : null}
              {typeof extraAudioUnitPrice === "number" || isRayonnement ? (
                <EngagementExtraLangOptionRow
                  title={t("engagement.audio_guide")}
                  selectedLangs={extraAudioLangs}
                  unitPrice={extraAudioUnitPrice}
                  defaultLang={defaultConnectionLang}
                  includedFreeCount={isRayonnement ? (rayonnementMaxAudioLangs ?? 0) : includedExtraAudioSlots}
                  maxSelectableCount={isRayonnement ? rayonnementMaxAudioLangs : undefined}
                  pricingVariant={isRayonnement ? "included" : "priced"}
                  helperText={
                    isRayonnement
                      ? t("engagement.helper_rayonnement_audio")
                      : extraMediationLangs.length > 0
                        ? t("engagement.helper_audio_with_mediation")
                        : t("engagement.helper_audio_default")
                  }
                  isLangSelectable={isAudioLangSelectable}
                  onToggleLang={handleToggleExtraAudioLang}
                />
              ) : null}
              {isRayonnement ? (
                <div className="space-y-2 border-t border-neutral-200 pt-4">
                  <label htmlFor="extra-languages-quote-request" className="text-sm font-semibold text-foreground">
                    {t("engagement.extra_langs_quote")}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t("engagement.extra_langs_quote_desc")}
                  </p>
                  <EngagementEuropeanLangMultiSelect
                    selectedCodes={extraQuoteEuropeanLangs}
                    onChange={setExtraQuoteEuropeanLangs}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {!session?.user && !authLoading ? (
              <Button asChild className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90">
                <Link to={`/login?redirect=${encodeURIComponent(`/organisation/engagement?plan=${plan}`)}`}>
                  {t("engagement.login_to_confirm")}
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90"
                disabled={
                  loadingPricing ||
                  submitting ||
                  (!isEtincelle &&
                    !isRayonnement &&
                    (!pricing || adjustedMonthly == null))
                }
                onClick={() => void handleConfirm()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    {t("engagement.subscribing")}
                  </>
                ) : isEtincelle ? (
                  t("engagement.activate_my_trial")
                ) : isRayonnement ? (
                  t("engagement.confirm_rayonnement")
                ) : (
                  t("engagement.confirm_subscription")
                )}
              </Button>
            )}
            <Button asChild variant="outline" className="rounded-xl border-neutral-300">
              <Link to="/organisation#tarifs">{t("engagement.compare_offers")}</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {isEtincelle
              ? t("engagement.footer_etincelle")
              : isRayonnement
                ? t("engagement.footer_rayonnement")
                : t("engagement.footer_default")}
          </p>
        </main>
      </div>
    </div>
  );
}
