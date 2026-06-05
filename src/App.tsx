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
import { BackofficeNavGuard } from "./components/BackofficeNavGuard";
import { OeuvrePageAccessGuard } from "./components/OeuvrePageAccessGuard";
import { RequireBackoffice } from "./components/RequireBackoffice";
import { NavigationMatrixProvider } from "./providers/NavigationMatrixProvider";
import { UiLanguageProvider } from "./providers/UiLanguageProvider";
import { useAuthUser } from "./hooks/useAuthUser";
import Dashboard from "./pages/admin/Dashboard";
import Prompts from "./pages/admin/Prompts";
import Artists from "./pages/Artists";
import Artists2 from "./pages/Artists2";
import EditArtist from "./pages/EditArtist";
import ArtistsCorbeille from "./pages/ArtistsCorbeille";
import Catalogue from "./pages/admin/Catalogue";
import Catalogue2 from "./pages/Catalogue2";
import CatalogueCorbeille from "./pages/CatalogueCorbeille";
import Statistics from "./pages/Statistics";
import SettingsPage from "./pages/Settings";
import Agencies from "./pages/Agencies";
import Agencies2 from "./pages/Agencies2";
import AgenciesCorbeille from "./pages/AgenciesCorbeille";
import Expos from "./pages/Expos";
import Expos2 from "./pages/Expos2";
import ExposVisitors from "./pages/ExposVisitors";
import ExposVisitorDetail from "./pages/ExposVisitorDetail";
import ExposCorbeille from "./pages/ExposCorbeille";
import Users from "./pages/Users";
import Utilisateurs from "./pages/Utilisateurs";
import UtilisateursCorbeille from "./pages/UtilisateursCorbeille";
import ArtworkDetail from "./pages/visitor/ArtworkDetail";
import Intro from "./pages/visitor/Intro";
import ScanWork2 from "./pages/visitor/ScanWork2";
import Summary from "./pages/visitor/Summary";
import VisitorRegister from "./pages/visitor/Register";
import RegisterVisitor from "./pages/visitor/RegisterVisitor";
import Login from "./pages/Login";
import RegisterSaaS from "./pages/RegisterSaaS";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import WorkScanner from "./pages/WorkScanner";
import PublicHome from "./pages/PublicHome";
import PublicHomeCommencer from "./pages/PublicHomeCommencer";
import CgvPage from "./pages/CgvPage";
import CookiesPage from "./pages/CookiesPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import AiPolicyPage from "./pages/AiPolicyPage";
import ExpoCastPage from "./pages/ExpoCastPage";
import OeuvresArtiste from "./pages/OeuvresArtiste";
import WelcomeLanding from "./pages/WelcomeLanding";
import VisitorWelcome from "./pages/visitor/VisitorWelcome";
import LegalStaticPage from "./pages/LegalStaticPage";
import CookieConsentBanner from "./components/CookieConsentBanner";
import { getAudienceChoice } from "./lib/audienceChoice";
import { isVisitorRole } from "./lib/authUser";
import { Loader2 } from "lucide-react";
import { useLayoutEffect } from "react";

const queryClient = new QueryClient();

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
    /(^|\/)(oeuvre|artworks|artwork)(\/|$)/.test(normalizedPathname) ||
    /(^|\/)(oeuvres_artiste|artworks_artist)(\/|$)/.test(normalizedPathname) ||
    normalizedPathname.startsWith("/visitor/") ||
    normalizedPathname === "/visitor" ||
    normalizedPathname === "/scan" ||
    normalizedPathname.startsWith("/scan/") ||
    normalizedPathname === "/scan-work1" ||
    normalizedPathname === "/scan-work2" ||
    normalizedPathname === "/scan-work-first";

  return (
    <div className="flex min-h-screen flex-col bg-[#121212]">
      {!hideGlobalHeader && <Header />}
      <main className={`flex flex-1 flex-col bg-[#121212] ${hideGlobalHeader ? "" : "pt-[4.25rem]"}`}>
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
    <div className="mx-auto h-[200px] w-full max-w-[1200px]">
      <BackofficeNavGuard />
    </div>
  );
}

function RootEntryRoute() {
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || "";
  if (expoId) {
    return <Navigate to={`/scan?expo_id=${encodeURIComponent(expoId)}`} replace />;
  }
  const { session, loading, role_name, role_id } = useAuthUser();
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
  <Routes>
    {/* Landing marketing publique (sans header) */}
    <Route path="/organisation" element={<PublicHome />} />
    <Route path="/organisation/commencer" element={<PublicHomeCommencer />} />
    {/* Rétrocompatibilité anciens liens /home */}
    <Route path="/home" element={<Navigate to="/organisation" replace />} />
    <Route path="/home/commencer" element={<Navigate to="/organisation/commencer" replace />} />
    <Route path="/cgv" element={<CgvPage />} />
    <Route path="/cookies" element={<CookiesPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/ai-policy" element={<AiPolicyPage />} />
    <Route path="/expo" element={<ExpoCastPage />} />
    <Route path="/" element={<AppShell />}>
      <Route index element={<RootEntryRoute />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<RegisterSaaS />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="legal/cgv" element={<LegalStaticPage variant="cgv" />} />
      <Route path="legal/rgpd" element={<LegalStaticPage variant="rgpd" />} />
      {/* Redirects rétrocompatibilité anciens QR codes */}
      <Route path="Oeuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="Œuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="oeuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="œuvre" element={<Navigate to="/artwork" replace />} />
      <Route path="œuvre/:artworkId" element={<OeuvreToArtworkRedirect />} />
      <Route element={<VisitorShell />}>
        <Route path="scan" element={<Intro />} />
        <Route path="scan-work1" element={<WorkScanner />} />
        <Route path="scan-work-first" element={<Navigate to="/scan-work1" replace />} />
        <Route path="scan-work2" element={<ScanWork2 />} />
        <Route path="summary" element={<Summary />} />
        <Route path="scan-work" element={<Navigate to="/scan-work1" replace />} />
        <Route path="register" element={<VisitorRegister />} />
        <Route path="register_visitor" element={<RegisterVisitor />} />
        <Route path="visitor" element={<VisitorWelcome />} />
        <Route element={<OeuvrePageAccessGuard />}>
          <Route path="artworks" element={<ArtworksListRedirect />} />
          <Route path="artworks/:artworkId" element={<OeuvreToArtworkRedirect />} />
          <Route path="artwork" element={<ArtworkDetail />} />
          <Route path="artwork/:artworkId" element={<ArtworkDetail />} />
          <Route path="artworks_artist" element={<OeuvresArtiste />} />
          <Route path="artworks_artist/:artistId" element={<OeuvresArtiste />} />
          <Route path="visitor/:artworkId" element={<ArtworkDetail />} />
        </Route>
      </Route>
      <Route element={<RequireBackoffice />}>
        <Route element={<AdminShell />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="artistes" element={<Artists />} />
          <Route path="artistes/artistes2" element={<Artists2 />} />
          <Route path="artistes-corbeille" element={<ArtistsCorbeille />} />
          <Route path="artistes/:id" element={<EditArtist />} />
          <Route path="artist/edit/:id" element={<EditArtist />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="catalogue/catalogue2" element={<Catalogue2 />} />
          <Route path="agencies" element={<Agencies />} />
          <Route path="agencies/agencies2" element={<Agencies2 />} />
          <Route path="agencies-corbeille" element={<AgenciesCorbeille />} />
          <Route path="user" element={<Users />} />
          <Route path="user/utilisateurs" element={<Utilisateurs />} />
          <Route path="user/users-corbeille" element={<UtilisateursCorbeille />} />
          <Route path="utilisateurs-corbeille" element={<UtilisateursCorbeille />} />
          <Route path="expos" element={<Expos />} />
          <Route path="expos/expos2" element={<Expos2 />} />
          <Route path="expos/visitors" element={<ExposVisitors />} />
          <Route path="expos/visitors/:id" element={<ExposVisitorDetail />} />
          <Route path="expos-corbeille" element={<ExposCorbeille />} />
          <Route path="prompts" element={<Prompts />} />
          <Route path="catalogue-corbeille" element={<CatalogueCorbeille />} />
          <Route path="qr-codes" element={<Navigate to="/catalogue" replace />} />
          <Route path="statistiques" element={<Statistics />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="setting" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Route>
  </Routes>
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
            <NavigationMatrixProvider>
              <NormalizeMultipleSlashPathname />
              <AppRoutes />
              <CookieConsentBanner />
            </NavigationMatrixProvider>
          </UiLanguageProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
