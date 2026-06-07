const GATE_KEY = "visitor_expo_gate_done";

/** Marque la landing expo comme vue pour cette session (QR œuvre → /artwork). */
export function markVisitorExpoGateDone(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(GATE_KEY, "1");
}

export function isVisitorExpoGateDone(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(GATE_KEY) === "1";
}
