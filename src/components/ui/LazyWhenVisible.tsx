import { useEffect, useRef, useState, type ReactNode } from "react";

type LazyWhenVisibleProps = {
  children: ReactNode;
  /** Marge avant montage (ex. "300px" pour précharger un peu avant l’écran). */
  rootMargin?: string;
  /** Hauteur minimale réservée pour limiter le CLS avant montage. */
  minHeight?: number | string;
  className?: string;
  /** Ancre : force le montage si le hash URL correspond (navigation menu vitrine). */
  anchorId?: string;
  id?: string;
};

function hashMatchesAnchor(anchorId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash.replace(/^#/, "") === anchorId;
}

/**
 * Monte les enfants uniquement quand le conteneur entre (ou approche) le viewport.
 * Réduit le JS initial et le travail du main thread sur les sections below-the-fold.
 */
export function LazyWhenVisible({
  children,
  rootMargin = "280px 0px",
  minHeight,
  className,
  anchorId,
  id,
}: LazyWhenVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => (anchorId ? hashMatchesAnchor(anchorId) : false));

  useEffect(() => {
    if (!anchorId) return;
    const activateIfHash = () => {
      if (hashMatchesAnchor(anchorId)) setVisible(true);
    };
    activateIfHash();
    window.addEventListener("hashchange", activateIfHash);
    return () => window.removeEventListener("hashchange", activateIfHash);
  }, [anchorId]);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin, threshold: 0.01 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return (
    <div
      ref={ref}
      id={id ?? anchorId}
      className={className}
      style={minHeight !== undefined && !visible ? { minHeight } : undefined}
    >
      {visible ? children : null}
    </div>
  );
}
