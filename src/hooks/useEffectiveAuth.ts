import { useMemo } from "react";

import { useAuthUser, type AuthUserWithRole } from "@/hooks/useAuthUser";
import { useNavigationModeContext } from "@/providers/NavigationModeProvider";
import type { NavigationMode } from "@/lib/navigationMode";

export type EffectiveAuth = AuthUserWithRole & {
  navigationMode: NavigationMode;
  setNavigationMode: (mode: NavigationMode) => void;
  canSwitchNavigationMode: boolean;
  globalRoleId: number | null;
  agencyRoleId: number | null;
  isGlobalStaffView: boolean;
  isOrganisationView: boolean;
  hasGlobalStaffRole: boolean;
  hasOrganisationRole: boolean;
};

const noopSetNavigationMode = () => {};

/** Rôle et périmètre effectifs selon le mode de navigation choisi (global vs organisation). */
export function useEffectiveAuth(): EffectiveAuth {
  const auth = useAuthUser();
  const nav = useNavigationModeContext();

  return useMemo(() => {
    if (!nav) {
      return {
        ...auth,
        navigationMode: "global" as const,
        setNavigationMode: noopSetNavigationMode,
        canSwitchNavigationMode: false,
        globalRoleId: auth.global_role_id,
        agencyRoleId: auth.agency_role_id,
        isGlobalStaffView:
          typeof auth.global_role_id === "number" && auth.global_role_id >= 1 && auth.global_role_id <= 3,
        isOrganisationView: false,
        hasGlobalStaffRole:
          typeof auth.global_role_id === "number" && auth.global_role_id >= 1 && auth.global_role_id <= 3,
        hasOrganisationRole:
          typeof auth.agency_role_id === "number" && auth.agency_role_id >= 4 && auth.agency_role_id <= 6,
      };
    }

    return {
      ...auth,
      role_id: nav.effectiveRoleId ?? auth.role_id,
      role_name: nav.effectiveRoleName ?? auth.role_name,
      navigationMode: nav.navigationMode,
      setNavigationMode: nav.setNavigationMode,
      canSwitchNavigationMode: nav.canSwitchNavigationMode,
      globalRoleId: nav.globalRoleId,
      agencyRoleId: nav.agencyRoleId,
      isGlobalStaffView: nav.isGlobalStaffView,
      isOrganisationView: nav.isOrganisationView,
      hasGlobalStaffRole: nav.hasGlobalStaffRole,
      hasOrganisationRole: nav.hasOrganisationRole,
    };
  }, [auth, nav]);
}
