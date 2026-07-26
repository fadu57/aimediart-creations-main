import { supabase } from "@/lib/supabase";

export type VisitorSoftDeleteSource = "profiles" | "visitors";

type SoftDeleteRpcResult = {
  ok?: boolean;
  id?: string;
  source?: string;
  deleted_at?: string;
  linked_visitors?: number;
  already_deleted?: boolean;
};

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    msg.includes("soft_delete_visitor") ||
    msg.includes("restore_visitor") ||
    msg.includes("could not find the function")
  );
}

/** Archive un visiteur (profil inscrit ou session anonyme). */
export async function softDeleteVisitor(
  id: string,
  source: VisitorSoftDeleteSource,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = id.trim();
  if (!uid) return { ok: false, message: "Identifiant visiteur invalide." };

  const { data, error } = await supabase.rpc("soft_delete_visitor", {
    p_id: uid,
    p_source: source,
  });

  if (!error) {
    const payload = data as SoftDeleteRpcResult | null;
    if (payload?.ok) return { ok: true };
    return { ok: false, message: "Suppression refusée." };
  }

  if (!isMissingRpcError(error)) {
    return { ok: false, message: error.message };
  }

  // Repli si RPC absente : UPDATE + vérif ligne (évite faux succès RLS).
  const table = source === "visitors" ? "visitors" : "profiles";
  const deletedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from(table)
    .update({ deleted_at: deletedAt })
    .eq("id", uid)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return {
      ok: false,
      message:
        "Corbeille indisponible : exécutez supabase/sql/soft_delete_visitor.sql dans Supabase.",
    };
  }
  if (!updated?.id) {
    return {
      ok: false,
      message:
        "Suppression refusée (droits insuffisants). Exécutez supabase/sql/soft_delete_visitor.sql dans Supabase.",
    };
  }

  if (source === "profiles") {
    await supabase
      .from("visitors")
      .update({ deleted_at: deletedAt })
      .eq("auth_user_id", uid)
      .is("deleted_at", null);
  }

  return { ok: true };
}

/** Restaure un visiteur archivé (+ sessions liées si profil). */
export async function restoreVisitor(
  id: string,
  source: VisitorSoftDeleteSource,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = id.trim();
  if (!uid) return { ok: false, message: "Identifiant visiteur invalide." };

  const { data, error } = await supabase.rpc("restore_visitor", {
    p_id: uid,
    p_source: source,
  });

  if (!error) {
    const payload = data as SoftDeleteRpcResult | null;
    if (payload?.ok) return { ok: true };
    return { ok: false, message: "Restauration refusée." };
  }

  if (!isMissingRpcError(error)) {
    return { ok: false, message: error.message };
  }

  const table = source === "visitors" ? "visitors" : "profiles";
  const { data: updated, error: updateErr } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq("id", uid)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return {
      ok: false,
      message:
        "Restauration indisponible : exécutez supabase/sql/soft_delete_visitor.sql dans Supabase.",
    };
  }
  if (!updated?.id) {
    return {
      ok: false,
      message:
        "Restauration refusée (droits insuffisants). Exécutez supabase/sql/soft_delete_visitor.sql dans Supabase.",
    };
  }

  if (source === "profiles") {
    await supabase.from("visitors").update({ deleted_at: null }).eq("auth_user_id", uid);
  }

  return { ok: true };
}
