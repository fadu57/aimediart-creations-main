import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useAuthUser } from "@/hooks/useAuthUser";
import { isVisitorRole } from "@/lib/authUser";
import {
  endOrganizerErrorSession,
  installOrganizerErrorLogCapture,
  isOrganizerFacingPath,
} from "@/lib/clientErrorLogging";

/** Capture d'erreurs sur le backoffice organisateur (staff / admin, hors role visiteur). */
export function OrganizerErrorLogCapture() {
  const location = useLocation();
  const { session, role_name, role_id, agency_id } = useAuthUser();

  const captureActive = useMemo(() => {
    if (!session) return false;
    if (isVisitorRole(role_name, role_id)) return false;
    return isOrganizerFacingPath(location.pathname);
  }, [location.pathname, session, role_name, role_id]);

  const authUserId = session?.user?.id ?? null;

  useEffect(() => {
    if (!captureActive) {
      void endOrganizerErrorSession(true);
      return undefined;
    }
    return installOrganizerErrorLogCapture({
      authUserId,
      agencyId: agency_id ?? null,
    });
  }, [captureActive, authUserId, agency_id]);

  return null;
}
