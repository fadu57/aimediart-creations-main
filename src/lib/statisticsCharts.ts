/** Affiche le nombre de visites au-dessus d'une barre (masqué si 0). */
export function formatBarVisitLabel(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

/** Total cumulé des visites sur une série horaire ou temporelle. */
export function sumChartVisits<T extends { visites: number }>(series: T[]): number {
  return series.reduce((sum, point) => sum + point.visites, 0);
}
