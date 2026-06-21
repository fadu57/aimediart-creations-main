import { mapRoleNameFromRoleId, parseAgencyRoleId, parseGlobalRoleId } from "@/lib/authUser";
import type { NavigationMode } from "@/lib/navigationMode";

export function canSwitchNavigationMode(input: {
  globalRoleId: number | null;
  agencyRoleId: number | null;
  agencyId: string | null;
}): boolean {
  const global = parseGlobalRoleId(input.globalRoleId);
  const agency = parseAgencyRoleId(input.agencyRoleId);
  return global != null && agency != null && Boolean(input.agencyId?.trim());
}

export function resolveEffectiveAuth(input: {
  navigationMode: NavigationMode;
  globalRoleId: number | null;
  agencyRoleId: number | null;
  canSwitch: boolean;
}): {
  role_id: number | null;
  role_name: string | null;
  isGlobalStaffView: boolean;
  isOrganisationView: boolean;
  hasGlobalStaffRole: boolean;
  hasOrganisationRole: boolean;
} {
  const global = parseGlobalRoleId(input.globalRoleId);
  const agency = parseAgencyRoleId(input.agencyRoleId);

  if (input.canSwitch && input.navigationMode === "organisation" && agency != null) {
    return {
      role_id: agency,
      role_name: mapRoleNameFromRoleId(agency),
      isGlobalStaffView: false,
      isOrganisationView: true,
      hasGlobalStaffRole: global != null,
      hasOrganisationRole: true,
    };
  }

  if (global != null) {
    return {
      role_id: global,
      role_name: mapRoleNameFromRoleId(global),
      isGlobalStaffView: true,
      isOrganisationView: false,
      hasGlobalStaffRole: true,
      hasOrganisationRole: agency != null,
    };
  }

  if (agency != null) {
    return {
      role_id: agency,
      role_name: mapRoleNameFromRoleId(agency),
      isGlobalStaffView: false,
      isOrganisationView: agency >= 4 && agency <= 6,
      hasGlobalStaffRole: false,
      hasOrganisationRole: true,
    };
  }

  return {
    role_id: null,
    role_name: null,
    isGlobalStaffView: false,
    isOrganisationView: false,
    hasGlobalStaffRole: false,
    hasOrganisationRole: false,
  };
}

export function navigationModeLabel(mode: NavigationMode): string {
  return mode === "global" ? "Administration globale" : "Mon organisation";
}
