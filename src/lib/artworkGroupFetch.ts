import { supabase } from "@/lib/supabase";

export type ArtworkGroupType = "artist" | "theme";

export type ArtworkGroupRow = {
  id: string;
  expo_id: string;
  agency_id: string;
  group_type: ArtworkGroupType;
  group_label: string;
  group_display_number: string | null;
  group_artist_id: string | null;
  group_qr_code_url: string | null;
  group_qrcode_image: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ArtworkGroupMemberRow = {
  group_id: string;
  artwork_id: string;
  sort_order: number;
};

export type ArtworkGroupWithMembers = ArtworkGroupRow & {
  members: ArtworkGroupMemberRow[];
};

/** Charge un groupe et ses membres triés (parcours visiteur / entrée QR). */
export async function fetchArtworkGroupForVisitor(
  groupId: string,
): Promise<ArtworkGroupWithMembers | null> {
  const id = groupId.trim();
  if (!id) return null;

  const { data: group, error: groupError } = await supabase
    .from("artwork_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) return null;

  const { data: members, error: membersError } = await supabase
    .from("artwork_group_members")
    .select("group_id, artwork_id, sort_order")
    .eq("group_id", id)
    .order("sort_order", { ascending: true });

  if (membersError) throw membersError;

  return {
    ...(group as ArtworkGroupRow),
    members: (members ?? []) as ArtworkGroupMemberRow[],
  };
}

/** IDs des œuvres du groupe, ordonnés pour la navigation prev/next. */
export async function fetchGroupMemberArtworkIds(groupId: string): Promise<string[]> {
  const group = await fetchArtworkGroupForVisitor(groupId);
  if (!group) return [];
  return group.members.map((m) => m.artwork_id);
}

/** Tous les groupes d'une expo (backoffice). */
export async function fetchArtworkGroupsForExpo(expoId: string): Promise<ArtworkGroupWithMembers[]> {
  const id = expoId.trim();
  if (!id) return [];

  const { data: groups, error: groupsError } = await supabase
    .from("artwork_groups")
    .select("*")
    .eq("expo_id", id)
    .order("sort_order", { ascending: true });

  if (groupsError) throw groupsError;
  if (!groups?.length) return [];

  const groupIds = groups.map((g) => (g as ArtworkGroupRow).id);

  const { data: members, error: membersError } = await supabase
    .from("artwork_group_members")
    .select("group_id, artwork_id, sort_order")
    .in("group_id", groupIds)
    .order("sort_order", { ascending: true });

  if (membersError) throw membersError;

  const membersByGroup = new Map<string, ArtworkGroupMemberRow[]>();
  for (const m of members ?? []) {
    const row = m as ArtworkGroupMemberRow;
    const list = membersByGroup.get(row.group_id) ?? [];
    list.push(row);
    membersByGroup.set(row.group_id, list);
  }

  return (groups as ArtworkGroupRow[]).map((g) => ({
    ...g,
    members: membersByGroup.get(g.id) ?? [],
  }));
}

/** Map artwork_id → groupe (pour le catalogue). */
export async function fetchArtworkGroupMapForExpo(
  expoId: string,
): Promise<Map<string, ArtworkGroupWithMembers>> {
  const groups = await fetchArtworkGroupsForExpo(expoId);
  const map = new Map<string, ArtworkGroupWithMembers>();
  for (const group of groups) {
    for (const member of group.members) {
      map.set(member.artwork_id, group);
    }
  }
  return map;
}

/** Met à jour l'ordre des œuvres dans un regroupement (parcours visiteur / numérotation). */
export async function saveArtworkGroupMemberOrder(
  groupId: string,
  orderedArtworkIds: string[],
): Promise<void> {
  const id = groupId.trim();
  if (!id) throw new Error("Identifiant de groupe manquant");
  if (orderedArtworkIds.length === 0) throw new Error("Aucune œuvre à ordonner");

  const { error: deleteError } = await supabase
    .from("artwork_group_members")
    .delete()
    .eq("group_id", id);
  if (deleteError) throw deleteError;

  const rows = orderedArtworkIds.map((artwork_id, index) => ({
    group_id: id,
    artwork_id,
    sort_order: index,
  }));
  const { error: insertError } = await supabase.from("artwork_group_members").insert(rows);
  if (insertError) throw insertError;
}
