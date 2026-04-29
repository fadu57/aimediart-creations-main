import { Outlet } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { isVisitorRole } from "@/lib/authUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";

/**
 * Pour un visiteur connecté (rôle 7), refuse l’affichage des pages œuvre si `page_œuvre` est décoché en matrice.
 * Les utilisateurs non connectés conservent l’accès public (QR, liens).
 */
export function OeuvrePageAccessGuard() {
  const { session, role_id, role_name } = useAuthUser();
  const { can, loading } = useNavigationMatrix();

  if (!session?.user) {
    return <Outlet />;
  }

  const visitor = isVisitorRole(role_name, role_id);
  if (!visitor) {
    return <Outlet />;
  }

  /* Tant que la matrice charge, ne pas bloquer l’affichage (parcours QR / liens publics). */
  if (!loading && !can("page_œuvre")) {
    return (
      <div className="mx-auto w-full max-w-[320px] px-4 py-8 text-center">
        <p className="text-sm text-destructive" role="alert">
          L’accès à la page œuvre n’est pas autorisé pour votre profil.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
