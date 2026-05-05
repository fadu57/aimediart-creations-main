import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { isBackofficeRole, isVisitorRole } from "@/lib/authUser";
import { Loader2 } from "lucide-react";

const OEUVRE_PATH = "/scan-work1";

/**
 * Session obligatoire + role autorise pour l'app de gestion.
 *
 * Logique d'acces :
 * - role_id 1-6 depuis agency_users  →  acces backoffice
 * - role_name reconnu via JWT (admin_general, super_admin, developpeur…) →  acces backoffice
 *   (cas des admins globaux sans ligne dans agency_users)
 * - visiteur (role_id 7 ou role_name "visiteur") →  redirect scan-work1
 * - sans role ni session →  redirect login / scan-work1
 */
export function RequireBackoffice() {
  const { session, loading, role_name, role_id, expo_id } = useAuthUser();
  const location = useLocation();

  const isExplicitVisitor = isVisitorRole(role_name, role_id);
  const isBackofficePath = location.pathname.toLowerCase().startsWith("/backoffice");

  // Acces autorise si :
  // 1. role_id numerique 1-6 (lu depuis agency_users apres migration schema)
  // 2. OU role_name reconnu comme backoffice (fallback JWT pour admins sans agency_users row)
  const hasBackofficeAccess =
    !isExplicitVisitor &&
    ((typeof role_id === "number" && role_id >= 1 && role_id <= 6) ||
      isBackofficeRole(role_name));

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

  // Anti-boucle : si l'utilisateur est deja sur une route "backoffice", ne redirige plus.
  if (isBackofficePath) {
    return <Outlet />;
  }

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

  if (!hasBackofficeAccess) {
    return <Navigate to={OEUVRE_PATH} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
