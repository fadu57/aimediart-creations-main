import { useMemo } from "react";

import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { expos } from "@/data/mockData";
import { resolveDataScope, type DataScope } from "@/lib/userScope";

/**
 * Périmètre données selon le rôle effectif (mode navigation global / organisation).
 */
export function useDataScope(): { scope: DataScope; loading: boolean } {
  const { role_name, role_id, agency_id, expo_id, loading } = useEffectiveAuth();
  const scope = useMemo(
    () => resolveDataScope(role_name, role_id, agency_id, expo_id, expos),
    [role_name, role_id, agency_id, expo_id],
  );
  return { scope, loading };
}
