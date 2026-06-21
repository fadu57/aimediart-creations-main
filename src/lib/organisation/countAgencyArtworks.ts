import { supabase } from "@/lib/supabase";

/** Compte les œuvres actives d'une agence (direct + via expos de l'agence). */
export async function countAgencyArtworks(agencyId: string): Promise<number> {
  const aid = agencyId.trim();

  const { data: expoRows } = await supabase
    .from("expos")
    .select("id")
    .or(`agency_id.eq.${aid},agency_id.is.null`)
    .is("deleted_at", null);
  const expoIds = ((expoRows as Array<{ id?: string | null }> | null) ?? [])
    .map((r) => r.id?.trim())
    .filter(Boolean) as string[];

  const ids = new Set<string>();

  const collectArtworkIds = (
    rows: Array<{ artwork_id?: string | null; artwork_agency_id?: string | null }> | null,
    options?: { requireAgencyMatch?: boolean },
  ) => {
    for (const row of rows ?? []) {
      const id = row.artwork_id?.trim();
      if (!id) continue;
      if (options?.requireAgencyMatch) {
        const rowAgency = row.artwork_agency_id?.trim();
        if (rowAgency && rowAgency !== aid) continue;
      }
      ids.add(id);
    }
  };

  const { data: byAgency, error: byAgencyErr } = await supabase
    .from("artworks")
    .select("artwork_id")
    .eq("artwork_agency_id", aid)
    .is("deleted_at", null);

  if (byAgencyErr) {
    const { data: fallbackByAgency } = await supabase
      .from("artworks")
      .select("artwork_id")
      .eq("artwork_agency_id", aid)
      .is("artwork_deleted_at", null);
    collectArtworkIds(fallbackByAgency);
  } else {
    collectArtworkIds(byAgency);
  }

  if (expoIds.length > 0) {
    const { data: byExpo, error: byExpoErr } = await supabase
      .from("artworks")
      .select("artwork_id, artwork_agency_id")
      .in("artwork_expo_id", expoIds)
      .is("deleted_at", null);

    if (byExpoErr) {
      const { data: fallbackByExpo } = await supabase
        .from("artworks")
        .select("artwork_id, artwork_agency_id")
        .in("artwork_expo_id", expoIds)
        .is("artwork_deleted_at", null);
      collectArtworkIds(fallbackByExpo, { requireAgencyMatch: true });
    } else {
      collectArtworkIds(byExpo, { requireAgencyMatch: true });
    }
  }

  if (ids.size === 0) {
    const { data: allVisible } = await supabase
      .from("artworks")
      .select("artwork_id, artwork_agency_id, artwork_expo_id")
      .is("deleted_at", null);
    const expoSet = new Set(expoIds);
    for (const row of (allVisible as Array<{
      artwork_id?: string | null;
      artwork_agency_id?: string | null;
      artwork_expo_id?: string | null;
    }> | null) ?? []) {
      const id = row.artwork_id?.trim();
      if (!id) continue;
      if (row.artwork_agency_id?.trim() === aid) ids.add(id);
      else if (row.artwork_expo_id?.trim() && expoSet.has(row.artwork_expo_id.trim())) ids.add(id);
    }
  }

  return ids.size;
}
