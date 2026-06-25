import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Info, Save, SlidersHorizontal } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { invalidateRetentionCache } from "@/hooks/useRetentionSettings";
import { cn } from "@/lib/utils";

interface RetentionRow {
  id: number;
  entity: string;
  table_name: string;
  retention_days: number;
  auto_purge: boolean;
  archive_before_purge: boolean;
  notify_before_days: number | null;
  notify_email: string | null;
  updated_at: string;
  updated_by: string | null;
}

type DirtyMap = Record<number, Partial<RetentionRow>>;

function retentionBadgeClass(days: number): string {
  if (days >= 60) return "bg-green-100 text-green-800 border-green-300";
  if (days >= 30) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-red-100 text-red-800 border-red-300";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface RetentionSettingCardProps {
  /** Tables retention_settings à éditer (une ou plusieurs). */
  tableNames: string[];
  /** role_id résolu depuis useAuthUser. Édition réservée aux niveaux 1-3. */
  roleId: number | null | undefined;
}

/**
 * En-tête éditable de rétention pour une page Corbeille.
 * Remplace l'ancien bandeau d'information : permet aux admins (rôles 1-3)
 * de régler la durée de conservation et la purge directement depuis la corbeille.
 */
export default function RetentionSettingCard({ tableNames, roleId }: RetentionSettingCardProps) {
  const canEdit = roleId === 1 || roleId === 2 || roleId === 3;

  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<DirtyMap>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [open, setOpen] = useState(false);

  // Stabilise la dépendance du useEffect (tableau de tables).
  const tablesKey = tableNames.join(",");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("retention_settings")
        .select("*")
        .in("table_name", tablesKey.split(","))
        .order("entity", { ascending: true });
      if (cancelled) return;
      if (!error) setRows((data as RetentionRow[] | null) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tablesKey]);

  if (loading || rows.length === 0) return null;

  const current = (row: RetentionRow): RetentionRow => ({ ...row, ...(dirty[row.id] ?? {}) });
  const isDirty = (id: number) => Object.keys(dirty[id] ?? {}).length > 0;
  const patch = <K extends keyof RetentionRow>(id: number, key: K, value: RetentionRow[K]) =>
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }));

  const saveRow = async (row: RetentionRow) => {
    const changes = dirty[row.id];
    if (!changes || Object.keys(changes).length === 0) return;
    const { data: me } = await supabase.auth.getUser();
    const userId = me.user?.id ?? null;
    setSaving((prev) => ({ ...prev, [row.id]: true }));
    try {
      const payload = { ...changes, updated_at: new Date().toISOString(), updated_by: userId };
      const { error } = await supabase.from("retention_settings").update(payload).eq("id", row.id);
      if (error) throw error;
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, ...changes, updated_at: payload.updated_at, updated_by: userId } : r)),
      );
      setDirty((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      invalidateRetentionCache();
      toast.success(`Rétention « ${row.entity} » enregistrée.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la sauvegarde.");
    } finally {
      setSaving((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  // --- Lecture seule (non-admin) : bandeau d'information simple ---
  if (!canEdit) {
    return (
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {row.auto_purge ? (
                <>Les fiches sont conservées <strong>{row.retention_days} jours</strong> après archivage. La purge automatique s'exécute chaque nuit à 2h.</>
              ) : (
                "La purge automatique est désactivée pour cette entité."
              )}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // --- Édition (admin) : carte repliable ---
  return (
    <div className="rounded-md border border-border/60 bg-white/90 text-foreground shadow-none">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
          Paramètres de rétention
        </span>
        <span className="flex items-center gap-2">
          {rows.map((row) => {
            const c = current(row);
            return (
              <span
                key={`badge-${row.id}`}
                className={cn(
                  "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
                  retentionBadgeClass(c.retention_days),
                )}
              >
                {c.retention_days}j{c.auto_purge ? "" : " · purge off"}
              </span>
            );
          })}
          <ChevronDown className={cn("h-4 w-4 opacity-70 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/50 p-4">
          {rows.map((row) => {
            const c = current(row);
            const d = isDirty(row.id);
            const isSaving = saving[row.id] ?? false;
            return (
              <div
                key={row.id}
                className={cn(
                  "space-y-3 rounded-md border p-4 shadow-none transition-colors",
                  d ? "border-primary/50 bg-primary/5" : "border-border/60 bg-background",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.entity}</span>
                    <code className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{c.table_name}</code>
                    {d && <span className="text-[10px] font-medium italic text-primary">• modifié</span>}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!d || isSaving}
                    onClick={() => void saveRow(row)}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Save className="h-3 w-3" />
                    {isSaving ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Durée de conservation (jours)</label>
                    <Input
                      type="number"
                      min={7}
                      max={365}
                      value={c.retention_days}
                      onChange={(e) =>
                        patch(row.id, "retention_days", Math.min(365, Math.max(7, Number(e.target.value) || 7)))
                      }
                      className="h-8 text-sm shadow-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn("text-xs font-medium", !c.auto_purge && "text-muted-foreground/50")}>
                      Notifier avant (jours)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      disabled={!c.auto_purge}
                      value={c.notify_before_days ?? ""}
                      onChange={(e) =>
                        patch(
                          row.id,
                          "notify_before_days",
                          e.target.value === "" ? null : Math.min(30, Math.max(1, Number(e.target.value))),
                        )
                      }
                      className="h-8 text-sm shadow-none disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn("text-xs font-medium", !c.auto_purge && "text-muted-foreground/50")}>
                      Email de notification
                    </label>
                    <Input
                      type="email"
                      disabled={!c.auto_purge}
                      value={c.notify_email ?? ""}
                      onChange={(e) => patch(row.id, "notify_email", e.target.value.trim() || null)}
                      placeholder="admin@exemple.com"
                      className="h-8 text-sm shadow-none disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-5 pt-1">
                  <label className="flex cursor-pointer select-none items-center gap-2">
                    <Switch checked={c.auto_purge} onCheckedChange={(v) => patch(row.id, "auto_purge", v)} />
                    <span className="text-xs font-medium">Purge automatique</span>
                  </label>
                  <label className="flex cursor-pointer select-none items-center gap-2">
                    <Switch
                      checked={c.archive_before_purge}
                      onCheckedChange={(v) => patch(row.id, "archive_before_purge", v)}
                    />
                    <span className="text-xs font-medium">Archiver avant suppression</span>
                  </label>
                </div>

                <p className="text-[11px] text-muted-foreground">Dernière modif. : {formatDate(c.updated_at)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
