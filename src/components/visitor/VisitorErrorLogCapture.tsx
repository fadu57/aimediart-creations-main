import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { isVisitorRole } from "@/lib/authUser";
import {
  endClientErrorSession,
  installClientErrorLogCapture,
  isVisitorFacingPath,
} from "@/lib/clientErrorLogging";

/** Capture d'erreurs sur tout le parcours visiteur (anonyme ou role 7). */
export function VisitorErrorLogCapture() {
  const location = useLocation();
  const { session, role_name, role_id } = useAuthUser();

  const captureActive = useMemo(() => {
    if (!isVisitorFacingPath(location.pathname)) return false;
    if (!session) return true;
    return isVisitorRole(role_name, role_id);
  }, [location.pathname, session, role_name, role_id]);

  const authUserId = session?.user?.id ?? null;

  useEffect(() => {
    if (!captureActive) {
      void endClientErrorSession("visitor", true);
      return undefined;
    }
    return installClientErrorLogCapture("visitor", { authUserId });
  }, [captureActive, authUserId]);

  return null;
}
