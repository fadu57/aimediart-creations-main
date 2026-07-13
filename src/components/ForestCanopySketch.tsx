import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const CANVAS_HEIGHT = 150;

/**
 * Canopée « pouls des visites » — bandeau p5.js chargé au scroll (pas au first paint).
 * Clic sur le canvas : ouverture de la page projection `/expo` dans un nouvel onglet.
 */
export function ForestCanopySketch({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const openExpo = () => {
      const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      const href = new URL("expo", window.location.origin + base).href;
      window.open(href, "_blank", "noopener,noreferrer");
    };

    const mountP5 = () => {
      void import("@/lib/forestCanopyP5Mount").then(async ({ mountForestCanopyP5 }) => {
        if (cancelled || !wrapRef.current) return;
        const { fetchForestCanopySettings } = await import("@/lib/forestCanopySettings");
        const { resolved } = await fetchForestCanopySettings();
        if (cancelled || !wrapRef.current) return;
        cleanup = mountForestCanopyP5(
          wrapRef.current,
          {
            mode: "strip",
            widthElement: wrapRef.current,
            onCanvasClickOpenCast: openExpo,
          },
          resolved,
        );
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      mountP5();
      return () => {
        cancelled = true;
        cleanup?.();
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        mountP5();
      },
      { rootMargin: "320px 0px", threshold: 0.01 },
    );

    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("relative cursor-pointer", className)}
      style={{ minHeight: CANVAS_HEIGHT, width: "100%" }}
    />
  );
}
