import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import {
  approxMaxCharsFromOutputTokens,
  approxOutputTokensFromMaxChars,
  clampGeminiOutputTokens,
} from "@/lib/charsToOutputTokens";

type AppSettingRow = { [key: string]: unknown };

/** Clés `app_settings` avec plafond caractères / tokens (popup Modifier). */
const APP_SETTINGS_MAX_LENGTH_KEYS = new Set(["Analyse de l'image", "analysis_prompt"]);

interface AppSettingsRawEditorProps {
  /** Clés `app_settings` à afficher / éditer dans ce bloc. */
  keys: string[];
  /** Texte d'aide affiché au-dessus du tableau (optionnel). */
  hint?: string;
  /** Appelé après un enregistrement réussi (ex. resynchroniser un panneau parent). */
  onSaved?: () => void | Promise<void>;
}

/**
 * Éditeur brut de lignes `app_settings` (clé/valeur), filtré sur une liste de clés.
 * Réutilisé par la page Prompts IA (analyse image) et Contrôle IA (cache modèles).
 */
export default function AppSettingsRawEditor({ keys, hint, onSaved }: AppSettingsRawEditorProps) {
  const { t } = useTranslation("settings");

  const [rows, setRows] = useState<AppSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AppSettingRow | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const keysCsv = keys.join("|");

  const loadData = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value, max_caract, max_tokens")
      .in("key", keysCsv.split("|"))
      .order("key", { ascending: true });
    if (error) throw error;
    setRows((data as AppSettingRow[] | null) ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await loadData();
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t("prompts_load_error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysCsv]);

  const columns = useMemo(() => {
    const cols = new Set<string>();
    for (const row of rows) for (const k of Object.keys(row)) cols.add(k);
    return Array.from(cols).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const openEditor = (row: AppSettingRow) => {
    setEditingRow(row);
    const r = row as Record<string, unknown>;
    const rawMt = r["max_tokens"];
    const rawMc = r["max_caract"];
    let maxTokensStr = "";
    if (rawMt != null && rawMt !== "" && Number.isFinite(Number(rawMt))) {
      maxTokensStr = String(Number(rawMt));
    } else if (rawMc != null && rawMc !== "" && Number.isFinite(Number(rawMc))) {
      maxTokensStr = String(approxOutputTokensFromMaxChars(Number(rawMc)));
    }
    setEditForm({ value: row.value == null ? "" : String(row.value), max_tokens: maxTokensStr });
    setEditError(null);
    setEditOpen(true);
  };

  const castEditedValue = (original: unknown, nextText: string): unknown => {
    if (original == null) return nextText;
    if (typeof original === "number") {
      const n = Number(nextText);
      return Number.isFinite(n) ? n : original;
    }
    if (typeof original === "boolean") return nextText.trim().toLowerCase() === "true";
    return nextText;
  };

  const saveEdit = async () => {
    if (!editingRow) return;
    const keyValue = String(editingRow.key ?? "").trim();
    if (!keyValue) {
      setEditError(t("settings_error_key_missing"));
      return;
    }
    const payload: Record<string, unknown> = { value: castEditedValue(editingRow.value, editForm.value ?? "") };
    if (APP_SETTINGS_MAX_LENGTH_KEYS.has(keyValue)) {
      const rawMt = (editForm.max_tokens ?? "").trim();
      if (rawMt === "") {
        payload.max_caract = null;
        payload.max_tokens = null;
      } else {
        const n = Number(rawMt);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          setEditError(t("settings_error_max_tokens_invalid"));
          return;
        }
        const tokens = clampGeminiOutputTokens(n);
        payload.max_tokens = tokens;
        payload.max_caract = approxMaxCharsFromOutputTokens(tokens);
      }
    }
    setSaving(true);
    setEditError(null);
    const { error } = await supabase.from("app_settings").update(payload).eq("key", keyValue);
    setSaving(false);
    if (error) {
      setEditError(error.message || t("settings_error_modification"));
      return;
    }
    setEditOpen(false);
    setEditingRow(null);
    await loadData();
    if (onSaved) await onSaved();
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t("settings_loading")}</p>;
  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none">
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("settings_no_rows")}</p>
      ) : (
        <div className="overflow-x-auto rounded border border-border/50 bg-background">
          <table className="min-w-full text-xs">
            <tbody>
              {rows.map((row, index) => (
                <tr key={`app-setting-${index}`} className="align-top">
                  {columns.map((col) => (
                    <td key={`app-setting-${index}-${col}`} className="border-b border-border/40 px-2 py-1.5">
                      {row[col] == null ? t("dash_emdash") : String(row[col])}
                    </td>
                  ))}
                  <td className="border-b border-border/40 px-2 py-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEditor(row)}>
                      {t("settings_btn_modify")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl shadow-none" aria-describedby={undefined} hideCloseButton>
          <DialogHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <DialogTitle className="text-left font-serif text-lg leading-snug sm:pr-4">
              {t("settings_dialog_app_title", { key: editingRow ? String(editingRow.key ?? "") : "" })}
            </DialogTitle>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>{t("settings_btn_cancel")}</Button>
              <Button type="button" onClick={() => void saveEdit()} disabled={saving}>
                {saving ? t("settings_btn_saving") : t("settings_btn_validate")}
              </Button>
            </div>
          </DialogHeader>
          {editingRow && APP_SETTINGS_MAX_LENGTH_KEYS.has(String((editingRow as Record<string, unknown>).key ?? "").trim()) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="raw-app-settings-max-tokens" className="text-sm font-medium">{t("settings_field_max_tokens")}</label>
                <Input
                  id="raw-app-settings-max-tokens"
                  name="app_settings_max_tokens"
                  type="number" min={256} max={4096} step={1} inputMode="numeric"
                  placeholder={t("edit_max_tokens_placeholder")}
                  value={editForm.max_tokens ?? ""}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, max_tokens: e.target.value }))}
                  className="shadow-none"
                />
                <p className="text-[11px] text-muted-foreground">{t("settings_max_tokens_help")}</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="raw-app-settings-max-caract" className="text-sm font-medium">{t("settings_max_caract_label")}</label>
                <Input
                  id="raw-app-settings-max-caract"
                  name="app_settings_max_caract"
                  type="number" readOnly tabIndex={-1} aria-readonly="true"
                  value={(() => {
                    const raw = (editForm.max_tokens ?? "").trim();
                    if (raw === "") return "";
                    const n = Number(raw);
                    if (!Number.isFinite(n) || n <= 0) return "";
                    return String(approxMaxCharsFromOutputTokens(clampGeminiOutputTokens(n)));
                  })()}
                  className="cursor-default bg-muted/50 shadow-none"
                />
                <p className="text-[11px] text-muted-foreground">{t("settings_max_caract_help")}</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Textarea
              id="raw-app-settings-value"
              name="app_settings_value"
              value={editForm.value ?? ""}
              onChange={(e) => setEditForm((prev) => ({ ...prev, value: e.target.value }))}
              className="min-h-[250px] w-full resize-y shadow-none"
              aria-label={t("settings_aria_value", { key: editingRow ? String(editingRow.key ?? "") : "" })}
            />
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
