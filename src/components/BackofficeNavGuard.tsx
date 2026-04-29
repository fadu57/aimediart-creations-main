import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";

/**
 * Redirige vers `/dashboard` si la route back-office courante est interdite par les lignes menu/page dans `matrice_securite`.
 */
export function BackofficeNavGuard() {
  const location = useLocation();
  const { canAccessPath, loading } = useNavigationMatrix();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!canAccessPath(location.pathname)) {
    return <Navigate to="/dashboard" replace state={{ from: location.pathname, blocked: true }} />;
  }

  return <Outlet />;
}
