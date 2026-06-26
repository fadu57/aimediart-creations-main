import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { useRetentionSettings } from "@/hooks/useRetentionSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RetentionBadge from "@/components/settings/RetentionBadge";
import RetentionSettingCard from "@/components/settings/RetentionSettingCard";

type ArtworkRow = {
  artwork_id: string;
  artwork_title?: string | null;
  deleted_at?: string | null;
};

export default function CatalogueCorbeille() {
  const { t } = useTranslation("trash");
  const { loading: authLoading, role_id, role_name } = useAuthUser();
  const canAccess = useMemo(() => {
    if (authLoading) return false;
    return role_id === 1 || role_id === 2 || role_id === 3 || hasFullDataAccess(role_name);
  }, [authLoading, role_id, role_name]);

  const { retention } = useRetentionSettings();
  const retentionEntry = retention["artworks"];

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ArtworkRow[]>([]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("artworks")
      .select("artwork_id, artwork_title, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: true }); // plus anciens en premier
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
      const { error } = await supabase
        .from("artworks")
        .update({ deleted_at: null })
        .eq("artwork_id", artworkId);
      if (error) throw error;
      toast.success(t("success_restore"));
      await loadTrash();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error_restore");
      toast.error(msg);
    }
  };

  if (!canAccess && !authLoading) {
    return (
      <div className="container py-8">
        <p className="text-sm text-destructive">{t("access_restricted")}</p>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">{t("title_catalogue")}</h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/catalogue">
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Link>
        </Button>
      </div>

      {/* Paramètres de rétention (édition admin) */}
      <RetentionSettingCard tableNames={["artworks"]} roleId={role_id} />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty_state")}</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((a) => {
            const name = (a.artwork_title ?? "").trim() || a.artwork_id;
            return (
              <Card key={a.artwork_id} className="glass-card">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("archived_on", { date: a.deleted_at ? new Date(a.deleted_at).toLocaleString("fr-FR") : "—" })}
                    </p>
                    <RetentionBadge
                      deleted_at={a.deleted_at}
                      retention_days={retentionEntry?.retention_days}
                      auto_purge={retentionEntry?.auto_purge}
                    />
                  </div>
                  <Button type="button" className="gap-2 shrink-0" onClick={() => void handleRestore(a.artwork_id)}>
                    <ArchiveRestore className="h-4 w-4" /> {t("restore_button")}
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
