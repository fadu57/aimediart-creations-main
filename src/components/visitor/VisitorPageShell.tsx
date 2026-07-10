import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Building2,
  GalleryVerticalEnd,
  Heart,
  House,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  Settings,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { LanguageFlag } from "@/components/LanguageFlag";
import {
  VisitorProfilePopup,
  type VisitorProfilePopupData,
} from "@/components/visitor/VisitorProfilePopup";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { HEADER_NAV_ITEMS } from "@/lib/navigationMatrix";
import {
  localizeVisitorAnonymousProfile,
  resolveReturningAnonymousVisitor,
} from "@/lib/registerAnonymousVisitorSession";
import { supabase } from "@/lib/supabase";
import { UI_LANGUAGE_OPTIONS } from "@/lib/uiLanguageOptions";
import { getVisitorAnonymousProfile, type VisitorAnonymousProfile } from "@/lib/visitorAnonymousProfile";
import { cn } from "@/lib/utils";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";

type LanguageOption = { value: UiLanguage; label: string };

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Réduit le padding haut quand une barre d’action est affichée sous le header fixe. */
  compactTopPadding?: boolean;
  languageOptions?: LanguageOption[];
};

export function VisitorPageShell({
  children,
  className,
  contentClassName,
  compactTopPadding = false,
  languageOptions = UI_LANGUAGE_OPTIONS,
}: Props) {
  const { t } = useTranslation("visitor");
  const { t: tHeader } = useTranslation("header");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const { session, loading: authLoading, role_id, first_name } = useAuthUser();
  const { language, setLanguage } = useUiLanguage();
  const { can, loading: navMatrixLoading } = useNavigationMatrix();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);
  const [anonymousProfile, setAnonymousProfile] = useState<VisitorAnonymousProfile | null>(() =>
    typeof window !== "undefined" ? getVisitorAnonymousProfile() : null,
  );
  const [authLastName, setAuthLastName] = useState<string | null>(null);
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);

  useEffect(() => {
    const syncAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(Boolean(data.user));
    };

    void syncAuthUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncAuthUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isAnonymousVisitor = !isAuthenticated;
  const isVisitorMenuRestricted = !isAuthenticated || role_id === 7;
  const canSeeSettings = typeof role_id === "number" && role_id >= 1 && role_id <= 3;

  const userMeta = (session?.user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  const headerFirstName =
    (first_name?.trim() || "") ||
    (typeof userMeta.first_name === "string" ? userMeta.first_name.trim() : "") ||
    (typeof userMeta.firstname === "string" ? userMeta.firstname.trim() : "") ||
    (typeof userMeta.full_name === "string" ? userMeta.full_name.trim().split(/\s+/)[0] ?? "" : "");
  const headerIdentityLabel = isAnonymousVisitor
    ? t("header_anon")
    : t("header_greeting", { name: headerFirstName || t("header_visitor") });
  const anonymousPseudo = anonymousProfile?.pseudo?.trim() || "";

  const profileDisplayName = useMemo(() => {
    if (isAnonymousVisitor) {
      return anonymousPseudo || t("header_visitor");
    }
    const parts = [headerFirstName, authLastName?.trim()].filter(Boolean);
    return parts.join(" ") || session?.user?.email?.split("@")[0] || t("header_visitor");
  }, [anonymousPseudo, authLastName, headerFirstName, isAnonymousVisitor, session?.user?.email, t]);

  const profilePopupData = useMemo((): VisitorProfilePopupData | null => {
    if (isAnonymousVisitor) {
      if (!headerAvatarUrl && !anonymousProfile?.avatarUrl?.trim()) return null;
      return {
        displayName: profileDisplayName,
        avatarUrl: headerAvatarUrl || anonymousProfile?.avatarUrl || null,
        selfieUrl: anonymousProfile?.selfieUrl || null,
        isAuthenticated: false,
      };
    }
    if (!headerAvatarUrl) return null;
    return {
      displayName: profileDisplayName,
      email: session?.user?.email ?? null,
      avatarUrl: headerAvatarUrl,
      isAuthenticated: true,
    };
  }, [
    anonymousProfile?.avatarUrl,
    anonymousProfile?.selfieUrl,
    headerAvatarUrl,
    isAnonymousVisitor,
    profileDisplayName,
    session?.user?.email,
  ]);

  const activeLanguage = languageOptions.find((option) => option.value === language) ?? languageOptions[0];

  useEffect(() => {
    if (!isAuthenticated) {
      let cancelled = false;

      const applyAnonymousProfile = async (profile: VisitorAnonymousProfile) => {
        const localized = await localizeVisitorAnonymousProfile(profile, language);
        if (cancelled) return;
        setAnonymousProfile(localized);
        setHeaderAvatarUrl(localized.selfieUrl?.trim() || localized.avatarUrl?.trim() || null);
      };

      void (async () => {
        const local = getVisitorAnonymousProfile();
        if (local?.avatarUrl?.trim()) {
          await applyAnonymousProfile(local);
          return;
        }

        const remote = await resolveReturningAnonymousVisitor();
        if (remote) {
          await applyAnonymousProfile(remote);
          return;
        }

        if (!cancelled) {
          setAnonymousProfile(null);
          setHeaderAvatarUrl(null);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    setAnonymousProfile(null);
    setAuthLastName(null);
    const userId = session?.user?.id?.trim();
    if (!userId) {
      setHeaderAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, last_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { avatar_url?: string | null; last_name?: string | null } | null;
      setAuthLastName(row?.last_name?.trim() || null);
      const profileUrl = row?.avatar_url?.trim() || "";
      if (profileUrl) {
        setHeaderAvatarUrl(profileUrl);
        return;
      }
      const meta = session?.user?.user_metadata as Record<string, unknown> | undefined;
      const metaUrl =
        (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) ||
        (typeof meta?.picture === "string" && meta.picture.trim()) ||
        null;
      setHeaderAvatarUrl(metaUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, language, session?.user?.id, session?.user?.user_metadata]);

  const handleAuthAffordanceClick = async () => {
    if (isAuthenticated) {
      await supabase.auth.signOut({ scope: "local" });
      setIsAuthenticated(false);
      navigate("/visitor", { replace: true });
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem("redirectAfterLogin", window.location.href);
    }
    navigate("/login");
  };

  const handleSignupClick = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("redirectAfterAuth", window.location.href);
    }
    navigate("/register");
  };

  const closeProfilePopup = () => setIsProfilePopupOpen(false);

  const contentTopPadding = isEmbedded ? "pt-[58px]" : compactTopPadding ? "pt-[68px]" : "pt-[64px]";

  return (
    <div
      className={cn(
        "visitor-page-shell min-h-screen overflow-x-hidden bg-[#121212] text-[#F0F0F0]",
        isEmbedded && "embedded-view",
        className,
      )}
    >
      <div className={cn("œuvre-fixed-header overflow-visible border-b border-white/10", isEmbedded ? "py-1" : "py-1.5")}>
        <div className="flex min-w-0 w-full items-center justify-between gap-1 px-2 sm:px-[15px]">
          <div className="flex min-w-0 basis-auto shrink items-center gap-1.5 overflow-hidden sm:gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[15%] bg-accent shadow-sm">
              <span className="inline-flex animate-logo-heart">
                <Heart className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.25} />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#E63946]">AIMEDIArt.com</p>
              <p className="text-[10px] font-semibold italic text-[#E63946]">{t("tagline")}</p>
            </div>
          </div>
          <div className="flex min-w-0 max-w-[42%] grow basis-auto flex-col items-center justify-center gap-1 px-0.5 sm:max-w-[220px] sm:px-2">
            {isAnonymousVisitor && (
              <button
                type="button"
                onClick={handleSignupClick}
                className="rounded-full bg-[#E63946] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition hover:bg-red-700"
              >
                {t("btn_register")}
              </button>
            )}
            <div className="flex max-w-[220px] items-center justify-end gap-2">
              <p className="min-w-0 flex-1 whitespace-normal break-words text-right text-[10px] font-semibold italic text-[#F0F0F0]">
                {authLoading ? (
                  <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[#F0F0F0]" aria-hidden />
                ) : isAnonymousVisitor ? (
                  anonymousPseudo ? t("header_anon_named", { name: anonymousPseudo }) : t("anon_cta_header")
                ) : (
                  headerIdentityLabel
                )}
              </p>
              {headerAvatarUrl ? (
                <button
                  type="button"
                  onClick={() => setIsProfilePopupOpen(true)}
                  className="shrink-0 rounded-full transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E63946]"
                  aria-label={t("header_avatar_open_profile")}
                >
                  <img
                    src={headerAvatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full border-2 border-[#E63946]/75 object-cover shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                  />
                </button>
              ) : null}
            </div>
          </div>
          <div className={cn("fab-container œuvre-navi z-[10001] basis-auto shrink-0 grow-0", isFabOpen && "active")}>
            <button
              type="button"
              className="fab-main shrink-0"
              aria-label={isFabOpen ? t("aria_close_menu") : t("aria_open_menu")}
              aria-expanded={isFabOpen}
              onClick={() => {
                setIsFabOpen((prev) => !prev);
                if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                  navigator.vibrate(50);
                }
              }}
            >
              {isFabOpen ? <X className="h-6 w-6 text-white" aria-hidden /> : <Menu className="h-6 w-6 text-white" aria-hidden />}
            </button>
            <div className={cn("fab-links", isFabOpen && isVisitorMenuRestricted && "visitor-mode")}>
              {isAuthenticated &&
                !isVisitorMenuRestricted &&
                HEADER_NAV_ITEMS.map((item) => {
                  if (!navMatrixLoading && !can(item.key)) return null;
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
                    ) : (
                      <BarChart3 className="h-5 w-5 text-[#121212]" aria-hidden />
                    );
                  return (
                    <NavLink
                      key={`visitor-fab-nav-${item.key}`}
                      to={item.to}
                      className="fab-item fab-nav-link"
                      aria-label={item.label}
                      target={isEmbedded ? "_top" : undefined}
                      rel={isEmbedded ? "noopener noreferrer" : undefined}
                      onClick={() => setIsFabOpen(false)}
                    >
                      {icon}
                      <span className="fab-item-label">{item.label}</span>
                    </NavLink>
                  );
                })}
              {isAuthenticated && !isVisitorMenuRestricted && canSeeSettings && (
                <NavLink
                  to="/settings"
                  className="fab-item fab-nav-link"
                  aria-label={tHeader("settings")}
                  title={tHeader("settings")}
                  target={isEmbedded ? "_top" : undefined}
                  rel={isEmbedded ? "noopener noreferrer" : undefined}
                  onClick={() => setIsFabOpen(false)}
                >
                  <Settings className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">{tHeader("settings")}</span>
                </NavLink>
              )}
              {languageOptions.length > 0 && activeLanguage && (
                <div className="fab-item fab-language-item px-2" aria-label={t("aria_language")}>
                  <div className="fab-language-selector-wrap inline-flex w-full items-center gap-2 rounded-md border px-2">
                    <LanguageFlag lang={activeLanguage.value} />
                    <select
                      id="visitorPageLanguageSelector"
                      value={language}
                      onChange={(e) => {
                        setLanguage(e.target.value as UiLanguage);
                        setIsFabOpen(false);
                      }}
                      className="fab-language-selector h-8 w-full bg-transparent text-xs font-semibold outline-none"
                      aria-label={t("aria_language")}
                      title={t("aria_language")}
                    >
                      {languageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="fab-item fab-auth-item"
                aria-label={isAuthenticated ? t("btn_logout") : t("btn_login")}
                onClick={() => {
                  setIsFabOpen(false);
                  void handleAuthAffordanceClick();
                }}
              >
                {isAuthenticated ? (
                  <>
                    <LogOut className="h-5 w-5 text-[#121212]" aria-hidden />
                    <span className="fab-item-label">{t("btn_logout")}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 text-[#121212]" aria-hidden />
                    <span className="fab-item-label">{t("btn_login")}</span>
                  </>
                )}
              </button>
              {isAnonymousVisitor && (
                <button
                  type="button"
                  className="fab-item fab-signup-item"
                  aria-label={t("btn_register")}
                  onClick={() => {
                    setIsFabOpen(false);
                    handleSignupClick();
                  }}
                >
                  <UserPlus className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">{t("btn_register")}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={cn("œuvre-page-container space-y-0 pb-6", contentTopPadding, contentClassName)}>{children}</div>

      <VisitorProfilePopup
        open={isProfilePopupOpen}
        profile={profilePopupData}
        onClose={closeProfilePopup}
        onLogout={profilePopupData?.isAuthenticated ? () => void handleAuthAffordanceClick() : undefined}
        onSignup={profilePopupData && !profilePopupData.isAuthenticated ? handleSignupClick : undefined}
      />
    </div>
  );
}
