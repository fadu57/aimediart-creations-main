import type { KeyboardEvent } from "react";

/** Anneau focus discret — ne change pas le layout (ring inset). */
export const A11Y_CLICKABLE_FOCUS_CLASS =
  "focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

type A11yActivateOptions = {
  /** Sur un `<div>` / carte (pas une ligne de tableau). */
  role?: "button" | "link";
};

/**
 * Rend un élément cliquable utilisable au clavier (Enter / Espace).
 * À combiner avec `A11Y_CLICKABLE_FOCUS_CLASS` sur className.
 * Sur `<tr>`, ne pas forcer de `role` pour préserver la sémantique tableau.
 */
export function a11yActivateProps(
  onActivate: () => void,
  options: A11yActivateOptions = {},
) {
  return {
    ...(options.role ? { role: options.role } : {}),
    tabIndex: 0 as const,
    onClick: () => onActivate(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
