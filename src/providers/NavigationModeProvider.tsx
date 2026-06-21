import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuthUser } from "@/hooks/useAuthUser";
import { getRoleIdFromJwt, parseGlobalRoleId } from "@/lib/authUser";
import { readNavigationMode, writeNavigationMode, type NavigationMode } from "@/lib/navigationMode";
import { canSwitchNavigationMode, resolveEffectiveAuth } from "@/lib/resolveEffectiveAuth";

export type NavigationModeContextValue = {
  navigationMode: NavigationMode;
  setNavigationMode: (mode: NavigationMode) => void;
  canSwitchNavigationMode: boolean;
  globalRoleId: number | null;
  agencyRoleId: number | null;
  effectiveRoleId: number | null;
  effectiveRoleName: string | null;
  isGlobalStaffView: boolean;
  isOrganisationView: boolean;
  hasGlobalStaffRole: boolean;
  hasOrganisationRole: boolean;
};

const NavigationModeContext = createContext<NavigationModeContextValue | null>(null);

export function NavigationModeProvider({ children }: { children: ReactNode }) {
  const { user, global_role_id, agency_role_id, agency_id, loading } = useAuthUser();
  const userId = user?.id ?? null;

  const globalRoleId = useMemo(() => {
    if (global_role_id != null) return global_role_id;
    return parseGlobalRoleId(getRoleIdFromJwt(user));
  }, [global_role_id, user]);

  const agencyRoleId = agency_role_id ?? null;

  const canSwitch = useMemo(
    () =>
      canSwitchNavigationMode({
        globalRoleId,
        agencyRoleId,
        agencyId: agency_id,
      }),
    [globalRoleId, agencyRoleId, agency_id],
  );

  const [navigationMode, setNavigationModeState] = useState<NavigationMode>("global");

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setNavigationModeState("global");
      return;
    }
    if (!canSwitch) {
      setNavigationModeState("global");
      return;
    }
    setNavigationModeState(readNavigationMode(userId) ?? "global");
  }, [loading, userId, canSwitch]);

  const setNavigationMode = useCallback(
    (mode: NavigationMode) => {
      if (!userId || !canSwitch) return;
      setNavigationModeState(mode);
      writeNavigationMode(userId, mode);
    },
    [userId, canSwitch],
  );

  const effective = useMemo(
    () =>
      resolveEffectiveAuth({
        navigationMode,
        globalRoleId,
        agencyRoleId,
        canSwitch,
      }),
    [navigationMode, globalRoleId, agencyRoleId, canSwitch],
  );

  const value = useMemo<NavigationModeContextValue>(
    () => ({
      navigationMode,
      setNavigationMode,
      canSwitchNavigationMode: canSwitch,
      globalRoleId,
      agencyRoleId,
      effectiveRoleId: effective.role_id,
      effectiveRoleName: effective.role_name,
      isGlobalStaffView: effective.isGlobalStaffView,
      isOrganisationView: effective.isOrganisationView,
      hasGlobalStaffRole: effective.hasGlobalStaffRole,
      hasOrganisationRole: effective.hasOrganisationRole,
    }),
    [
      navigationMode,
      setNavigationMode,
      canSwitch,
      globalRoleId,
      agencyRoleId,
      effective.role_id,
      effective.role_name,
      effective.isGlobalStaffView,
      effective.isOrganisationView,
      effective.hasGlobalStaffRole,
      effective.hasOrganisationRole,
    ],
  );

  return <NavigationModeContext.Provider value={value}>{children}</NavigationModeContext.Provider>;
}

export function useNavigationModeContext(): NavigationModeContextValue | null {
  return useContext(NavigationModeContext);
}
