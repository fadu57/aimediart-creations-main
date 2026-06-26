import { supabase } from "@/lib/supabase";
import { countAgencyArtworks } from "@/lib/organisation/countAgencyArtworks";

export type ResignImpact = {
  exposCount: number;
  artworksCount: number;
};

/** Récupère les ids d'expos actives rattachées à l'agence. */
async function fetchActiveExpoIds(agencyId: string): Promise<string[]> {
  const { data } = await supabase
    .from("expos")
    .select("id")
    .eq("agency_id", agencyId)
    .is("deleted_at", null);
  return ((data as Array<{ id?: string | null }> | null) ?? [])
    .map((r) => r.id?.trim())
    .filter(Boolean) as string[];
}

/** Compte ce qui sera mis à la corbeille lors d'une résiliation (expos + œuvres). */
export async function countResignImpact(agencyId: string): Promise<ResignImpact> {
  const aid = agencyId.trim();
  const [expoIds, artworksCount] = await Promise.all([
    fetchActiveExpoIds(aid),
    countAgencyArtworks(aid),
  ]);
  return { exposCount: expoIds.length, artworksCount };
}

/**
 * Résiliation : met à la corbeille (restauration possible 60 j) l'agence,
 * toutes ses expos et toutes les œuvres liées (directement ou via expo).
 */
export async function resignOrganisationCascade(
  agencyId: string,
): Promise<{ error: string | null }> {
  const aid = agencyId.trim();
  if (!aid) return { error: "Organisation introuvable." };

  const nowIso = new Date().toISOString();
  const expoIds = await fetchActiveExpoIds(aid);

  // 1) Œuvres rattachées directement à l'agence.
  const { error: byAgencyErr } = await supabase
    .from("artworks")
    .update({ deleted_at: nowIso })
    .eq("artwork_agency_id", aid)
    .is("deleted_at", null);
  if (byAgencyErr) return { error: byAgencyErr.message };

  // 2) Œuvres rattachées via une expo de l'agence.
  if (expoIds.length > 0) {
    const { error: byExpoErr } = await supabase
      .from("artworks")
      .update({ deleted_at: nowIso })
      .in("artwork_expo_id", expoIds)
      .is("deleted_at", null);
    if (byExpoErr) return { error: byExpoErr.message };
  }

  // 3) Expos de l'agence.
  const { error: expoErr } = await supabase
    .from("expos")
    .update({ deleted_at: nowIso })
    .eq("agency_id", aid)
    .is("deleted_at", null);
  if (expoErr) return { error: expoErr.message };

  // 4) Agence.
  const { error: agencyErr } = await supabase
    .from("agencies")
    .update({ deleted_at: nowIso })
    .eq("id", aid);
  if (agencyErr) return { error: agencyErr.message };

  return { error: null };
}
