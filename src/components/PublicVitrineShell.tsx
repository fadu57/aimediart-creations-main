import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Heart, Menu, X } from "lucide-react";

import Header from "@/components/Header";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";
import { LanguageFlag } from "@/components/LanguageFlag";
import { VitrineAnchorNav } from "@/components/VitrineAnchorNav";
import { UI_LANGUAGE_OPTIONS } from "@/lib/uiLanguageOptions";
import { AIMEDIART_CONTACT_MAILTO } from "@/lib/aimediartContact";
import { cn } from "@/lib/utils";

export const BRAND_RED = "hsl(0 65% 48%)";
export const BRAND_RED_DARK = "hsl(0 62% 38%)";
/** Rouge marque pour le mot « AIMEDIArt » sur la vitrine */
export const AIMEDIART_WORD_RED = "text-[#E63946]";

function LogoMark({ compact }: { compact?: boolean }) {
  const { t } = useTranslation("home");
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
          {t("brand.baseline")}
        </div>
      </div>
    </div>
  );
}

function FloatingNav({
  isMobileOpen,
  setIsMobileOpen,
  vitrinePathPrefix,
  hideLogin,
  stackedBelowBackoffice,
}: {
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
  /** "" = ancres sur la page courante ; "/organisation" = ancres vers la vitrine (pages légales) */
  vitrinePathPrefix: "" | "/organisation";
  hideLogin?: boolean;
  stackedBelowBackoffice?: boolean;
}) {
  const { language, setLanguage } = useUiLanguage();
  const { t } = useTranslation("home");
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((o) => o.value === language) ?? UI_LANGUAGE_OPTIONS[0];

  const NavItems = (
    <VitrineAnchorNav
      vitrinePathPrefix={vitrinePathPrefix}
      variant="floating"
      onNavigate={() => setIsMobileOpen(false)}
    />
  );

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 z-40 border-b border-neutral-300/70 bg-white/85 backdrop-blur-md",
          stackedBelowBackoffice ? "top-[4.25rem]" : "top-0",
        )}
      >
        <div className="mx-auto flex h-[74px] w-full max-w-[1060px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <LogoMark compact />
            <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-300/80 bg-white px-1 py-1 shadow-sm">
              <LanguageFlag lang={activeLanguage.value} />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                className="h-5 w-[42px] cursor-pointer bg-transparent text-[10px] font-semibold outline-none"
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
            {!hideLogin ? (
              <Link
                to="/login"
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-neutral-300/80 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground/85 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-ring lg:px-2 lg:py-1 lg:text-[12px]"
              >
                {t("nav.login")}
                <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
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
            className={cn(
              "fixed left-0 z-50 h-auto w-[82vw] max-w-[332px] rounded-br-xl border-r border-neutral-300 bg-[rgba(252,251,250,0.60)] p-4 shadow-2xl backdrop-blur-sm",
              stackedBelowBackoffice ? "top-[4.25rem]" : "top-0",
            )}
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
                {!hideLogin ? (
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-lg border border-neutral-300/80 bg-white px-3 py-2 text-sm font-medium text-foreground/85 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => setIsMobileOpen(false)}
                  >
                    {t("nav.login")}
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
                <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
                  <LanguageFlag lang={activeLanguage.value} />
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
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const initVanta = async () => {
      try {
        (window as Window & { THREE?: typeof THREE }).THREE = THREE;
        const vantaModule = await import("vanta/dist/vanta.clouds.min");
        const CLOUDS = (vantaModule.default ?? vantaModule) as (options: Record<string, unknown>) => {
          destroy: () => void;
        };
        if (!mounted || !container) return;
        effect = CLOUDS({
          THREE,
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

    const scheduleVanta = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => void initVanta(), { timeout: 2500 });
      } else {
        timeoutId = setTimeout(() => void initVanta(), 1200);
      }
    };

    scheduleVanta();

    return () => {
      mounted = false;
      if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      effect?.destroy();
      effect = null;
    };
  }, []);

  return (
    <div
      ref={vantaRef}
      className="fixed inset-0 z-0 bg-gradient-to-b from-sky-100/80 via-white to-white"
      aria-hidden
    />
  );
}

function PublicVitrineFooter() {
  const { t } = useTranslation("home");

  const footerLinkClass =
    "group inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-medium leading-tight text-foreground/85 transition-colors hover:bg-neutral-100";

  const footerLinks = [
    { to: "/cgv", label: t("footer.cgv") },
    { to: "/cookies", label: t("footer.cookies") },
    { to: "/privacy", label: t("footer.privacy") },
    { to: "/terms", label: t("footer.terms") },
    { to: "/ai-policy", label: t("footer.ai_policy") },
  ] as const;

  return (
    <footer className="border-t border-neutral-300/70 bg-white/80 py-3.5">
      <div className="mx-auto w-full max-w-[1060px] px-5 sm:px-6">
        <div className="flex flex-col gap-[7px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <LogoMark compact />
          </div>
          <div className="rounded-lg border border-neutral-200 bg-[#faf9f7] px-0.5 py-0.5">
            <nav className="flex flex-wrap items-center gap-0.5" aria-label={t("footer.nav_aria")}>
              <a href={AIMEDIART_CONTACT_MAILTO} className={footerLinkClass}>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 transition-colors group-hover:bg-[#E63946]"
                  aria-hidden
                />
                {t("footer.contact")}
              </a>
              {footerLinks.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(footerLinkClass, isActive && "bg-neutral-100")
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                          isActive ? "bg-[#E63946]" : "bg-neutral-300 group-hover:bg-[#E63946]",
                        )}
                        aria-hidden
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
        <p className="mt-2.5 text-center text-[11px] text-neutral-500 sm:text-left">
          {t("footer.copyright")}
        </p>
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
  const { session, loading: authLoading } = useAuthUser();
  const showBackofficeHeader = Boolean(session) && !authLoading;
  /** Connecté : un seul header (backoffice avec ancres vitrine), pas de FloatingNav en doublon. */
  const mergeVitrineIntoHeader = showBackofficeHeader;
  const mainTopPaddingClass = mergeVitrineIntoHeader
    ? "pt-[5rem]"
    : vitrinePathPrefix === "/organisation"
      ? "pt-[74px]"
      : undefined;

  return (
    <div
      className={cn(
        "relative min-h-screen font-sans text-[#1f1f1f]",
        atmosphericBackdrop ? "bg-transparent" : "bg-white",
      )}
    >
      <VantaCloudsBackground />
      <div className="relative z-10">
        {showBackofficeHeader ? <Header /> : null}
        {!mergeVitrineIntoHeader ? (
          <FloatingNav
            isMobileOpen={mobileNavOpen}
            setIsMobileOpen={setMobileNavOpen}
            vitrinePathPrefix={vitrinePathPrefix}
            hideLogin={showBackofficeHeader}
            stackedBelowBackoffice={showBackofficeHeader}
          />
        ) : null}
        <main
          id="contenu-principal"
          role="main"
          className={cn("outline-none", mainTopPaddingClass)}
        >
          {children}
          <PublicVitrineFooter />
        </main>
      </div>
    </div>
  );
}
