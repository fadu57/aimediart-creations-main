import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { BackofficeNavGuard } from "@/components/BackofficeNavGuard";
import { useNavigationModeContext } from "@/providers/NavigationModeProvider";
import { useOrganisationStandby } from "@/providers/OrganisationStandbyProvider";

const STANDBY_ALLOWED_PREFIXES = ["/dashboard", "/organisation"];

function isStandbyAllowedPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return STANDBY_ALLOWED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** En mode veille : profil (/dashboard) et page d'accueil vitrine (/organisation). */
export function StandbyModeNavGuard() {
  const location = useLocation();
  const { isStandbyNavRestricted, loading } = useOrganisationStandby();
  const navMode = useNavigationModeContext();
  const modeReady = navMode?.modeReady ?? true;

  if (loading || !modeReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (isStandbyNavRestricted && !isStandbyAllowedPath(location.pathname)) {
    return <Navigate to="/dashboard" replace state={{ standbyRestricted: true }} />;
  }

  return <BackofficeNavGuard />;
}
