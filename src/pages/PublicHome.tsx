import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Heart, HeartHandshake, Loader2, Menu, MessagesSquare, QrCode, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PricingRow = {
  pricing_label: string | null;
  pricing_plan: string | null;
  pricing_max_œuvres: number | null;
  pricing_max_oeuvres?: number | null;
  pricing_is_unlimited: boolean | null;
  pricing_monthly_ttc_eur: number | null;
  pricing_annual_remis: number | null;
  pricing_annuel?: number | null;
};

const BRAND_RED = "hsl(0 65% 48%)";
const BRAND_RED_DARK = "hsl(0 62% 38%)";
const UNSPLASH_HERO_IMAGE =
  "/landing-hero-upload.png";
const UNSPLASH_GALLERY_IMAGE =
  "https://images.unsplash.com/photo-1768924401996-4c8d79462660?auto=format&fit=crop&w=1400&q=80";
const UNSPLASH_DASHBOARD_IMAGE =
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80";
const UNSPLASH_INCLUSIVE_IMAGE =
  "https://images.unsplash.com/photo-1770910200099-745991a725de?auto=format&fit=crop&w=1400&q=80";
const UNSPLASH_MUSEUM_CROWD_IMAGE =
  "https://images.unsplash.com/photo-1758592376385-d5296e694beb?auto=format&fit=crop&w=1600&q=80";
const UNSPLASH_ART_VIEWING_IMAGE =
  "https://images.unsplash.com/photo-1770910200099-745991a725de?auto=format&fit=crop&w=1600&q=80";
const UNSPLASH_EXHIBIT_WALK_IMAGE =
  "https://images.unsplash.com/photo-1770910200099-745991a725de?auto=format&fit=crop&w=1600&q=80";
const UNSPLASH_GALLERY_COUPLE_IMAGE =
  "https://images.unsplash.com/photo-1518281053204-48de9654fb37?auto=format&fit=crop&w=1600&q=80";

type AnchorItem = { id: string; label: string };
const ANCHORS: AnchorItem[] = [
  { id: "concept", label: "Concept" },
  { id: "parcours", label: "Parcours" },
  { id: "pour-qui", label: "Pour qui" },
  { id: "tarifs", label: "Tarifs" },
  { id: "accessibilite", label: "Accessibilité" },
  { id: "contact", label: "Contact" },
];

function formatEur(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function normalizePlan(plan: string | null): string {
  return (plan ?? "").trim().toUpperCase();
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

function planSortKey(plan: string | null): number {
  const key = normalizePlan(plan);
  return PLAN_ORDER[key] ?? 999;
}

function capacityLabel(row: PricingRow): string {
  if (row.pricing_is_unlimited) return "Nombre illimité d'œuvres";
  const max = typeof row.pricing_max_œuvres === "number" ? row.pricing_max_œuvres : row.pricing_max_oeuvres;
  if (typeof max === "number" && max > 0) return `${max} œuvres maxi`;
  return "Sur mesure";
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
    return "Pour institutions, musées et besoins multi-sites.";
  }
  return "Offre AIMEDIArt.";
}

function LogoMark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center rounded-[17%] shadow-[0_6px_18px_rgba(0,0,0,0.1)] ${compact ? "h-12 w-12" : "h-14 w-14"}`}
        style={{ backgroundColor: BRAND_RED }}
        aria-hidden
      >
        <span className="inline-flex animate-logo-heart">
          <Heart className={`text-white ${compact ? "h-5 w-5" : "h-7 w-7"}`} fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden />
        </span>
      </div>
      <div className="min-w-0 leading-tight">
        <div className={`font-sans font-bold tracking-tight ${compact ? "text-[1.05rem]" : "text-[1.35rem]"}`} style={{ color: BRAND_RED }}>AIMEDIArt.com</div>
        <div className={`${compact ? "text-[12px]" : "text-[15px]"} font-semibold italic`} style={{ color: BRAND_RED }}>Art-mediation with AI</div>
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
    <nav aria-label="Navigation de la vitrine" className="flex flex-col gap-1">
      {ANCHORS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="group inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={() => setIsMobileOpen(false)}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 transition-colors group-hover:bg-neutral-500" aria-hidden />
          {item.label}
        </a>
      ))}
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
    </nav>
  );

  return (
    <>
      <aside className="fixed left-5 top-6 z-40 hidden w-[252px] rounded-[1.3rem] border border-neutral-300/70 bg-white/85 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.08)] backdrop-blur-md lg:block">
        <div className="pb-3">
          <LogoMark />
        </div>
        <div className="rounded-[1rem] border border-neutral-200 bg-[#faf9f7] p-2.5">
          <div className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground">
            VITRINE PUBLIQUE
          </div>
          {NavItems}
        </div>
      </aside>

      <div className="fixed left-4 top-4 z-50 lg:hidden">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-neutral-300/80 bg-white/90 px-3.5 py-2 text-sm font-medium shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-4 w-4" aria-hidden />
          Menu
        </button>
      </div>
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/45"
            aria-hidden
            onClick={() => setIsMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 z-50 h-full w-[82vw] max-w-[332px] border-r border-neutral-300 bg-[#fcfbfa] p-4 shadow-2xl"
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
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 max-w-[23ch] font-serif text-[1.95rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[2.2rem]">
          {title}
        </h2>
        <div className="mt-9">{children}</div>
      </div>
    </section>
  );
}

function HeartsBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type HeartParticle = {
      x: number;
      y: number;
      size: number;
      speedY: number;
      swayAmp: number;
      swaySpeed: number;
      phase: number;
      opacity: number;
      hueShift: number;
    };

    const particles: HeartParticle[] = [];
    const targetCount = reduceMotion ? 16 : 34;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createHeart = (initial = false): HeartParticle => ({
      x: Math.random() * width,
      y: initial ? Math.random() * height : height + 30 + Math.random() * 160,
      size: 8 + Math.random() * 18,
      speedY: 0.25 + Math.random() * 0.65,
      swayAmp: 8 + Math.random() * 22,
      swaySpeed: 0.004 + Math.random() * 0.01,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.14 + Math.random() * 0.26,
      hueShift: Math.random() * 8,
    });

    const drawHeart = (x: number, y: number, size: number, color: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.25);
      ctx.bezierCurveTo(x, y, x - size * 0.5, y, x - size * 0.5, y + size * 0.25);
      ctx.bezierCurveTo(x - size * 0.5, y + size * 0.52, x - size * 0.2, y + size * 0.72, x, y + size);
      ctx.bezierCurveTo(x + size * 0.2, y + size * 0.72, x + size * 0.5, y + size * 0.52, x + size * 0.5, y + size * 0.25);
      ctx.bezierCurveTo(x + size * 0.5, y, x, y, x, y + size * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      const now = performance.now();
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.y -= p.speedY;
        p.x += Math.sin(now * p.swaySpeed + p.phase) * 0.22;
        const drawX = p.x + Math.sin(now * p.swaySpeed + p.phase) * p.swayAmp;
        const color = `hsl(${354 + p.hueShift} 75% 55%)`;
        drawHeart(drawX, p.y, p.size, color, p.opacity);

        if (p.y < -40) {
          particles[i] = createHeart(false);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    resize();
    for (let i = 0; i < targetCount; i += 1) particles.push(createHeart(true));
    rafId = window.requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
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
      // Requêtes tolérantes: certains environnements exposent `pricing_annuel`, d'autres non.
      const sb = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
        };
      };
      const pricingSelectCandidates = [
        "pricing_label,pricing_plan,pricing_max_œuvres,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annual_remis,pricing_annuel",
        "pricing_label,pricing_plan,pricing_max_oeuvres,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annual_remis,pricing_annuel",
        "pricing_label,pricing_plan,pricing_max_œuvres,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annual_remis",
        "pricing_label,pricing_plan,pricing_max_oeuvres,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annual_remis",
      ];
      const loadPricing = async () => {
        let lastRes: { data: unknown; error: { message?: string } | null } = { data: null, error: null };
        for (const columns of pricingSelectCandidates) {
          const res = await sb.from("pricing").select(columns);
          lastRes = res;
          if (!res.error) return res;
        }
        return lastRes;
      };
      const [pricingRes, promptIconsRes] = await Promise.all([
        loadPricing(),
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
      const rawPricingRows = (pricingRes.data as PricingRow[] | null) ?? [];
      const normalizedPricingRows = rawPricingRows.map((row) => {
        const maxWithLigature = row.pricing_max_œuvres;
        const maxAscii = row.pricing_max_oeuvres;
        return {
          ...row,
          pricing_max_œuvres:
            typeof maxWithLigature === "number"
              ? maxWithLigature
              : (typeof maxAscii === "number" ? maxAscii : null),
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
    const rows = [...pricingRows].filter((r) => (r.pricing_plan ?? "").trim().length > 0);
    rows.sort((a, b) => {
      const p = planSortKey(a.pricing_plan) - planSortKey(b.pricing_plan);
      if (p !== 0) return p;
      const aUnlimited = Boolean(a.pricing_is_unlimited);
      const bUnlimited = Boolean(b.pricing_is_unlimited);
      if (aUnlimited !== bUnlimited) return aUnlimited ? 1 : -1; // illimité en dernier
      const aMax = typeof a.pricing_max_œuvres === "number" ? a.pricing_max_œuvres : a.pricing_max_oeuvres;
      const bMax = typeof b.pricing_max_œuvres === "number" ? b.pricing_max_œuvres : b.pricing_max_oeuvres;
      const aCap = typeof aMax === "number" ? aMax : Number.POSITIVE_INFINITY;
      const bCap = typeof bMax === "number" ? bMax : Number.POSITIVE_INFINITY;
      return aCap - bCap;
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
      <HeartsBackground />
      <div className="relative z-10">
        <FloatingNav isMobileOpen={mobileNavOpen} setIsMobileOpen={setMobileNavOpen} />

        <div className="lg:pl-[305px]">
        <section className="pb-14 pt-20 sm:pb-18 lg:pt-6">
          <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
            <div className="relative overflow-hidden rounded-[2rem] border border-neutral-300/80 bg-[#faf8f5] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.07)] sm:p-10 lg:p-12">
              <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] bg-[rgba(168,23,29,0.06)]" aria-hidden />
              <div className="absolute -left-8 bottom-10 h-16 w-16 rounded-full border border-[rgba(168,23,29,0.2)]" aria-hidden />
              <h1 className="mt-4 max-w-[16ch] font-serif text-[2.05rem] font-semibold leading-[1.05] tracking-tight text-foreground max-[389px]:text-[1.85rem] sm:text-5xl lg:text-[3.5rem]">
                L’art qui vous parle, littéralement
              </h1>
              <p className="mt-5 max-w-[72ch] text-[1rem] leading-relaxed text-foreground/85 max-[389px]:text-[0.95rem] sm:text-[1.15rem]">
                Le visiteur dialogue avec un assistant incarnant l’artiste via un simple QR code.
                <span className="mt-3 block text-foreground/80">
                  <span className="font-semibold text-foreground">Moins de jargon, plus d’attention</span> ; moins de discours vertical, plus de dialogue.
                </span>
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#parcours" className="w-full sm:w-auto">
                  <Button
                    className="h-11 w-full rounded-xl px-5 text-sm font-semibold sm:w-auto"
                    style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}
                  >
                    Le parcours visiteur
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Button>
                </a>
                <a href="#concept" className="w-full sm:w-auto">
                  <Button variant="outline" className="h-11 w-full rounded-xl border-neutral-300 bg-white/80 px-5 sm:w-auto">
                    Une médiation dialoguée
                  </Button>
                </a>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-neutral-300/70 bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Scan QR-code</div>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <div className="max-w-[11ch] text-sm leading-relaxed text-foreground/85">Un geste simple devant l’œuvre</div>
                    <div className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 p-2" aria-hidden>
                      <QrCode className="h-6 w-6 text-[#9d2525]" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-300/70 bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Mode de langage</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-foreground/85">Expert, Poète, Enfant…</div>
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
                <div className="rounded-2xl border border-neutral-300/70 bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Vote émotionnel</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                    De 1 à 5 cœurs
                    <span className="mt-1 block text-[#9D2525]">♥♥♥♥♥</span>
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
              <blockquote className="mt-8 border-l-2 border-[rgba(168,23,29,0.5)] pl-4 text-sm italic leading-relaxed text-foreground/75 sm:max-w-[48ch]">
                « Une médiation qui n’écrase pas, qui accueille ; une parole qui n’impose pas, qui relie. »
              </blockquote>
            </div>
          </div>
        </section>

        <Section id="concept" eyebrow="Problème / solution" title="Des cartels illisibles… à une médiation dialoguée">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-3xl border-neutral-300/70 bg-[#fdfdfc] shadow-[0_12px_24px_rgba(0,0,0,0.05)]">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Cartels traditionnels</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm leading-relaxed text-foreground/80">
                <p>Illisibles, intimidants, trop descendants.</p>
                <ul className="space-y-1">
                  <li className="flex gap-2">
                    <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px]">–</span>
                    <span>Jargon et sur-information</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px]">–</span>
                    <span>Une lecture « obligatoire »</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px]">–</span>
                    <span>Peu d’accessibilité (FALC, publics variés)</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-[rgba(168,23,29,0.22)] bg-[#fdfbf9] shadow-[0_12px_24px_rgba(0,0,0,0.05)]">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Solution AIMEDIArt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm leading-relaxed text-foreground/80">
                <p>Médiation personnalisée, émotionnelle, accessible et dialoguée.</p>
                <ul className="space-y-1">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_RED }} aria-hidden />
                    <span>Vous posez vos questions, à votre rythme</span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_RED }} aria-hidden />
                    <span>Choix d’un ton (Expert, Poète, Enfant…)</span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_RED }} aria-hidden />
                    <span>Retour émotionnel simple (1 à 5 cœurs)</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
          <figure className="mt-5 overflow-hidden rounded-3xl border border-neutral-300/70 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative">
              <img
                src={UNSPLASH_GALLERY_IMAGE}
                alt="Public dans une galerie d’art contemporain"
                className="h-56 w-full object-cover object-[center_42%] sm:h-72"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.24),rgba(0,0,0,0.02)_55%)]" aria-hidden />
            </div>
          </figure>
        </Section>

        <Section id="parcours" eyebrow="Parcours visiteur" title="Un parcours en 3 étapes, lisible en un coup d’œil">
          <figure className="mb-5 overflow-hidden rounded-3xl border border-neutral-300/70 bg-white shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative">
              <img
                src={UNSPLASH_ART_VIEWING_IMAGE}
                alt="Visiteurs en train de parcourir une exposition d’art contemporain"
                className="h-56 w-full object-cover object-[center_38%] sm:h-72"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.2),rgba(0,0,0,0.01)_60%)]" aria-hidden />
            </div>
          </figure>
          <div className="relative grid gap-4 lg:grid-cols-3">
            <div className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-[30px] hidden h-px bg-neutral-300 lg:block" aria-hidden />
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
                text: "Expert, Poète, Enfant de 5 ans… et même Simple / Essentiel si besoin.",
                icon: MessagesSquare,
              },
              {
                step: "Étape 3",
                title: "Dialoguer + voter",
                text: "Questions suggérées par IA, puis vote émotionnel de 1 à 5 cœurs.",
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
                <CardContent className="text-sm leading-relaxed text-foreground/80">{x.text}</CardContent>
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
                  { kpi: "+31%", label: "questions engageantes" },
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

          <div className="mt-4 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span className="inline-block h-[2px] w-10 rounded-full bg-neutral-300" aria-hidden />
            Données lisibles, décisions curatoriales plus éclairées.
          </div>
        </Section>

        <Section id="pour-qui" eyebrow="Pour qui ?" title="Un outil pensé pour des acteurs culturels différents">
          <figure className="mb-5 overflow-hidden rounded-3xl border border-neutral-300/70 bg-white shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative">
              <img
                src={UNSPLASH_MUSEUM_CROWD_IMAGE}
                alt="Public nombreux devant une œuvre dans un musée"
                className="h-56 w-full object-cover object-[center_30%] sm:h-72"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.22),rgba(0,0,0,0.02)_58%)]" aria-hidden />
            </div>
          </figure>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Artistes", text: "Une médiation fidèle, incarnée, qui respecte l’intention." },
              { title: "Commissaires d’exposition", text: "Un tableau de bord utile, sans complexifier la visite." },
              { title: "Galeries", text: "Une expérience premium et un retour sur la réception." },
              { title: "Associations", text: "Une médiation accueillante, adaptable à tous les publics." },
              { title: "Musées / institutions", text: "Un dispositif compatible multi-sites et multi-expos." },
              { title: "Lieux multi-sites", text: "Un cadre cohérent, réplicable, et pilotable dans le temps." },
            ].map((c, index) => (
              <Card
                key={c.title}
                className={`rounded-3xl border-neutral-300/70 shadow-[0_10px_22px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(0,0,0,0.07)] focus-within:ring-1 focus-within:ring-[rgba(168,23,29,0.22)] ${
                  index % 3 === 0 ? "bg-white" : index % 3 === 1 ? "bg-[#fbfaf8]" : "bg-[#f8f6f2]"
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="font-serif text-lg">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-foreground/80">{c.text}</CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="tarifs" title="Des offres claires, adaptées au rythme des expositions">
          <figure className="mb-5 overflow-hidden rounded-3xl border border-neutral-300/70 bg-white shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative">
              <img
                src={UNSPLASH_EXHIBIT_WALK_IMAGE}
                alt="Visiteurs qui circulent dans une exposition avec œuvres accrochées"
                className="h-56 w-full object-cover object-[center_36%] sm:h-72"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.2),rgba(0,0,0,0.01)_60%)]" aria-hidden />
            </div>
          </figure>
          <div className="rounded-3xl border border-neutral-300/70 bg-[#faf9f7] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.05)] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-sm font-semibold">Paiement mensuel</div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80">Souplesse. Résiliable à la fin de l’événement.</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-sm font-semibold">Paiement annuel</div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80">Avantage tarifaire. Le plus serein pour conserver catalogue et fiches d’œuvres.</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              En cas de résiliation, l’accès reste actif jusqu’à la fin de la période payée. À son terme, les données sont supprimées définitivement.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
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
                  {groupedPlans.map(({ planKey, variants }) => {
                    const first = variants[0];
                    const displayPlan = first?.pricing_plan?.trim() || planKey;
                    const isHighlight = /HORIZON|ATELIER/.test(displayPlan.toUpperCase());
                    const rawLabel = first?.pricing_label?.trim() ?? "";
                    const repeatsPlanName = rawLabel.toUpperCase().includes(displayPlan.toUpperCase());
                    const subtitle = rawLabel && !repeatsPlanName ? rawLabel : planEditorialDescription(displayPlan);
                    const selectedIndexRaw = selectedVariantByPlan[planKey] ?? 0;
                    const selectedIndex = Math.min(Math.max(selectedIndexRaw, 0), Math.max(variants.length - 1, 0));
                    const selectedVariant = variants[selectedIndex];
                    return (
                      <Card
                        key={planKey}
                        className={`rounded-3xl border-neutral-300/70 bg-white shadow-[0_12px_24px_rgba(0,0,0,0.05)] ${
                          isHighlight ? "ring-1 ring-[rgba(168,23,29,0.22)]" : ""
                        }`}
                      >
                        <CardHeader className="pb-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {isHighlight ? "Recommandé" : "Offre"}
                            </span>
                            <Link to="/login">
                              <Button
                                size="sm"
                                className="h-8 rounded-lg px-3 text-xs font-semibold"
                                style={{ backgroundColor: "#9D2525", color: "white" }}
                              >
                                Commander
                              </Button>
                            </Link>
                          </div>
                          <CardTitle className="font-serif text-[1.75rem] leading-tight text-[#9d2525]">{displayPlan}</CardTitle>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {subtitle}
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
                                    Option {idx + 1} — {capacityLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          {selectedVariant ? (
                            <div className="rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4">
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold">{capacityLabel(selectedVariant)}</div>
                                  </div>
                                  <span className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                    Option {selectedIndex + 1}
                                  </span>
                                </div>
                                <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
                                  <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                                    <div className="text-[11px] font-medium text-muted-foreground">Mensuel TTC</div>
                                    <div className="mt-0.5 text-[22px] font-semibold leading-none tracking-tight xl:text-[24px]">{formatEur(selectedVariant.pricing_monthly_ttc_eur)}</div>
                                  </div>
                                  <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                                    <div className="text-[11px] font-medium text-muted-foreground">Annuel TTC</div>
                                    <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                                      <span className="text-[22px] font-semibold leading-none tracking-tight xl:text-[24px]">{formatEur(selectedVariant.pricing_annual_remis)}</span>
                                      {typeof selectedVariant.pricing_annuel === "number" && !Number.isNaN(selectedVariant.pricing_annuel) ? (
                                        <span className="text-[20px] font-bold italic leading-none text-[#9d2525] line-through">
                                          {formatEur(selectedVariant.pricing_annuel)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </Section>

        <Section id="accessibilite" eyebrow="Réassurance" title="Une médiation pensée pour le confort de tous les publics">
          <figure className="mb-4 overflow-hidden rounded-3xl border border-neutral-300/70 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
            <div className="relative">
              <img
                src={UNSPLASH_INCLUSIVE_IMAGE}
                alt="Public varié découvrant un musée dans un espace inclusif"
                className="h-56 w-full object-cover object-[center_38%] sm:h-72"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.2),rgba(0,0,0,0.01)_62%)]" aria-hidden />
            </div>
          </figure>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Smartphone d’abord", text: "Pensé pour un usage sur place, en mobilité." },
              { title: "Pour tous les publics", text: "Médiation adaptable à l’âge et au niveau." },
              { title: "Attention FALC", text: "Facile à Lire et à Comprendre, quand c’est nécessaire." },
              { title: "Chaleureux & culturel", text: "Une tonalité éditoriale, premium et humaine." },
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

        <Section id="contact" eyebrow="Contact" title="Parlons de votre exposition">
          <figure className="mb-5 overflow-hidden rounded-3xl border border-neutral-300/70 bg-white shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
            <div className="relative">
              <img
                src={UNSPLASH_GALLERY_COUPLE_IMAGE}
                alt="Deux visiteurs observant une œuvre dans une galerie"
                className="h-56 w-full object-cover object-[center_30%] sm:h-72"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.23),rgba(0,0,0,0.01)_60%)]" aria-hidden />
            </div>
          </figure>
          <div className="rounded-[2rem] border border-neutral-300/70 bg-[#faf9f7] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.05)] sm:p-8">
            <p className="max-w-[68ch] text-sm leading-relaxed text-foreground/80">
              Vous préparez une exposition, une résidence, ou un parcours multi-sites ? AIMEDIArt s’adapte au contexte.
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
                <div className="font-serif text-lg font-semibold">AIMEDIArt</div>
                <div className="text-sm text-muted-foreground">Médiation interactive via IA, simple et accessible.</div>
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

