import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { Loader2 } from "lucide-react";

/**
 * Redirige vers `/login` si aucune session Supabase. Les routes enfants sont les pages « privées ».
 */
export function RequireAuth() {
  const { session, loading } = useAuthUser();
  const location = useLocation();

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

  return <Outlet />;
}
