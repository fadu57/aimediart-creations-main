import type { WakaEntity } from "@/lib/wakatime";

/** Noms WakaTime contenant « Cursor » (Cursor, Cursor IDE, etc.). */
export function isCursorEditorName(name: string): boolean {
  return /cursor/i.test(name.trim());
}

export function filterCursorEditors(editors: WakaEntity[]): WakaEntity[] {
  return editors.filter((e) => isCursorEditorName(e.name));
}

export function sumCursorEditorSeconds(editors: WakaEntity[]): number {
  return filterCursorEditors(editors).reduce((sum, e) => sum + e.total_seconds, 0);
}

export function cursorSharePercent(cursorSeconds: number, totalSeconds: number): number {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0;
  return Math.round((cursorSeconds / totalSeconds) * 1000) / 10;
}
