import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { fetchUserRoleFromDb, getRoleIdFromJwt, mergeRoleFromDbAndJwt } from "@/lib/authUser";
import { resolveAgencyExpoFromJwt } from "@/lib/userScope";

export type AuthUserWithRole = {
  session: Session | null;
  user: User | null;
  role_name: string | null;
  role_label: string | null;
  /** Niveau réel issu de users.role_id. */
  role_id: number | null;
  /** Prénom depuis `public.user.user_prenom`. */
  user_prenom: string | null;
  /** Périmètre métier : agence (obligatoire pour filtrer les écrans). */
  agency_id: string | null;
  /** Périmètre métier : exposition (si absent, toutes les expos de l’agence). */
  expo_id: string | null;
  loading: boolean;
};

const empty: AuthUserWithRole = {
  session: null,
  user: null,
  role_name: null,
  role_label: null,
  role_id: null,
  user_prenom: null,
  agency_id: null,
  expo_id: null,
  loading: true,
};

/** `getSession()` peut rester bloqué (refresh token, réseau) avant même la lecture du profil. */
const AUTH_GET_SESSION_TIMEOUT_MS = 10_000;

/** Évite un blocage infini si la requête `public.users` reste en attente (réseau, proxy, etc.). */
const FETCH_USER_PROFILE_TIMEOUT_MS = 5_000;
const CURRENT_USER_PRENOM_KEY = "current_user_prenom";

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
 * Session Supabase + `role_name` / `role_label` (tables `user` et `roles_user`).
 */
export function useAuthUser() {
  const [state, setState] = useState<AuthUserWithRole>(empty);
  /** Incrémenté à chaque `applySession` : les résultats obsolètes (logout pendant un fetch) sont ignorés. */
  const applyGenerationRef = useRef(0);

  const applySession = useCallback(async (session: Session | null) => {
    const myGeneration = ++applyGenerationRef.current;

    if (!session?.user) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(CURRENT_USER_PRENOM_KEY);
      }
      setState({
        session: null,
        user: null,
        role_name: null,
        role_label: null,
        role_id: null,
        user_prenom: null,
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
        // Toujours tenter la lecture `public.users` pour récupérer `user_prenom`,
        // même si le rôle est déjà présent dans le JWT.
        dbProfile = await fetchUserRoleFromDbWithTimeout(session.user.id);
      } catch (e) {
        const isTimeout = e instanceof Error && e.message === "profile_fetch_timeout";
        if (import.meta.env.DEV) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(isTimeout ? "[auth] timeout lecture profil users, fallback JWT" : "[auth] erreur lecture profil users :", msg);
        }
        dbProfile = { role_name: null, role_label: null, role_id: null, user_prenom: null, agency_id: null, expo_id: null };
      }
      if (myGeneration !== applyGenerationRef.current) return;

      const { role_name, role_label } = mergeRoleFromDbAndJwt(
        session.user,
        dbProfile.role_name,
        dbProfile.role_label,
      );
      const role_id = dbProfile.role_id ?? getRoleIdFromJwt(session.user);
      const meta = session.user.user_metadata as Record<string, unknown> | undefined;
      const user_prenom =
        dbProfile.user_prenom ??
        (typeof meta?.user_prenom === "string" ? meta.user_prenom.trim() || null : null) ??
        (typeof meta?.prenom === "string" ? meta.prenom.trim() || null : null);
      if (typeof window !== "undefined") {
        if (user_prenom) {
          window.localStorage.setItem(CURRENT_USER_PRENOM_KEY, user_prenom);
        } else {
          window.localStorage.removeItem(CURRENT_USER_PRENOM_KEY);
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
        user_prenom,
        agency_id,
        expo_id,
        loading: false,
      });
    } catch (e) {
      if (myGeneration !== applyGenerationRef.current) return;
      // Bypass robuste: si la lecture DB (users) échoue (403/RLS), on continue avec le rôle JWT.
      const { role_name, role_label } = mergeRoleFromDbAndJwt(session.user, null, null);
      const role_id = getRoleIdFromJwt(session.user);
      const meta = session.user.user_metadata as Record<string, unknown> | undefined;
      const user_prenom =
        (typeof meta?.user_prenom === "string" ? meta.user_prenom.trim() || null : null) ??
        (typeof meta?.prenom === "string" ? meta.prenom.trim() || null : null);
      if (typeof window !== "undefined") {
        if (user_prenom) {
          window.localStorage.setItem(CURRENT_USER_PRENOM_KEY, user_prenom);
        } else {
          window.localStorage.removeItem(CURRENT_USER_PRENOM_KEY);
        }
      }
      const jwtScope = resolveAgencyExpoFromJwt(session.user);
      if (import.meta.env.DEV) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[auth] bypass profil DB (users) :", msg);
      }
      setState({
        session,
        user: session.user,
        role_name,
        role_label,
        role_id,
        user_prenom,
        agency_id: jwtScope.agency_id,
        expo_id: jwtScope.expo_id,
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Ne pas appeler getSession() en parallèle : il peut bloquer longtemps et entrer en course avec ce callback.
    // `onAuthStateChange` est invoqué tout de suite avec la session courante (événement INITIAL_SESSION).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void applySession(session);
    });

    return () => {
      cancelled = true;
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
