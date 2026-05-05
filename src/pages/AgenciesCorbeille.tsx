import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft, Info } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { useRetentionSettings } from "@/hooks/useRetentionSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RetentionBadge from "@/components/settings/RetentionBadge";

type AgencyTrashRow = {
  id: string;
  name_agency?: string | null;
  deleted_at?: string | null;
};

export default function AgenciesCorbeille() {
  const { loading: authLoading, role_id, role_name } = useAuthUser();
  const canAccess = useMemo(
    () => role_id === 1 || role_id === 2 || role_id === 3 || role_id === 4 || hasFullDataAccess(role_name),
    [role_id, role_name],
  );

  const { retention } = useRetentionSettings();
  const retentionEntry = retention["agencies"];

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AgencyTrashRow[]>([]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agencies")
      .select("id, name_agency, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: true }); // plus anciens en premier
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data as AgencyTrashRow[] | null) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadTrash();
  }, [canAccess, loadTrash]);

  const handleRestore = async (agencyId: string) => {
    if (!canAccess) return;
    const { error } = await supabase
      .from("agencies")
      .update({ deleted_at: null })
      .eq("id", agencyId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organisation restaurée.");
    await loadTrash();
  };

  if (!authLoading && !canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">Corbeille — Organisations</h2>
          <p className="text-muted-foreground">Restaurez une fiche archivée par erreur.</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/agencies">
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
          {rows.map((row) => (
            <Card key={row.id} className="glass-card">
              <CardContent className="p-5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold truncate">{row.name_agency?.trim() || row.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Archivé le {row.deleted_at ? new Date(row.deleted_at).toLocaleString("fr-FR") : "—"}
                  </p>
                  <RetentionBadge
                    deleted_at={row.deleted_at}
                    retention_days={retentionEntry?.retention_days}
                    auto_purge={retentionEntry?.auto_purge}
                  />
                </div>
                <Button type="button" className="gap-2 shrink-0" onClick={() => void handleRestore(row.id)}>
                  <ArchiveRestore className="h-4 w-4" /> Restaurer
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
