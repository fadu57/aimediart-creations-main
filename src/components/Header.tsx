import { useEffect, useState } from "react";
import { BarChart3, Building2, GalleryVerticalEnd, Heart, House, Loader2, LogIn, LogOut, Menu, Settings, UserPlus, Users, X } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { normalizeRoleName, ROLE_ADMIN_AGENCY } from "@/lib/authUser";
import { HEADER_NAV_ITEMS } from "@/lib/navigationMatrix";
import { supabase } from "@/lib/supabase";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";

const LOGO_RED = "hsl(0 65% 48%)";
const UI_LANGUAGE_OPTIONS: Array<{ value: UiLanguage; label: string; flagClass: string }> = [
  { value: "fr", label: "FR", flagClass: "fi fi-fr" },
  { value: "en", label: "EN", flagClass: "fi fi-gb" },
  { value: "es", label: "ES", flagClass: "fi fi-es" },
  { value: "de", label: "DE", flagClass: "fi fi-de" },
  { value: "it", label: "IT", flagClass: "fi fi-it" },
];

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
  const homeTo = session ? (isAgencyHome ? "/artistes" : "/dashboard") : "/home";

  return (
    <Link to={homeTo} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <div
        className={`flex shrink-0 items-center justify-center rounded-[15%] shadow-sm ${compact ? "h-8 w-8" : "h-10 w-10"}`}
        style={{ backgroundColor: LOGO_RED }}
        aria-hidden
      >
        <span className="inline-flex animate-logo-heart">
          <Heart
            className={`text-white ${compact ? "h-4 w-4" : "h-6 w-6"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            aria-hidden
          />
        </span>
      </div>
      <div
        className={`min-w-0 flex flex-col items-start justify-center leading-tight ${compact ? "flex" : "hidden sm:flex"}`}
      >
        <span
          className={`block font-sans font-bold tracking-tight whitespace-nowrap ${compact ? "text-[0.7rem] sm:text-[0.75rem]" : "text-[0.9rem] sm:text-[1rem]"}`}
          style={{ color: LOGO_RED }}
        >
          AIMEDIArt.com
        </span>
        <span
          className={`block w-full font-sans font-bold italic leading-snug ${compact ? "mt-px text-[8px] sm:text-[10px]" : "text-[9px] sm:text-[10px]"}`}
          style={{ color: LOGO_RED }}
        >
          Art-mediation with AI
        </span>
      </div>
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
    /(^|\/)oeuvre(\/|$)/.test(normalizedPathname) ||
    /(^|\/)oeuvres_artiste(\/|$)/.test(normalizedPathname) ||
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
  const { session, first_name, user, role_name, role_id, loading: authLoading } = useAuthUser();
  const homePath = session ? "/dashboard" : "/home";
  const { can } = useNavigationMatrix();
  const { language, setLanguage, t } = useUiLanguage();
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((option) => option.value === language) ?? UI_LANGUAGE_OPTIONS[0];
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isDesktopHeader, setIsDesktopHeader] = useState(
    typeof window !== "undefined" ? window.innerWidth > 1173 : true,
  );
  const hasFullHeader = role_id === 4 || role_id === 1 || (typeof role_id === "number" && role_id >= 1 && role_id <= 6);
  const canSeeHomeMenu = can("menu_home");
  const canSeeSettings = role_id === 1 || role_id === 2 || role_id === 3;
  const userMeta = (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  const jwtDisplayName =
    (typeof userMeta.full_name === "string" ? userMeta.full_name.trim() : "") ||
    (typeof userMeta.firstname === "string" ? userMeta.firstname.trim() : "") ||
    (typeof userMeta.first_name === "string" ? userMeta.first_name.trim() : "");
  const displayUserPrenom = first_name?.trim() || jwtDisplayName || "Visiteur";

  const handleLogout = async () => {
    // Déconnexion tolérante hors-ligne: évite l'appel réseau `logout?scope=global`
    // qui échoue avec `ERR_INTERNET_DISCONNECTED`.
    await supabase.auth.signOut({ scope: "local" });
    // Après déconnexion, revenir sur la landing publique.
    window.location.href = "/home";
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
      <div
        className={
          isVisitorPage
            ? "mx-auto flex min-h-[4rem] w-full max-w-[375px] items-center justify-between gap-1.5 px-1.5 sm:gap-2 sm:px-3"
            : "mx-auto flex min-h-[4.25rem] w-full max-w-[1200px] items-center justify-between px-4 py-1"
        }
      >
        <div className="header-left flex min-w-0 flex-1 items-center gap-[15px]">
          <Logo compact={isAuthFormPage} role_name={role_name} role_id={role_id} />
          <div className="user-controls flex flex-col items-start gap-1">
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-1.5">
              <span className={activeLanguage.flagClass} aria-hidden />
              <select
                id="languageSelector"
                value={language}
                onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                className="h-7 w-[64px] bg-transparent text-[10px] font-semibold outline-none"
                aria-label={t("Langue de l'interface")}
                title={t("Langue de l'interface")}
              >
                {UI_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="whitespace-nowrap text-[11px] text-gray-700">
              {t("Bonjour")}
              {session ? (
                <>
                  {" "}
                  {authLoading ? (
                    <Loader2 className="inline-block h-3 w-3 animate-spin align-middle text-gray-500" aria-hidden />
                  ) : (
                    <span id="display_user_prenom" className="font-semibold">
                      {displayUserPrenom}
                    </span>
                  )}
                </>
              ) : (
                ""
              )}
            </span>
          </div>
        </div>
        {isDesktopHeader && (
          <nav className="ml-4 hidden items-center gap-1 xl:flex">
            {canSeeHomeMenu && (
              <NavLink
                to={homePath}
                className={({ isActive }) =>
                  `rounded-md px-2 py-1 text-sm font-medium transition-colors ${
                    isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                  }`
                }
              >
                {t("Accueil")}
              </NavLink>
            )}
            {hasFullHeader &&
              HEADER_NAV_ITEMS.map((item) => {
                if (item.key === "menu_home") return null;
                if (!can(item.key)) return null;
                return (
                  <NavLink
                    key={`desktop-nav-${item.key}`}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-md px-2 py-1 text-sm font-medium transition-colors ${
                        isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                      }`
                    }
                  >
                    {t(item.label)}
                  </NavLink>
                );
              })}
            {hasFullHeader && canSeeSettings && (
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-medium transition-colors ${
                    isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                  }`
                }
                aria-label={t("Configuration")}
                title={t("Configuration")}
              >
                <Settings className="h-5 w-5" aria-hidden />
              </NavLink>
            )}
            {session && !isAuthFormPage ? (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  void handleLogout();
                }}
              >
                {t("Déconnexion")}
              </button>
            ) : (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `rounded-md px-2 py-1 text-sm font-medium transition-colors ${
                    isActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted"
                  }`
                }
              >
                {t("Connexion")}
              </NavLink>
            )}
          </nav>
        )}
      </div>
      {!isDesktopHeader && (
        <>
          <div
            className={`fab-backdrop ${isFabOpen ? "active" : ""}`}
            aria-hidden={!isFabOpen}
            onClick={() => setIsFabOpen(false)}
          />
          <div className={`fab-container fab-top-right ${isFabOpen ? "active" : ""}`}>
          <div className="fab-links">
            {canSeeHomeMenu && (
              <NavLink to={homePath} className="fab-item" title={t("Accueil")} onClick={() => setIsFabOpen(false)}>
                <House className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">{t("Accueil")}</span>
              </NavLink>
            )}
            {hasFullHeader &&
              HEADER_NAV_ITEMS.map((item) => {
                if (item.key === "menu_home") return null;
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
                  <NavLink key={`fab-nav-${item.key}`} to={item.to} className="fab-item" title={t(item.label)} onClick={() => setIsFabOpen(false)}>
                    {icon}
                    <span className="fab-item-label">{t(item.label)}</span>
                  </NavLink>
                );
              })}
            {hasFullHeader && canSeeSettings && (
              <NavLink to="/settings" className="fab-item" title={t("Configuration")} onClick={() => setIsFabOpen(false)}>
                <Settings className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">{t("Configuration")}</span>
              </NavLink>
            )}
            <div className="fab-item px-2" title={t("Langue de l'interface")}>
              <div className="fab-language-selector-wrap inline-flex w-full items-center gap-2 rounded-md border px-2">
                <span className={activeLanguage.flagClass} aria-hidden />
                <select
                  id="languageSelector"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                  className="fab-language-selector h-8 w-full bg-transparent text-xs font-semibold outline-none"
                  aria-label={t("Langue de l'interface")}
                  title={t("Langue de l'interface")}
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
                title={t("Déconnexion")}
                onClick={() => {
                  setIsFabOpen(false);
                  void handleLogout();
                }}
              >
                <LogOut className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">{t("Déconnexion")}</span>
              </button>
            ) : (
              <NavLink to="/login" className="fab-item" title={t("Connexion")} onClick={() => setIsFabOpen(false)}>
                <LogIn className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">{t("Connexion")}</span>
              </NavLink>
            )}
          </div>
          <button
            type="button"
            className="fab-main"
            aria-label={isFabOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => {
              setIsFabOpen((prev) => !prev);
              if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(50);
            }}
          >
            {isFabOpen ? <X className="h-6 w-6 text-white" aria-hidden /> : <Menu className="h-6 w-6 text-white" aria-hidden />}
          </button>
        </div>
        </>
      )}
    </header>
  );
}
