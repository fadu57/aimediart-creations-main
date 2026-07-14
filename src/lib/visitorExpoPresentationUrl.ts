/** URL de la page visiteur avec présentation expo (descriptif, logo, dates). */
export function buildVisitorExpoPresentationPath(expoId: string): string {
  const id = expoId.trim();
  if (!id) return "/visitor";
  const params = new URLSearchParams({ expo_id: id, preview_gate: "1" });
  if (import.meta.env.DEV) {
    return `/dev/visitor-expo?${params.toString()}`;
  }
  return `/visitor?${params.toString()}`;
}

export function openVisitorExpoPresentation(expoId: string): void {
  if (!expoId.trim() || typeof window === "undefined") return;
  const path = buildVisitorExpoPresentationPath(expoId);
  window.open(`${window.location.origin}${path}`, "_blank", "noopener,noreferrer");
}
