import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetentionSetting {
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

type DirtyMap = Record<number, Partial<RetentionSetting>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function retentionBadgeClass(days: number): string {
  if (days >= 60) return "bg-green-100 text-green-800 border-green-300";
  if (days >= 30) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-red-100 text-red-800 border-red-300";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RetentionSettingsProps {
  /** Appelant : role_id résolu depuis useAuthUser */
  roleId: number | null | undefined;
}

export default function RetentionSettings({ roleId }: RetentionSettingsProps) {
  const canAccess = roleId === 1 || roleId === 2 || roleId === 3;

  const [rows, setRows] = useState<RetentionSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  /** dirty[id] contient les champs modifiés non encore sauvegardés */
  const [dirty, setDirty] = useState<DirtyMap>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  // -------------------------------------------------------------------------
  // Chargement initial
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("retention_settings")
        .select("*")
        .order("entity", { ascending: true });
      if (cancelled) return;
      if (error) {
        setUnavailable(true);
      } else {
        setRows((data as RetentionSetting[] | null) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canAccess]);

  if (!canAccess) return null;

  // -------------------------------------------------------------------------
  // Helpers dirty state
  // -------------------------------------------------------------------------

  /** Valeur courante : fusionner dirty par-dessus la ligne d'origine */
  function current(row: RetentionSetting): RetentionSetting {
    return { ...row, ...(dirty[row.id] ?? {}) };
  }

  function isDirty(id: number): boolean {
    return Object.keys(dirty[id] ?? {}).length > 0;
  }

  function patch<K extends keyof RetentionSetting>(id: number, key: K, value: RetentionSetting[K]) {
    setDirty((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [key]: value },
    }));
  }

  // -------------------------------------------------------------------------
  // Sauvegarde individuelle
  // -------------------------------------------------------------------------
  const saveRow = async (row: RetentionSetting) => {
    const changes = dirty[row.id];
    if (!changes || Object.keys(changes).length === 0) return;

    const { data: me } = await supabase.auth.getUser();
    const userId = me.user?.id ?? null;

    setSaving((prev) => ({ ...prev, [row.id]: true }));
    try {
      const payload: Partial<RetentionSetting> & { updated_at: string; updated_by: string | null } = {
        ...changes,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      };

      const { error } = await supabase
        .from("retention_settings")
        .update(payload)
        .eq("id", row.id);

      if (error) throw error;

      // Mettre à jour la ligne locale
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, ...changes, updated_at: payload.updated_at, updated_by: userId }
            : r,
        ),
      );
      // Effacer dirty pour cet id
      setDirty((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });

      toast.success(`Rétention "${row.entity}" enregistrée.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur lors de la sauvegarde.";
      toast.error(msg);
    } finally {
      setSaving((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  // -------------------------------------------------------------------------
  // Résumé
  // -------------------------------------------------------------------------
  const totalActive = rows.filter((r) => current(r).auto_purge).length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Chargement…</p>;
  }

  if (unavailable || rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Paramètres de rétention non disponibles.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{rows.length} entité{rows.length > 1 ? "s" : ""} configurée{rows.length > 1 ? "s" : ""}</span>
        {" — "}purge automatique active sur{" "}
        <span className="font-medium text-foreground">{totalActive}</span>
      </p>

      {/* Une carte par entité */}
      <div className="space-y-3">
        {rows.map((row) => {
          const c = current(row);
          const d = isDirty(row.id);
          const isSaving = saving[row.id] ?? false;

          return (
            <div
              key={row.id}
              className={`rounded-md border p-4 space-y-3 shadow-none transition-colors ${
                d
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 bg-muted/20"
              }`}
            >
              {/* En-tête */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{c.entity}</span>
                  <code className="text-[10px] text-muted-foreground bg-muted rounded px-1">{c.table_name}</code>
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${retentionBadgeClass(c.retention_days)}`}
                  >
                    {c.retention_days}j
                  </span>
                  {d && (
                    <span className="text-[10px] text-primary font-medium italic">
                      • modifié
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!d || isSaving}
                  onClick={() => void saveRow(row)}
                  className="gap-1.5 h-7 text-xs"
                >
                  <Save className="h-3 w-3" />
                  {isSaving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>

              {/* Grille de champs */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

                {/* Durée de conservation */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Durée de conservation (jours)
                  </label>
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

                {/* Notifier avant (jours) */}
                <div className="space-y-1">
                  <label className={`text-xs font-medium ${!c.auto_purge ? "text-muted-foreground/50" : ""}`}>
                    Notifier avant (jours)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!c.auto_purge}
                    value={c.notify_before_days ?? ""}
                    onChange={(e) =>
                      patch(row.id, "notify_before_days", e.target.value === "" ? null : Math.min(30, Math.max(1, Number(e.target.value))))
                    }
                    className="h-8 text-sm shadow-none disabled:opacity-40"
                  />
                </div>

                {/* Email de notification */}
                <div className="space-y-1">
                  <label className={`text-xs font-medium ${!c.auto_purge ? "text-muted-foreground/50" : ""}`}>
                    Email de notification
                  </label>
                  <Input
                    type="email"
                    disabled={!c.auto_purge}
                    value={c.notify_email ?? ""}
                    onChange={(e) =>
                      patch(row.id, "notify_email", e.target.value.trim() || null)
                    }
                    placeholder="admin@exemple.com"
                    className="h-8 text-sm shadow-none disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Switch
                    checked={c.auto_purge}
                    onCheckedChange={(v) => patch(row.id, "auto_purge", v)}
                  />
                  <span className="text-xs font-medium">Purge automatique</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Switch
                    checked={c.archive_before_purge}
                    onCheckedChange={(v) => patch(row.id, "archive_before_purge", v)}
                  />
                  <span className="text-xs font-medium">Archiver avant suppression</span>
                </label>
              </div>

              {/* Dernière mise à jour (lecture seule) */}
              <p className="text-[11px] text-muted-foreground">
                Dernière modif. : {formatDate(c.updated_at)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
