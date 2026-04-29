import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuthUser } from "@/hooks/useAuthUser";
import {
  defaultNavAccessForRole,
  mergeNavAccessFromMatriceSecurite,
  NAV_MATRIX_CIBLES,
  pathnameToNavCible,
  type NavMatrixCible,
} from "@/lib/navigationMatrix";
import { supabase } from "@/lib/supabase";
import { NavigationMatrixContext, type NavigationMatrixContextValue } from "@/providers/navigationMatrixContext";

export function NavigationMatrixProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthUser();
  const sessionUserId = session?.user?.id ?? null;
  const [access, setAccess] = useState<NavigationMatrixContextValue["access"]>(() =>
    defaultNavAccessForRole(null),
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!sessionUserId) {
      setAccess(defaultNavAccessForRole(null));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: profile, error: profileErr } = await supabase
        .from("users")
        .select("user_roles, role_id")
        .eq("id", sessionUserId)
        .maybeSingle();
      if (profileErr) {
        if (import.meta.env.DEV) console.warn("[NavigationMatrix][profile]", profileErr.message);
        setAccess(defaultNavAccessForRole(null));
        return;
      }
      const row = profile as { user_roles?: number | string | null; role_id?: number | string | null } | null;
      const roleId = Number((row?.user_roles ?? row?.role_id) ?? NaN);
      if (!Number.isFinite(roleId)) {
        setAccess(defaultNavAccessForRole(null));
        return;
      }
      if (roleId === 1) {
        setAccess(defaultNavAccessForRole(1));
        return;
      }

      const { data, error } = await supabase
        .from("matrice_securite")
        .select("ressource, lecture")
        .eq("role_id", roleId)
        .in("ressource", [...NAV_MATRIX_CIBLES]);
      if (error) {
        if (import.meta.env.DEV) console.warn("[NavigationMatrix]", error.message);
        setAccess(defaultNavAccessForRole(roleId));
      } else {
        setAccess(
          mergeNavAccessFromMatriceSecurite(
            roleId,
            (data as { ressource: string; lecture: boolean }[] | null) ?? [],
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [sessionUserId]);

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
