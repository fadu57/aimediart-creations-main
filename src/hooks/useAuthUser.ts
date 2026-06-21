import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { fetchUserRoleFromDb, getRoleIdFromJwt, getRoleNameFromJwt, mergeRoleFromDbAndJwt, mapRoleNameFromRoleId, normalizeRoleName, parseGlobalRoleId, resolveSessionRoleId } from "@/lib/authUser";
import { persistUserIpOnLogin } from "@/lib/persistUserIpOnLogin";
import { resolveAgencyExpoFromJwt } from "@/lib/userScope";

export type AuthUserWithRole = {
  session: Session | null;
  user: User | null;
  role_name: string | null;
  role_label: string | null;
  /** Niveau effectif fusionné (privilège le plus élevé). */
  role_id: number | null;
  /** Rôle global SaaS (1–3), si présent. */
  global_role_id: number | null;
  /** Rôle métier agence/expo (4–7), si présent. */
  agency_role_id: number | null;
  /** Prenom depuis public.profiles.first_name. */
  first_name: string | null;
  /** Perimetre metier : agence (obligatoire pour filtrer les ecrans). */
  agency_id: string | null;
  /** Perimetre metier : exposition (si absent, toutes les expos de l'agence). */
  expo_id: string | null;
  loading: boolean;
};

const empty: AuthUserWithRole = {
  session: null,
  user: null,
  role_name: null,
  role_label: null,
  role_id: null,
  global_role_id: null,
  agency_role_id: null,
  first_name: null,
  agency_id: null,
  expo_id: null,
  loading: true,
};

/** getSession() peut rester bloque (refresh token, reseau) avant meme la lecture du profil. */
const AUTH_GET_SESSION_TIMEOUT_MS = 10_000;

/** Evite un blocage infini si la requete public.profiles reste en attente (reseau, proxy, etc.). */
const FETCH_USER_PROFILE_TIMEOUT_MS = 5_000;
const CURRENT_USER_FIRST_NAME_KEY = "current_user_first_name";

type DbProfile = Awaited<ReturnType<typeof fetchUserRoleFromDb>>;

async function getSessionWithTimeout(): Promise<{ session: Session | null; timedOut: boolean }> {
  return Promise.race([
    supabase.auth.getSession().then(({ data }) => ({ session: data.session, timedOut: false as const })),
    new Promise<{ session: null; timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ session: null, timedOut: true }), AUTH_GET_SESSION_TIMEOUT_MS),
    ),
  ]);
}

async function fetchUserRoleFromDbWithTimeout(userId: string): Promise<DbProfile> {
  return Promise.race([
    fetchUserRoleFromDb(userId),
    new Promise<DbProfile>((_, reject) =>
      setTimeout(() => reject(new Error("profile_fetch_timeout")), FETCH_USER_PROFILE_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Session Supabase + role_name / role_label (tables profiles, agency_users et roles_user).
 */
export function useAuthUser() {
  const [state, setState] = useState<AuthUserWithRole>(empty);
  /** Incremente a chaque applySession : les resultats obsoletes (logout pendant un fetch) sont ignores. */
  const applyGenerationRef = useRef(0);

  const applySession = useCallback(async (session: Session | null) => {
    const myGeneration = ++applyGenerationRef.current;

    if (!session?.user) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(CURRENT_USER_FIRST_NAME_KEY);
      }
      setState({
        session: null,
        user: null,
        role_name: null,
        role_label: null,
        role_id: null,
        global_role_id: null,
        agency_role_id: null,
        first_name: null,
        agency_id: null,
        expo_id: null,
        loading: false,
      });
      return;
    }

    setState((s) => ({
      ...s,
      session,
      user: session.user,
      loading: true,
    }));

    try {
      let dbProfile: DbProfile;
      try {
        // Toujours tenter la lecture public.profiles pour recuperer first_name,
        // meme si le role est deja present dans le JWT.
        dbProfile = await fetchUserRoleFromDbWithTimeout(session.user.id);
      } catch (e) {
        const isTimeout = e instanceof Error && e.message === "profile_fetch_timeout";
        if (import.meta.env.DEV) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            isTimeout
              ? "[auth] timeout lecture profil profiles, fallback JWT"
              : "[auth] erreur lecture profil profiles :",
            msg,
          );
        }
        dbProfile = { role_name: null, role_label: null, role_id: null, global_role_id: null, agency_role_id: null, first_name: null, agency_id: null, expo_id: null };
      }
      if (myGeneration !== applyGenerationRef.current) return;

      const jwtRoleId = getRoleIdFromJwt(session.user);
      const global_role_id = dbProfile.global_role_id ?? parseGlobalRoleId(jwtRoleId);
      const agency_role_id = dbProfile.agency_role_id ?? null;

      const { role_name: dbRoleName, role_label: dbRoleLabel } = mergeRoleFromDbAndJwt(
        session.user,
        dbProfile.role_name,
        dbProfile.role_label,
      );
      const role_id = resolveSessionRoleId(session.user, dbProfile);
      const role_name =
        normalizeRoleName(mapRoleNameFromRoleId(role_id)) ?? dbRoleName ?? normalizeRoleName(getRoleNameFromJwt(session.user));
      const role_label = dbRoleLabel;
      const meta = session.user.user_metadata as Record<string, unknown> | undefined;
      // Priorite : base de donnees -> metadonnees JWT (signUp avec options.data.first_name)
      const first_name =
        dbProfile.first_name ??
        (typeof meta?.first_name === "string" ? meta.first_name.trim() || null : null);

      if (typeof window !== "undefined") {
        if (first_name) {
          window.localStorage.setItem(CURRENT_USER_FIRST_NAME_KEY, first_name);
        } else {
          window.localStorage.removeItem(CURRENT_USER_FIRST_NAME_KEY);
        }
      }
      const jwtScope = resolveAgencyExpoFromJwt(session.user);
      const agency_id = dbProfile.agency_id ?? jwtScope.agency_id;
      const expo_id = dbProfile.expo_id ?? jwtScope.expo_id;
      if (myGeneration !== applyGenerationRef.current) return;

      setState({
        session,
        user: session.user,
        role_name,
        role_label,
        role_id,
        global_role_id,
        agency_role_id,
        first_name,
        agency_id,
        expo_id,
        loading: false,
      });
    } catch (e) {
      if (myGeneration !== applyGenerationRef.current) return;
      // Bypass robuste: si la lecture DB (profiles) echoue (403/RLS), on continue avec le role JWT.
      const { role_name, role_label } = mergeRoleFromDbAndJwt(session.user, null, null);
      const jwtRoleId = getRoleIdFromJwt(session.user);
      const role_id = resolveSessionRoleId(session.user, {
        role_id: null,
        global_role_id: parseGlobalRoleId(jwtRoleId),
        agency_role_id: null,
      });
      const global_role_id = parseGlobalRoleId(jwtRoleId);
      const agency_role_id = null;
      const meta = session.user.user_metadata as Record<string, unknown> | undefined;
      const first_name =
        typeof meta?.first_name === "string" ? meta.first_name.trim() || null : null;
      if (typeof window !== "undefined") {
        if (first_name) {
          window.localStorage.setItem(CURRENT_USER_FIRST_NAME_KEY, first_name);
        } else {
          window.localStorage.removeItem(CURRENT_USER_FIRST_NAME_KEY);
        }
      }
      const jwtScope = resolveAgencyExpoFromJwt(session.user);
      if (import.meta.env.DEV) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[auth] bypass profil DB (profiles) :", msg);
      }
      setState({
        session,
        user: session.user,
        role_name,
        role_label,
        role_id,
        global_role_id,
        agency_role_id,
        first_name,
        agency_id: jwtScope.agency_id,
        expo_id: jwtScope.expo_id,
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        void persistUserIpOnLogin(session.user.id);
      }
      void applySession(session);
    });

    // Secours si INITIAL_SESSION tarde (extensions, stockage auth corrompu…).
    void getSessionWithTimeout().then(({ session, timedOut }) => {
      if (cancelled) return;
      if (timedOut && import.meta.env.DEV) {
        console.warn("[auth] getSession timeout — formulaire login débloqué");
      }
      void applySession(session);
    });

    const hardFallback = setTimeout(() => {
      if (cancelled) return;
      setState((s) => (s.loading ? { ...s, loading: false } : s));
    }, AUTH_GET_SESSION_TIMEOUT_MS + 500);

    return () => {
      cancelled = true;
      clearTimeout(hardFallback);
      subscription.unsubscribe();
    };
  }, [applySession]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const { session } = await getSessionWithTimeout();
    await applySession(session);
  }, [applySession]);

  return { ...state, refresh };
}
