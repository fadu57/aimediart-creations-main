import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft, Info } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { useRetentionSettings } from "@/hooks/useRetentionSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RetentionBadge from "@/components/settings/RetentionBadge";

type UserTrashRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  deleted_at?: string | null;
};

export default function UtilisateursCorbeille() {
  const { loading: authLoading, role_id } = useAuthUser();
  const { can, loading: navLoading } = useNavigationMatrix();
  const canAccess = can("menu_user");
  const canRestore = useMemo(() => role_id === 1 || role_id === 2 || role_id === 4, [role_id]);

  const { retention } = useRetentionSettings();
  const retentionEntry = retention["profiles"];

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UserTrashRow[]>([]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: true }); // plus anciens en premier
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
    const { error } = await supabase
      .from("profiles")
      .update({ deleted_at: null })
      .eq("id", userId);
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

      {/* Bandeau d'information rétention */}
      {retentionEntry && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {retentionEntry.auto_purge
              ? <>Les fiches sont conservées <strong>{retentionEntry.retention_days} jours</strong> après archivage. La purge automatique s'exécute chaque nuit à 2h.</>
              : "La purge automatique est désactivée pour cette entité."}
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fiche archivée.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((u) => {
            const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.id;
            return (
              <Card key={u.id} className="glass-card">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Archivé le {u.deleted_at ? new Date(u.deleted_at).toLocaleString("fr-FR") : "—"}
                    </p>
                    <RetentionBadge
                      deleted_at={u.deleted_at}
                      retention_days={retentionEntry?.retention_days}
                      auto_purge={retentionEntry?.auto_purge}
                    />
                  </div>
                  {canRestore ? (
                    <Button type="button" className="gap-2 shrink-0" onClick={() => void handleRestore(u.id)}>
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
