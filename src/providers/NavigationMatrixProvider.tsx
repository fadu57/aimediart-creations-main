import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuthUser } from "@/hooks/useAuthUser";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { parseGlobalRoleId, getRoleIdFromJwt, resolveMergedAuthRoleId } from "@/lib/authUser";
import { pickLowestRoleId, parseNumericRoleId } from "@/lib/roleHierarchy";
import {
  defaultNavAccessForRole,
  mergeNavAccessFromMatriceSecurite,
  navAccessWhenMatriceSecuriteEmptyForAgencyRole,
  NAV_MATRIX_CIBLES,
  pathnameToNavCible,
  type NavMatrixCible,
} from "@/lib/navigationMatrix";
import { supabase } from "@/lib/supabase";
import { NavigationMatrixContext, type NavigationMatrixContextValue } from "@/providers/navigationMatrixContext";
import { useNavigationModeContext } from "@/providers/NavigationModeProvider";

export function NavigationMatrixProvider({ children }: { children: ReactNode }) {
  // On utilise directement role_id resolu par useAuthUser (inclut deja le fallback JWT)
  // pour eviter une double requete qui peut echouer si la table users n'existe plus.
  const { session, loading: authLoading } = useAuthUser();
  const { role_id: effectiveRoleId } = useEffectiveAuth();
  const navMode = useNavigationModeContext();
  const modeReady = navMode?.modeReady ?? true;
  const sessionUserId = session?.user?.id ?? null;

  const [access, setAccess] = useState<NavigationMatrixContextValue["access"]>(() =>
    defaultNavAccessForRole(null),
  );
  const [loading, setLoading] = useState(true);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async () => {
    // Attendre auth + mode de navigation (évite un calcul matrice sur le mauvais rôle au F5).
    if (authLoading || !modeReady) return;

    const generation = ++loadGenerationRef.current;
    const isStale = () => generation !== loadGenerationRef.current;

    if (!sessionUserId) {
      if (isStale()) return;
      setAccess(defaultNavAccessForRole(null));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const jwtRoleId = getRoleIdFromJwt(session?.user ?? null);
      const jwtGlobalRoleId = parseGlobalRoleId(jwtRoleId);
      let roleId = pickLowestRoleId(effectiveRoleId, jwtGlobalRoleId, jwtRoleId);

      // Admins globaux (1–3) : le JWT suffit — pas de requête agency_users inutile.
      if (roleId == null && jwtGlobalRoleId == null) {
        const { data: agencyRow } = await supabase
          .from("agency_users")
          .select("role_id")
          .eq("user_id", sessionUserId)
          .order("role_id", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (isStale()) return;

        const agencyRoleId = parseNumericRoleId(agencyRow?.role_id);
        roleId = pickLowestRoleId(
          resolveMergedAuthRoleId(jwtRoleId, jwtGlobalRoleId, agencyRoleId),
          agencyRoleId,
          jwtRoleId,
        );
      }

      if (isStale()) return;

      if (roleId == null) {
        setAccess(defaultNavAccessForRole(null));
        return;
      }

      // role_id 1 : acces total sans lire la matrice_securite
      if (roleId === 1) {
        setAccess(defaultNavAccessForRole(1));
        return;
      }

      const { data, error } = await supabase
        .from("matrice_securite")
        .select("ressource, lecture")
        .eq("role_id", roleId)
        .in("ressource", [...NAV_MATRIX_CIBLES]);

      if (isStale()) return;

      if (error) {
        if (import.meta.env.DEV) console.warn("[NavigationMatrix]", error.message);
        setAccess(
          navAccessWhenMatriceSecuriteEmptyForAgencyRole(roleId) ?? defaultNavAccessForRole(roleId),
        );
      } else {
        setAccess(
          mergeNavAccessFromMatriceSecurite(
            roleId,
            (data as { ressource: string; lecture: boolean }[] | null) ?? [],
          ),
        );
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [sessionUserId, effectiveRoleId, authLoading, modeReady, session?.user]);

  useEffect(() => {
    void load();
  }, [load]);

  const can = useCallback(
    (cible: NavMatrixCible) => {
      return access[cible] === true;
    },
    [access],
  );

  const canAccessPath = useCallback(
    (pathname: string) => {
      const cible = pathnameToNavCible(pathname);
      if (cible == null) return true;
      return can(cible);
    },
    [can],
  );

  const value = useMemo<NavigationMatrixContextValue>(
    () => ({
      access,
      loading,
      refresh: load,
      can,
      canAccessPath,
    }),
    [access, loading, load, can, canAccessPath],
  );

  return <NavigationMatrixContext.Provider value={value}>{children}</NavigationMatrixContext.Provider>;
}
