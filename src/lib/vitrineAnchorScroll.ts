/** Ancres de navigation → cible réelle de scroll (sous-sections lazy). */
const VITRINE_SCROLL_TARGETS: Record<string, string> = {
  connectivite: "connectivite-challenge",
};

export function resolveVitrineScrollTarget(anchorId: string): string {
  const id = anchorId.replace(/^#/, "").trim();
  return VITRINE_SCROLL_TARGETS[id] ?? id;
}

/** Scroll vers une ancre vitrine (#tarifs, etc.) avec retry (sections lazy). */
export function scrollToVitrineAnchor(anchorId: string): void {
  if (typeof window === "undefined" || !anchorId.trim()) return;
  const navId = anchorId.replace(/^#/, "").trim();
  const scrollId = resolveVitrineScrollTarget(navId);
  window.location.hash = navId;

  const tryScroll = (attempt = 0) => {
    const el = document.getElementById(scrollId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (attempt < 30) {
      window.setTimeout(() => tryScroll(attempt + 1), 50);
    }
  };

  tryScroll();
}
