/**
 * Garde-fou audio pour expositions intérieures : consentement déclaratif + bannissement admin.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { hasIndoorAudioConsent, saveIndoorAudioConsent } from "@/lib/indoorAudioConsent";
import { fetchExpoRowForVisitor } from "@/lib/visitorExpoFetch";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import {
  fetchVisitorAudioBanStatus,
  sendVisitorAudioHeartbeat,
} from "@/lib/visitorAudioSession";

const BAN_POLL_MS = 10_000;
const HEARTBEAT_MS = 15_000;

export type IndoorAudioGuardContextValue = {
  isIndoorExpo: boolean;
  isLoading: boolean;
  isBanned: boolean;
  hasConsented: boolean;
  showOnboarding: boolean;
  acceptConsent: () => void;
  /** Retourne false si la lecture doit être bloquée. */
  assertCanPlay: () => boolean;
  registerPauseCallback: (cb: () => void) => () => void;
};

const IndoorAudioGuardContext = createContext<IndoorAudioGuardContextValue | null>(null);

export function useIndoorAudioGuard(): IndoorAudioGuardContextValue {
  const ctx = useContext(IndoorAudioGuardContext);
  if (!ctx) {
    return {
      isIndoorExpo: false,
      isLoading: false,
      isBanned: false,
      hasConsented: true,
      showOnboarding: false,
      acceptConsent: () => undefined,
      assertCanPlay: () => true,
      registerPauseCallback: () => () => undefined,
    };
  }
  return ctx;
}

export type IndoorAudioGuardProviderProps = {
  expoId: string;
  artworkId?: string;
  artworkTitle?: string;
  children: ReactNode;
};

export function IndoorAudioGuardProvider({
  expoId,
  artworkId,
  artworkTitle,
  children,
}: IndoorAudioGuardProviderProps) {
  const [visitorClientId, setVisitorClientId] = useState(() => getOrCreateVisitorUuid());
  const [isIndoorExpo, setIsIndoorExpo] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(expoId));
  const [isBanned, setIsBanned] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const pauseCallbacksRef = useRef<Set<() => void>>(new Set());
  const sessionIdRef = useRef<string | null>(null);
  const [resolvedExpoId, setResolvedExpoId] = useState(expoId);

  const pauseAllAudio = useCallback(() => {
    pauseCallbacksRef.current.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  }, []);

  // Resynchronise l'ID si un autre onglet a régénéré visitor_uuid (évite 2 lignes fantômes).
  useEffect(() => {
    const syncVisitorId = () => {
      const current = getOrCreateVisitorUuid();
      setVisitorClientId((prev) => (prev === current ? prev : current));
    };
    syncVisitorId();
    window.addEventListener("storage", syncVisitorId);
    window.addEventListener("focus", syncVisitorId);
    return () => {
      window.removeEventListener("storage", syncVisitorId);
      window.removeEventListener("focus", syncVisitorId);
    };
  }, []);

  const sendHeartbeat = useCallback(async () => {
    if (!resolvedExpoId) return;
    const clientId = getOrCreateVisitorUuid();
    try {
      const sessionId = await sendVisitorAudioHeartbeat({
        visitor_client_id: clientId,
        expo_id: resolvedExpoId,
        artwork_id: artworkId ?? null,
        artwork_title: artworkTitle ?? null,
        page_url: typeof window !== "undefined" ? window.location.href : null,
        audio_consent_acknowledged: true,
      });
      if (sessionId) sessionIdRef.current = sessionId;
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[IndoorAudioGuard] heartbeat:", err);
    }
  }, [resolvedExpoId, artworkId, artworkTitle]);

  // Résout expo_id depuis l'œuvre si absent de l'URL
  useEffect(() => {
    if (expoId) {
      setResolvedExpoId(expoId);
      return;
    }
    if (!artworkId) {
      setResolvedExpoId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase
        .from("artworks")
        .select("artwork_expo_id")
        .eq("artwork_id", artworkId)
        .maybeSingle();
      if (cancelled) return;
      const fromArtwork = (data as { artwork_expo_id?: string | null } | null)?.artwork_expo_id?.trim() || "";
      setResolvedExpoId(fromArtwork);
    })();
    return () => {
      cancelled = true;
    };
  }, [expoId, artworkId]);

  // Charge expo_indoor et état de consentement
  useEffect(() => {
    if (!resolvedExpoId) {
      setIsIndoorExpo(false);
      setIsLoading(false);
      setHasConsented(true);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const row = await fetchExpoRowForVisitor(resolvedExpoId);
      if (cancelled) return;
      const indoor = row ? row.expo_indoor !== false : true;
      setIsIndoorExpo(indoor);
      const consented = !indoor || hasIndoorAudioConsent(resolvedExpoId, visitorClientId);
      setHasConsented(consented);
      setShowOnboarding(indoor && !consented);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedExpoId, visitorClientId]);

  // Heartbeat présence + polling bannissement (après consentement en expo intérieure)
  useEffect(() => {
    if (!isIndoorExpo || !resolvedExpoId || !hasConsented) return;

    let cancelled = false;

    const pollBan = async () => {
      if (cancelled) return;
      try {
        const status = await fetchVisitorAudioBanStatus(getOrCreateVisitorUuid());
        if (status.session_id) sessionIdRef.current = status.session_id;
        if (status.banned) {
          setIsBanned(true);
          setShowOnboarding(false);
          pauseAllAudio();
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[IndoorAudioGuard] ban poll:", err);
      }
    };

    void sendHeartbeat();
    void pollBan();

    const onVisible = () => {
      if (document.visibilityState === "visible") void sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisible);

    const heartbeatTimer = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);
    const banTimer = window.setInterval(() => void pollBan(), BAN_POLL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(heartbeatTimer);
      window.clearInterval(banTimer);
    };
  }, [isIndoorExpo, resolvedExpoId, hasConsented, visitorClientId, sendHeartbeat, pauseAllAudio]);

  const acceptConsent = useCallback(() => {
    if (!resolvedExpoId) return;
    saveIndoorAudioConsent(resolvedExpoId, visitorClientId);
    setHasConsented(true);
    setShowOnboarding(false);
    void sendHeartbeat();
  }, [resolvedExpoId, visitorClientId, sendHeartbeat]);

  const assertCanPlay = useCallback((): boolean => {
    if (!isIndoorExpo) return true;
    if (isBanned) return false;
    if (!hasConsented) {
      setShowOnboarding(true);
      return false;
    }
    return true;
  }, [isIndoorExpo, isBanned, hasConsented]);

  const registerPauseCallback = useCallback((cb: () => void) => {
    pauseCallbacksRef.current.add(cb);
    return () => {
      pauseCallbacksRef.current.delete(cb);
    };
  }, []);

  const value = useMemo<IndoorAudioGuardContextValue>(
    () => ({
      isIndoorExpo,
      isLoading,
      isBanned,
      hasConsented,
      showOnboarding,
      acceptConsent,
      assertCanPlay,
      registerPauseCallback,
    }),
    [
      isIndoorExpo,
      isLoading,
      isBanned,
      hasConsented,
      showOnboarding,
      acceptConsent,
      assertCanPlay,
      registerPauseCallback,
    ],
  );

  return (
    <IndoorAudioGuardContext.Provider value={value}>{children}</IndoorAudioGuardContext.Provider>
  );
}
