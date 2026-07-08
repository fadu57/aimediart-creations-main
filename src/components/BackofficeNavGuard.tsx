import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { getBackofficeFallbackPath } from "@/lib/navigationMatrix";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { useNavigationModeContext } from "@/providers/NavigationModeProvider";

/**
 * Redirige vers la première route de menu autorisée (ou `/dashboard`) si la route courante est interdite
 * par `matrice_securite`. `/dashboard` reste toujours accessible comme page d'accueil profil.
 */
export function BackofficeNavGuard() {
  const location = useLocation();
  const { canAccessPath, loading, access } = useNavigationMatrix();
  const { loading: authLoading } = useAuthUser();
  const navMode = useNavigationModeContext();
  const modeReady = navMode?.modeReady ?? true;
  const fallback = getBackofficeFallbackPath(access);
  const guardsLoading = loading || authLoading || !modeReady;

  if (guardsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!canAccessPath(location.pathname)) {
    if (location.pathname === fallback) {
      return <Outlet />;
    }
    return <Navigate to={fallback} replace state={{ from: location.pathname, blocked: true }} />;
  }

  return <Outlet />;
}
