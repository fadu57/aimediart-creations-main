import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useRetentionSettings } from "@/hooks/useRetentionSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RetentionBadge from "@/components/settings/RetentionBadge";
import RetentionSettingCard from "@/components/settings/RetentionSettingCard";

type VisitorTrashRow = {
  id: string;
  source: "visitors" | "profiles";
  first_name?: string | null;
  last_name?: string | null;
  pseudo?: string | null;
  expo_id?: string | null;
  deleted_at?: string | null;
};

export default function VisiteursCorbeille() {
  const { t } = useTranslation("trash");
  const { loading: authLoading, role_id: currentRoleId, agency_id: currentAgencyId } = useAuthUser();
  const canAccess = typeof currentRoleId === "number" && currentRoleId >= 1 && currentRoleId <= 4;
  const canRestore = typeof currentRoleId === "number" && currentRoleId < 4;

  const { retention } = useRetentionSettings();
  const retentionVisitors = retention["visitors"];
  const retentionProfiles = retention["profiles"];

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VisitorTrashRow[]>([]);
  const [expoById, setExpoById] = useState<Map<string, string>>(new Map());

  const loadTrash = useCallback(async () => {
    setLoading(true);

    const [{ data: exposData }, { data: anonData, error: anonErr }, { data: agencyRows }] = await Promise.all([
      supabase.from("expos").select("id, expo_name"),
      supabase
        .from("visitors")
        .select("id, visitor_pseudo, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: true }),
      supabase.from("agency_users").select("user_id, agency_id").eq("role_id", 7),
    ]);

    if (anonErr) {
      toast.error(anonErr.message);
    }

    setExpoById(
      new Map(
        ((exposData ?? []) as Array<{ id: string; expo_name?: string | null }>).map((e) => [
          e.id,
          e.expo_name?.trim() || e.id,
        ]),
      ),
    );

    const agencyByUser = new Map(
      ((agencyRows ?? []) as Array<{ user_id?: string | null; agency_id?: string | null }>)
        .filter((r) => r.user_id)
        .map((r) => [String(r.user_id), r.agency_id?.trim() || null]),
    );

    let visitorUserIds = [...agencyByUser.keys()];
    if (currentRoleId === 4 && currentAgencyId) {
      const agency = currentAgencyId.trim();
      visitorUserIds = visitorUserIds.filter((id) => agencyByUser.get(id) === agency);
    }

    let profileRows: VisitorTrashRow[] = [];
    if (visitorUserIds.length > 0) {
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, username, deleted_at")
        .in("id", visitorUserIds)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: true });

      if (profileErr) {
        toast.error(profileErr.message);
      } else {
        profileRows = ((profileData ?? []) as Array<{
          id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          deleted_at?: string | null;
        }>).map((p) => ({
          id: String(p.id ?? ""),
          source: "profiles" as const,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          pseudo: p.username ?? null,
          deleted_at: p.deleted_at ?? null,
        })).filter((r) => r.id);
      }
    }

    const anonTrash: VisitorTrashRow[] = ((anonData ?? []) as Array<{
      id?: string | null;
      visitor_pseudo?: string | null;
      deleted_at?: string | null;
    }>).map((v) => ({
      id: String(v.id ?? ""),
      source: "visitors" as const,
      first_name: t("anonymous"),
      last_name: null,
      pseudo: v.visitor_pseudo?.trim() || null,
      deleted_at: v.deleted_at ?? null,
    })).filter((r) => r.id);

    const merged = [...profileRows, ...anonTrash].sort((a, b) => {
      const da = a.deleted_at ? new Date(a.deleted_at).getTime() : 0;
      const db = b.deleted_at ? new Date(b.deleted_at).getTime() : 0;
      return da - db;
    });

    setRows(merged);
    setLoading(false);
  }, [currentRoleId, currentAgencyId, t]);

  useEffect(() => {
    if (!canAccess) return;
    void loadTrash();
  }, [canAccess, loadTrash]);

  const handleRestore = async (row: VisitorTrashRow) => {
    if (!canRestore) return;
    const table = row.source === "visitors" ? "visitors" : "profiles";
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: null })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message || t("error_restore"));
      return;
    }
    toast.success(t("success_restore"));
    await loadTrash();
  };

  if (authLoading) {
    return <p className="text-sm text-muted-foreground px-6 py-8">{t("loading")}</p>;
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold">{t("title_visitors")}</h2>
          <p className="text-muted-foreground">{t("subtitle_visitors")}</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/expos/visitors">
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Link>
        </Button>
      </div>

      {/* Paramètres de rétention (édition admin) */}
      <RetentionSettingCard tableNames={["visitors", "profiles"]} roleId={currentRoleId} />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty_state")}</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((row) => {
            const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.pseudo?.trim() || row.id;
            const retentionEntry = row.source === "visitors" ? retentionVisitors : retentionProfiles;
            const expo = row.expo_id ? expoById.get(row.expo_id) : null;
            return (
              <Card key={`${row.source}-${row.id}`} className="glass-card">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold truncate">{name}</p>
                    {row.pseudo && row.pseudo !== name ? (
                      <p className="text-xs text-muted-foreground truncate">@{row.pseudo}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {row.source === "visitors" ? t("visitor_anonymous_label") : t("visitor_registered_label")}
                      {expo ? ` · ${expo}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("archived_on", { date: row.deleted_at ? new Date(row.deleted_at).toLocaleString("fr-FR") : "—" })}
                    </p>
                    <RetentionBadge
                      deleted_at={row.deleted_at}
                      retention_days={retentionEntry?.retention_days}
                      auto_purge={retentionEntry?.auto_purge}
                    />
                  </div>
                  {canRestore ? (
                    <Button type="button" className="gap-2 shrink-0" onClick={() => void handleRestore(row)}>
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
