import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  Heart,
  HeartHandshake,
  Loader2,
  Menu,
  MessagesSquare,
  MonitorPlay,
  QrCode,
  Smartphone,
  ThermometerSun,
  Wind,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForestCanopySketch } from "@/components/ForestCanopySketch";
import expositionVivantePhoto from "@/assets/exposition-vivante.png";
import oreilleAttentivePhoto from "@/assets/oreille-attentive.png";
import outputCreatifPhoto from "@/assets/output-creatif.png";
import parcoursPhoto from "@/assets/parcours.png";
import tarifsPhoto from "@/assets/tarifs.png";
import accessibilitePhoto from "@/assets/accessibilite.png";
import contactPhoto from "@/assets/contact.png";

/**
 * Ligne `pricing` Supabase (lecture vitrine).
 * Colonnes générées : `pricing_annuel`, `pricing_annual_remis`, `éco_annuel` — lecture seule.
 */
type PricingRow = {
  pricing_label: string | null;
  pricing_plan: string | null;
  pricing_max_oeuvres: number | null;
  /** Nom réel en base : `princing_max_visitors` (faute volontaire). */
  princing_max_visitors: number | null;
  pricing_is_unlimited: boolean | null;
  pricing_monthly_ttc_eur: number | null;
  pricing_annuel: number | null;
  pricing_annual_remis: number | null;
  /** Économie annuelle (mappé depuis `éco_annuel` ou `eco_annuel`). */
  eco_annuel: number | null;
};

const BRAND_RED = "hsl(0 65% 48%)";
const BRAND_RED_DARK = "hsl(0 62% 38%)";
/** Rouge marque pour le mot « AIMEDIArt » sur la vitrine */
const AIMEDIART_WORD_RED = "text-[#E63946]";

function highlightAimediartWord(text: string): ReactNode {
  const parts = text.split(/(AIMEDIArt)/g);
  return parts.map((part, i) =>
    part === "AIMEDIArt" ? (
      <span key={`aim-${i}`} className={AIMEDIART_WORD_RED}>
        AIMEDIArt
      </span>
    ) : (
      <span key={`txt-${i}`}>{part}</span>
    )
  );
}

const UNSPLASH_HERO_IMAGE =
  "/landing-hero-new.png";
const UNSPLASH_DASHBOARD_IMAGE =
  "/landing-dashboard-new.png";
type AnchorItem = { id: string; label: string };
const ANCHORS: AnchorItem[] = [
  { id: "accueil", label: "Accueil" },
  { id: "exposition-vivante", label: "Exposition vivante" },
  { id: "parcours", label: "Parcours" },
  { id: "tarifs", label: "Tarifs" },
  { id: "accessibilite", label: "Accessibilité" },
  { id: "contact", label: "Contact" },
];

function formatEur(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

/** Mensuel TTC : 0 → GRATUIT, NULL → Sur Devis, sinon montant + €/mois. */
function formatMonthlyTtcDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Sur Devis";
  if (value === 0) return "GRATUIT";
  const n = typeof value === "number" && !Number.isNaN(value) ? value : Number(value);
  if (!Number.isFinite(n)) return "Sur Devis";
  if (n === 0) return "GRATUIT";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)}\u00a0€/mois`;
}

function toPricingNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

/** Zénith / Zenith : non affiché sur la vitrine tarifs ; filtré avant le groupement. */
function isZenithPlanName(plan: string | null): boolean {
  return planNameAsciiUpper(plan).includes("ZENITH");
}

/** Offre Rayonnement : libellés et mise en page spécifiques sur la carte tarifs. */
function isRayonnementPlanName(plan: string | null): boolean {
  return planNameAsciiUpper(plan).includes("RAYONNEMENT");
}

const PLAN_ORDER: Record<string, number> = {
  "L’ÉTINCELLE": 0,
  "L'ETINCELLE": 0,
  "L’ETINCELLE": 0,
  "L’ATELIER": 1,
  "L'ATELIER": 1,
  "L’HORIZON": 2,
  "L'HORIZON": 2,
  "LE RAYONNEMENT": 3,
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
function shouldShowAnnualPricingColumn(row: PricingRow, isRayonnement: boolean): boolean {
  if (isRayonnement) return false;
  if (row.pricing_monthly_ttc_eur === 0) return false;
  const ar = row.pricing_annual_remis ?? 0;
  const af = row.pricing_annuel ?? 0;
  return !(ar === 0 && af === 0);
}

function capacityLabel(row: PricingRow): string {
  if (row.pricing_is_unlimited) return "∞ œuvres · ∞ visiteurs";
  const maxOeuvres = row.pricing_max_oeuvres;
  const maxVisitors = row.princing_max_visitors;
  const oeuvresPart =
    typeof maxOeuvres === "number" && maxOeuvres > 0 ? `${maxOeuvres} œuvres maxi` : "Œuvres sur mesure";
  const visitorsPart =
    typeof maxVisitors === "number" && maxVisitors > 0 ? `${maxVisitors} visiteurs maxi` : "Visiteurs sur mesure";
  return `${oeuvresPart} · ${visitorsPart}`;
}

function planEditorialDescription(plan: string): string {
  const upper = plan.toUpperCase();
  if (upper.includes("ÉTINCELLE") || upper.includes("ETINCELLE")) {
    return "Offre d’entrée, idéale pour tester la médiation dialoguée.";
  }
  if (upper.includes("ATELIER")) {
    return "Pour artistes et structures avec catalogue fixe.";
  }
  if (upper.includes("HORIZON")) {
    return "Pour galeries, associations ou structures multi-projets.";
  }
  if (upper.includes("RAYONNEMENT")) {
    return "Une offre sur mesure pour de grands événements.";
  }
  return "Offre AIMEDIArt.";
}

/** Titre court en tête de carte : seul le nom du palier (Étincelle, Atelier, Horizon, Rayonnement). */
function planCardTitleShort(plan: string | null): string {
  const ascii = planNameAsciiUpper(plan);
  const core = ascii
    .replace(/^L['']?\s*/i, "")
    .replace(/^LE\s+/i, "")
    .trim();

  if (core.includes("RAYONNEMENT")) return "Rayonnement";
  if (core.includes("HORIZON")) return "Horizon";
  if (core.includes("ATELIER")) return "Atelier";
  if (core.includes("ETINCELLE")) return "Étincelle";

  const raw = (plan ?? "").trim();
  if (!raw) return "Offre";
  const first = raw.split(/\s*[–—-]\s*/)[0]?.trim() ?? raw;
  return first.replace(/^L['’]\s*/i, "L’").replace(/^Le\s+/i, "").replace(/^La\s+/i, "").trim() || raw;
}

function LogoMark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3.5">
      <div
        className={`flex shrink-0 items-center justify-center rounded-[17%] shadow-[0_6px_18px_rgba(0,0,0,0.1)] ${compact ? "h-[3.25rem] w-[3.25rem]" : "h-[3.75rem] w-[3.75rem]"}`}
        style={{ backgroundColor: BRAND_RED }}
        aria-hidden
      >
        <span className="inline-flex animate-logo-heart">
          <Heart className={`text-white ${compact ? "h-[1.4rem] w-[1.4rem]" : "h-[1.9rem] w-[1.9rem]"}`} fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden />
        </span>
      </div>
      <div className="min-w-0 leading-tight">
        <div className={`font-sans font-bold tracking-tight ${compact ? "text-[1.12rem]" : "text-[1.42rem]"}`}>
          <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span>
          <span style={{ color: BRAND_RED }}>.com</span>
        </div>
        <div className={`${compact ? "text-[12.5px]" : "text-[15.5px]"} font-semibold italic`} style={{ color: BRAND_RED }}>Art-mediation with AI</div>
      </div>
    </div>
  );
}

function FloatingNav({
  isMobileOpen,
  setIsMobileOpen,
}: {
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}) {
  const NavItems = (
    <nav aria-label="Navigation de la vitrine" className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-0.5 xl:gap-1">
      {ANCHORS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="group inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-ring lg:gap-1 lg:px-1.5 lg:py-1 lg:text-[13px] lg:leading-tight"
          onClick={() => setIsMobileOpen(false)}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-300 transition-colors group-hover:bg-[#E63946] lg:h-1.5 lg:w-1.5"
            aria-hidden
          />
          {item.label}
        </a>
      ))}
    </nav>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-neutral-300/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-[74px] w-full max-w-[1060px] items-center justify-between gap-3 px-5 sm:px-6">
          <div className="shrink-0">
            <LogoMark compact />
          </div>
          <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 lg:flex">
            <div className="max-w-full rounded-xl border border-neutral-200 bg-[#faf9f7] px-1 py-0.5 sm:px-1.5 sm:py-1">
              {NavItems}
            </div>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300/80 bg-white px-3 py-2 text-sm font-medium text-foreground/85 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Se connecter
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300/80 bg-white/70 px-3.5 py-2 text-sm font-medium shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-ring lg:hidden"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-4 w-4" aria-hidden />
            Menu
          </button>
        </div>
      </header>
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/45"
            aria-hidden
            onClick={() => setIsMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 z-50 h-auto w-[82vw] max-w-[332px] rounded-br-xl border-r border-neutral-300 bg-[rgba(252,251,250,0.60)] p-4 shadow-2xl backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Menu vitrine"
          >
            <div className="flex items-start justify-between gap-3">
              <LogoMark compact />
              <button
                type="button"
                className="rounded-md p-2 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Fermer le menu"
                onClick={() => setIsMobileOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-2.5">
              <div className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground">VITRINE PUBLIQUE</div>
              {NavItems}
              <div className="pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-lg border border-neutral-300/80 bg-white px-3 py-2 text-sm font-medium text-foreground/85 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={() => setIsMobileOpen(false)}
                >
                  Se connecter
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/** Enveloppe « surface » (hero / sections) — divs statiques, sans Framer Motion. */
function SurfaceCardShell({
  decorations,
  children,
}: {
  decorations: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-2 my-3 sm:mx-3 sm:my-4">
      <div className="relative overflow-hidden rounded-[2rem] border border-neutral-300/80 bg-[#faf8f5] p-5 shadow-[0_12px_28px_rgba(0,0,0,0.06)] sm:p-10 lg:p-12">
        {decorations}
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  eyebrowClassName,
  title,
  children,
  surfaceCard = false,
}: {
  id: string;
  eyebrow?: string;
  /** Classes additionnelles pour le surtitre (eyebrow), ex. alignement ou largeur ciblée */
  eyebrowClassName?: string;
  title: ReactNode;
  children: ReactNode;
  /** Même enveloppe visuelle que le bloc principal du hero (#accueil) */
  surfaceCard?: boolean;
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
      <h2 className="mt-2 max-w-[23ch] font-serif text-[1.95rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[2.2rem]">
        {title}
      </h2>
      <div className="mt-9">{children}</div>
    </>
  );

  return (
    <section id={id} className="scroll-mt-[68px] pb-16 pt-6 sm:pb-24 sm:pt-8">
      <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
        {surfaceCard ? (
          <SurfaceCardShell
            decorations={
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

function VantaCloudsBackground() {
  const vantaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = vantaRef.current;
    if (!container) return;

    let effect: { destroy: () => void } | null = null;
    let mounted = true;
    const initVanta = async () => {
      try {
        const THREE = await import("three");
        (window as unknown as { THREE?: unknown }).THREE = THREE;
        const vantaModule = await import("vanta/dist/vanta.clouds.min");
        const CLOUDS = (vantaModule.default ?? vantaModule) as (options: Record<string, unknown>) => { destroy: () => void };
        if (!mounted || !container) return;
        effect = CLOUDS({
          el: container,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          backgroundColor: 0xffffff,
          skyColor: 0x68b8d7,
          cloudColor: 0xadc1de,
          cloudShadowColor: 0x183550,
          sunColor: 0xff9919,
          sunGlareColor: 0xff6633,
          sunlightColor: 0xff9933,
          speed: 0.6,
        });
      } catch (error) {
        console.error("[PublicHome] Initialisation Vanta Clouds impossible:", error);
      }
    };
    void initVanta();

    return () => {
      mounted = false;
      effect?.destroy();
      effect = null;
    };
  }, []);

  return <div ref={vantaRef} className="fixed inset-0 z-0" aria-hidden />;
}

export default function PublicHome() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [selectedVariantByPlan, setSelectedVariantByPlan] = useState<Record<string, number>>({});
  const [promptIcons, setPromptIcons] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setPricingLoading(true);
      setPricingError(null);
      const sb = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
        };
      };
      const pricingColumns =
        "pricing_label,pricing_plan,pricing_max_oeuvres,princing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel";
      const [pricingRes, promptIconsRes] = await Promise.all([
        sb.from("pricing").select(pricingColumns),
        sb.from("prompt_style").select("icon"),
      ]);
      if (cancelled) return;
      if (pricingRes.error) {
        setPricingError(pricingRes.error.message || "Chargement des tarifs impossible.");
        setPricingRows([]);
        setPricingLoading(false);
        return;
      }
      const iconRows = (promptIconsRes.data as Array<{ icon?: string | null }> | null) ?? [];
      const cleanedIcons = [...new Set(iconRows.map((r) => (r.icon ?? "").trim()).filter(Boolean))];
      setPromptIcons(cleanedIcons.slice(0, 8));
      const rawPricingRows = (pricingRes.data as Record<string, unknown>[] | null) ?? [];
      const normalizedPricingRows: PricingRow[] = rawPricingRows.map((row) => {
        const r = row as Record<string, unknown>;
        const ecoFromDb = toPricingNumber(r["éco_annuel"] ?? r.eco_annuel);
        return {
          pricing_label: typeof row.pricing_label === "string" || row.pricing_label === null ? (row.pricing_label as string | null) : null,
          pricing_plan: typeof row.pricing_plan === "string" || row.pricing_plan === null ? (row.pricing_plan as string | null) : null,
          pricing_max_oeuvres: toPricingNumber(row.pricing_max_oeuvres),
          princing_max_visitors: toPricingNumber(row.princing_max_visitors),
          pricing_is_unlimited:
            row.pricing_is_unlimited === true ? true : row.pricing_is_unlimited === false ? false : null,
          pricing_monthly_ttc_eur: toPricingNumber(row.pricing_monthly_ttc_eur),
          pricing_annuel: toPricingNumber(row.pricing_annuel),
          pricing_annual_remis: toPricingNumber(row.pricing_annual_remis),
          eco_annuel: ecoFromDb,
        };
      });
      setPricingRows(normalizedPricingRows);
      setPricingLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedPlans = useMemo(() => {
    const rows = [...pricingRows].filter(
      (r) => (r.pricing_plan ?? "").trim().length > 0 && !isZenithPlanName(r.pricing_plan),
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
    return [...map.entries()]
      .sort((a, b) => planSortKey(a[0]) - planSortKey(b[0]))
      .map(([planKey, variants]) => ({ planKey, variants }));
  }, [pricingRows]);

  return (
    <div className="relative min-h-screen bg-white text-[#1f1f1f]">
      <VantaCloudsBackground />
      <div className="relative z-10">
        <FloatingNav isMobileOpen={mobileNavOpen} setIsMobileOpen={setMobileNavOpen} />

        <div>
        <section id="accueil" className="scroll-mt-[68px] pb-14 pt-20 sm:pb-18 lg:pt-6">
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
                Feedback invisible · Exposition vivante
              </p>
              <h1 className="mt-4 max-w-[18ch] font-serif text-[2.05rem] font-semibold leading-[1.08] tracking-tight text-foreground max-[389px]:text-[1.85rem] sm:max-w-[22ch] sm:text-5xl lg:text-[3.35rem]">
                Quand l&apos;expo respire
                <br />
                avec ses visiteurs
              </h1>
              <p className="mt-5 max-w-[92ch] text-[1rem] leading-[1.75] text-foreground/85 max-[389px]:text-[0.95rem] sm:text-[1.12rem]">
                Dans une exposition classique, la récolte d&apos;avis casse souvent le rythme : formulaire à la sortie, borne froide, promesse de questionnaire.
                <br />
                <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> propose autre chose : une médiation qui continue, une oreille discrète, et un grand écran qui devient le{" "}
                <strong className="font-semibold text-foreground">miroir de l&apos;âme</strong> de la salle — ce que le public ressent, sans qu&apos;il ait l&apos;impression d&apos;être « sondé ».
              </p>
              <p className="mt-4 max-w-[88ch] text-[1rem] leading-[1.75] text-foreground/78 sm:text-[1.05rem]">
                Plus il y a de monde et d&apos;interactions sincères, plus la scénographie émotionnelle s&apos;enrichit.
                <br />
                Le cercle vertueux commence : un geste sur le téléphone,
                une réponse, une interaction — et l&apos;exposition vit.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#exposition-vivante" className="w-full sm:w-auto">
                  <Button
                    className="h-11 w-full rounded-xl px-5 text-sm font-semibold sm:w-auto"
                    style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}
                  >
                    Découvrir la vision
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Button>
                </a>
                <a href="#parcours" className="w-full sm:w-auto">
                  <Button variant="outline" className="h-11 w-full rounded-xl border-neutral-300 bg-white/80 px-5 sm:w-auto">
                    Le parcours visiteur
                  </Button>
                </a>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-neutral-300/70 bg-white/95 p-4 ph-animate-float">
                  <div className="text-xs font-bold tracking-[0.12em] text-muted-foreground">QR-Code sans application</div>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <div className="max-w-[18ch] text-sm leading-relaxed text-foreground/85">Une web-app : scanner, dialoguer, ressentir.</div>
                    <div className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 p-2" aria-hidden>
                      <QrCode className="h-6 w-6 text-[#9d2525]" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-300/70 bg-white/95 p-4 ph-animate-float-delayed">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Langage adapté</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-foreground/85">Expert, Poète, Enfant, FALC… le ton suit le visiteur.</div>
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
                </div>
                <div className="rounded-2xl border border-neutral-300/70 bg-white/95 p-4 ph-animate-float">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Cœurs & émotions</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                    Des « likes » narratifs qui nourrissent l&apos;expo en direct.
                  </div>
                </div>
              </div>
              <figure className="mt-8 overflow-hidden rounded-2xl border border-neutral-300/70 bg-white">
                <img
                  src={UNSPLASH_HERO_IMAGE}
                  alt="Visiteurs observant des œuvres dans une galerie"
                  className="h-48 w-full object-cover object-center sm:h-60"
                  loading="eager"
                />
              </figure>
              <blockquote className="mt-8 border-l-2 border-[rgba(168,23,29,0.5)] pl-4 text-sm italic leading-relaxed text-foreground/75 sm:max-w-[52ch]">
                Un feedback dynamique — « Ce n&apos;est pas un tableau Excel dans le coin : c&apos;est une extension vivante de l&apos;expo — un double sens où la médiation et le ressenti ne font plus qu&apos;un. »
              </blockquote>
            </SurfaceCardShell>
          </div>
        </section>

        <Section
          surfaceCard
          id="exposition-vivante"
          eyebrow="Une exposition qui vibre"
          title={
            <>
              Le feedback devient
              <br />
              une respiration collective
            </>
          }
        >
          <div className="max-w-[68ch] space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
            <p>
              <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> est une <strong className="font-semibold text-foreground">écoute scénographique</strong> : ce que la plupart des expositions devinent à peine — le vrai ressenti —
              devient une matière visible et partagée. Le visiteur ne « remplit » rien : il poursuit la conversation commencée devant l&apos;œuvre.
            </p>
            <p>
              Un écran qui n&apos;affiche pas des statistiques froides ; il révèle le pouls de la salle. Même dans un silence feutré, on voit l&apos;activité émotionnelle bouillonner :
              cela rassure, invite à s&apos;attarder, et replace chaque regard au centre du récit.
            </p>
          </div>
          <figure className="mt-8 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <img
                src={expositionVivantePhoto}
                alt="Visiteurs au sein d&apos;une installation d&apos;exposition, bannières et espace immersif"
                className="home-hero-image"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
        </Section>

        <Section
          surfaceCard
          id="oreille-attentive"
          eyebrow="Feedback invisible"
          eyebrowClassName="text-left w-[500px]"
          title={
            <>
              L&apos;oreille attentive,
              <br />
              la suite naturelle du dialogue
            </>
          }
        >
          <div className="flex w-full max-w-full flex-col gap-8 lg:w-[900px] lg:flex-row lg:items-start lg:gap-8">
            <div className="w-full min-w-0 flex-1 space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem] lg:min-w-0">
              <p>
                Le « sondage » n&apos;est plus une insert brutale entre deux salles. <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> lit les <strong className="font-semibold text-foreground">réactions immédiates</strong>, les intonations du texte libre,
                les battements de cœurs donnés à une œuvre : sans questionnaire imposé, le système comprend par exemple qu&apos;une technique a surpris, ému ou clarifié quelque chose pour le visiteur.
              </p>
              <p>
                Pour le lieu et les partenaires, c&apos;est un rapport qui parle d&apos;efficacité et d&apos;engagement — le « pouls » de l&apos;expo en direct. Pour l&apos;artiste et le curateur,
                c&apos;est un tableau de bord vivant : ajuster une lumière, préciser un cartel, répondre depuis l&apos;atelier quand la salle murmure son incompréhension ou son émerveillement.
              </p>
            </div>
            <div className="w-full min-w-0 text-left lg:flex lg:h-[350px] lg:w-[300px] lg:shrink-0 lg:flex-col lg:items-end lg:justify-end lg:text-right">
              <figure className="ml-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-neutral-300/70 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
                <img
                  src={oreilleAttentivePhoto}
                  alt="Illustration — médiation et écoute au sein de l&apos;exposition"
                  className="aspect-[4/3] w-full max-w-[300px] overflow-visible object-cover object-center object-bottom sm:aspect-[5/4] lg:aspect-auto lg:h-[350px] lg:min-h-[350px] lg:w-[300px]"
                  loading="lazy"
                />
              </figure>
            </div>
          </div>
        </Section>

        <Section
          surfaceCard
          id="output-creatif"
          eyebrow="L'écran géant"
          title={
            <>
              Trois visages pour le ressenti
              <br />
              — au-delà du tableau Excel
            </>
          }
        >
          <p className="max-w-[72ch] text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
            Ce n&apos;est pas une extension de tableur collée au mur : c&apos;est une <strong className="font-semibold text-foreground">scénographie du feedback</strong>. Trois grammaires visuelles pour dire la même vérité — celle du public.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <Card className="group rounded-3xl border-neutral-300/70 bg-gradient-to-b from-violet-50/90 to-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] transition-transform duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-24 items-end justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-400/25 via-fuchsia-400/20 to-transparent ph-animate-float">
                  <Cloud className="h-14 w-14 text-indigo-500/90" strokeWidth={1.25} aria-hidden />
                </div>
                <CardTitle className="font-serif text-lg">Nuage de particules</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                Chaque retour devient une particule colorée qui nourrit une forme mouvante : le mur respire avec les mots et les cœurs reçus.
              </CardContent>
            </Card>
            <Card className="group rounded-3xl border-neutral-300/70 bg-gradient-to-b from-rose-50/90 to-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] transition-transform duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-300/25 to-amber-100/40 ph-animate-float-delayed">
                  <Wind className="h-12 w-12 text-rose-600/85" strokeWidth={1.25} aria-hidden />
                </div>
                <CardTitle className="font-serif text-lg">Mur de murmures</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                Les phrases les plus poétiques captées par <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> apparaissent et s&apos;effacent comme une conversation collective — organique, imprévisible, humaine.
              </CardContent>
            </Card>
            <Card className="group rounded-3xl border-neutral-300/70 bg-gradient-to-b from-sky-50/90 to-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] transition-transform duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400/30 to-emerald-300/15">
                  <ThermometerSun className="h-12 w-12 text-sky-600/90 ph-animate-shimmer" strokeWidth={1.25} aria-hidden />
                </div>
                <CardTitle className="font-serif text-lg">Thermomètre émotionnel</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                Une jauge artistique qui montre l&apos;émotion collective de la salle en temps réel — partagée, lisible, sans jargon statistique.
              </CardContent>
            </Card>
          </div>
          <figure className="mt-10 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <img
                src={outputCreatifPhoto}
                alt="Visiteur en sweat à capuche bleu devant des peintures abstraites dans une galerie aux murs de pierre et poutres apparentes"
                className="home-hero-image"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
        </Section>

        <Section
          surfaceCard
          id="live-scenographie"
          eyebrow="L'avantage LIVE"
          title={
            <>
              Une scénographie qui réagit :
              <br />
              une canopée du climat émotionnel
            </>
          }
        >
          <div className="max-w-[68ch] space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
            <p>
              La plupart des outils livrent des chiffres le lendemain. <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> joue la carte du <strong className="font-semibold text-foreground">direct</strong> : le feedback n&apos;est plus une corvée de fin de visite,
              il devient le carburant de l&apos;exposition elle-même.
            </p>
            <p>
              Imaginez une expo sur le climat : plus les visiteurs expriment de l&apos;espoir au fil du dialogue, plus l&apos;écran fait grandir une forêt lumineuse ; plus l&apos;inquiétude domine,
              plus le paysage se fait dense et sombre. Le ressenti pilote une <strong className="font-semibold text-foreground">scénographie génératrice</strong> — le lieu et le message respirent ensemble.
            </p>
          </div>
          <div className="relative mt-8 overflow-hidden rounded-2xl border border-emerald-900/25 bg-gradient-to-b from-slate-950 via-emerald-950/90 to-black px-5 py-6 sm:px-8">
            <p className="relative z-10 max-w-[62ch] text-sm leading-relaxed text-emerald-50/95">
              Ce que vous voyez ici est une métaphore animée : une canopée qui pulse au rythme collectif — comme votre mur pourrait pulser au rythme des visites.
            </p>
            <p className="relative z-10 mt-5 w-full text-right text-sm font-semibold italic text-red-500 sm:text-base">
              Cliquer sur le bloc ci-dessous pour ouvrir la projection dans un nouvel onglet (TV / projecteur).
            </p>
            <ForestCanopySketch className="relative mt-3 w-full overflow-hidden rounded-lg bg-black/20" />
          </div>
        </Section>

        <Section surfaceCard id="sans-friction" eyebrow="Sans rupture" title="Du dernier échange à l'action — sans friction">
          <div className="max-w-[68ch] space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
            <p>
              À la fin de la médiation, <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> ne bascule pas vers « veuillez noter notre service ». Il reste dans son rôle : une voix qui demande si la passion a traversé la salle,
              si le style reste mystérieux ou si la lumière a été comprise — <strong className="font-semibold text-foreground">questions naturelles</strong>, auxquelles on répond par émotions et cœurs, pas par cases à cocher.
            </p>
            <p>
              Puis vient la transition fluide vers l&apos;utile : « Si vous souhaitez garder un souvenir de notre échange, je peux vous envoyer par e-mail la liste des œuvres qui vous ont touché ? »
              Le visiteur laisse une adresse pour un <strong className="font-semibold text-foreground">service rendu</strong>, pas pour une intrusion marketing — une LeadGen qui naît du lien authentique.
            </p>
          </div>
        </Section>

        <Section
          surfaceCard
          id="pont-ecran"
          eyebrow="Smartphone → mur"
          title={
            <>
              Le pont temps réel entre
              <br />
              smartphone et smart-expo !
            </>
          }
        >
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div className="space-y-4 text-sm leading-[1.85] text-foreground/85 sm:text-[1.02rem]">
              <p>
                Chaque geste sur le téléphone déclenche une réaction sur l&apos;écran du lieu : les « cœurs » partent en <strong className="font-semibold text-foreground">pluie</strong> sur le mur quand le public liker une œuvre ;
                une <strong className="font-semibold text-foreground">roue des émotions</strong> — ébloui, touché, intrigué, apaisé, troublé, amusé — transforme les intentions en paysage partagé.
              </p>
              <p>
                Si dix personnes choisissent « apaisé » ensemble, l&apos;écran peut diffuser une onde de couleur ou une texture douce : l&apos;impact visuel porte la mémoire du groupe, pas seulement la note individuelle.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-neutral-300/80 bg-neutral-950 px-5 py-6 text-neutral-100 shadow-inner">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  <Smartphone className="h-4 w-4 text-emerald-400" aria-hidden />
                  Visiteur
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  <MonitorPlay className="h-4 w-4 text-sky-400" aria-hidden />
                  Écran salle
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] font-medium text-neutral-500">Pluie de cœurs</p>
                  <div className="ph-heart-rain-cell relative mt-3 h-24 rounded-lg bg-gradient-to-b from-rose-500/20 to-transparent">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span key={`h-${i}`} className="text-rose-400/90" style={{ "--i": i } as CSSProperties} aria-hidden>
                        ♥
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] font-medium text-neutral-500">Roue des émotions</p>
                  <div className="relative mt-3 flex h-24 items-center justify-center">
                    <div className="ph-wave-pulse absolute h-20 w-20 rounded-full border-2 border-violet-400/40" aria-hidden />
                    <div className="ph-wave-pulse absolute h-14 w-14 rounded-full border border-cyan-400/35 [animation-delay:0.6s]" aria-hidden />
                    <span className="relative text-center text-xs font-medium leading-snug text-neutral-200">
                      ébloui · touché · apaisé
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          surfaceCard
          id="parcours"
          eyebrow="Parcours visiteur"
          title={
            <>
              Un parcours en 3 étapes,
              <br />
              lisible en un coup d&apos;œil
            </>
          }
        >
          <figure className="mb-5 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <img
                src={parcoursPhoto}
                alt="Deux visiteurs dans une galerie entre deux grands portraits photographiques encadrés"
                className="home-hero-image"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
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
                step: "Étape 1",
                title: "Scanner un QR code",
                text: "Devant l’œuvre, le visiteur scanne. C’est immédiat, sans friction.",
                icon: QrCode,
              },
              {
                step: "Étape 2",
                title: "Choisir un mode de langage",
                text: <>Expert, Poète, Enfant de 5 ans…<br />et même FALC* si besoin.</>,
                icon: MessagesSquare,
              },
              {
                step: "Étape 3",
                title: "Dialoguer + voter",
                text: "Emotions suggérées par IA, puis vote émotionnel de 1 à 5 cœurs ❤️❤️❤️❤️❤️",
                icon: HeartHandshake,
              },
            ].map((x) => (
              <Card key={x.step} className="relative rounded-3xl border-neutral-300/70 bg-white shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <CardHeader className="pb-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{x.step}</p>
                    <div className="rounded-full border border-neutral-300 bg-neutral-50 p-2">
                      <x.icon className="h-4 w-4 text-foreground/70" aria-hidden />
                    </div>
                  </div>
                  <CardTitle className="font-serif text-xl">{x.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-foreground/80">
                  {x.text}
                  {x.step === "Étape 2" ? (
                    <p className="mt-2 text-[11px] italic text-muted-foreground">*FALC : Facile À Lire et à Comprendre</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-neutral-300/70 bg-[#fdfdfc] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pour le commissaire</p>
              <h3 className="mt-2 font-serif text-2xl font-semibold tracking-tight">Un pilotage plus fin de la réception des œuvres</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                Pour les commissaires, galeries et lieux culturels, chaque scan devient une donnée utile sans alourdir l’expérience de visite.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {[
                  { kpi: "1 248", label: "scans sur l’exposition" },
                  { kpi: "4,3 / 5", label: "note émotionnelle moyenne" },
                  { kpi: "62%", label: "émotion dominante cartographiée" },
                  { kpi: "+31%", label: "questions ou retours engageants" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <div className="font-serif text-xl leading-none text-foreground">{item.kpi}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-300/70 bg-white p-5 shadow-[0_12px_24px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bénéfices métier</p>
              <img
                src={UNSPLASH_DASHBOARD_IMAGE}
                alt="Écran montrant un tableau de bord analytique"
                className="mt-3 h-32 w-full rounded-xl border border-neutral-200 object-cover"
                loading="lazy"
              />
              <div className="mt-3 grid gap-2">
                {[
                  "Nombre de scans par œuvre",
                  "Note émotionnelle moyenne",
                  "Cartographie émotionnelle de l’exposition",
                  "Compréhension plus fine de la réception des œuvres",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-xl bg-neutral-50 p-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_RED }} aria-hidden />
                    <span className="text-sm leading-relaxed text-foreground/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </Section>

        <Section
          surfaceCard
          id="tarifs"
          title={
            <>
              Des offres claires,
              <br />
              adaptées au rythme des expositions
            </>
          }
        >
          <figure className="mb-5 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <img
                src={tarifsPhoto}
                alt="Visiteur observant un grand tirage paysage montagne dans une galerie"
                className="home-hero-image"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
          <div className="rounded-3xl border border-neutral-300/70 bg-[#faf9f7] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.05)] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-sm font-semibold">Paiement mensuel</div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                  Souplesse.
                  <br />
                  Résiliable à la fin de l’événement.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-sm font-semibold">Paiement annuel</div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                  Avantage tarifaire.
                  <br />
                  Le plus serein pour conserver catalogue et fiches d’œuvres.
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs italic text-muted-foreground">
              En cas de résiliation, l’accès reste actif jusqu’à la fin de la période payée. À son terme, les données sont supprimées définitivement.
            </p>
            <p className="mt-2 text-xs italic text-muted-foreground">
              Si vous souhaitez conserver votre catalogue et vos fiches d'œuvres pour une future exposition, l'abonnement Annuel est la solution la plus sereine (et la plus économique sur la durée !)
            </p>
          </div>

          <div className="mt-7">
            {pricingLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-neutral-300/70 bg-white p-12 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                <span className="ml-3 text-sm text-muted-foreground">Chargement des tarifs…</span>
              </div>
            ) : pricingError ? (
              <div className="rounded-3xl border border-destructive/30 bg-white p-5 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <p className="text-sm font-medium text-destructive">Tarifs indisponibles</p>
                <p className="mt-1 text-sm text-muted-foreground">{pricingError}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Vérifiez la connexion Supabase, la présence de la table <code className="rounded bg-muted px-1">pricing</code> et les droits RLS en lecture.
                </p>
              </div>
            ) : groupedPlans.length === 0 ? (
              <div className="rounded-3xl border border-neutral-300/70 bg-white p-5 shadow-[0_10px_22px_rgba(0,0,0,0.05)]">
                <p className="text-sm text-muted-foreground">Aucune offre trouvée dans la table <code className="rounded bg-muted px-1">pricing</code>.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  {(() => {
                    let testerBadgeCount = 0;
                    let recommendedBadgeCount = 0;
                    return groupedPlans.map(({ planKey, variants }) => {
                    const first = variants[0];
                    const displayPlan = first?.pricing_plan?.trim() || planKey;
                    const cardTitleShort = planCardTitleShort(displayPlan);
                    const isHighlight = /HORIZON|ATELIER/.test(displayPlan.toUpperCase());
                    const rawLabel = first?.pricing_label?.trim() ?? "";
                    const repeatsPlanName = rawLabel.toUpperCase().includes(displayPlan.toUpperCase());
                    const selectedIndexRaw = selectedVariantByPlan[planKey] ?? 0;
                    const selectedIndex = Math.min(Math.max(selectedIndexRaw, 0), Math.max(variants.length - 1, 0));
                    const selectedVariant = variants[selectedIndex];
                    const isRayonnementCard = isRayonnementPlanName(displayPlan);
                    const showAnnualColumn = shouldShowAnnualPricingColumn(selectedVariant, isRayonnementCard);
                    const subtitle =
                      rawLabel && !repeatsPlanName
                        ? rawLabel
                        : isRayonnementCard
                          ? "Une offre sur mesure pour de grands événements."
                          : planEditorialDescription(displayPlan);
                    let badgeLabel = "Recommandé";
                    if (isHighlight) {
                      recommendedBadgeCount += 1;
                      badgeLabel = recommendedBadgeCount === 1 ? "Créer" : recommendedBadgeCount === 2 ? "Conquérir" : "Recommandé";
                    } else {
                      testerBadgeCount += 1;
                      badgeLabel = testerBadgeCount === 2 ? "Sublimer" : "Tester";
                    }
                    return (
                      <Card
                        key={planKey}
                        className={cn(
                          "rounded-3xl border-neutral-300/70 bg-white shadow-[0_12px_24px_rgba(0,0,0,0.05)]",
                          isHighlight && "ring-1 ring-[rgba(168,23,29,0.22)]",
                        )}
                      >
                        <CardHeader className="pb-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {badgeLabel}
                            </span>
                            <Link to="/login">
                              <Button
                                size="sm"
                                className="h-8 rounded-lg px-3 text-xs font-semibold"
                                style={{ backgroundColor: "#9D2525", color: "white" }}
                              >
                                {isRayonnementCard ? "Demander un devis" : "Commander"}
                              </Button>
                            </Link>
                          </div>
                          <CardTitle className="font-serif text-[1.75rem] leading-tight text-[#9d2525]">{cardTitleShort}</CardTitle>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {highlightAimediartWord(subtitle)}
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {variants.length > 1 ? (
                            <div className="space-y-2">
                              <label htmlFor={`plan-variant-${planKey}`} className="block text-xs font-medium text-muted-foreground">
                                Sélectionner votre option
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
                                    Option {variantOptionCode(displayPlan, idx)} — {capacityLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          {selectedVariant ? (
                            <div className="rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4">
                              <div className="flex flex-col gap-3">
                                <div
                                  className={cn(
                                    "flex items-center justify-between gap-3",
                                    isRayonnementCard && "lg:justify-start",
                                  )}
                                >
                                  <div>
                                    <div className="text-sm font-semibold leading-snug">
                                      {isRayonnementCard
                                        ? selectedVariant.pricing_label != null &&
                                          selectedVariant.pricing_label.trim() !== ""
                                          ? highlightAimediartWord(selectedVariant.pricing_label.trim())
                                          : null
                                        : capacityLabel(selectedVariant)}
                                    </div>
                                  </div>
                                  {!isRayonnementCard && selectedVariant.pricing_monthly_ttc_eur !== 0 ? (
                                    <span className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                      Option {variantOptionCode(displayPlan, selectedIndex)}
                                    </span>
                                  ) : null}
                                </div>
                                {!isRayonnementCard ? (
                                  <div
                                    className={cn(
                                      "grid gap-2",
                                      showAnnualColumn
                                        ? "grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
                                        : "grid-cols-1",
                                    )}
                                  >
                                    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                                      <div className="text-[11px] font-medium text-muted-foreground">Mensuel TTC</div>
                                      <div className="mt-0.5 text-[22px] font-semibold leading-none tracking-tight xl:text-[24px]">
                                        {formatMonthlyTtcDisplay(selectedVariant.pricing_monthly_ttc_eur)}
                                      </div>
                                    </div>
                                    {showAnnualColumn ? (
                                      <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                                        <div className="text-[11px] font-medium text-muted-foreground">Annuel TTC</div>
                                        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                                          <span className="text-[22px] font-semibold leading-none tracking-tight xl:text-[24px]">
                                            {formatEur(selectedVariant.pricing_annual_remis)}
                                          </span>
                                          {typeof selectedVariant.pricing_annuel === "number" &&
                                          !Number.isNaN(selectedVariant.pricing_annuel) ? (
                                            <span className="text-[20px] font-bold italic leading-none text-[#9d2525] line-through">
                                              {formatEur(selectedVariant.pricing_annuel)}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  });
                  })()}
                </div>
              </>
            )}
          </div>
        </Section>

        <Section
          surfaceCard
          id="accessibilite"
          eyebrow="Connexion sans friction"
          title={
            <>
              Un parcours
              <br />
              qui s&apos;adapte à chaque regard
            </>
          }
        >
          <p className="max-w-[68ch] text-sm leading-relaxed text-foreground/80">
            Scan près de l&apos;œuvre, aucune application à installer : la web-app s&apos;ouvre, propose des profils de lecture (enfant, expert, poète, langage simplifié…) ou suit la langue du téléphone,
            puis ramène le visiteur vers le feedback sans jamais casser la déambulation.
          </p>
          <figure className="mb-4 mt-8 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <img
                src={accessibilitePhoto}
                alt="Visiteur senior avec canne parcourant une exposition photographique aux murs blancs"
                className="home-hero-image"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "QR immédiat", text: "Aucune install : le geste devant l’œuvre ouvre la médiation." },
              { title: "Profils de lecture", text: "Du ton expert au ton poétique, jusqu’au FALC si besoin." },
              { title: "Cœurs narratifs", text: "Un bouton central, comme un live social — l’intérêt se lit en direct." },
              { title: "Humain & précis", text: "Une voix chaleureuse qui transforme derrière le rideau les émotions en données utiles." },
            ].map((x, i) => (
              <div
                key={x.title}
                className={`rounded-2xl border border-neutral-300/70 p-4 shadow-[0_8px_18px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-[1px] hover:shadow-[0_12px_20px_rgba(0,0,0,0.06)] ${
                  i === 3 ? "bg-[#f9f5f3]" : "bg-white"
                }`}
              >
                <div className="text-sm font-semibold">{x.title}</div>
                <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.text}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section surfaceCard id="contact" eyebrow="Contact" title="Donnez une voix — et un écran — à votre prochaine exposition">
          <figure className="mb-5 rounded-2xl border border-neutral-300/70 bg-white p-0 shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative mx-auto w-full max-w-[1010px] overflow-hidden rounded-2xl">
              <img
                src={contactPhoto}
                alt="Deux visiteurs de dos, devant des photographies encadrées sur un mur de galerie"
                className="home-hero-image"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.14),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
          <div className="rounded-[2rem] border border-neutral-300/70 bg-[#faf9f7] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)] sm:p-8">
            <p className="max-w-[70ch] text-sm leading-relaxed text-foreground/80">
              Résidence, musée, galerie ou itinérance multi-sites : racontez-nous votre scénographie et la manière dont vous voulez entendre votre public.
              <span className="mt-2 block">
                <span className={AIMEDIART_WORD_RED}>AIMEDIArt</span> fusionne médiation et feedback pour que l&apos;aller-retour soit aussi naturel qu&apos;une conversation dans la salle.
              </span>
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="mailto:contact@aimediart.com" className="w-full sm:w-auto">
                <Button className="h-11 w-full rounded-xl px-5 text-sm max-[389px]:h-10 max-[389px]:text-[13px] sm:w-auto" style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}>
                  Contacter
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </a>
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="outline" className="h-11 w-full rounded-xl border-neutral-300 bg-white text-sm max-[389px]:h-10 max-[389px]:text-[13px] sm:w-auto">
                  Se connecter
                </Button>
              </Link>
            </div>
          </div>
        </Section>

        <footer className="border-t border-neutral-300/70 bg-white/80 py-10">
          <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <LogoMark compact />
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <a href="#contact" className="text-foreground/80 hover:text-foreground">Contact</a>
                <Link to="/login" className="text-foreground/80 hover:text-foreground">Connexion</Link>
              </div>
            </div>
          </div>
        </footer>
        </div>
      </div>
    </div>
  );
}

