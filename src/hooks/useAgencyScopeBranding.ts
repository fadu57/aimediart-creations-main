import { useEffect, useMemo, useState } from "react";

import { useDataScope } from "@/hooks/useDataScope";
import { supabase } from "@/lib/supabase";

export type AgencyScopeBrandingState = {
  name: string | null;
  logoUrl: string | null;
};

/**
 * Image / nom d’affichage de l’agence du périmètre courant (mode agency ou expo uniquement).
 */
export function useAgencyScopeBranding(): {
  branding: AgencyScopeBrandingState | null;
  loading: boolean;
  agencyScopeKey: string | null;
} {
  const { scope, loading: scopeLoading } = useDataScope();
  const agencyScopeKey = useMemo(() => {
    if (scope.mode === "agency") return scope.agencyId;
    if (scope.mode === "expo") return scope.agencyId;
    return null;
  }, [scope]);

  const [branding, setBranding] = useState<AgencyScopeBrandingState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (scopeLoading || !agencyScopeKey?.trim()) {
      setBranding(null);
      setLoading(false);
      return;
    }
    const agencyId = agencyScopeKey.trim();
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("name_agency, logo_agency")
        .eq("id", agencyId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (error || !data) {
        setBranding({ name: null, logoUrl: null });
        return;
      }
      const row = data as { name_agency?: string | null; logo_agency?: string | null };
      setBranding({
        name: typeof row.name_agency === "string" ? row.name_agency.trim() || null : null,
        logoUrl: typeof row.logo_agency === "string" ? row.logo_agency.trim() || null : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeLoading, agencyScopeKey]);

  return { branding, loading, agencyScopeKey };
}
