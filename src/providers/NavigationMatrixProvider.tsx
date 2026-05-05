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
  // On utilise directement role_id resolu par useAuthUser (inclut deja le fallback JWT)
  // pour eviter une double requete qui peut echouer si la table users n'existe plus.
  const { session, role_id: authRoleId, loading: authLoading } = useAuthUser();
  const sessionUserId = session?.user?.id ?? null;

  const [access, setAccess] = useState<NavigationMatrixContextValue["access"]>(() =>
    defaultNavAccessForRole(null),
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Attendre que useAuthUser ait fini de charger
    if (authLoading) return;

    if (!sessionUserId) {
      setAccess(defaultNavAccessForRole(null));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Priorite 1 : role_id deja resolu par useAuthUser (agency_users + fallback JWT)
      let roleId = typeof authRoleId === "number" ? authRoleId : NaN;

      // Priorite 2 : si toujours inconnu, nouvelle tentative sur agency_users
      // (cas ou useAuthUser n'a pas encore charge le role au moment du montage)
      if (!Number.isFinite(roleId)) {
        const { data: agencyRow } = await supabase
          .from("agency_users")
          .select("role_id")
          .eq("user_id", sessionUserId)
          .order("role_id", { ascending: true })
          .limit(1)
          .maybeSingle();
        roleId = Number(agencyRow?.role_id ?? NaN);
      }

      if (!Number.isFinite(roleId)) {
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
  }, [sessionUserId, authRoleId, authLoading]);

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
