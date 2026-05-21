import { supabase } from "@/lib/supabase";

type SoftDeleteRpcResult = {
  ok?: boolean;
  user_id?: string;
  deleted_at?: string;
};

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    msg.includes("soft_delete_team_member") ||
    msg.includes("could not find the function")
  );
}

/** Marque un utilisateur en corbeille (profiles.deleted_at). */
export async function softDeleteUserProfile(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = userId.trim();
  if (!uid) return { ok: false, message: "Identifiant utilisateur invalide." };

  const { data, error } = await supabase.rpc("soft_delete_team_member", {
    p_user_id: uid,
  });

  if (!error) {
    const payload = data as SoftDeleteRpcResult | null;
    if (payload?.ok) return { ok: true };
  }

  if (error && !isMissingRpcError(error)) {
    return { ok: false, message: error.message };
  }

  // Repli legacy : propre profil ou admin global (RLS profiles_update_own_or_admin)
  const deletedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("profiles")
    .update({ deleted_at: deletedAt })
    .eq("id", uid)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return {
      ok: false,
      message: isMissingRpcError(error ?? null)
        ? "Corbeille indisponible : exécutez supabase/sql/soft_delete_team_member.sql (migration 41) dans Supabase."
        : updateErr.message,
    };
  }
  if (updated?.id) return { ok: true };

  return {
    ok: false,
    message:
      "Suppression refusée (droits insuffisants). Exécutez supabase/sql/soft_delete_team_member.sql (migration 41) dans Supabase.",
  };
}

/** IDs actifs (non archivés) parmi une liste — repli si RLS limite la lecture. */
export async function filterActiveProfileUserIds(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const { data, error } = await supabase.from("profiles").select("id, deleted_at").in("id", ids);
  if (error || !Array.isArray(data)) return new Set(ids);

  const active = new Set<string>();
  const seen = new Set<string>();
  for (const row of data as Array<{ id?: string | null; deleted_at?: string | null }>) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    seen.add(id);
    if (!row.deleted_at) active.add(id);
  }

  for (const id of ids) {
    if (!seen.has(id)) active.add(id);
  }
  return active;
}
