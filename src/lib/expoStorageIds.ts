import { supabase } from "@/lib/supabase";

/** Résout des identifiants expo vers expos.id (FK expo_user_role). */
export async function resolveExpoStorageIds(rawIds: string[]): Promise<string[]> {
  const unique = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const { data: byId, error: byIdErr } = await supabase
    .from("expos")
    .select("id, expo_id")
    .in("id", unique);
  if (byIdErr) throw byIdErr;

  const rows = (byId as Array<{ id?: string | null; expo_id?: string | null }> | null) ?? [];
  const idByAny = new Map<string, string>();
  for (const row of rows) {
    const pk = row.id?.trim();
    if (!pk) continue;
    idByAny.set(pk, pk);
    const alt = row.expo_id?.trim();
    if (alt) idByAny.set(alt, pk);
  }

  const missing = unique.filter((raw) => !idByAny.has(raw));
  if (missing.length > 0) {
    const { data: byExpoId, error: byExpoErr } = await supabase
      .from("expos")
      .select("id, expo_id")
      .in("expo_id", missing);
    if (byExpoErr) throw byExpoErr;
    for (const row of (byExpoId as Array<{ id?: string | null; expo_id?: string | null }> | null) ?? []) {
      const pk = row.id?.trim();
      const alt = row.expo_id?.trim();
      if (pk) {
        idByAny.set(pk, pk);
        if (alt) idByAny.set(alt, pk);
      }
    }
  }

  return [...new Set(unique.map((raw) => idByAny.get(raw) ?? raw).filter(Boolean))];
}
