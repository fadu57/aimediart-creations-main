import { useEffect, useState } from "react";
import { BarChart3, Building2, GalleryVerticalEnd, House, Loader2, LogIn, LogOut, Menu, Settings, UserPlus, Users, X } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { normalizeRoleName, ROLE_ADMIN_AGENCY } from "@/lib/authUser";
import { HEADER_NAV_ITEMS } from "@/lib/navigationMatrix";
import { supabase } from "@/lib/supabase";
import { endOrganizerErrorSession, logClientError } from "@/lib/clientErrorLogging";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { useOrganisationStandby } from "@/providers/OrganisationStandbyProvider";
import { useTranslation } from "react-i18next";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";
import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { SettingsMenuDropdown } from "@/components/SettingsMenuDropdown";
import { VitrineAnchorNav } from "@/components/VitrineAnchorNav";
import { LanguageFlag } from "@/components/LanguageFlag";
import { isOrganisationVitrineAreaPath } from "@/i18n/constants";
import { UI_LANGUAGE_OPTIONS } from "@/lib/uiLanguageOptions";
import { cn } from "@/lib/utils";

/** Effet verre sur les pastilles du menu desktop (aperçu navigateur). */
const HEADER_NAV_PILL_BLUR = "backdrop-blur-[12px]";
/** Pastilles menu desktop — compactes. */
const HEADER_NAV_PILL_CLASS = `rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors sm:text-sm sm:px-2 sm:py-1 ${HEADER_NAV_PILL_BLUR}`;
/** Pastilles header /organisation fusionné — taille intermédiaire. */
const HEADER_NAV_PILL_COMPACT_CLASS = `rounded-md px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap transition-colors ${HEADER_NAV_PILL_BLUR}`;
/** Ombre portée + inset pour le bouton de déconnexion. */
const HEADER_LOGOUT_SHADOW =
  "shadow-[0px_4px_12px_0px_rgba(0,0,0,0.15),inset_0px_4px_12px_0px_rgba(0,0,0,0.15)]";

/** Mapping label français HEADER_NAV_ITEMS → clé i18next namespace "header". */
const NAV_LABEL_TO_KEY: Record<string, string> = {
  "Votre profil": "nav_home",
  Organisation: "nav_organisation",
  User: "nav_users",
  Expos: "nav_expos",
  Artistes: "nav_artists",
  Catalogue: "nav_catalogue",
  Statistiques: "nav_stats",
};

/**
 * Résout la clé i18next pour un label de navigation.
 * En mode DEV, logue un avertissement si le label n'est pas dans NAV_LABEL_TO_KEY
 * (ex. un nouveau menu ajouté dans HEADER_NAV_ITEMS sans entrée de traduction correspondante).
 * En production, retourne le label français en dernier recours — visible, donc détectable.
 */
function navKey(label: string): string {
  const key = NAV_LABEL_TO_KEY[label];
  if (key) return key;
  if (import.meta.env.DEV) {
    console.warn(
      `[i18n] Header: label nav "${label}" absent de NAV_LABEL_TO_KEY — ` +
      `ajouter une entrée et une clé dans src/i18n/locales/*/header.json`,
    );
  }
  return label;
}

function Logo({
  compact,
  role_name,
  role_id,
}: {
  compact?: boolean;
  role_name: string | null;
  role_id: number | null;
}) {
  const isAgencyHome = normalizeRoleName(role_name) === ROLE_ADMIN_AGENCY || role_id === 4;
  const { session } = useAuthUser();
  // En espace connecté, éviter d’envoyer vers la vitrine publique.
  const homeTo = session ? (isAgencyHome ? "/artistes" : "/dashboard") : "/organisation";

  return (
    <Link to={homeTo} className="flex min-w-0 items-center">
      <AimediartBrandLogoBlock compact={compact} hideTextBelowSm={!compact} animateHeart />
    </Link>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const normalizedPathname = (() => {
    const decoded = decodeURIComponent(pathname || "");
    return decoded
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/œ/g, "oe")
      .replace(/Œ/g, "oe");
  })();
  const isRegisterPage =
    pathname === "/register" ||
    pathname.startsWith("/register/") ||
    pathname === "/register_visitor" ||
    pathname.startsWith("/register_visitor/") ||
    pathname === "/register-visitor" ||
    pathname.startsWith("/register-visitor/");
  const isArtworkViewerPage =
    /(^|\/)(oeuvre|artwork)(\/|$)/.test(normalizedPathname) ||
    /(^|\/)(oeuvres_artiste|artworks_artist)(\/|$)/.test(normalizedPathname) ||
    normalizedPathname === "/visitor" ||
    normalizedPathname.startsWith("/visitor/") ||
    normalizedPathname === "/scan-work2" ||
    normalizedPathname === "/scan-work1" ||
    normalizedPathname === "/scan-work-first";
  const isVisitorPage =
    pathname === "/register" ||
    pathname.startsWith("/register/") ||
    pathname === "/register_visitor" ||
    pathname.startsWith("/register_visitor/") ||
    pathname === "/register-visitor" ||
    pathname.startsWith("/register-visitor/") ||
    pathname === "/scan" ||
    pathname.startsWith("/scan/") ||
    pathname === "/scan-work" ||
    pathname.startsWith("/scan-work/") ||
    pathname === "/scan-work1" ||
    pathname === "/scan-work-first" ||
    pathname === "/scan-work2" ||
    pathname === "/summary" ||
    pathname.startsWith("/summary/") ||
    isArtworkViewerPage;
  const isAuthFormPage = pathname === "/login" || isVisitorPage;
  const isOrganisationVitrinePage = isOrganisationVitrineAreaPath(pathname);
  const { session, first_name, user, role_name, role_id, agency_id, loading: authLoading } = useEffectiveAuth();
  const homePath = session ? "/dashboard" : "/organisation";
  const { can } = useNavigationMatrix();
  const { isStandbyNavRestricted } = useOrganisationStandby();
  const { language, setLanguage } = useUiLanguage();
  const { t } = useTranslation("header");
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((option) => option.value === language) ?? UI_LANGUAGE_OPTIONS[0];
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [agencyDisplayName, setAgencyDisplayName] = useState<string | null>(null);
  const [isDesktopHeader, setIsDesktopHeader] = useState(
    typeof window !== "undefined" ? window.innerWidth > 1173 : true,
  );
  /** Équipe expo (6) et visiteur : pas d’entrée « Organisation » ; admin agence (4) et commissaire (5) y accèdent. */
  const hideOrganisationNav = typeof role_id === "number" && role_id > 5;
  const showGreetingAgency = typeof role_id === "number" && role_id > 3;
  const hasFullHeader = role_id === 4 || role_id === 1 || (typeof role_id === "number" && role_id >= 1 && role_id <= 6);
  const canSeeHomeMenu = can("menu_home");
  const canSeeSettings = role_id === 1 || role_id === 2 || role_id === 3;
  const standbyNavOnly = isStandbyNavRestricted;
  const showVitrineNavInHeader =
    Boolean(session) && isOrganisationVitrinePage && !authLoading;
  const showVitrineNavInHeaderDesktop = showVitrineNavInHeader && isDesktopHeader;
  const vitrineAnchorPrefix = pathname === "/organisation" ? "" : "/organisation";
  const navPillClass = showVitrineNavInHeaderDesktop ? HEADER_NAV_PILL_COMPACT_CLASS : HEADER_NAV_PILL_CLASS;
  const languageInNavRow = showVitrineNavInHeaderDesktop && isDesktopHeader;

  const languageSelector = (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-white px-1.5">
      <LanguageFlag lang={activeLanguage.value} />
      <select
        id={languageInNavRow ? "languageSelectorDesktopNav" : "languageSelector"}
        value={language}
        onChange={(e) => setLanguage(e.target.value as UiLanguage)}
        className="h-7 w-[64px] bg-transparent text-[10px] font-semibold outline-none"
        aria-label={t("language_label")}
        title={t("language_label")}
      >
        {UI_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
  const userMeta = (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  const jwtDisplayName =
    (typeof userMeta.full_name === "string" ? userMeta.full_name.trim() : "") ||
    (typeof userMeta.firstname === "string" ? userMeta.firstname.trim() : "") ||
    (typeof userMeta.first_name === "string" ? userMeta.first_name.trim() : "");
  const displayUserPrenom = first_name?.trim() || jwtDisplayName || "Visiteur";

  useEffect(() => {
    let cancelled = false;
    if (!session?.user || !agency_id?.trim() || !showGreetingAgency) {
      setAgencyDisplayName(null);
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("name_agency")
        .eq("id", agency_id.trim())
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setAgencyDisplayName(null);
        return;
      }
      const n = (data as { name_agency?: string | null }).name_agency?.trim();
      setAgencyDisplayName(n || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user, agency_id, showGreetingAgency]);

  const handleLogout = async () => {
    const postLogoutPath = role_id === 7 ? "/visitor" : "/organisation";
    try {
      if (session?.user?.id && role_id !== 7) {
        void logClientError("organizer", {
          message: "Déconnexion volontaire (menu)",
          source: "auth.sign_out",
          authUserId: session.user.id,
          agencyId: agency_id ?? null,
        });
        void endOrganizerErrorSession(true);
      }
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("redirectAfterLogin");
        window.location.replace(postLogoutPath);
      }
    }
  };

  useEffect(() => {
    setIsFabOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onResize = () => setIsDesktopHeader(window.innerWidth > 1173);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isDesktopHeader && isFabOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFabOpen, isDesktopHeader]);

  if (isArtworkViewerPage || isRegisterPage) {
    return null;
  }

  return (
    <header
      className={
        isVisitorPage
          ? "fixed top-0 left-1/2 z-50 w-full max-w-[375px] -translate-x-1/2 border-b border-border/40 bg-white/80 backdrop-blur-md shadow-sm"
          : "fixed top-0 left-0 z-50 w-full border-b border-border/40 bg-white/80 backdrop-blur-md shadow-sm"
      }
    >
      {!isDesktopHeader && (
        <div
          className={`fab-backdrop ${isFabOpen ? "active" : ""}`}
          aria-hidden={!isFabOpen}
          onClick={() => setIsFabOpen(false)}
        />
      )}
      <div
        className={
          isVisitorPage
            ? "mx-auto flex min-h-[4rem] w-full max-w-[375px] items-center justify-between gap-1.5 px-1.5 sm:gap-2 sm:px-3"
            : cn(
                "mx-auto flex w-full py-1",
                showVitrineNavInHeaderDesktop
                  ? "max-w-[1060px] flex-col px-5 py-1 sm:px-6 min-h-[5rem]"
                  : "max-w-[1200px] items-center justify-between gap-2 px-2 sm:px-4 min-h-[4.25rem]",
              )
        }
      >
        <div
          className={cn(
            "flex w-full gap-2",
            showVitrineNavInHeaderDesktop
              ? "items-center justify-between px-2 sm:px-3"
              : "items-center justify-between",
          )}
        >
        <div
          className={cn(
            "header-left flex min-w-0 items-center gap-[15px]",
            !showVitrineNavInHeaderDesktop && "flex-1",
          )}
        >
          <Logo compact={isAuthFormPage} role_name={role_name} role_id={role_id} />
          {!languageInNavRow ? (
            <div className="user-controls flex flex-col items-start gap-1">
              {languageSelector}
              {!isDesktopHeader && (
              <span className="hidden min-[400px]:inline whitespace-nowrap text-[11px] text-gray-700">
                {t("greeting")}
                {session ? (
                  <>
                    {" "}
                    {authLoading ? (
                      <Loader2 className="inline-block h-3 w-3 animate-spin align-middle text-gray-500" aria-hidden />
                    ) : (
                      <span id="display_user_prenom_mobile" className="font-semibold">
                        {displayUserPrenom}
                        {showGreetingAgency && agencyDisplayName
                          ? t("greeting_agency_suffix", { agency: agencyDisplayName })
                          : null}
                      </span>
                    )}
                  </>
                ) : (
                  ""
                )}
              </span>
            )}
            </div>
          ) : null}
        </div>
        {isDesktopHeader && (
          <div
            className={cn(
              "hidden min-w-0 flex-col xl:flex",
              showVitrineNavInHeaderDesktop ? "shrink-0 items-end gap-0" : "ml-4 shrink-0 items-end gap-0.5",
            )}
          >
            <nav className="flex flex-nowrap items-center justify-end gap-1">
              {languageInNavRow ? languageSelector : null}
              <NavLink
                to="/organisation"
                className={({ isActive }) =>
                  `${navPillClass} ${
                    isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                  }`
                }
              >
                {t("nav_accueil")}
              </NavLink>
              {!standbyNavOnly &&
                hasFullHeader &&
                HEADER_NAV_ITEMS.map((item) => {
                  if (item.key === "menu_home") return null;
                  if (hideOrganisationNav && item.key === "menu_agence") return null;
                  if (!can(item.key)) return null;
                  return (
                    <NavLink
                      key={`desktop-nav-${item.key}`}
                      to={item.to}
                      className={({ isActive }) =>
                        `${navPillClass} ${
                          isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                        }`
                      }
                    >
                      {t(navKey(item.label))}
                    </NavLink>
                  );
                })}
              {canSeeHomeMenu && (
                <div className="inline-flex items-center gap-1.5">
                  <NavLink
                    to={homePath}
                    className={({ isActive }) =>
                      `${navPillClass} ${
                        isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                      }`
                    }
                  >
                    {t("nav_home")}
                  </NavLink>
                  {standbyNavOnly ? (
                    <span className="rounded-full border border-amber-400/90 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      {t("standby_mode_badge")}
                    </span>
                  ) : null}
                </div>
              )}
              {!standbyNavOnly && hasFullHeader && canSeeSettings && (
                <SettingsMenuDropdown triggerClassName={navPillClass} />
              )}
              {session && !isAuthFormPage ? (
                <button
                  type="button"
                  className={`${navPillClass} text-foreground hover:bg-muted ${HEADER_LOGOUT_SHADOW}`}
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  {t("logout")}
                </button>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    `${navPillClass} ${
                      isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                    }`
                  }
                >
                  {t("login")}
                </NavLink>
              )}
            </nav>
            {showVitrineNavInHeaderDesktop ? (
              <div className="flex items-center justify-end gap-3">
                <div className="rounded-lg border border-neutral-200 bg-[#faf9f7] px-0.5 py-0.5">
                  <VitrineAnchorNav
                    vitrinePathPrefix={vitrineAnchorPrefix}
                    variant="header"
                    align="end"
                  />
                </div>
                {session ? (
                  <Link
                    to={homePath}
                    className="whitespace-nowrap text-[11px] text-gray-700 transition-colors hover:text-foreground"
                  >
                    {t("greeting")}{" "}
                    {authLoading ? (
                      <Loader2 className="inline-block h-3 w-3 animate-spin align-middle text-gray-500" aria-hidden />
                    ) : (
                      <span id="display_user_prenom" className="font-semibold">
                        {displayUserPrenom}
                        {showGreetingAgency && agencyDisplayName
                          ? t("greeting_agency_suffix", { agency: agencyDisplayName })
                          : null}
                      </span>
                    )}
                  </Link>
                ) : (
                  <span className="whitespace-nowrap text-[11px] text-gray-700">
                    {t("greeting")}
                  </span>
                )}
              </div>
            ) : (
              <span className="whitespace-nowrap text-[11px] text-gray-700 text-right">
                {t("greeting")}
                {session ? (
                  <>
                    {" "}
                    {authLoading ? (
                      <Loader2 className="inline-block h-3 w-3 animate-spin align-middle text-gray-500" aria-hidden />
                    ) : (
                      <Link
                        to={homePath}
                        className="font-semibold transition-colors hover:text-foreground"
                      >
                        {displayUserPrenom}
                        {showGreetingAgency && agencyDisplayName
                          ? t("greeting_agency_suffix", { agency: agencyDisplayName })
                          : null}
                      </Link>
                    )}
                  </>
                ) : (
                  ""
                )}
              </span>
            )}
          </div>
        )}
        {!isDesktopHeader && (
          <div className={`fab-container fab-top-right fab-in-header shrink-0 ${isFabOpen ? "active" : ""}`}>
            <div className="fab-links">
              <NavLink
                to="/organisation"
                className="fab-item"
                title={t("nav_accueil")}
                onClick={() => setIsFabOpen(false)}
              >
                <House className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">{t("nav_accueil")}</span>
              </NavLink>
              {canSeeHomeMenu && (
                <NavLink to={homePath} className="fab-item" title={t("nav_home")} onClick={() => setIsFabOpen(false)}>
                  <House className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">
                    {t("nav_home")}
                    {standbyNavOnly ? ` · ${t("standby_mode_badge")}` : ""}
                  </span>
                </NavLink>
              )}
              {!standbyNavOnly &&
                hasFullHeader &&
                HEADER_NAV_ITEMS.map((item) => {
                  if (item.key === "menu_home") return null;
                  if (hideOrganisationNav && item.key === "menu_agence") return null;
                  if (!can(item.key)) return null;
                  const icon =
                    item.key === "menu_home" ? (
                      <House className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_agence" ? (
                      <Building2 className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_user" ? (
                      <Users className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_expos" ? (
                      <GalleryVerticalEnd className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_artiste" ? (
                      <UserPlus className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_catalogue" ? (
                      <GalleryVerticalEnd className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_stats" ? (
                      <BarChart3 className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : (
                      <Settings className="h-5 w-5 text-[#121212]" aria-hidden />
                    );
                  return (
                    <NavLink key={`fab-nav-${item.key}`} to={item.to} className="fab-item" title={t(navKey(item.label))} onClick={() => setIsFabOpen(false)}>
                      {icon}
                      <span className="fab-item-label">{t(navKey(item.label))}</span>
                    </NavLink>
                  );
                })}
              {!standbyNavOnly && hasFullHeader && canSeeSettings && (
                <SettingsMenuDropdown variant="fab" onNavigate={() => setIsFabOpen(false)} />
              )}
              <div className="fab-item px-2" title={t("language_label")}>
                <div className="fab-language-selector-wrap inline-flex w-full items-center gap-2 rounded-md border px-2">
                  <LanguageFlag lang={activeLanguage.value} />
                  <select
                    id="languageSelectorFab"
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value as UiLanguage);
                      setIsFabOpen(false);
                    }}
                    className="fab-language-selector h-8 w-full bg-transparent text-xs font-semibold outline-none"
                    aria-label={t("language_label")}
                    title={t("language_label")}
                  >
                    {UI_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {session && !isAuthFormPage ? (
                <button
                  type="button"
                  className="fab-item"
                  title={t("logout")}
                  onClick={() => {
                    setIsFabOpen(false);
                    void handleLogout();
                  }}
                >
                  <LogOut className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">{t("logout")}</span>
                </button>
              ) : (
                <NavLink to="/login" className="fab-item" title={t("login")} onClick={() => setIsFabOpen(false)}>
                  <LogIn className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">{t("login")}</span>
                </NavLink>
              )}
            </div>
            <button
              type="button"
              className="fab-main"
              aria-label={isFabOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isFabOpen}
              onClick={() => {
                setIsFabOpen((prev) => !prev);
                if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(50);
              }}
            >
              {isFabOpen ? <X className="h-6 w-6 text-white" aria-hidden /> : <Menu className="h-6 w-6 text-white" aria-hidden />}
            </button>
          </div>
        )}
        </div>
      </div>
      {showVitrineNavInHeader && !isDesktopHeader ? (
        <div className="border-t border-border/40 bg-white/80 px-2 py-1.5 backdrop-blur-md">
          <div className="mx-auto w-full max-w-[1060px] overflow-x-auto">
            <div className="w-max min-w-full rounded-lg border border-neutral-200 bg-[#faf9f7] px-0.5 py-0.5">
              <VitrineAnchorNav
                vitrinePathPrefix={vitrineAnchorPrefix}
                variant="header"
                align="center"
              />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
