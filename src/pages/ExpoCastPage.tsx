import { useEffect, useRef } from "react";

/**
 * Page projection plein écran (cast Chromecast, navigateur TV, projecteur).
 * Canopée : taille = outerWidth/outerHeight, pixelDensity = displayDensity(), pas de scaling CSS, image-rendering pixelated.
 * Quitter : fermer l’onglet ou la fenêtre du navigateur.
 */
export default function ExpoCastPage() {
  const canvasHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "AIMEDIArt — projection";
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyMargin = document.body.style.margin;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.margin = prevBodyMargin;
    };
  }, []);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWake = async () => {
      try {
        if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* refus navigateur / TV sans Wake Lock : prévoir mise en veille désactivée côté appareil */
      }
    };
    void requestWake();
    const onVis = () => {
      if (document.visibilityState === "visible") void requestWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void wakeLock?.release()?.catch(() => {});
    };
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { mountForestCanopyP5 } = await import("@/lib/forestCanopyP5Mount");
      const { fetchForestCanopySettings } = await import("@/lib/forestCanopySettings");
      const { resolved } = await fetchForestCanopySettings();
      if (cancelled || !canvasHostRef.current) return;
      cleanup = mountForestCanopyP5(host, { mode: "fullscreen" }, resolved);
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={canvasHostRef}
      className="fixed inset-0 touch-none bg-[#05140a]"
      style={{ WebkitTouchCallout: "none" as const }}
    />
  );
}
