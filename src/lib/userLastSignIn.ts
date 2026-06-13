/** Date + heure courtes (fuseau local), ex. 11/06/2026 · 14:32 */
export function formatFrenchDateTime(
  iso: string | null | undefined,
  emptyLabel = "—",
): string {
  if (!iso?.trim()) return emptyLabel;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${datePart} · ${timePart}`;
}

/** Formate auth.users.last_sign_in_at pour l’admin utilisateurs. */
export function formatUserLastSignIn(
  iso: string | null | undefined,
  neverLabel = "Jamais connecté",
): string {
  return formatFrenchDateTime(iso, neverLabel);
}
