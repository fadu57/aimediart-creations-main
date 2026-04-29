import { useMemo } from "react";

import { expos } from "@/data/mockData";
import { useAuthUser } from "@/hooks/useAuthUser";
import { resolveDataScope, type DataScope } from "@/lib/userScope";

/**
 * Périmètre données (mock) selon `role_name` et les identifiants profil.
 */
export function useDataScope(): { scope: DataScope; loading: boolean } {
  const { role_name, role_id, agency_id, expo_id, loading } = useAuthUser();
  const scope = useMemo(
    () => resolveDataScope(role_name, role_id, agency_id, expo_id, expos),
    [role_name, role_id, agency_id, expo_id],
  );
  return { scope, loading };
}
