import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Heart, Menu, X } from "lucide-react";

import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";
import { cn } from "@/lib/utils";

export const BRAND_RED = "hsl(0 65% 48%)";
export const BRAND_RED_DARK = "hsl(0 62% 38%)";
/** Rouge marque pour le mot « AIMEDIArt » sur la vitrine */
export const AIMEDIART_WORD_RED = "text-[#E63946]";

const UI_LANGUAGE_OPTIONS: Array<{ value: UiLanguage; label: string; flagClass: string }> = [
  { value: "fr", label: "FR", flagClass: "fi fi-fr" },
  { value: "de", label: "DE", flagClass: "fi fi-de" },
  { value: "en", label: "EN", flagClass: "fi fi-gb" },
  { value: "es", label: "ES", flagClass: "fi fi-es" },
  { value: "it", label: "IT", flagClass: "fi fi-it" },
];

const ANCHOR_IDS = ["accueil", "exposition-vivante", "parcours", "tarifs", "accessibilite", "connectivite"] as const;

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
        <div className={`${compact ? "text-[12.5px]" : "text-[15.5px]"} font-semibold italic`} style={{ color: BRAND_RED }}>
          Art-mediation with AI
        </div>
      </div>
    </div>
  );
}

function FloatingNav({
  isMobileOpen,
  setIsMobileOpen,
  vitrinePathPrefix,
}: {
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
  /** "" = ancres sur la page courante ; "/organisation" = ancres vers la vitrine (pages légales) */
  vitrinePathPrefix: "" | "/organisation";
}) {
  const { language, setLanguage } = useUiLanguage();
  const { t } = useTranslation("home");
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((o) => o.value === language) ?? UI_LANGUAGE_OPTIONS[0];

  const navClassName =
    "group inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-ring lg:gap-0.5 lg:rounded lg:px-1 lg:py-0.5 lg:text-[11px] lg:leading-tight xl:px-1.5 xl:text-[12px]";

  const NavItems = (
    <nav aria-label="Navigation de la vitrine" className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-0">
      {ANCHOR_IDS.map((id) => {
        const label = t(`nav.anchor_${id.replace(/-/g, "_")}`);
        const dot = (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-neutral-300 transition-colors group-hover:bg-[#E63946] lg:h-1.5 lg:w-1.5"
            aria-hidden
          />
        );

        if (id === "connectivite") {
          return vitrinePathPrefix ? (
            <Link
              key={id}
              to={`${vitrinePathPrefix}#connectivite`}
              className={navClassName}
              onClick={() => setIsMobileOpen(false)}
            >
              {dot}
              {label}
            </Link>
          ) : (
            <a key={id} href="#connectivite" className={navClassName} onClick={() => setIsMobileOpen(false)}>
              {dot}
              {label}
            </a>
          );
        }

        return vitrinePathPrefix ? (
          <Link
            key={id}
            to={`${vitrinePathPrefix}#${id}`}
            className={navClassName}
            onClick={() => setIsMobileOpen(false)}
          >
            {dot}
            {label}
          </Link>
        ) : (
          <a key={id} href={`#${id}`} className={navClassName} onClick={() => setIsMobileOpen(false)}>
            {dot}
            {label}
          </a>
        );
      })}
    </nav>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-neutral-300/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-[74px] w-full max-w-[1060px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <LogoMark compact />
            <div className="inline-flex items-center gap-1 rounded-lg border border-neutral-300/80 bg-white px-2 py-1.5 shadow-sm">
              <span className={activeLanguage.flagClass} aria-hidden />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                className="h-6 w-[58px] cursor-pointer bg-transparent text-[11px] font-semibold outline-none"
                aria-label={t("nav.language_label")}
              >
                {UI_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 lg:flex">
            <div className="max-w-full rounded-lg border border-neutral-200 bg-[#faf9f7] px-0.5 py-0.5">
              {NavItems}
            </div>
            <Link
              to="/login"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-neutral-300/80 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground/85 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-ring lg:px-2 lg:py-1 lg:text-[12px]"
            >
              {t("nav.login")}
              <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-300/80 bg-white/70 px-2.5 py-2 text-xs font-medium shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-ring sm:gap-2 sm:px-3.5 sm:text-sm lg:hidden"
            onClick={() => setIsMobileOpen(true)}
            aria-label={t("nav.open_menu")}
          >
            <Menu className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden min-[340px]:inline">Menu</span>
          </button>
        </div>
      </header>
      {isMobileOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/45" aria-hidden onClick={() => setIsMobileOpen(false)} />
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
                aria-label={t("nav.close_menu")}
                onClick={() => setIsMobileOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-2.5">
              <div className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground">{t("nav.public_vitrine")}</div>
              {NavItems}
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-lg border border-neutral-300/80 bg-white px-3 py-2 text-sm font-medium text-foreground/85 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={() => setIsMobileOpen(false)}
                >
                  {t("nav.login")}
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
                <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
                  <span className={activeLanguage.flagClass} aria-hidden />
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                    className="h-6 w-full cursor-pointer bg-transparent text-sm font-semibold outline-none"
                    aria-label={t("nav.language_label")}
                  >
                    {UI_LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
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
        console.error("[PublicVitrineShell] Initialisation Vanta Clouds impossible:", error);
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

function PublicVitrineFooter({ vitrinePathPrefix }: { vitrinePathPrefix: "" | "/organisation" }) {
  const { t } = useTranslation("home");
  const contactHref = vitrinePathPrefix ? `${vitrinePathPrefix}#contact` : "#contact";

  return (
    <footer className="border-t border-neutral-300/70 bg-white/80 py-10">
      <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <LogoMark compact />
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {vitrinePathPrefix ? (
              <Link to={contactHref} className="text-foreground/80 hover:text-foreground">
                {t("footer.contact")}
              </Link>
            ) : (
              <a href={contactHref} className="text-foreground/80 hover:text-foreground">
                {t("footer.contact")}
              </a>
            )}
            <Link to="/cgv" className="text-foreground/80 hover:text-foreground">
              {t("footer.cgv")}
            </Link>
            <Link to="/cookies" className="text-foreground/80 hover:text-foreground">
              {t("footer.cookies")}
            </Link>
            <Link to="/privacy" className="text-foreground/80 hover:text-foreground">
              {t("footer.privacy")}
            </Link>
            <Link to="/terms" className="text-foreground/80 hover:text-foreground">
              {t("footer.terms")}
            </Link>
            <Link to="/ai-policy" className="text-foreground/80 hover:text-foreground">
              {t("footer.ai_policy")}
            </Link>
            <Link to="/login" className="text-foreground/80 hover:text-foreground">
              {t("footer.login")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

type PublicVitrineShellProps = {
  children: ReactNode;
  /** "" sur /home ; "/organisation" sur les pages légales pour que l’ancrage renvoie à la vitrine */
  vitrinePathPrefix: "" | "/organisation";
  /**
   * Si true, le shell n’impose pas de fond blanc opaque : le ciel Vanta reste visible
   * (pages CGV / cookies).
   */
  atmosphericBackdrop?: boolean;
};

/**
 * En-tête (nav fixe), fond Vanta et pied de page identiques à la vitrine /home.
 */
export function PublicVitrineShell({
  children,
  vitrinePathPrefix,
  atmosphericBackdrop = false,
}: PublicVitrineShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div
      className={cn(
        "relative min-h-screen text-[#1f1f1f]",
        atmosphericBackdrop ? "bg-transparent" : "bg-white",
      )}
    >
      <VantaCloudsBackground />
      <div className="relative z-10">
        <FloatingNav
          isMobileOpen={mobileNavOpen}
          setIsMobileOpen={setMobileNavOpen}
          vitrinePathPrefix={vitrinePathPrefix}
        />
        <div>
          {children}
          <PublicVitrineFooter vitrinePathPrefix={vitrinePathPrefix} />
        </div>
      </div>
    </div>
  );
}
