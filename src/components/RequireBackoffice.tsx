import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import {
  isVisitorRole,
} from "@/lib/authUser";
import { Loader2 } from "lucide-react";

const OEUVRE_PATH = "/scan-work1";

/**
 * Session obligatoire + rôle autorisé pour l’app de gestion.
 * Les profils `visiteur` (et sans rôle exploitable) sont renvoyés vers la page Œuvre.
 */
export function RequireBackoffice() {
  const { session, loading, role_name, role_id, expo_id } = useAuthUser();
  const location = useLocation();
  const isExplicitVisitor = isVisitorRole(role_name, role_id);
  const isBackofficePath = location.pathname.toLowerCase().startsWith("/backoffice");
  const hasBackofficeAccess = !isExplicitVisitor && typeof role_id === "number" && role_id >= 1 && role_id <= 6;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Vérification de la session…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Anti-boucle : si l'utilisateur est déjà sur une route "backoffice", ne redirige plus.
  // (Certaines bases/proxies utilisent un préfixe `/backoffice` en prod.)
  if (isBackofficePath) {
    return <Outlet />;
  }

  if (isExplicitVisitor) {
    return <Navigate to={OEUVRE_PATH} replace state={{ from: location.pathname }} />;
  }

  if ((role_id === 5 || role_id === 6) && !expo_id) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-destructive" role="alert">
          Aucune exposition assignée
        </p>
      </div>
    );
  }

  if (!hasBackofficeAccess) {
    return <Navigate to={OEUVRE_PATH} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
