import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import {
  listGedSectionsTrash,
  restoreGedSection,
  type AimediartGedSection,
} from "@/lib/aimediartDocuments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Corbeille G.E.D. — dossiers principaux soft-deleted (rôles 1–3). */
export default function SettingsGedCorbeille() {
  const { t } = useTranslation("trash");
  const { loading: authLoading, role_id, role_name } = useAuthUser();
  const canAccess = useMemo(
    () =>
      role_id === 1 ||
      role_id === 2 ||
      role_id === 3 ||
      (role_id == null && hasFullDataAccess(role_name)),
    [role_id, role_name],
  );

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AimediartGedSection[]>([]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listGedSectionsTrash();
    if (error) {
      toast.error(error);
      setRows([]);
    } else {
      setRows(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadTrash();
  }, [canAccess, loadTrash]);

  const handleRestore = async (sectionId: string) => {
    if (!canAccess) return;
    const { error } = await restoreGedSection(sectionId);
    if (error) {
      toast.error(error || t("error_restore"));
      return;
    }
    toast.success(t("success_restore"));
    await loadTrash();
  };

  if (!authLoading && !canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">{t("title_ged")}</h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/settings/ged">
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty_state")}</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((row) => (
            <Card key={row.id} className="glass-card">
              <CardContent className="p-5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold truncate">{row.name?.trim() || row.slug}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("archived_on", {
                      date: row.deleted_at
                        ? new Date(row.deleted_at).toLocaleString("fr-FR")
                        : "—",
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  className="gap-2 shrink-0"
                  onClick={() => void handleRestore(row.id)}
                >
                  <ArchiveRestore className="h-4 w-4" /> {t("restore_button")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
