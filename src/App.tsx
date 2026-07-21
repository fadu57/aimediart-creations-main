import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "./components/Header";
import { StandbyModeNavGuard } from "./components/StandbyModeNavGuard";
import { BackofficeNavGuard } from "./components/BackofficeNavGuard";
import { OrganisationStandbyProvider } from "./providers/OrganisationStandbyProvider";
import { OeuvrePageAccessGuard } from "./components/OeuvrePageAccessGuard";
import { ArtworkEntryGate } from "./components/visitor/ArtworkEntryGate";
import { RequireBackoffice } from "./components/RequireBackoffice";
import { NavigationMatrixProvider } from "./providers/NavigationMatrixProvider";
import { UiLanguageProvider } from "./providers/UiLanguageProvider";
import { NavigationModeProvider } from "./providers/NavigationModeProvider";
import { useEffectiveAuth } from "./hooks/useEffectiveAuth";
import { VisitorErrorLogCapture } from "./components/visitor/VisitorErrorLogCapture";
import { OrganizerErrorLogCapture } from "./components/organizer/OrganizerErrorLogCapture";
import CookieConsentBanner from "./components/CookieConsentBanner";
import { SkipToContentLink } from "./components/SkipToContentLink";
import { getAudienceChoice } from "./lib/audienceChoice";
import { isVisitorRole } from "./lib/authUser";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useLayoutEffect } from "react";
import * as Pages from "./routes/lazyPages";
import {
  ensureFullI18n,
  ensureVitrineNamespacesForPath,
  isPublicMarketingPath,
} from "@/i18n/bootstrapI18n";

const queryClient = new QueryClient();

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}

/**
 * URLs du type https://domaine.fr//scan?... ont un pathname "//scan" (double slash après l’hôte).
 * React Router n’associe pas `//scan` à la route `scan` → SPA mal routée ; on replie en un seul "/".
 */
function NormalizeMultipleSlashPathname() {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const collapsed = location.pathname.replace(/\/{2,}/g, "/");
    if (collapsed === location.pathname) return;

    navigate(
      {
        pathname: collapsed === "" ? "/" : collapsed,
        search: location.search,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

/** Charge les namespaces i18n selon la route (vitrine légère vs backoffice complet). */
function I18nRouteLoader() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (isPublicMarketingPath(pathname)) {
      ensureVitrineNamespacesForPath(pathname);
      return;
    }
    void ensureFullI18n();
  }, [pathname]);

  return null;
}


/** Redirige les anciens QR codes /oeuvre/:artworkId -> /artwork/:artworkId (retrocompat). */
function OeuvreToArtworkRedirect() {
  const { artworkId } = useParams<{ artworkId: string }>();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  const to = artworkId
    ? `/artwork/${encodeURIComponent(artworkId)}${qs ? `?${qs}` : ""}`
    : "/artwork";
  return <Navigate to={to} replace />;
}

/** QR canonique : /artworks -> /artwork (même query). */
function ArtworksListRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={`/artwork${qs ? `?${qs}` : ""}`} replace />;
}
/**
 * Shell commun : header (état connecté / invité) + zone de contenu.
 * Permet d’afficher « Aucun user connecté » sur `/login` tout en gardant la même barre.
 */
function AppShell() {
  const { pathname } = useLocation();
  const normalizedPathname = decodeURIComponent(pathname || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe");
  const hideGlobalHeader =
    normalizedPathname === "/" ||
    /(^|\/)(oeuvre|artworks|artwork|artwork-group)(\/|$)/.test(normalizedPathname) ||
    /(^|\/)(oeuvres_artiste|artworks_artist)(\/|$)/.test(normalizedPathname) ||
    normalizedPathname.startsWith("/visitor/") ||
    normalizedPathname === "/visitor" ||
    normalizedPathname.startsWith("/dev/visitor") ||
    normalizedPathname === "/dev/a11y-demo" ||
    normalizedPathname === "/scan" ||
    normalizedPathname.startsWith("/scan/") ||
    normalizedPathname === "/scan-work1" ||
    normalizedPathname === "/scan-work2" ||
    normalizedPathname === "/scan-work-first" ||
    normalizedPathname === "/summary";

  return (
    <div className="flex min-h-screen flex-col bg-[#121212]">
      {!hideGlobalHeader && <Header />}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex min-w-0 flex-1 flex-col overflow-x-hidden bg-[#121212] outline-none ${
          hideGlobalHeader ? "" : "scroll-mt-[4.75rem] pt-[4.75rem]"
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}

function VisitorShell() {
  return (
    <div className="flex flex-1 justify-center bg-[#121212]">
      <div className="w-[360px] flex-1 bg-[#121212]">
        <Outlet />
      </div>
    </div>
  );
}

function AdminShell() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1200px] overflow-x-hidden text-[#F0F0F0]">
      <StandbyModeNavGuard />
    </div>
  );
}

function buildVisitorLandingPath(searchParams: URLSearchParams): string | null {
  const expoId = searchParams.get("expo_id")?.trim() || "";
  const artworkId = searchParams.get("artwork_id")?.trim() || searchParams.get("artworkId")?.trim() || "";
  if (!expoId && !artworkId) return null;
  const qs = new URLSearchParams();
  if (expoId) qs.set("expo_id", expoId);
  if (artworkId) qs.set("artwork_id", artworkId);
  if (searchParams.get("preview_gate") === "1") qs.set("preview_gate", "1");
  const query = qs.toString();
  return query ? `/visitor?${query}` : "/visitor";
}

/** Ancienne route /scan avec expo_id → landing visiteur unifiée. */
function ScanEntryRedirect() {
  const [searchParams] = useSearchParams();
  const target = buildVisitorLandingPath(searchParams);
  if (target) return <Navigate to={target} replace />;
  return <Pages.Intro />;
}

function RootEntryRoute() {
  const [searchParams] = useSearchParams();
  const visitorLanding = buildVisitorLandingPath(searchParams);
  if (visitorLanding) {
    return <Navigate to={visitorLanding} replace />;
  }
  const { session, loading, role_name, role_id } = useEffectiveAuth();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (session) {
    const target = isVisitorRole(role_name, role_id) ? "/scan-work1" : "/dashboard";
    return <Navigate to={target} replace />;
  }
  const audience = getAudienceChoice();
  if (audience === "organizer") {
    return <Navigate to="/organisation" replace />;
  }
  // Visiteurs connus ou première visite → /visitor
  return <Navigate to="/visitor" replace />;
}

/**
 * - `/login` : public (formulaire), avec header
 * - `/scan-work1` : page scanner visiteur / public
 * - `/artwork` : page œuvre ; `/artworks/*` : redirection seulement (anciens QR au pluriel)
 * - `/visitor/*` : public, sans header applicatif
 * - autres routes : `RequireBackoffice` (session + rôle gestion)
 */
const AppRoutes = () => (
  <Suspense fallback={<RouteLoadingFallback />}>
  <Routes>
    {/* Landing marketing publique (sans header) */}
    <Route path="/organisation" element={<Pages.PublicHome />} />
    <Route path="/organisation/commencer" element={<Pages.PublicHomeCommencer />} />
    <Route path="/organisation/engagement" element={<Pages.OrganisationEngagement />} />
    <Route path="/organisation/connexion" element={<Pages.OrganisationConnexion />} />
    <Route path="/connexion" element={<Navigate to="/organisation#connectivite" replace />} />
    {/* Rétrocompatibilité anciens liens /home */}
    <Route path="/home" element={<Navigate to="/organisation" replace />} />
    <Route path="/home/commencer" element={<Navigate to="/organisation/commencer" replace />} />
    <Route path="/cgv" element={<Pages.CgvPage />} />
    <Route path="/cookies" element={<Pages.CookiesPage />} />
    <Route path="/privacy" element={<Pages.PrivacyPage />} />
    <Route path="/terms" element={<Pages.TermsPage />} />
    <Route path="/ai-policy" element={<Pages.AiPolicyPage />} />
    <Route path="/expo" element={<Pages.ExpoCastPage />} />
    <Route path="/" element={<AppShell />}>
      <Route index element={<RootEntryRoute />} />
      <Route path="login" element={<Pages.Login />} />
      <Route path="signup" element={<Pages.RegisterSaaS />} />
      <Route path="reset-password" element={<Pages.ResetPassword />} />
      {import.meta.env.DEV ? (
        <Route path="dev/a11y-demo" element={<Pages.A11yDemoPage />} />
      ) : null}
      <Route path="legal/cgv" element={<Pages.LegalStaticPage variant="cgv" />} />
      <Route path="legal/rgpd" element={<Pages.LegalStaticPage variant="rgpd" />} />
      {/* Redirects rétrocompatibilité anciens QR codes */}
      <Route path="Oeuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="Œuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="oeuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="œuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="œuvre/:artworkId" element={<OeuvreToArtworkRedirect />} />
      <Route element={<VisitorShell />}>
        <Route path="scan" element={<ScanEntryRedirect />} />
        <Route path="scan-work1" element={<Pages.WorkScanner />} />
        <Route path="scan-work-first" element={<Navigate to="/scan-work1" replace />} />
        <Route path="scan-work2" element={<Pages.ScanWork2 />} />
        <Route path="summary" element={<Pages.Summary />} />
        <Route path="scan-work" element={<Navigate to="/scan-work1" replace />} />
        <Route path="register" element={<Pages.VisitorRegister />} />
        <Route path="register_visitor" element={<Pages.RegisterVisitor />} />
        <Route path="visitor" element={<Pages.VisitorWelcome />} />
        {import.meta.env.DEV ? (
          <>
            <Route path="dev/visitor-form" element={<Pages.VisitorFormPreview />} />
            <Route path="dev/visitor-expo" element={<Pages.VisitorExpoPreview />} />
          </>
        ) : null}
        <Route element={<OeuvrePageAccessGuard />}>
          <Route element={<ArtworkEntryGate />}>
            <Route path="artworks" element={<ArtworksListRedirect />} />
            <Route path="artworks/:artworkId" element={<OeuvreToArtworkRedirect />} />
            <Route path="artwork" element={<Pages.ArtworkDetail />} />
            <Route path="artwork/:artworkId" element={<Pages.ArtworkDetail />} />
            <Route path="artwork-group/:groupId" element={<Pages.ArtworkGroupEntry />} />
            <Route path="visitor/:artworkId" element={<Pages.ArtworkDetail />} />
          </Route>
          <Route path="artworks_artist" element={<Pages.OeuvresArtiste />} />
          <Route path="artworks_artist/:artistId" element={<Pages.OeuvresArtiste />} />
        </Route>
      </Route>
      <Route element={<RequireBackoffice />}>
        <Route element={<AdminShell />}>
          <Route path="dashboard" element={<Pages.Dashboard />} />
          <Route path="artistes" element={<Pages.Artists />} />
          <Route path="artistes/artistes2" element={<Pages.Artists2 />} />
          <Route path="artistes-corbeille" element={<Pages.ArtistsCorbeille />} />
          <Route path="artistes/:id" element={<Pages.EditArtist />} />
          <Route path="artist/edit/:id" element={<Pages.EditArtist />} />
          <Route path="catalogue" element={<Pages.Catalogue />} />
          <Route path="catalogue/catalogue2" element={<Pages.Catalogue2 />} />
          <Route path="agencies" element={<Pages.Agencies />} />
          <Route path="agencies/agencies2" element={<Pages.Agencies2 />} />
          <Route path="agencies-corbeille" element={<Pages.AgenciesCorbeille />} />
          <Route path="user" element={<Pages.Users />} />
          <Route path="user/utilisateurs" element={<Pages.Utilisateurs />} />
          <Route path="user/users-corbeille" element={<Pages.UtilisateursCorbeille />} />
          <Route path="user/utilisateurs-corbeille" element={<Navigate to="/utilisateurs-corbeille" replace />} />
          <Route path="utilisateurs-corbeille" element={<Pages.UtilisateursCorbeille />} />
          <Route path="expos" element={<Pages.Expos />} />
          <Route path="expos/expos2" element={<Pages.Expos2 />} />
          <Route path="expos/visitors" element={<Pages.ExposVisitors />} />
          <Route path="expos/visitors/:id" element={<Pages.ExposVisitorDetail />} />
          <Route path="expos/visitor-audio" element={<Pages.ExposVisitorAudioMonitor />} />
          <Route path="expos/sponsors" element={<Pages.ExposSponsors />} />
          <Route path="visiteurs-corbeille" element={<Pages.VisiteursCorbeille />} />
          <Route path="expos-corbeille" element={<Pages.ExposCorbeille />} />
          <Route path="prompts" element={<Pages.Prompts />} />
          <Route path="catalogue-corbeille" element={<Pages.CatalogueCorbeille />} />
          <Route path="qr-codes" element={<Navigate to="/catalogue" replace />} />
          <Route path="statistiques" element={<Pages.Statistics />} />
          <Route path="settings" element={<Pages.SettingsPage />} />
          <Route path="settings/couts" element={<Pages.SettingsCouts />} />
          <Route path="settings/acces" element={<Pages.SettingsAcces />} />
          <Route path="settings/prompts-ia" element={<Pages.SettingsPromptsIa />} />
          <Route path="settings/controle-ia" element={<Pages.SettingsControleIa />} />
          <Route path="suivi_temps" element={<Pages.SettingsSuiviTemps />} />
          <Route path="suivi_supabase" element={<Pages.SettingsSupabaseMonitoring />} />
          <Route path="suivi_vercel" element={<Navigate to="/settings" replace />} />
          <Route path="suivi_tokens" element={<Pages.SettingsSuiviTokens />} />
          <Route path="suivi_erreurs_visiteurs" element={<Pages.SettingsVisitorErrors />} />
          <Route path="suivi_erreurs_organisateurs" element={<Pages.SettingsOrganizerErrors />} />
          <Route path="settings/qui-est-en-ligne" element={<Pages.SettingsOnlinePresence />} />
          <Route path="settings/presence-seuils" element={<Pages.SettingsPresenceThresholds />} />
          <Route path="setting" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Pages.NotFound />} />
        </Route>
      </Route>
    </Route>
  </Routes>
  </Suspense>
);

const App = () => {
  if (import.meta.env.DEV) {
    console.debug("[App] démarrage");
  }

  // Garde de sécurité: évite un rendu cassé si un provider clé est indisponible.
  const canRenderApp = Boolean(queryClient);
  if (!canRenderApp) {
    return (
      <div className="p-6 text-sm text-destructive">
        Erreur d&apos;initialisation: application indisponible.
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <UiLanguageProvider>
            <NavigationModeProvider>
            <NavigationMatrixProvider>
              <OrganisationStandbyProvider>
              <SkipToContentLink />
              <NormalizeMultipleSlashPathname />
              <I18nRouteLoader />
              <VisitorErrorLogCapture />
              <OrganizerErrorLogCapture />
              <AppRoutes />
              <CookieConsentBanner />
              </OrganisationStandbyProvider>
            </NavigationMatrixProvider>
            </NavigationModeProvider>
          </UiLanguageProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
