import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { mountForestCanopyP5 } from "@/lib/forestCanopyP5Mount";

const CANVAS_HEIGHT = 150;

/**
 * Canopée « pouls des visites » — bandeau p5.js.
 * Clic sur le canvas : ouverture de la page projection `/expo` dans un nouvel onglet (cast TV / projecteur).
 */
export function ForestCanopySketch({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const openExpo = () => {
      const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      const href = new URL("expo", window.location.origin + base).href;
      window.open(href, "_blank", "noopener,noreferrer");
    };

    return mountForestCanopyP5(el, {
      mode: "strip",
      widthElement: el,
      onCanvasClickOpenCast: openExpo,
    });
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("relative cursor-pointer", className)}
      style={{ minHeight: CANVAS_HEIGHT, width: "100%" }}
    />
  );
}
