import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuthUser } from "@/hooks/useAuthUser";
import {
  cancelOrganisationStandbyRequest,
  fetchOrganisationStandbyState,
  requestOrganisationStandby,
  type OrganisationStandbyState,
} from "@/lib/organisationStandby";

type OrganisationStandbyContextValue = {
  state: OrganisationStandbyState;
  loading: boolean;
  refresh: () => Promise<void>;
  requestStandby: () => Promise<OrganisationStandbyState>;
  cancelStandbyRequest: () => Promise<OrganisationStandbyState>;
  isStandbyNavRestricted: boolean;
};

const OrganisationStandbyContext = createContext<OrganisationStandbyContextValue | null>(null);

export function OrganisationStandbyProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuthUser();
  const [state, setState] = useState<OrganisationStandbyState>({
    authenticated: false,
    role_id: null,
    agency_id: null,
    has_subscription: false,
    plan_code: null,
    billing_cycle: null,
    status: null,
    standby_status: null,
    standby_requested_at: null,
    standby_cancel_deadline_at: null,
    standby_effective_at: null,
    next_renewal_at: null,
    is_nav_restricted: false,
    can_request_standby: false,
    can_cancel_standby_request: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setState((s) => ({ ...s, authenticated: false, is_nav_restricted: false }));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchOrganisationStandbyState();
      setState(next);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const requestStandby = useCallback(async () => {
    const next = await requestOrganisationStandby();
    setState(next);
    return next;
  }, []);

  const cancelStandbyRequest = useCallback(async () => {
    const next = await cancelOrganisationStandbyRequest();
    setState(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      state,
      loading,
      refresh,
      requestStandby,
      cancelStandbyRequest,
      isStandbyNavRestricted: Boolean(session?.user && state.is_nav_restricted),
    }),
    [state, loading, refresh, requestStandby, cancelStandbyRequest, session?.user],
  );

  return <OrganisationStandbyContext.Provider value={value}>{children}</OrganisationStandbyContext.Provider>;
}

export function useOrganisationStandby(): OrganisationStandbyContextValue {
  const ctx = useContext(OrganisationStandbyContext);
  if (!ctx) {
    throw new Error("useOrganisationStandby doit être utilisé dans OrganisationStandbyProvider");
  }
  return ctx;
}
