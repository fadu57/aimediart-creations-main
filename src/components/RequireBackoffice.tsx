import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { isVisitorRole } from "@/lib/authUser";
import { Loader2 } from "lucide-react";

const OEUVRE_PATH = "/scan-work1";

/**
 * Session obligatoire + role autorise pour l'app de gestion.
 *
 * Logique d'acces :
 * - visiteur (role_id 7 ou role_name "visiteur") →  redirect scan-work1
 * - sans session →  redirect /login
 * - session valide + role < 7 (ou role inconnu/null) →  acces backoffice
 *   (role null = admin sans ligne agency_users ou JWT non enrichi ; on fait confiance a la session)
 */
export function RequireBackoffice() {
  const { session, loading, role_name, role_id, expo_id } = useEffectiveAuth();
  const location = useLocation();

  const isExplicitVisitor = isVisitorRole(role_name, role_id);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Verification de la session…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Seul le role visiteur (7) est redirige vers la page publique.
  if (isExplicitVisitor) {
    return <Navigate to={OEUVRE_PATH} replace state={{ from: location.pathname }} />;
  }

  // Roles 5 et 6 necessitent une expo assignee
  if ((role_id === 5 || role_id === 6) && !expo_id) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-destructive" role="alert">
          Aucune exposition assignee
        </p>
      </div>
    );
  }

  // Tout utilisateur authentifie non-visiteur accede au back-office.
  return <Outlet />;
}
