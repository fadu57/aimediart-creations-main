import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { useRetentionSettings } from "@/hooks/useRetentionSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RetentionBadge from "@/components/settings/RetentionBadge";
import RetentionSettingCard from "@/components/settings/RetentionSettingCard";

type UserTrashRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  deleted_at?: string | null;
};

export default function UtilisateursCorbeille() {
  const { t } = useTranslation("trash");
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
      toast.error(error.message || t("error_restore"));
      return;
    }
    toast.success(t("success_restore"));
    await loadTrash();
  };

  if (authLoading || navLoading) {
    return <p className="text-sm text-muted-foreground px-6 py-8">{t("loading")}</p>;
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">{t("title_users")}</h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/user/utilisateurs">
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Link>
        </Button>
      </div>

      {/* Paramètres de rétention (édition admin) */}
      <RetentionSettingCard tableNames={["profiles"]} roleId={role_id} />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty_state")}</p>
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
                      {t("archived_on", { date: u.deleted_at ? new Date(u.deleted_at).toLocaleString("fr-FR") : "—" })}
                    </p>
                    <RetentionBadge
                      deleted_at={u.deleted_at}
                      retention_days={retentionEntry?.retention_days}
                      auto_purge={retentionEntry?.auto_purge}
                    />
                  </div>
                  {canRestore ? (
                    <Button type="button" className="gap-2 shrink-0" onClick={() => void handleRestore(u.id)}>
                      <ArchiveRestore className="h-4 w-4" /> {t("restore_button")}
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
