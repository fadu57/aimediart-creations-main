/** Date de création du dépôt (1er commit git « Première mise en ligne »). */
export const PROJECT_CREATED_DATE = "2026-04-29";

export function formatProjectDate(iso = PROJECT_CREATED_DATE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
