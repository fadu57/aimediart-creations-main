import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type UserTrashRow = {
  id: string;
  user_prenom?: string | null;
  user_nom?: string | null;
  user_email?: string | null;
  user_deleted_at?: string | null;
};

export default function UtilisateursCorbeille() {
  const { loading: authLoading, role_id } = useAuthUser();
  const { can, loading: navLoading } = useNavigationMatrix();
  const canAccess = can("menu_user");
  const canRestore = useMemo(() => role_id === 1 || role_id === 2 || role_id === 4, [role_id]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UserTrashRow[]>([]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, user_prenom, user_nom, user_email, user_deleted_at")
      .not("user_deleted_at", "is", null)
      .order("user_deleted_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data as UserTrashRow[] | null) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadTrash();
  }, [canAccess, loadTrash]);

  const handleRestore = async (userId: string) => {
    if (!canRestore) return;
    const { error } = await supabase.from("users").update({ user_deleted_at: null }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fiche utilisateur restaurée.");
    await loadTrash();
  };

  if (authLoading || navLoading) {
    return <p className="text-sm text-muted-foreground px-6 py-8">Chargement…</p>;
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">Corbeille — Utilisateurs</h2>
          <p className="text-muted-foreground">Restaurez une fiche archivée par erreur.</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/user/utilisateurs">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fiche archivée.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((u) => {
            const name = [u.user_prenom, u.user_nom].filter(Boolean).join(" ").trim() || u.user_email || u.id;
            return (
              <Card key={u.id} className="glass-card">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Archive le {u.user_deleted_at ? new Date(u.user_deleted_at).toLocaleString("fr-FR") : "—"}
                    </p>
                  </div>
                  {canRestore ? (
                    <Button type="button" className="gap-2" onClick={() => void handleRestore(u.id)}>
                      <ArchiveRestore className="h-4 w-4" /> Restaurer
                    </Button>
                  ) : (
                    <div className="h-9 w-24" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

