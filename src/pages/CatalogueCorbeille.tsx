import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ArtworkRow = {
  artwork_id: string;
  artwork_title?: string | null;
  artwork_deleted_at?: string | null;
};

export default function CatalogueCorbeille() {
  const { loading: authLoading, role_id, role_name } = useAuthUser();
  const canAccess = useMemo(() => {
    if (authLoading) return false;
    return role_id === 1 || role_id === 2 || role_id === 3 || hasFullDataAccess(role_name);
  }, [authLoading, role_id, role_name]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ArtworkRow[]>([]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("artworks")
      .select("artwork_id, artwork_title, artwork_deleted_at")
      .not("artwork_deleted_at", "is", null)
      .order("artwork_deleted_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data as ArtworkRow[] | null) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadTrash();
  }, [canAccess, loadTrash]);

  const handleRestore = async (artworkId: string) => {
    if (!canAccess) return;
    try {
      const { error } = await supabase.from("artworks").update({ artwork_deleted_at: null }).eq("artwork_id", artworkId);
      if (error) throw error;
      toast.success("Œuvre restaurée.");
      await loadTrash();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Restauration impossible.";
      toast.error(msg);
    }
  };

  if (!canAccess && !authLoading) {
    return (
      <div className="container py-8">
        <p className="text-sm text-destructive">Accès réservé aux niveaux 1 à 3.</p>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">Corbeille — Œuvres</h2>
          <p className="text-muted-foreground">Restaurez une fiche archivée par erreur.</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/catalogue">
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
          {rows.map((a) => {
            const name = (a.artwork_title ?? "").trim() || a.artwork_id;
            return (
              <Card key={a.artwork_id} className="glass-card">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Archivé le {a.artwork_deleted_at ? new Date(a.artwork_deleted_at).toLocaleString("fr-FR") : "—"}
                    </p>
                  </div>
                  <Button type="button" className="gap-2" onClick={() => void handleRestore(a.artwork_id)}>
                    <ArchiveRestore className="h-4 w-4" /> Restaurer
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

