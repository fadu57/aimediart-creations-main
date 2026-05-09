import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { getBackofficeFallbackPath } from "@/lib/navigationMatrix";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";

/**
 * Redirige vers la première route de menu autorisée (ou `/settings`) si la route courante est interdite
 * par `matrice_securite`. Ne cible pas systématiquement `/dashboard` : si « Accueil » est décoché,
 * une redirection vers `/dashboard` provoquerait une boucle infinie avec `<Navigate>`.
 */
export function BackofficeNavGuard() {
  const location = useLocation();
  const { canAccessPath, loading, access } = useNavigationMatrix();
  const fallback = getBackofficeFallbackPath(access);

  if (loading) {
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
