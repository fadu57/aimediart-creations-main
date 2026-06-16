import { useEffect, useRef, useState, type ReactNode } from "react";

type LazyWhenVisibleProps = {
  children: ReactNode;
  /** Marge avant montage (ex. "300px" pour précharger un peu avant l’écran). */
  rootMargin?: string;
  /** Hauteur minimale réservée pour limiter le CLS avant montage. */
  minHeight?: number | string;
  className?: string;
};

/**
 * Monte les enfants uniquement quand le conteneur entre (ou approche) le viewport.
 * Réduit le JS initial et le travail du main thread sur les sections below-the-fold.
 */
export function LazyWhenVisible({
  children,
  rootMargin = "280px 0px",
  minHeight,
  className,
}: LazyWhenVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

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
      className={className}
      style={minHeight !== undefined && !visible ? { minHeight } : undefined}
    >
      {visible ? children : null}
    </div>
  );
}
