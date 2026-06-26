import { useEffect, useMemo, useRef, useState, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperClass } from "swiper";
import { A11y, Autoplay, EffectCoverflow, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/navigation";
import {
  fetchPublicHomeData,
  getOrganisationInitialData,
  type PricingRow,
  type PublicHomeInitialData,
} from "@/lib/organisation/publicHomeData";
import type { TFunction } from "i18next";
import { Link, useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  Cloud,
  FileText,
  HeartHandshake,
  Languages,
  Loader2,
  MapPin,
  MessagesSquare,
  MonitorPlay,
  QrCode,
  ScanSearch,
  Smartphone,
  ThermometerSun,
  Volume2,
  Wind,
} from "lucide-react";

import { PublicVitrineShell, AIMEDIART_WORD_RED, BRAND_RED, BRAND_RED_DARK } from "@/components/PublicVitrineShell";
import { AiGenerationInfoTrigger } from "@/components/AiGenerationInfoModal";
import { VitrineGeographyDemoMap } from "@/components/vitrine/VitrineGeographyDemoMap";
import { VitrineStatsDemoPreview } from "@/components/vitrine/VitrineStatsDemoPreview";
import { LazyWhenVisible } from "@/components/ui/LazyWhenVisible";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StandbyPlanTrigger } from "@/components/organisation/StandbyPlanTrigger";
import type { StandbyPlanCode } from "@/components/organisation/StandbyPlanModal";

import expositionVivantePhoto from "@/assets/exposition-vivante.png";
import expositionVivanteWebp from "@/assets/exposition-vivante.webp";
import oreilleAttentivePhoto from "@/assets/oreille-attentive.png";
import oreilleAttentiveWebp from "@/assets/oreille-attentive.webp";
import outputCreatifPhoto from "@/assets/output-creatif.png";
import outputCreatifWebp from "@/assets/output-creatif.webp";
import parcoursPhoto from "@/assets/parcours.png";
import parcoursWebp from "@/assets/parcours.webp";
import tarifsPhoto from "@/assets/tarifs.png";
import tarifsWebp from "@/assets/tarifs.webp";
import accessibilitePhoto from "@/assets/accessibilite.png";
import accessibiliteWebp from "@/assets/accessibilite.webp";
import contactPhoto from "@/assets/contact.png";
import contactWebp from "@/assets/contact.webp";
import { scrollToVitrineAnchor } from "@/lib/vitrineAnchorScroll";
import { AIMEDIART_CONTACT_MAILTO } from "@/lib/aimediartContact";

const ForestCanopySketch = lazy(() =>
  import("@/components/ForestCanopySketch").then((m) => ({ default: m.ForestCanopySketch })),
);
const OrganisationConnexionContent = lazy(() =>
  import("@/components/OrganisationConnexionContent").then((m) => ({ default: m.OrganisationConnexionContent })),
);

export type PublicHomeProps = {
  /** Données pré-chargées (prérendu build ou Server Component). */
  initialData?: PublicHomeInitialData | null;
};

function ProductionStatCard({
  prefix,
  value,
  label,
  sublabel,
  valueGenderIcons,
}: {
  prefix?: string;
  value: string;
  label: string;
  sublabel?: string;
  valueGenderIcons?: boolean;
}) {
  return (
    <div className="flex min-h-[7.5rem] flex-col items-center justify-center rounded-2xl border border-[#E63946]/20 bg-[#fdf8f7] px-3 py-4 text-center">
      <div className="flex flex-col items-center leading-none">
        {prefix ? (
          <span className="mb-1 text-[10px] font-medium lowercase tracking-wide text-[#E63946]/75">{prefix}</span>
        ) : null}
        <div className="flex items-center justify-center gap-1.5">
          {valueGenderIcons ? (
            <span className="flex items-center gap-0.5 text-[1.35rem] leading-none" aria-hidden="true">
              <span>👩</span>
              <span>👨</span>
            </span>
          ) : null}
          <span className="text-3xl font-semibold tabular-nums text-[#E63946]">{value}</span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs leading-snug text-muted-foreground">
        {label}
        <span className="text-[#E63946]">*</span>
      </p>
      {sublabel ? (
        <p className="mt-1.5 text-center text-[10px] leading-snug text-muted-foreground/90">
          {sublabel}
          <span className="text-[#E63946]">*</span>
        </p>
      ) : null}
    </div>
  );
}

function highlightAimediartWord(text: string, textSpanClassName?: string): ReactNode {
  const parts = text.split(/(AIMEDIArt)/g);
  return parts.map((part, i) =>
    part === "AIMEDIArt" ? (
      <span key={`aim-${i}`} className={AIMEDIART_WORD_RED}>
        AIMEDIArt
      </span>
    ) : (
      <span key={`txt-${i}`} className={textSpanClassName}>
        {part}
      </span>
    )
  );
}

const UNSPLASH_HERO_IMAGE =
  "/landing-hero-new.png";

function formatEur(value: number | null | undefined, locale: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

/** TVA appliquée pour dériver le HT depuis le TTC stocké en base. */
const VAT_RATE = 0.2;

/** Montant HT (2 décimales) dérivé du TTC ; renvoie un nombre arrondi au centime. */
function ttcToHt(ttc: number): number {
  return Math.round((ttc / (1 + VAT_RATE)) * 100) / 100;
}

/** Affichage compact d'un montant HT/an : décimales seulement si nécessaire. */
function formatEurAuto(value: number | null | undefined, locale: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Mensuel TTC : 0 → GRATUIT, NULL → Sur Devis, sinon montant + €/mois. */
function formatMonthlyTtcDisplay(value: number | null | undefined, t: TFunction, locale: string): string {
  if (value === null || value === undefined) return t("tarifs.sur_devis");
  if (value === 0) return t("tarifs.gratuit");
  const n = typeof value === "number" && !Number.isNaN(value) ? value : Number(value);
  if (!Number.isFinite(n)) return t("tarifs.sur_devis");
  if (n === 0) return t("tarifs.gratuit");
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)}\u00a0${t("tarifs.per_month")}`;
}

function normalizePlan(plan: string | null): string {
  return (plan ?? "").trim().toUpperCase();
}

/** Compare les noms de plan sans tenir compte des accents (ZÉNITH / ZENITH). */
function planNameAsciiUpper(plan: string | null): string {
  return normalizePlan(plan)
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Zénith / Zenith : carte pleine largeur sous la grille 2×2. */
function isZenithPlanName(plan: string | null): boolean {
  return planNameAsciiUpper(plan).includes("ZENITH");
}

/** Offre Rayonnement : réseaux d'expositions, sur devis. */
function isRayonnementPlanName(plan: string | null): boolean {
  return planNameAsciiUpper(plan).includes("RAYONNEMENT");
}

function isQuoteOnlyPlanName(plan: string | null): boolean {
  return isZenithPlanName(plan);
}

function isCustomLanguagesPlanCode(code: string): boolean {
  return code.includes("ZENITH");
}

/** Sur devis uniquement si Zénith ou ligne sans prix mensuel explicitement marquée devis. */
function isQuoteOnlyRow(row: PricingRow): boolean {
  const code = planCodeFromRow(row);
  if (code.includes("ZENITH")) return true;
  if (typeof row.pricing_monthly_ttc_eur === "number") return false;
  return row.is_quote_only === true;
}

const PLAN_ORDER: Record<string, number> = {
  "L’ÉTINCELLE": 0,
  "L'ETINCELLE": 0,
  "L’ETINCELLE": 0,
  "L’ATELIER": 1,
  "L'ATELIER": 1,
  "L’HORIZON": 2,
  "L'HORIZON": 2,
  "L’ENVERGURE": 3,
  "L'ENVERGURE": 3,
  ENVERGURE: 3,
  "LE RAYONNEMENT": 4,
};

/** Clé de tri croissante (les lignes Zénith sont exclues du rendu tarifs). */
function planSortKey(plan: string | null): number {
  const key = normalizePlan(plan);
  return PLAN_ORDER[key] ?? 100;
}

/** Première lettre du nom d’abonnement (ex. L’Horizon → H, L’Atelier → A), pour libellés H1, A2… */
function planOptionLetter(plan: string | null): string {
  let s = planNameAsciiUpper(plan).replace(/\u2019/g, "'");
  s = s
    .replace(/^L['']?\s*/i, "")
    .replace(/^LE\s+/i, "")
    .replace(/^LA\s+/i, "")
    .replace(/^LES\s+/i, "")
    .trim();
  const m = s.match(/[A-Z]/);
  return m?.[0] ?? "?";
}

function variantOptionCode(plan: string | null, optionIndexZeroBased: number): string {
  return `${planOptionLetter(plan)}${optionIndexZeroBased + 1}`;
}

/** Colonne « Annuel TTC » : masquée si offre gratuite ou montants annuels nuls / absents. */
function shouldShowAnnualPricingColumn(row: PricingRow, isQuoteOnly: boolean): boolean {
  if (isQuoteOnly) return false;
  if (row.pricing_monthly_ttc_eur === 0) return false;
  const ar = row.pricing_annual_remis ?? 0;
  const af = row.pricing_annuel ?? 0;
  return !(ar === 0 && af === 0);
}

function planCodeFromRow(row: PricingRow): string {
  if (row.plan_code?.trim()) return planNameAsciiUpper(row.plan_code);
  return planNameAsciiUpper(row.pricing_plan);
}

function capacityLabel(row: PricingRow, t: TFunction): string {
  const maxOeuvres = row.pricing_max_oeuvres;
  const maxVisitors = row.princing_max_visitors;
  const hasConcreteLimits =
    (typeof maxOeuvres === "number" && maxOeuvres > 0) ||
    (typeof maxVisitors === "number" && maxVisitors > 0);
  if (row.pricing_is_unlimited && !hasConcreteLimits) return t("tarifs.capacity_unlimited");
  const oeuvresPart =
    typeof maxOeuvres === "number" && maxOeuvres > 0
      ? t("tarifs.capacity_oeuvres", { count: maxOeuvres })
      : "Œuvres sur mesure";
  const visitorsPart =
    typeof maxVisitors === "number" && maxVisitors > 0
      ? t("tarifs.capacity_visitors", { count: maxVisitors })
      : "Visiteurs sur mesure";
  const base = `${oeuvresPart} · ${visitorsPart}`;
  if (planCodeFromRow(row).includes("ETINCELLE")) {
    return `${base}${t("tarifs.capacity_suffix_one_month")}`;
  }
  return base;
}

function CapacityBlockSummary({ row, t }: { row: PricingRow; t: TFunction }) {
  const maxOeuvres = row.pricing_max_oeuvres;
  const maxVisitors = row.princing_max_visitors;
  const hasConcreteLimits =
    (typeof maxOeuvres === "number" && maxOeuvres > 0) ||
    (typeof maxVisitors === "number" && maxVisitors > 0);

  if (row.pricing_is_unlimited && !hasConcreteLimits) {
    return <div className="text-sm font-semibold leading-snug">{t("tarifs.capacity_unlimited")}</div>;
  }

  const oeuvresUnlimited = Boolean(row.pricing_is_unlimited) && !(typeof maxOeuvres === "number" && maxOeuvres > 0);

  return (
    <div className="text-sm font-semibold leading-snug">
      {oeuvresUnlimited ? (
        <div>{t("tarifs.capacity_oeuvres_unlimited")}</div>
      ) : typeof maxOeuvres === "number" && maxOeuvres > 0 ? (
        <div>{t("tarifs.capacity_oeuvres_block", { count: maxOeuvres })}</div>
      ) : null}
      {typeof maxVisitors === "number" && maxVisitors > 0 ? (
        <div>{t("tarifs.capacity_visitors_block", { count: maxVisitors })}</div>
      ) : null}
    </div>
  );
}

function shouldHideStandbyDetailRow(row: PricingRow, hideStandbyRow: boolean): boolean {
  if (hideStandbyRow) return true;
  const code = planCodeFromRow(row);
  return code.includes("ETINCELLE") || code.includes("RAYONNEMENT") || code.includes("ZENITH");
}

function optionUnitPrice(row: PricingRow, optionCode: string): number | null {
  const fromOptions = row.pricing_options.find((o) => o.option_code === optionCode)?.unit_price_ttc_eur;
  if (typeof fromOptions === "number") return fromOptions;
  if (optionCode === "STANDBY") return row.standby_monthly_price_ttc_eur;
  return null;
}

function formatCompactEur(value: number | null | undefined, locale: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );
}

function planStandbyLabel(row: PricingRow, t: TFunction, locale: string): string {
  if (isCustomLanguagesPlanCode(planCodeFromRow(row))) return t("tarifs.sur_devis");
  const price = optionUnitPrice(row, "STANDBY");
  if (typeof price !== "number" || price <= 0) return t("tarifs.usage_none");
  return t("tarifs.standby_price", { price: formatCompactEur(price, locale) });
}

function planLanguagesLabel(row: PricingRow, t: TFunction, locale: string): string {
  if (isCustomLanguagesPlanCode(planCodeFromRow(row))) return t("tarifs.languages_custom");
  const min = row.included_mediation_langs_min;
  const max = row.included_mediation_langs_max ?? min;
  const extraPrice = optionUnitPrice(row, "EXTRA_MEDIATION_LANG");
  let included = "";
  if (min === 1 && max === 1) included = t("tarifs.languages_included_one", { count: 1 });
  else if (typeof min === "number" && typeof max === "number" && min !== max) {
    included = t("tarifs.languages_included_range", { min, max });
  } else if (typeof max === "number" && max > 1) {
    included = t("tarifs.languages_included_many", { count: max });
  } else if (typeof min === "number") {
    included = t("tarifs.languages_included_one", { count: min });
  } else {
    return t("tarifs.usage_none");
  }
  if (planCodeFromRow(row).includes("RAYONNEMENT")) {
    return `${included} ${t("tarifs.languages_extra_on_quote")}`;
  }
  if (typeof extraPrice !== "number") return included;
  return `${included} · ${t("tarifs.languages_extra", { price: formatCompactEur(extraPrice, locale) })}`;
}

function planAudioLabel(row: PricingRow, t: TFunction, locale: string): string {
  if (isCustomLanguagesPlanCode(planCodeFromRow(row))) return t("tarifs.languages_custom");
  const audioLangs = row.included_audio_langs ?? 0;
  const extraPrice = optionUnitPrice(row, "EXTRA_AUDIO_LANG");
  if (audioLangs <= 0) return t("tarifs.audio_none");
  const included =
    audioLangs === 1 ? t("tarifs.audio_included_one") : t("tarifs.audio_included_many", { count: audioLangs });
  if (planCodeFromRow(row).includes("RAYONNEMENT")) {
    return `${included} ${t("tarifs.languages_extra_on_quote")}`;
  }
  if (typeof extraPrice !== "number") return included;
  return `${included} · ${t("tarifs.audio_extra", { price: formatCompactEur(extraPrice, locale) })}`;
}

function planUsageLabel(row: PricingRow, t: TFunction): string {
  const code = planCodeFromRow(row);
  if (code.includes("ZENITH")) return t("tarifs.usage_custom_event");
  if (code.includes("RAYONNEMENT")) return t("tarifs.usage_network");
  if (code.includes("ETINCELLE") || row.trial_duration_days === 30) return t("tarifs.usage_limited_one_month");
  return t("tarifs.usage_no_limit");
}

function standbyPlanCodeFromDisplay(displayPlan: string): StandbyPlanCode | null {
  const upper = planNameAsciiUpper(displayPlan);
  if (upper.includes("ATELIER")) return "ATELIER";
  if (upper.includes("HORIZON")) return "HORIZON";
  return null;
}

function PlanPricingDetails({
  row,
  t,
  locale,
  isQuoteOnly,
  hideStandbyRow = false,
}: {
  row: PricingRow;
  t: TFunction;
  locale: string;
  isQuoteOnly: boolean;
  hideStandbyRow?: boolean;
}) {
  const hideStandby = shouldHideStandbyDetailRow(row, hideStandbyRow);
  const usageValue = planUsageLabel(row, t);
  const showUsageRow = usageValue !== t("tarifs.usage_no_limit");
  const rows = [
    ...(!hideStandby ? [{ label: t("tarifs.option_standby"), value: planStandbyLabel(row, t, locale) }] : []),
    ...(!isQuoteOnly
      ? [
          { label: t("tarifs.option_languages"), value: planLanguagesLabel(row, t, locale) },
          { label: t("tarifs.option_audio"), value: planAudioLabel(row, t, locale) },
        ]
      : []),
    ...(showUsageRow ? [{ label: t("tarifs.option_usage"), value: usageValue }] : []),
  ];

  return (
    <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 text-xs leading-relaxed text-muted-foreground">
      {rows.map((item) => (
        <div key={item.label} className="flex flex-wrap gap-x-1">
          <span className="font-medium text-foreground/80">{item.label} :</span>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function planEditorialDescription(plan: string, t: TFunction): string {
  const upper = plan.toUpperCase();
  if (upper.includes("ÉTINCELLE") || upper.includes("ETINCELLE")) {
    return t("tarifs.plan_desc_etincelle");
  }
  if (upper.includes("ATELIER")) {
    return t("tarifs.plan_desc_atelier");
  }
  if (upper.includes("HORIZON")) {
    return t("tarifs.plan_desc_horizon");
  }
  if (upper.includes("ENVERGURE")) {
    return t("tarifs.plan_desc_envergure");
  }
  if (upper.includes("RAYONNEMENT")) {
    return t("tarifs.plan_desc_rayonnement");
  }
  if (upper.includes("ZENITH") || upper.includes("ZÉNITH")) {
    return t("tarifs.plan_desc_zenith");
  }
  return "Offre AIMEDIArt.";
}

function QuotePlanSummary({ kind, t }: { kind: "rayonnement" | "zenith"; t: TFunction }) {
  const prefix = kind === "rayonnement" ? "plan_summary_rayonnement" : "plan_summary_zenith";
  return (
    <div className="text-sm leading-snug">
      <div className="font-semibold">{t(`tarifs.${prefix}_title`)}</div>
      <p className="mt-1 font-normal">{t(`tarifs.${prefix}_audience`)}</p>
      <p className="mt-1 font-normal italic">{t(`tarifs.${prefix}_footer`)}</p>
    </div>
  );
}

/** Titre court en tête de carte : seul le nom du palier, traduit via i18n. */
function planCardTitleShort(plan: string | null, t: TFunction): string {
  const ascii = planNameAsciiUpper(plan);
  const core = ascii
    .replace(/^L['']?\s*/i, "")
    .replace(/^LE\s+/i, "")
    .trim();

  if (core.includes("ZENITH")) return t("tarifs.plan_name_zenith");
  if (core.includes("RAYONNEMENT")) return t("tarifs.plan_name_rayonnement");
  if (core.includes("ENVERGURE")) return t("tarifs.plan_name_envergure");
  if (core.includes("HORIZON")) return t("tarifs.plan_name_horizon");
  if (core.includes("ATELIER")) return t("tarifs.plan_name_atelier");
  if (core.includes("ETINCELLE")) return t("tarifs.plan_name_etincelle");

  const raw = (plan ?? "").trim();
  if (!raw) return t("tarifs.plan_name_etincelle");
  const first = raw.split(/\s*[–—-]\s*/)[0]?.trim() ?? raw;
  return first.replace(/^L['’]\s*/i, "L’").replace(/^Le\s+/i, "").replace(/^La\s+/i, "").trim() || raw;
}


/** Badge éditorial en tête de carte, fixe par offre (plus de compteur fragile). */
function planBadgeLabel(plan: string | null, t: TFunction): string {
  const ascii = planNameAsciiUpper(plan);
  if (ascii.includes("ZENITH")) return t("tarifs.badge_zenith");
  if (ascii.includes("RAYONNEMENT")) return t("tarifs.badge_rayonner");
  if (ascii.includes("ENVERGURE")) return t("tarifs.badge_sublimer");
  if (ascii.includes("HORIZON")) return t("tarifs.badge_conquerir");
  if (ascii.includes("ATELIER")) return t("tarifs.badge_creer");
  if (ascii.includes("ETINCELLE")) return t("tarifs.badge_tester");
  return t("tarifs.badge_recommande");
}

/** Enveloppe « surface » (hero / sections) — divs statiques, sans Framer Motion. */
function SurfaceCardShell({
  decorations,
  children,
  backgroundImage,
  backgroundWebp,
  backgroundImageAlt,
  backgroundGradient = "left",
  backgroundImageLayout = "side-fade",
}: {
  decorations?: ReactNode;
  children: ReactNode;
  backgroundImage?: string;
  backgroundWebp?: string;
  backgroundImageAlt?: string;
  backgroundGradient?: "left" | "right";
  /** side-fade : photo sur le côté (connexion) ; full-width : photo entière sur toute la largeur */
  backgroundImageLayout?: "side-fade" | "full-width";
}) {
  const defaultDecorations = (
    <>
      <div
        className="pointer-events-none absolute -right-6 top-20 h-40 w-40 rounded-full bg-[rgba(230,57,70,0.07)] ph-animate-shimmer blur-2xl"
        aria-hidden
      />
      <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] bg-[rgba(168,23,29,0.06)]" aria-hidden />
      <div
        className="pointer-events-none absolute -left-8 bottom-10 h-16 w-16 rounded-full border border-[rgba(168,23,29,0.2)]"
        aria-hidden
      />
    </>
  );

  return (
    <div className="mx-2 my-3 sm:mx-3 sm:my-4">
      <div className="relative overflow-hidden rounded-[2rem] border border-neutral-300/80 bg-[#faf8f5] p-5 shadow-[0_12px_28px_rgba(0,0,0,0.06)] sm:p-10 lg:p-12">
        {backgroundImage ? (
          backgroundImageLayout === "full-width" ? (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 w-full [mask-image:linear-gradient(to_bottom,black_0%,black_32%,rgba(0,0,0,0.85)_48%,rgba(0,0,0,0.45)_62%,transparent_88%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_32%,rgba(0,0,0,0.85)_48%,rgba(0,0,0,0.45)_62%,transparent_88%)]"
                aria-hidden
              >
                <OptimizedImage
                  src={backgroundImage}
                  webpSrc={backgroundWebp}
                  alt=""
                  className="block h-auto w-full object-contain object-top"
                  loading="eager"
                  aria-hidden
                />
              </div>
              <div
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_28%,rgba(250,248,245,0.35)_52%,#faf8f5_78%,#faf8f5_100%)]"
                aria-hidden
              />
            </>
          ) : (
            <>
              <OptimizedImage
                src={backgroundImage}
                webpSrc={backgroundWebp}
                alt={backgroundImageAlt ?? ""}
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full object-cover",
                  backgroundGradient === "right" ? "object-left" : "object-right",
                )}
                loading="eager"
                aria-hidden={!backgroundImageAlt}
              />
              <div
                className={cn(
                  "pointer-events-none absolute inset-0",
                  backgroundGradient === "right"
                    ? "bg-gradient-to-l from-[#faf8f5] from-[34%] via-[#faf8f5]/90 to-[#faf8f5]/25"
                    : "bg-gradient-to-r from-[#faf8f5] from-[34%] via-[#faf8f5]/90 to-[#faf8f5]/25",
                )}
                aria-hidden
              />
            </>
          )
        ) : (
          decorations ?? defaultDecorations
        )}
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  eyebrowClassName,
  titleClassName,
  title,
  children,
  surfaceCard = false,
  backgroundImage,
  backgroundWebp,
  backgroundImageAlt,
  backgroundGradient = "left",
  backgroundImageLayout = "side-fade",
}: {
  id: string;
  eyebrow?: string;
  /** Classes additionnelles pour le surtitre (eyebrow), ex. alignement ou largeur ciblée */
  eyebrowClassName?: string;
  /** Classes additionnelles pour le titre h2, ex. max-w plus large */
  titleClassName?: string;
  title: ReactNode;
  children: ReactNode;
  /** Même enveloppe visuelle que le bloc principal du hero (#accueil) */
  surfaceCard?: boolean;
  backgroundImage?: string;
  backgroundWebp?: string;
  backgroundImageAlt?: string;
  backgroundGradient?: "left" | "right";
  backgroundImageLayout?: "side-fade" | "full-width";
}) {
  const inner = (
    <>
      {eyebrow ? (
        <p
          className={cn(
            "text-[11px] font-bold uppercase tracking-[0.14em] text-[#E63946]",
            eyebrowClassName,
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          "mt-2 max-w-[23ch] text-[1.95rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[2.2rem]",
          titleClassName,
        )}
      >
        {title}
      </h2>
      <div className="mt-9">{children}</div>
    </>
  );

  return (
    <section id={id} className="scroll-mt-[68px] pb-0 pt-3">
      <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
        {surfaceCard ? (
          <SurfaceCardShell
            backgroundImage={backgroundImage}
            backgroundWebp={backgroundWebp}
            backgroundImageAlt={backgroundImageAlt}
            backgroundGradient={backgroundGradient}
            backgroundImageLayout={backgroundImageLayout}
            decorations={
              backgroundImage ? undefined : (
                <>
                  <div
                    className="pointer-events-none absolute -right-6 top-20 h-40 w-40 rounded-full bg-[rgba(230,57,70,0.07)] ph-animate-shimmer blur-2xl"
                    aria-hidden
                  />
                  <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] bg-[rgba(168,23,29,0.06)]" aria-hidden />
                  <div
                    className="absolute -left-8 bottom-10 h-16 w-16 rounded-full border border-[rgba(168,23,29,0.2)]"
                    aria-hidden
                  />
                </>
              )
            }
          >
            {inner}
          </SurfaceCardShell>
        ) : (
          inner
        )}
      </div>
    </section>
  );
}

export default function PublicHome({ initialData: initialDataProp }: PublicHomeProps = {}) {
  const { t, i18n } = useTranslation("home");
  const location = useLocation();
  const resolvedInitialData = useMemo(
    () => initialDataProp ?? getOrganisationInitialData(),
    [initialDataProp],
  );
  const [pricingLoading, setPricingLoading] = useState(!resolvedInitialData);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingRows, setPricingRows] = useState<PricingRow[]>(resolvedInitialData?.pricingRows ?? []);
  const [selectedVariantByPlan, setSelectedVariantByPlan] = useState<Record<string, number>>({});
  const [promptIcons, setPromptIcons] = useState<string[]>(resolvedInitialData?.promptIcons ?? []);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  // Coverflow tarifs : estompe les cartes selon leur distance au centre.
  // → centrale nette, 2 cartes inclinées de chaque côté, puis 1 carte en perspective derrière.
  const applyPricingCoverflowDepth = (swiper: SwiperClass) => {
    swiper.slides.forEach((slide) => {
      const inner = slide.querySelector<HTMLElement>(".ph-pricing-slide-inner");
      if (!inner) return;
      const dist = Math.abs((slide as HTMLElement & { progress: number }).progress);
      // 5 cartes visibles au total : centrale + 2 de chaque côté. Au-delà, masqué.
      const opacity = dist > 2.6 ? 0 : Math.max(0.4, 1 - dist * 0.3);
      inner.style.opacity = String(opacity);
      inner.style.visibility = dist > 2.8 ? "hidden" : "visible";
    });
  };

  const syncPricingCoverflowTransition = (swiper: SwiperClass, duration: number) => {
    swiper.slides.forEach((slide) => {
      const inner = slide.querySelector<HTMLElement>(".ph-pricing-slide-inner");
      if (inner) inner.style.transitionDuration = `${duration}ms`;
    });
  };

  useEffect(() => {
    const anchorId = location.hash.replace(/^#/, "").trim();
    if (!anchorId || location.pathname !== "/organisation") return;
    scrollToVitrineAnchor(anchorId);
    // Après ancre (#accessibilite…), forcer le chargement des img lazy dans la section cible
    requestAnimationFrame(() => {
      const section = document.getElementById(anchorId);
      section?.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => {
        img.loading = "eager";
        img.decode?.().catch(() => undefined);
      });
    });
  }, [location.hash, location.pathname]);

  useEffect(() => {
    if (resolvedInitialData) return;

    let cancelled = false;
    const run = async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
      if (!supabaseUrl || !anonKey) {
        setPricingError("Configuration Supabase manquante.");
        setPricingLoading(false);
        return;
      }

      setPricingLoading(true);
      setPricingError(null);
      try {
        const data = await fetchPublicHomeData(supabaseUrl, anonKey);
        if (cancelled) return;
        setPricingRows(data.pricingRows);
        setPromptIcons(data.promptIcons);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Chargement des tarifs impossible.";
        setPricingError(message);
        setPricingRows([]);
      } finally {
        if (!cancelled) setPricingLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [resolvedInitialData]);

  const zenithPlan = useMemo(
    () =>
      pricingRows.find(
        (r) => isZenithPlanName(r.plan_code) || isZenithPlanName(r.pricing_plan),
      ) ?? null,
    [pricingRows],
  );

  const groupedPlans = useMemo(() => {
    const rows = [...pricingRows].filter(
      (r) =>
        (r.pricing_plan ?? "").trim().length > 0 &&
        !isZenithPlanName(r.pricing_plan) &&
        !isZenithPlanName(r.plan_code),
    );
    rows.sort((a, b) => {
      const p = planSortKey(a.pricing_plan) - planSortKey(b.pricing_plan);
      if (p !== 0) return p;
      const aUnlimited = Boolean(a.pricing_is_unlimited);
      const bUnlimited = Boolean(b.pricing_is_unlimited);
      if (aUnlimited !== bUnlimited) return aUnlimited ? 1 : -1; // illimité en dernier
      const aOeuvres = typeof a.pricing_max_oeuvres === "number" ? a.pricing_max_oeuvres : 0;
      const bOeuvres = typeof b.pricing_max_oeuvres === "number" ? b.pricing_max_oeuvres : 0;
      if (aOeuvres !== bOeuvres) return aOeuvres - bOeuvres;
      const aVis = typeof a.princing_max_visitors === "number" ? a.princing_max_visitors : 0;
      const bVis = typeof b.princing_max_visitors === "number" ? b.princing_max_visitors : 0;
      return aVis - bVis;
    });

    const map = new Map<string, PricingRow[]>();
    for (const row of rows) {
      const key = normalizePlan(row.pricing_plan);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    const orderOf = (planKey: string, variants: PricingRow[]): number => {
      const explicit = variants
        .map((v) => (typeof v.sort_order === "number" ? v.sort_order : null))
        .filter((n): n is number => n !== null);
      if (explicit.length > 0) return Math.min(...explicit);
      return planSortKey(planKey);
    };
    return [...map.entries()]
      .map(([planKey, variants]) => ({ planKey, variants }))
      .sort((a, b) => orderOf(a.planKey, a.variants) - orderOf(b.planKey, b.variants));
  }, [pricingRows]);

  return (
    <PublicVitrineShell vitrinePathPrefix="">
        <section id="accueil" className="scroll-mt-[68px] pb-0 pt-0" aria-labelledby="hero-title">
          <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
            <SurfaceCardShell
              decorations={
                <>
                  <div className="pointer-events-none absolute -right-6 top-20 h-40 w-40 rounded-full bg-[rgba(230,57,70,0.07)] ph-animate-shimmer blur-2xl" aria-hidden />
                  <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] bg-[rgba(168,23,29,0.06)]" aria-hidden />
                  <div className="absolute -left-8 bottom-10 h-16 w-16 rounded-full border border-[rgba(168,23,29,0.2)]" aria-hidden />
                </>
              }
            >
              <p className="mt-2 max-w-[52ch] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E63946]/90">
                {t("hero.eyebrow")}
              </p>
              <h1
                id="hero-title"
                className="mt-4 max-w-[18ch] text-[2.05rem] font-semibold leading-[1.08] tracking-tight text-foreground max-[389px]:text-[1.85rem] sm:max-w-[22ch] sm:text-5xl lg:text-[3.35rem]"
              >
                <span className="block">{t("hero.title_line1")}</span>
                <span className="block">{t("hero.title_line2")}</span>
                <span className="sr-only">
                  {" — médiation d'exposition par QR code et intelligence artificielle pour musées, galeries et lieux culturels"}
                </span>
              </h1>
              <p className="mt-5 max-w-[92ch] text-[1rem] leading-[1.75] text-foreground/85 max-[389px]:text-[0.95rem] sm:text-[17px]" style={{ whiteSpace: "pre-line" }}>
                {highlightAimediartWord(t("hero.intro_1"))}
              </p>
              <p className="mt-4 max-w-[88ch] text-[1rem] leading-[1.75] text-foreground/78 sm:text-[1.05rem]" style={{ whiteSpace: "pre-line" }}>
                {t("hero.intro_2")}
              </p>
              <figure className="mt-6 overflow-hidden rounded-2xl border border-neutral-300/70 bg-white">
                <OptimizedImage
                  src={UNSPLASH_HERO_IMAGE}
                  alt={t("hero.image_alt")}
                  className="h-48 w-full object-cover object-center sm:h-60"
                  priority
                  width={1060}
                  height={360}
                />
              </figure>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#exposition-vivante" className="w-full sm:w-auto">
                  <Button
                    className="h-11 w-full rounded-xl px-5 text-sm font-semibold sm:w-auto"
                    style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}
                  >
                    {t("hero.cta_discover")}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Button>
                </a>
                <a href="#parcours" className="w-full sm:w-auto">
                  <Button variant="outline" className="h-11 w-full rounded-xl border-neutral-300 bg-white/80 px-5 sm:w-auto">
                    {t("hero.cta_parcours")}
                  </Button>
                </a>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-neutral-300/70 bg-white/95 p-4 ph-animate-float ph-fold-card">
                  <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground">{t("hero.feature_qr_label")}</p>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <p className="max-w-[18ch] text-sm leading-relaxed text-foreground/85">{t("hero.feature_qr_text")}</p>
                    <div className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 p-2" aria-hidden>
                      <QrCode className="h-6 w-6 text-[#9d2525]" />
                    </div>
                  </div>
                </article>
                <article className="rounded-2xl border border-neutral-300/70 bg-white/95 p-4 ph-animate-float-delayed ph-fold-card">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("hero.feature_lang_label")}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{t("hero.feature_lang_text")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Icônes des modes de langage">
                    {(promptIcons.length > 0 ? promptIcons : ["🎓", "🪶", "🧒", "✨"]).map((icon, idx) => (
                      <span
                        key={`mode-icon-${icon}-${idx}`}
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 px-1 text-base"
                        aria-hidden
                      >
                        {icon}
                      </span>
                    ))}
                  </div>
                </article>
                <article className="rounded-2xl border border-neutral-300/70 bg-white/95 p-4 ph-animate-float ph-fold-card">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("hero.feature_hearts_label")}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                    {t("hero.feature_hearts_text")}
                  </p>
                </article>
              </div>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-5">
                <blockquote className="min-w-0 flex-1 border-l-2 border-[rgba(168,23,29,0.5)] pl-4 text-sm italic leading-relaxed text-foreground/75 sm:max-w-[52ch]">
                  {t("hero.quote")}
                </blockquote>
                <AiGenerationInfoTrigger className="w-full shrink-0 sm:mt-0 sm:w-[min(100%,459px)]" />
              </div>
            </SurfaceCardShell>
          </div>
        </section>

        <Section
          surfaceCard
          id="exposition-vivante"
          eyebrow={t("exposition.eyebrow")}
          title={
            t("exposition.title_line1", { defaultValue: "" }) ? (
              <>
                <span className="block">
                  {t("exposition.title_line1")}
                  <br />
                  {t("exposition.title_line2")}
                </span>
                <span className="mt-1.5 block text-[0.65rem] font-normal italic leading-snug tracking-[0.6px] text-foreground/65 sm:text-[0.7rem]">
                  {t("exposition.title_note")}
                </span>
              </>
            ) : (
              t("exposition.title")
            )
          }
        >
          <div className="w-full space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-base">
            <p className="w-full">{highlightAimediartWord(t("exposition.text_1"))}</p>
            <p className="w-full">{t("exposition.text_2")}</p>
          </div>
          <figure className="mt-8 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <OptimizedImage
                src={expositionVivantePhoto}
                webpSrc={expositionVivanteWebp}
                alt={t("exposition.image_alt")}
                className="home-hero-image"
                loading="eager"
                width={1010}
                height={288}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
        </Section>

        <Section
          surfaceCard
          id="oreille-attentive"
          eyebrow={t("oreille.eyebrow")}
          eyebrowClassName="text-left w-[500px]"
          title={
            t("oreille.title_line1", { defaultValue: "" }) ? (
              <span className="block">
                {t("oreille.title_line1")}
                <br />
                {t("oreille.title_line2")}
              </span>
            ) : (
              t("oreille.title")
            )
          }
        >
          <div className="flex w-full max-w-full flex-col gap-8 lg:w-[900px] lg:flex-row lg:items-start lg:gap-8">
            <div className="w-full min-w-0 flex-1 space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem] lg:min-w-0">
              <p>{highlightAimediartWord(t("oreille.text_1"))}</p>
              <p>{t("oreille.text_2")}</p>
            </div>
            <div className="w-full min-w-0 text-left lg:flex lg:h-[350px] lg:w-[300px] lg:shrink-0 lg:flex-col lg:items-end lg:justify-end lg:text-right">
              <figure className="ml-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-neutral-300/70 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
                <OptimizedImage
                  src={oreilleAttentivePhoto}
                  webpSrc={oreilleAttentiveWebp}
                  alt={t("oreille.image_alt")}
                  className="aspect-[4/3] w-full max-w-[300px] object-cover object-center object-bottom sm:aspect-[5/4] lg:aspect-auto lg:h-[350px] lg:min-h-[350px] lg:w-[300px]"
                  loading="eager"
                  width={300}
                  height={350}
                />
              </figure>
            </div>
          </div>
        </Section>

        <Section
          surfaceCard
          id="output-creatif"
          eyebrow={t("output.eyebrow")}
          title={t("output.title")}
        >
          <p className="max-w-[72ch] text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">{t("output.intro")}</p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <article>
            <Card className="group rounded-3xl border-neutral-300/70 bg-gradient-to-b from-violet-50/90 to-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] transition-transform duration-300 ph-fold-card">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-24 items-end justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-400/25 via-fuchsia-400/20 to-transparent ph-animate-float">
                  <Cloud className="h-14 w-14 text-indigo-500/90" strokeWidth={1.25} aria-hidden />
                </div>
                <CardTitle className="text-lg">{t("output.card_nuage_title")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                <p>{t("output.card_nuage_text")}</p>
              </CardContent>
            </Card>
            </article>
            <article>
            <Card className="group rounded-3xl border-neutral-300/70 bg-gradient-to-b from-rose-50/90 to-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] transition-transform duration-300 ph-fold-card">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-300/25 to-amber-100/40 ph-animate-float-delayed">
                  <Wind className="h-12 w-12 text-rose-600/85" strokeWidth={1.25} aria-hidden />
                </div>
                <CardTitle className="text-lg">{t("output.card_murmures_title")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                <p>{highlightAimediartWord(t("output.card_murmures_text"))}</p>
              </CardContent>
            </Card>
            </article>
            <article>
            <Card className="group rounded-3xl border-neutral-300/70 bg-gradient-to-b from-sky-50/90 to-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] transition-transform duration-300 ph-fold-card">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400/30 to-emerald-300/15">
                  <ThermometerSun className="h-12 w-12 text-sky-600/90 ph-animate-shimmer" strokeWidth={1.25} aria-hidden />
                </div>
                <CardTitle className="text-lg">{t("output.card_thermometre_title")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                <p>{t("output.card_thermometre_text")}</p>
              </CardContent>
            </Card>
            </article>
          </div>
          <figure className="mt-10 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <OptimizedImage
                src={outputCreatifPhoto}
                webpSrc={outputCreatifWebp}
                alt={t("output.image_alt")}
                className="home-hero-image"
                loading="eager"
                width={1010}
                height={288}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
        </Section>

        <Section
          surfaceCard
          id="live-scenographie"
          eyebrow={t("live.eyebrow")}
          title={t("live.title")}
          titleClassName="max-w-[600px]"
        >
          <div className="w-full space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-base">
            <p className="w-full">{highlightAimediartWord(t("live.text_1"))}</p>
            <p className="w-full">{t("live.text_2")}</p>
          </div>
          <div className="relative mt-8 overflow-hidden rounded-2xl border border-emerald-900/25 bg-gradient-to-b from-slate-950 via-emerald-950/90 to-black px-5 py-6 sm:px-8">
            <p className="relative z-10 max-w-[62ch] text-sm leading-relaxed text-emerald-50/95">
              {t("live.canopy_caption")}
            </p>
            <p className="relative z-10 mt-5 w-full text-right text-sm font-semibold italic text-red-500 sm:text-base">
              {t("live.canopy_cta")}
            </p>
            <LazyWhenVisible minHeight={150}>
              <Suspense fallback={<div className="relative mt-3 w-full rounded-lg bg-black/20" style={{ minHeight: 150 }} aria-hidden />}>
                <ForestCanopySketch className="relative mt-3 w-full overflow-hidden rounded-lg bg-black/20" />
              </Suspense>
            </LazyWhenVisible>
          </div>
        </Section>

        <Section surfaceCard id="sans-friction" eyebrow={t("friction.eyebrow")} title={t("friction.title")}>
          <div className="max-w-[68ch] space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
            <p className="w-full">{highlightAimediartWord(t("friction.text_1"), "block w-full")}</p>
            <p className="w-full">{t("friction.text_2")}</p>
          </div>
        </Section>

        <Section
          surfaceCard
          id="pont-ecran"
          eyebrow={t("pont.eyebrow")}
          title={t("pont.title")}
        >
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div className="space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
              <p>{t("pont.text_1")}</p>
              <p>{t("pont.text_2")}</p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-neutral-300/80 bg-neutral-950 px-5 py-6 text-neutral-100 shadow-inner">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  <Smartphone className="h-4 w-4 text-emerald-400" aria-hidden />
                  {t("pont.label_visitor")}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  <MonitorPlay className="h-4 w-4 text-sky-400" aria-hidden />
                  {t("pont.label_screen")}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] font-medium text-neutral-500">{t("pont.hearts_label")}</p>
                  <div className="ph-heart-rain-cell relative mt-3 h-24 rounded-lg bg-gradient-to-b from-rose-500/20 to-transparent">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span key={`h-${i}`} className="text-rose-400/90" style={{ "--i": i } as CSSProperties} aria-hidden>
                        ♥
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] font-medium text-neutral-500">{t("pont.emotions_label")}</p>
                  <div className="relative mt-3 flex h-24 items-center justify-center">
                    <div className="ph-wave-pulse absolute h-20 w-20 rounded-full border-2 border-violet-400/40" aria-hidden />
                    <div className="ph-wave-pulse absolute h-14 w-14 rounded-full border border-cyan-400/35 [animation-delay:0.6s]" aria-hidden />
                    <span className="relative text-center text-xs font-medium leading-snug text-neutral-200">
                      {t("pont.emotions_sample")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          surfaceCard
          id="production"
          eyebrow={t("production.eyebrow")}
          title={t("production.title")}
          titleClassName="max-w-[600px] text-left whitespace-pre-line"
        >
          <div className="max-w-[72ch] space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-base">
            <p>{highlightAimediartWord(t("production.text_1"))}</p>
            <p>{t("production.text_2")}</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                id: "prod-photo",
                label: t("production.step_photo_label"),
                title: t("production.step_photo_title"),
                text: t("production.step_photo_text"),
                icon: Camera,
              },
              {
                id: "prod-analysis",
                label: t("production.step_analysis_label"),
                title: t("production.step_analysis_title"),
                text: t("production.step_analysis_text"),
                icon: ScanSearch,
              },
              {
                id: "prod-personas",
                label: t("production.step_personas_label"),
                title: t("production.step_personas_title"),
                text: t("production.step_personas_text"),
                icon: Languages,
              },
              {
                id: "prod-audio",
                label: t("production.step_audio_label"),
                title: t("production.step_audio_title"),
                text: t("production.step_audio_text"),
                icon: Volume2,
              },
              {
                id: "prod-cartel",
                label: t("production.step_cartel_label"),
                title: t("production.step_cartel_title"),
                text: t("production.step_cartel_text"),
                icon: FileText,
              },
              {
                id: "prod-stats",
                label: t("production.step_stats_label"),
                title: t("production.step_stats_title"),
                text: t("production.step_stats_text"),
                icon: BarChart3,
              },
            ].map((step) => (
              <article
                key={step.id}
                className="rounded-2xl border border-neutral-300/70 bg-white p-4 shadow-[0_8px_18px_rgba(0,0,0,0.04)] ph-fold-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#E63946] bg-[#fdf8f7] text-xs font-bold tabular-nums text-[#E63946]"
                    aria-hidden
                  >
                    {step.label}
                  </span>
                  <div className="rounded-full border border-neutral-300 bg-neutral-50 p-2">
                    <step.icon className="h-4 w-4 text-foreground/70" aria-hidden />
                  </div>
                </div>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">{step.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProductionStatCard
              prefix={t("production.stat_up_to")}
              value={t("production.stat_personas_number")}
              label={t("production.stat_personas_label")}
            />
            <ProductionStatCard
              prefix={t("production.stat_up_to")}
              value={t("production.stat_languages_number")}
              label={t("production.stat_languages_label")}
            />
            <ProductionStatCard
              value={t("production.stat_voices_number")}
              label={t("production.stat_voices_label")}
              sublabel={t("production.stat_voices_sublabel")}
              valueGenderIcons
            />
            <ProductionStatCard
              prefix={t("production.stat_up_to")}
              value={t("production.stat_texts_number")}
              label={t("production.stat_texts_label")}
            />
          </div>
          <p className="mt-2 max-w-[600px] text-left text-[11px] italic leading-relaxed text-[#E63946]">
            {t("production.stat_footnote")}
          </p>
        </Section>

        <Section
          surfaceCard
          id="parcours"
          eyebrow={t("parcours.eyebrow")}
          title={t("parcours.title")}
          titleClassName="max-w-[600px] text-left whitespace-pre-line"
        >
          <div className="relative grid gap-4 lg:grid-cols-3">
            <div className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-[30px] hidden h-px bg-neutral-300 lg:block" aria-hidden />
            <div className="pointer-events-none absolute left-[33.33%] top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block" aria-hidden>
              <div className="rounded-full border border-[#E63946]/35 bg-white/90 p-2 shadow-[0_8px_16px_rgba(230,57,70,0.25)]">
                <ArrowRight className="h-5 w-5 text-[#E63946]" />
              </div>
            </div>
            <div className="pointer-events-none absolute left-[66.66%] top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block" aria-hidden>
              <div className="rounded-full border border-[#E63946]/35 bg-white/90 p-2 shadow-[0_8px_16px_rgba(230,57,70,0.25)]">
                <ArrowRight className="h-5 w-5 text-[#E63946]" />
              </div>
            </div>
            {[
              {
                id: "step1",
                step: t("parcours.step1_label"),
                title: t("parcours.step1_title"),
                text: t("parcours.step1_text"),
                icon: QrCode,
              },
              {
                id: "step2",
                step: t("parcours.step2_label"),
                title: t("parcours.step2_title"),
                text: t("parcours.step2_text"),
                icon: MessagesSquare,
              },
              {
                id: "step3",
                step: t("parcours.step3_label"),
                title: t("parcours.step3_title"),
                text: t("parcours.step3_text"),
                icon: HeartHandshake,
              },
            ].map((x) => (
              <article key={x.id} aria-labelledby={`${x.id}-title`}>
              <Card className="relative rounded-3xl border-neutral-300/70 bg-white shadow-[0_10px_22px_rgba(0,0,0,0.05)] ph-fold-card">
                <CardHeader className="pb-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{x.step}</p>
                    <div className="rounded-full border border-neutral-300 bg-neutral-50 p-2">
                      <x.icon className="h-4 w-4 text-foreground/70" aria-hidden />
                    </div>
                  </div>
                  <CardTitle
                    id={`${x.id}-title`}
                    className={cn(
                      "text-xl",
                      x.id === "step2" && "max-w-[600px] text-left whitespace-pre-line",
                    )}
                  >
                    {x.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-foreground/80">
                  <p style={{ whiteSpace: "pre-line" }}>{x.text}</p>
                  {x.id === "step2" ? (
                    <p className="mt-2 text-[11px] italic text-muted-foreground" style={{ whiteSpace: "normal" }}>{t("parcours.step2_falc_note")}</p>
                  ) : null}
                </CardContent>
              </Card>
              </article>
            ))}
          </div>

          <figure className="mb-5 mt-10 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <OptimizedImage
                src={parcoursPhoto}
                webpSrc={parcoursWebp}
                alt={t("parcours.image_alt")}
                className="home-hero-image"
                loading="eager"
                width={1010}
                height={288}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-3xl border border-neutral-300/70 bg-[#fdfdfc] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)] ph-fold-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("parcours.commissaire_eyebrow")}</p>
              <h3 className="mt-2 max-w-[600px] text-left text-2xl font-semibold tracking-tight whitespace-pre-line">{t("parcours.commissaire_title")}</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">{t("parcours.commissaire_text")}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {[
                  { id: "kpi_scans", kpi: "1 248", label: t("parcours.kpi_scans_label") },
                  { id: "kpi_note", kpi: "4,3 / 5", label: t("parcours.kpi_note_label") },
                  { id: "kpi_emotion", kpi: "62%", label: t("parcours.kpi_emotion_label") },
                  { id: "kpi_retours", kpi: "+31%", label: t("parcours.kpi_retours_label") },
                ].map((item) => (
                  <div key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <p className="text-xl leading-none text-foreground">{item.kpi}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-3xl border border-neutral-300/70 bg-white p-5 shadow-[0_12px_24px_rgba(0,0,0,0.05)] ph-fold-card">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("parcours.benefices_label")}</p>
              <div className="mt-3 grid gap-2">
                {[
                  t("parcours.benefit_1"),
                  t("parcours.benefit_2"),
                  t("parcours.benefit_3"),
                  t("parcours.benefit_4"),
                  t("parcours.benefit_5"),
                  t("parcours.benefit_6"),
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-xl bg-neutral-50 p-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_RED }} aria-hidden />
                    <p className="text-sm leading-4 text-foreground/80">{item}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-neutral-300/70 bg-[#fdfdfc] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)] ph-fold-card">
              <div className="flex items-start gap-3">
                <div className="rounded-full border border-neutral-300 bg-white p-2">
                  <MapPin className="h-5 w-5 text-[#E63946]" aria-hidden />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("parcours.geography_eyebrow")}</p>
                  <h3 className="mt-2 max-w-[600px] text-left text-xl font-semibold tracking-tight whitespace-pre-line">{t("parcours.geography_title")}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/80">{t("parcours.geography_text")}</p>
              <p className="mt-3 text-[11px] italic leading-relaxed text-muted-foreground">{t("parcours.geography_disclaimer")}</p>
              <VitrineGeographyDemoMap />
            </article>
            <article className="rounded-3xl border border-neutral-300/70 bg-white p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)] ph-fold-card">
              <div className="flex items-start gap-3">
                <div className="rounded-full border border-neutral-300 bg-neutral-50 p-2">
                  <FileText className="h-5 w-5 text-[#E63946]" aria-hidden />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("parcours.pdf_eyebrow")}</p>
                  <h3 className="mt-2 max-w-[600px] text-left text-xl font-semibold tracking-tight whitespace-pre-line">{t("parcours.pdf_title")}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/80">{t("parcours.pdf_text")}</p>
              <VitrineStatsDemoPreview />
            </article>
          </div>

        </Section>

        <Section
          surfaceCard
          id="tarifs"
          title={t("tarifs.title")}
          titleClassName="max-w-[600px] text-left whitespace-pre-line"
          backgroundImage={tarifsPhoto}
          backgroundWebp={tarifsWebp}
          backgroundImageAlt={t("tarifs.image_alt")}
          backgroundImageLayout="full-width"
        >
          <div className="mt-7">
            {pricingLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-neutral-300/70 bg-white p-12 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                <span className="ml-3 text-sm text-muted-foreground">{t("tarifs.loading")}</span>
              </div>
            ) : pricingError ? (
              <div className="rounded-3xl border border-destructive/30 bg-white p-5 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <p className="text-sm font-medium text-destructive">{t("tarifs.error_title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pricingError}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <Trans
                    i18nKey="tarifs.error_text"
                    ns="home"
                    components={{ code: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]" /> }}
                  />
                </p>
              </div>
            ) : groupedPlans.length === 0 ? (
              <div className="rounded-3xl border border-neutral-300/70 bg-white p-5 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <p className="text-sm text-muted-foreground">{t("tarifs.empty")}</p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex justify-center">
                  <div
                    role="tablist"
                    aria-label={t("tarifs.billing_toggle_label", { defaultValue: "Périodicité de paiement" })}
                    className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white p-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={billingPeriod === "monthly"}
                      onClick={() => setBillingPeriod("monthly")}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200",
                        billingPeriod === "monthly" ? "bg-[#9d2525] text-white shadow-sm" : "text-neutral-600 hover:text-[#9d2525]",
                      )}
                    >
                      {t("tarifs.toggle_monthly", { defaultValue: "Mensuel" })}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={billingPeriod === "annual"}
                      onClick={() => setBillingPeriod("annual")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200",
                        billingPeriod === "annual" ? "bg-[#9d2525] text-white shadow-sm" : "text-neutral-600 hover:text-[#9d2525]",
                      )}
                    >
                      {t("tarifs.toggle_annual", { defaultValue: "Annuel" })}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          billingPeriod === "annual" ? "bg-white/20 text-white" : "bg-[#9d2525]/10 text-[#9d2525]",
                        )}
                      >
                        {t("tarifs.toggle_annual_badge", { defaultValue: "-2 mois" })}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="relative w-full px-1 sm:px-10">
                  <div className="ph-pricing-coverflow relative rounded-[8px] border border-[#9d2525] p-[5px] shadow-[inset_0px_4px_12px_0px_rgba(157,37,37,0.15)] bg-[radial-gradient(circle_at_50%_50%,rgba(174,174,174,1)_0%,rgba(255,255,255,1)_100%)]">
                  <Swiper
                    modules={[EffectCoverflow, Navigation, Autoplay, A11y]}
                    effect="coverflow"
                    grabCursor
                    centeredSlides
                    slidesPerView="auto"
                    spaceBetween={0}
                    loop
                    navigation
                    autoplay={{ delay: 2200, disableOnInteraction: false, pauseOnMouseEnter: true }}
                    speed={650}
                    watchSlidesProgress
                    onInit={applyPricingCoverflowDepth}
                    onSetTranslate={applyPricingCoverflowDepth}
                    onSetTransition={syncPricingCoverflowTransition}
                    coverflowEffect={{ rotate: 34, stretch: -12, depth: 110, modifier: 1, scale: 0.9, slideShadows: false }}
                    className="ph-pricing-swiper !px-2 !py-8"
                  >
                  {(() => {
                    return groupedPlans.map(({ planKey, variants }) => {
                    const first = variants[0];
                    const displayPlan = first?.pricing_plan?.trim() || planKey;
                    const cardTitleShort = planCardTitleShort(displayPlan, t);
                    const planUpper = displayPlan.toUpperCase();
                    const isHighlight = /HORIZON|ATELIER/.test(planUpper);
                    const topRank = planUpper.includes("HORIZON")
                      ? 1
                      : planUpper.includes("ENVERGURE")
                        ? 2
                        : planUpper.includes("ATELIER")
                          ? 3
                          : null;
                    const rawLabel = first?.pricing_label?.trim() ?? "";
                    const repeatsPlanName = rawLabel.toUpperCase().includes(displayPlan.toUpperCase());
                    const selectedIndexRaw = selectedVariantByPlan[planKey] ?? 0;
                    const selectedIndex = Math.min(Math.max(selectedIndexRaw, 0), Math.max(variants.length - 1, 0));
                    const selectedVariant = variants[selectedIndex];
                    const isRayonnementCard = isRayonnementPlanName(displayPlan);
                    const isQuoteOnlyCard = selectedVariant
                      ? isQuoteOnlyRow(selectedVariant)
                      : isQuoteOnlyPlanName(displayPlan);
                    const showAnnualColumn = shouldShowAnnualPricingColumn(selectedVariant, isQuoteOnlyCard);
                    const subtitle =
                      rawLabel && !repeatsPlanName
                        ? rawLabel
                        : isRayonnementCard
                          ? t("tarifs.plan_desc_rayonnement")
                          : planEditorialDescription(displayPlan, t);
                    const badgeLabel = planBadgeLabel(displayPlan, t);
                    return (
                      <SwiperSlide
                        key={planKey}
                        className="ph-pricing-slide !h-auto !w-[180px] sm:!w-[210px] lg:!w-[230px]"
                      >
                      <div className="ph-pricing-slide-inner h-full">
                      {topRank ? (
                        <span className="ph-top-flash" data-rank={topRank}>
                          {t("tarifs.top_flash", { rank: topRank, defaultValue: "Top {{rank}}" })}
                        </span>
                      ) : null}
                      <article aria-labelledby={`plan-title-${planKey}`} className="h-full">
                      <Card
                        className={cn(
                          "flex h-full min-h-[456px] flex-col rounded-3xl border-neutral-300/70 bg-white shadow-[0_12px_24px_rgba(0,0,0,0.05)] ph-fold-card",
                          isHighlight && "ring-1 ring-[rgba(168,23,29,0.22)]",
                        )}
                      >
                        <span className="ph-corner-ribbon">{badgeLabel}</span>
                        <CardHeader className="pb-3">
                          <div className="mb-2 flex items-center justify-end">
                            <Link
                              to={
                                isRayonnementCard
                                  ? "/organisation/engagement?plan=RAYONNEMENT"
                                  : isQuoteOnlyCard
                                    ? `/organisation/commencer?intent=devis&plan=${encodeURIComponent(displayPlan)}`
                                    : `/organisation/commencer?intent=souscrire&plan=${encodeURIComponent(displayPlan)}`
                              }
                            >
                              <Button
                                size="sm"
                                className="h-8 rounded-lg px-3 text-xs font-semibold"
                                style={{ backgroundColor: "#9D2525", color: "white" }}
                              >
                                {isRayonnementCard || !isQuoteOnlyCard
                                  ? t("tarifs.cta_commander")
                                  : t("tarifs.cta_devis")}
                              </Button>
                            </Link>
                          </div>
                          <CardTitle id={`plan-title-${planKey}`} className="text-[1.75rem] leading-tight text-[#9d2525]">{cardTitleShort}</CardTitle>
                          <p className="line-clamp-2 min-h-[2.6rem] text-sm leading-relaxed text-muted-foreground">
                            {highlightAimediartWord(subtitle)}
                          </p>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col space-y-3">
                          {variants.length > 1 ? (
                            <div className="space-y-2">
                              <label htmlFor={`plan-variant-${planKey}`} className="block text-xs font-medium text-muted-foreground">
                                {t("tarifs.select_option_label")}
                              </label>
                              <select
                                id={`plan-variant-${planKey}`}
                                value={selectedIndex}
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  setSelectedVariantByPlan((prev) => ({ ...prev, [planKey]: Number.isNaN(value) ? 0 : value }));
                                }}
                                className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                {variants.map((option, idx) => (
                                  <option key={`${planKey}-opt-${idx}`} value={idx}>
                                    {t("tarifs.option_prefix", { code: variantOptionCode(displayPlan, idx) })} — {capacityLabel(option, t)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          {selectedVariant ? (
                            <div className="flex flex-1 rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4">
                              <div className="flex flex-1 flex-col gap-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <CapacityBlockSummary row={selectedVariant} t={t} />
                                  </div>
                                </div>
                                {(() => {
                                  const standbyCode = standbyPlanCodeFromDisplay(displayPlan);
                                  const standbyPrice = standbyCode
                                    ? optionUnitPrice(selectedVariant, "STANDBY")
                                    : null;
                                  if (!standbyCode || typeof standbyPrice !== "number") return null;
                                  return (
                                    <StandbyPlanTrigger
                                      planCode={standbyCode}
                                      planDisplayName={cardTitleShort}
                                      monthlyPriceEur={standbyPrice}
                                    />
                                  );
                                })()}
                                <PlanPricingDetails
                                  row={selectedVariant}
                                  t={t}
                                  locale={i18n.language}
                                  isQuoteOnly={isQuoteOnlyCard}
                                  hideStandbyRow={Boolean(standbyPlanCodeFromDisplay(displayPlan))}
                                />
                                {!isQuoteOnlyCard ? (() => {
                                  const effectivePeriod =
                                    billingPeriod === "annual" && showAnnualColumn ? "annual" : "monthly";
                                  return (
                                    <div className="mt-auto">
                                      <AnimatePresence mode="wait" initial={false}>
                                        <motion.div
                                          key={effectivePeriod}
                                          initial={{ opacity: 0, y: 6 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          exit={{ opacity: 0, y: -6 }}
                                          transition={{ duration: 0.18, ease: "easeOut" }}
                                          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center"
                                        >
                                          {effectivePeriod === "monthly" ? (
                                            <>
                                              {selectedVariant.pricing_monthly_ttc_eur !== 0 ? (
                                                <div className="text-[11px] font-medium text-muted-foreground">
                                                  {t("tarifs.col_monthly")}
                                                </div>
                                              ) : null}
                                              <div
                                                className={cn(
                                                  "mt-0.5 text-[15px] font-semibold leading-none tracking-tight",
                                                  selectedVariant.pricing_monthly_ttc_eur === 0
                                                    ? "italic text-[#9d2525] text-[18px] leading-snug whitespace-normal"
                                                    : "whitespace-nowrap",
                                                )}
                                              >
                                                {formatMonthlyTtcDisplay(selectedVariant.pricing_monthly_ttc_eur, t, i18n.language)}
                                              </div>
                                              {typeof selectedVariant.pricing_monthly_ttc_eur === "number" &&
                                              selectedVariant.pricing_monthly_ttc_eur > 0 ? (
                                                <div className="mt-1 whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
                                                  {t("tarifs.ht_equiv", {
                                                    price: formatEurAuto(ttcToHt(selectedVariant.pricing_monthly_ttc_eur), i18n.language),
                                                  })}
                                                </div>
                                              ) : null}
                                            </>
                                          ) : (
                                            <>
                                              <div className="text-[11px] font-medium text-muted-foreground">{t("tarifs.col_annual")}</div>
                                              <div className="mt-0.5 flex flex-nowrap items-center justify-center gap-x-1.5 whitespace-nowrap">
                                                <span className="text-[15px] font-semibold leading-none tracking-tight">
                                                  {formatEur(selectedVariant.pricing_annual_remis, i18n.language)}
                                                </span>
                                                {typeof selectedVariant.pricing_annuel === "number" &&
                                                !Number.isNaN(selectedVariant.pricing_annuel) ? (
                                                  <span className="text-[15px] font-bold italic leading-none text-[#9d2525] line-through">
                                                    {formatEur(selectedVariant.pricing_annuel, i18n.language)}
                                                  </span>
                                                ) : null}
                                              </div>
                                              {typeof selectedVariant.pricing_annual_remis === "number" &&
                                              selectedVariant.pricing_annual_remis > 0 ? (
                                                <div className="mt-1 whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
                                                  {t("tarifs.ht_equiv", {
                                                    price: formatEurAuto(ttcToHt(selectedVariant.pricing_annual_remis), i18n.language),
                                                  })}
                                                </div>
                                              ) : null}
                                              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#9d2525]">
                                                {t("tarifs.annual_badge")}
                                              </div>
                                            </>
                                          )}
                                        </motion.div>
                                      </AnimatePresence>
                                    </div>
                                  );
                                })() : null}
                              </div>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                      </article>
                      </div>
                      </SwiperSlide>
                    );
                  });
                  })()}
                  {zenithPlan ? (
                    <SwiperSlide
                      key="zenith"
                      className="ph-pricing-slide !h-auto !w-[180px] sm:!w-[210px] lg:!w-[230px]"
                    >
                      <div className="ph-pricing-slide-inner h-full">
                      <article aria-labelledby="plan-title-zenith" className="h-full">
                        <Card className="flex h-full min-h-[456px] flex-col rounded-3xl border-neutral-300/70 bg-white shadow-[0_12px_24px_rgba(0,0,0,0.05)] ph-fold-card ring-1 ring-[rgba(168,23,29,0.22)]">
                          <span className="ph-corner-ribbon">{t("tarifs.badge_zenith")}</span>
                          <CardHeader className="pb-3">
                            <div className="mb-2 flex items-center justify-end gap-3">
                              <Link to="/organisation/commencer?intent=devis&plan=ZENITH">
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg px-3 text-xs font-semibold"
                                  style={{ backgroundColor: "#9D2525", color: "white" }}
                                >
                                  {t("tarifs.cta_devis")}
                                </Button>
                              </Link>
                            </div>
                            <CardTitle
                              id="plan-title-zenith"
                              className="text-[1.75rem] leading-tight text-[#9d2525]"
                            >
                              {planCardTitleShort(zenithPlan.pricing_plan, t)}
                            </CardTitle>
                            <p className="line-clamp-2 min-h-[2.6rem] text-sm leading-relaxed text-muted-foreground">
                              {highlightAimediartWord(t("tarifs.plan_desc_zenith"))}
                            </p>
                          </CardHeader>
                          <CardContent className="flex flex-1 flex-col space-y-3">
                            <div className="rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4">
                              <QuotePlanSummary kind="zenith" t={t} />
                              <PlanPricingDetails
                                row={zenithPlan}
                                t={t}
                                locale={i18n.language}
                                isQuoteOnly
                                hideStandbyRow
                              />
                            </div>
                          </CardContent>
                        </Card>
                      </article>
                      </div>
                    </SwiperSlide>
                  ) : null}
                  </Swiper>
                  </div>
                </div>

                <div className="mt-7 rounded-3xl border border-neutral-300/70 bg-[#faf9f7] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.05)] sm:p-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <h3 className="text-sm font-semibold">{t("tarifs.monthly_label")}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                        {t("tarifs.monthly_text")}
                      </p>
                      <p className="mt-1 text-sm italic leading-relaxed text-foreground/80">
                        {t("tarifs.monthly_text_veille_note")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <h3 className="text-sm font-semibold">{t("tarifs.annual_label")}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                        {t("tarifs.annual_text")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs italic text-muted-foreground">
                    {t("tarifs.data_note_1")}
                  </p>
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    {t("tarifs.data_note_2")}
                  </p>
                </div>
              </>
            )}
          </div>
        </Section>

        <Section
          surfaceCard
          id="accessibilite"
          eyebrow={t("access.eyebrow")}
          title={t("access.title")}
          titleClassName="max-w-[600px] text-left whitespace-pre-line"
        >
          <p className="w-full text-sm leading-relaxed text-foreground/80">
            {t("access.intro")}
          </p>

          <figure className="mb-4 mt-8 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <OptimizedImage
                src={accessibilitePhoto}
                webpSrc={accessibiliteWebp}
                alt={t("access.image_alt")}
                className="home-hero-image"
                loading="eager"
                width={1010}
                height={288}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { id: "card1", title: t("access.card1_title"), text: t("access.card1_text") },
              { id: "card2", title: t("access.card2_title"), text: t("access.card2_text") },
              { id: "card3", title: t("access.card3_title"), text: t("access.card3_text") },
              { id: "card4", title: t("access.card4_title"), text: t("access.card4_text") },
            ].map((x, i) => (
              <article
                key={x.id}
                className={`rounded-2xl border border-neutral-300/70 p-4 shadow-[0_8px_18px_rgba(0,0,0,0.04)] ph-fold-card ${
                  i === 3 ? "bg-[#f9f5f3]" : "bg-white"
                }`}
              >
                <h3 className="text-sm font-semibold">{x.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.text}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section surfaceCard id="contact" eyebrow={t("contact.eyebrow")} title={t("contact.title")}>
          <figure className="mb-5 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <OptimizedImage
                src={contactPhoto}
                webpSrc={contactWebp}
                alt={t("contact.image_alt")}
                className="home-hero-image"
                loading="eager"
                width={1010}
                height={288}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
          <div className="rounded-[2rem] border border-neutral-300/70 bg-[#faf9f7] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)] sm:p-8">
            <p className="w-full text-sm leading-relaxed text-foreground/80">
              {t("contact.text_1")}
              <span className="mt-2 block">
                {highlightAimediartWord(t("contact.text_2"))}
              </span>
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={AIMEDIART_CONTACT_MAILTO} className="w-full sm:w-auto">
                <Button className="h-11 w-full rounded-xl px-5 text-sm max-[389px]:h-10 max-[389px]:text-[13px] sm:w-auto" style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}>
                  {t("contact.cta_contact")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </a>
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="outline" className="h-11 w-full rounded-xl border-neutral-300 bg-white text-sm max-[389px]:h-10 max-[389px]:text-[13px] sm:w-auto">
                  {t("contact.cta_login")}
                </Button>
              </Link>
            </div>
          </div>
        </Section>

        <LazyWhenVisible
          anchorId="connectivite"
          anchorAliases={["connectivite-challenge"]}
          className="scroll-mt-[5rem]"
          minHeight={320}
        >
          <section>
            <Suspense fallback={<div className="mx-auto w-full max-w-[1060px] px-5 py-16 sm:px-6" aria-hidden style={{ minHeight: 320 }} />}>
              <OrganisationConnexionContent />
            </Suspense>
          </section>
        </LazyWhenVisible>

    </PublicVitrineShell>
  );
}

