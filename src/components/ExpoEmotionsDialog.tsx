import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  countActiveEmotions,
  getEmotionDisplayLabel,
  loadEmotionCatalog,
  MAX_ACTIVE_EXPO_EMOTIONS,
  saveEmotionCatalogChanges,
  type ExpoEmotionCatalogRow,
} from "@/lib/expoEmotions";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PendingNewEmotion = {
  tempId: string;
  name_emotion: string;
  icone_emotion: string;
};

function buildActiveMap(rows: ExpoEmotionCatalogRow[]): Record<string, boolean> {
  return Object.fromEntries(rows.map((row) => [row.id, row.is_active]));
}

function isPendingId(id: string): boolean {
  return id.startsWith("pending-");
}

function createTempId(): string {
  return `pending-${crypto.randomUUID()}`;
}

export function ExpoEmotionsDialog({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation("expos");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ExpoEmotionCatalogRow[]>([]);
  const [pendingNew, setPendingNew] = useState<PendingNewEmotion[]>([]);
  const [initialActiveById, setInitialActiveById] = useState<Record<string, boolean>>({});
  const [draftActiveById, setDraftActiveById] = useState<Record<string, boolean>>({});
  const [newIcon, setNewIcon] = useState("");
  const [newName, setNewName] = useState("");
  const [newActive, setNewActive] = useState(false);

  const resetAddForm = () => {
    setNewIcon("");
    setNewName("");
    setNewActive(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPendingNew([]);
    resetAddForm();
    try {
      const catalog = await loadEmotionCatalog();
      const activeMap = buildActiveMap(catalog);
      setRows(catalog);
      setInitialActiveById(activeMap);
      setDraftActiveById(activeMap);
    } catch (e) {
      setRows([]);
      setInitialActiveById({});
      setDraftActiveById({});
      setError(e instanceof Error ? e.message : t("form.emotions.load_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const displayRows = useMemo((): ExpoEmotionCatalogRow[] => {
    const pendingRows: ExpoEmotionCatalogRow[] = pendingNew.map((pending) => ({
      id: pending.tempId,
      name_emotion: pending.name_emotion,
      Emotion_M: pending.name_emotion,
      Emotion_F: null,
      name_emotion_en: null,
      name_emotion_de: null,
      name_emotion_es: null,
      name_emotion_it: null,
      icone_emotion: pending.icone_emotion,
      is_active: Boolean(draftActiveById[pending.tempId]),
    }));
    return [...rows, ...pendingRows];
  }, [draftActiveById, pendingNew, rows]);

  const hasChanges = useMemo(() => {
    if (pendingNew.length > 0) return true;
    const ids = new Set([...Object.keys(initialActiveById), ...Object.keys(draftActiveById)]);
    for (const id of ids) {
      if (isPendingId(id)) continue;
      if (Boolean(initialActiveById[id]) !== Boolean(draftActiveById[id])) return true;
    }
    return false;
  }, [draftActiveById, initialActiveById, pendingNew.length]);

  const activeCount = countActiveEmotions(draftActiveById);
  const splitIndex = Math.ceil(displayRows.length / 2);
  const leftRows = displayRows.slice(0, splitIndex);
  const rightRows = displayRows.slice(splitIndex);

  const requestClose = () => {
    if (saving) return;
    onOpenChange(false);
  };

  const toggleEmotion = (id: string, checked: boolean) => {
    setDraftActiveById((prev) => {
      if (checked) {
        const currentActive = countActiveEmotions(prev);
        if (currentActive >= MAX_ACTIVE_EXPO_EMOTIONS && !prev[id]) {
          toast.error(t("form.emotions.max_active", { count: MAX_ACTIVE_EXPO_EMOTIONS }));
          return prev;
        }
        return { ...prev, [id]: true };
      }
      return { ...prev, [id]: false };
    });
  };

  const removePending = (tempId: string) => {
    setPendingNew((prev) => prev.filter((row) => row.tempId !== tempId));
    setDraftActiveById((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
  };

  const handleAddEmotion = () => {
    const name = newName.trim();
    const icon = newIcon.trim();
    if (!name) {
      toast.error(t("form.emotions.add_validation_name"));
      return;
    }
    if (!icon) {
      toast.error(t("form.emotions.add_validation_icon"));
      return;
    }

    if (newActive) {
      const currentActive = countActiveEmotions(draftActiveById);
      if (currentActive >= MAX_ACTIVE_EXPO_EMOTIONS) {
        toast.error(t("form.emotions.max_active", { count: MAX_ACTIVE_EXPO_EMOTIONS }));
        return;
      }
    }

    const tempId = createTempId();
    setPendingNew((prev) => [...prev, { tempId, name_emotion: name, icone_emotion: icon }]);
    setDraftActiveById((prev) => ({ ...prev, [tempId]: newActive }));
    resetAddForm();
  };

  const handleSave = async () => {
    const activeChanges = rows
      .filter((row) => Boolean(initialActiveById[row.id]) !== Boolean(draftActiveById[row.id]))
      .map((row) => ({ id: row.id, is_active: Boolean(draftActiveById[row.id]) }));

    const newEmotions = pendingNew.map((pending) => ({
      name_emotion: pending.name_emotion,
      Emotion_M: pending.name_emotion,
      icone_emotion: pending.icone_emotion,
      is_active: Boolean(draftActiveById[pending.tempId]),
    }));

    if (activeChanges.length === 0 && newEmotions.length === 0) return;

    setSaving(true);
    try {
      await saveEmotionCatalogChanges({ activeChanges, newEmotions });
      toast.success(t("form.emotions.save_success"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("form.emotions.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const renderColumn = (columnRows: ExpoEmotionCatalogRow[]) => (
    <ul className="space-y-2">
      {columnRows.map((row) => {
        const label = getEmotionDisplayLabel(row, i18n.language);
        const checked = Boolean(draftActiveById[row.id]);
        const pending = isPendingId(row.id);
        return (
          <li key={row.id}>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/40",
                pending ? "border-primary/40 bg-primary/5" : "border-border/60",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => toggleEmotion(row.id, value === true)}
                disabled={loading || saving}
                aria-label={label}
              />
              {row.icone_emotion ? (
                <span className="text-base leading-none" aria-hidden>
                  {row.icone_emotion}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 text-sm leading-snug">{label}</span>
              {pending ? (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {t("form.emotions.pending_badge")}
                </span>
              ) : null}
              {pending ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removePending(row.id);
                  }}
                  disabled={loading || saving}
                  aria-label={t("form.emotions.remove_pending")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </label>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent
        overlayClassName="z-[60]"
        className={cn(
          "z-[60] w-[calc(100vw-2rem)] max-h-[min(88dvh,100%)] max-w-3xl overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl",
        )}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t("form.emotions.title")}</DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="min-w-0 font-serif text-lg text-white sm:text-xl">{t("form.emotions.title")}</h2>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={saving}
                className="h-9 w-full px-3 text-sm border border-white/70 bg-transparent text-white hover:bg-white/10 sm:w-auto"
              >
                {t("form.close")}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => void handleSave()}
                disabled={saving || loading || !hasChanges}
                className={cn(
                  "h-9 w-full px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] sm:w-auto",
                  !hasChanges && "invisible pointer-events-none",
                )}
              >
                {saving ? t("form.saving") : t("form.save_changes")}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("form.emotions.summary_prefix", { count: MAX_ACTIVE_EXPO_EMOTIONS })}
            <span className="text-xs font-semibold">
              {t("form.emotions.summary_active", { count: activeCount, max: MAX_ACTIVE_EXPO_EMOTIONS })}
            </span>
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              {t("form.emotions.loading")}
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : displayRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("form.emotions.empty")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderColumn(leftRows)}
              {renderColumn(rightRows)}
            </div>
          )}

          <div className="border-t border-border/70 pt-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("form.emotions.add_section_title")}</h3>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1 sm:w-20">
                <label htmlFor="expo-emotion-icon" className="text-xs text-muted-foreground">
                  {t("form.emotions.add_icon_label")}
                </label>
                <Input
                  id="expo-emotion-icon"
                  value={newIcon}
                  onChange={(event) => setNewIcon(event.target.value)}
                  placeholder="😊"
                  maxLength={8}
                  disabled={loading || saving}
                  className="text-center text-lg"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor="expo-emotion-name" className="text-xs text-muted-foreground">
                  {t("form.emotions.add_name_label")}
                </label>
                <Input
                  id="expo-emotion-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={t("form.emotions.add_name_placeholder")}
                  disabled={loading || saving}
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox
                  checked={newActive}
                  onCheckedChange={(value) => setNewActive(value === true)}
                  disabled={loading || saving}
                  aria-label={t("form.emotions.add_active_label")}
                />
                <span>{t("form.emotions.add_active_label")}</span>
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddEmotion}
                disabled={loading || saving}
                className="h-9 shrink-0 gap-1.5 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                {t("form.emotions.add_button")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
