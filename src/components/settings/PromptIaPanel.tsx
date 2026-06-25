import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { isImageAnalysisPromptStyleRow } from "@/lib/inferPromptStyleKey";
import AppSettingsRawEditor from "@/components/settings/AppSettingsRawEditor";

type PromptStyleRow = PromptStyleLabelFields & {
  id: string | number;
  icon?: string | null;
  style_rules?: string | null;
  system_instruction?: string | null;
  max_tokens?: number | null;
};

type PromptStyleForm = {
  name_fr: string;
  name_en: string;
  name_de: string;
  name_es: string;
  name_it: string;
  icon: string;
  style_rules: string;
  system_instruction: string;
  max_tokens: string;
};

const PROMPT_STYLE_SETTINGS_SELECT =
  "id, name_fr, name_en, name_de, name_es, name_it, icon, style_rules, system_instruction, max_tokens";

/** Clés `app_settings` liées à l'analyse d'image (prompts). */
const IMAGE_ANALYSIS_KEYS = ["Analyse de l'image", "analysis_prompt"];

async function fetchPromptStyles() {
  let res = await supabase.from("prompt_style").select(PROMPT_STYLE_SETTINGS_SELECT).order("id", { ascending: true });
  if (res.error) {
    res = await supabase.from("prompt_style").select("*").order("id", { ascending: true });
  }
  return res;
}

/** Panneau « Prompts IA » : prompt d'analyse d'image + personas (prompt_style). */
export function PromptIaPanel() {
  const { t, i18n } = useTranslation("settings");

  const [promptStyleRows, setPromptStyleRows] = useState<PromptStyleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [editingPromptRow, setEditingPromptRow] = useState<PromptStyleRow | null>(null);
  const [editingPromptForm, setEditingPromptForm] = useState<PromptStyleForm>({
    name_fr: "", name_en: "", name_de: "", name_es: "", name_it: "",
    icon: "", style_rules: "", system_instruction: "", max_tokens: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadStyles = async () => {
    const res = await fetchPromptStyles();
    if (res.error) throw res.error;
    setPromptStyleRows((res.data as PromptStyleRow[] | null) ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await loadStyles();
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t("prompts_load_error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPromptStyleEditor = (row: PromptStyleRow) => {
    setEditingPromptRow(row);
    setEditingPromptForm({
      name_fr: row.name_fr ?? "",
      name_en: row.name_en ?? "",
      name_de: row.name_de ?? "",
      name_es: row.name_es ?? "",
      name_it: row.name_it ?? "",
      icon: row.icon ?? "",
      style_rules: row.style_rules ?? "",
      system_instruction: row.system_instruction ?? "",
      max_tokens: row.max_tokens == null ? "" : String(row.max_tokens),
    });
    setEditError(null);
    setEditPromptOpen(true);
  };

  const savePromptStyleEdit = async () => {
    if (!editingPromptRow) return;
    const id = editingPromptRow.id;
    const trimmedTokens = editingPromptForm.max_tokens.trim();
    const parsedTokens = trimmedTokens === "" ? null : Number.isFinite(Number(trimmedTokens)) ? Number(trimmedTokens) : NaN;
    if (Number.isNaN(parsedTokens)) {
      setEditError(t("settings_error_max_tokens_invalid"));
      return;
    }
    const payload = {
      name_fr: editingPromptForm.name_fr.trim() || null,
      name_en: editingPromptForm.name_en.trim() || null,
      name_de: editingPromptForm.name_de.trim() || null,
      name_es: editingPromptForm.name_es.trim() || null,
      name_it: editingPromptForm.name_it.trim() || null,
      icon: editingPromptForm.icon.trim() || null,
      style_rules: editingPromptForm.style_rules.trim() || null,
      system_instruction: editingPromptForm.system_instruction.trim() || null,
      max_tokens: parsedTokens,
    };
    setSavingEdit(true);
    setEditError(null);
    const { error } = await supabase.from("prompt_style").update(payload).eq("id", id);
    setSavingEdit(false);
    if (error) {
      setEditError(error.message || t("settings_error_modification"));
      return;
    }
    setEditPromptOpen(false);
    setEditingPromptRow(null);
    await loadStyles();
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t("settings_loading")}</p>;
  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;

  const mediationStyles = promptStyleRows.filter((row) => !isImageAnalysisPromptStyleRow(row));

  return (
    <div className="space-y-4">
      <AppSettingsRawEditor keys={IMAGE_ANALYSIS_KEYS} hint={t("settings_app_settings_image_analysis_hint")} />

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none">
        <p className="mb-2 text-xs text-muted-foreground">{t("settings_prompt_style_mediation_hint")}</p>
        {mediationStyles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings_no_rows")}</p>
        ) : (
          <div className="overflow-x-auto rounded border border-border/50 bg-background">
            <table className="min-w-full text-xs">
              <tbody>
                {mediationStyles.map((row) => (
                  <tr key={`prompt-style-${row.id}`} className="align-top">
                    <td className="border-b border-border/40 px-2 py-1.5">{getStyleLabelFromDb(row, i18n.language) || t("dash_emdash")}</td>
                    <td className="border-b border-border/40 px-2 py-1.5">{row.icon || t("dash_emdash")}</td>
                    <td className="border-b border-border/40 px-2 py-1.5 whitespace-pre-wrap">{row.system_instruction || t("dash_emdash")}</td>
                    <td className="border-b border-border/40 px-2 py-1.5 whitespace-pre-wrap">{row.style_rules || t("dash_emdash")}</td>
                    <td className="border-b border-border/40 px-2 py-1.5">{row.max_tokens ?? t("dash_emdash")}</td>
                    <td className="border-b border-border/40 px-2 py-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={() => openPromptStyleEditor(row)}>
                        {t("settings_btn_modify")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={editPromptOpen} onOpenChange={setEditPromptOpen}>
        <DialogContent className="max-w-2xl shadow-none">
          <DialogHeader>
            <DialogTitle>{t("settings_dialog_prompt_title")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name_fr", "settings_field_name_fr", "edit-prompt-style-name-fr"],
                  ["name_en", "settings_field_name_en", "edit-prompt-style-name-en"],
                  ["name_de", "settings_field_name_de", "edit-prompt-style-name-de"],
                  ["name_es", "settings_field_name_es", "edit-prompt-style-name-es"],
                  ["name_it", "settings_field_name_it", "edit-prompt-style-name-it"],
                ] as const
              ).map(([field, labelKey, inputId]) => (
                <div key={field} className="space-y-1 sm:col-span-1">
                  <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground">{t(labelKey)}</label>
                  <Input
                    id={inputId}
                    name={`prompt_style_${field}`}
                    value={editingPromptForm[field]}
                    onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="w-[618px] max-w-full space-y-1">
              <label htmlFor="edit-prompt-style-style_rules" className="text-xs font-semibold text-muted-foreground">{t("settings_field_style_rules")}</label>
              <Textarea
                id="edit-prompt-style-style_rules"
                name="prompt_style_style_rules"
                value={editingPromptForm.style_rules}
                onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, style_rules: e.target.value }))}
                className="min-h-[90px] w-full"
              />
            </div>
            <div className="w-[618px] max-w-full space-y-1">
              <label htmlFor="edit-prompt-style-system_instruction" className="text-xs font-semibold text-muted-foreground">{t("settings_field_system_instruction")}</label>
              <Textarea
                id="edit-prompt-style-system_instruction"
                name="prompt_style_system_instruction"
                value={editingPromptForm.system_instruction}
                onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, system_instruction: e.target.value }))}
                className="min-h-[90px] w-full"
              />
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <div className="w-[160px] space-y-1">
                <label htmlFor="edit-prompt-style-max_tokens" className="text-xs font-semibold text-muted-foreground">{t("settings_field_max_tokens")}</label>
                <Input
                  id="edit-prompt-style-max_tokens"
                  name="prompt_style_max_tokens"
                  value={editingPromptForm.max_tokens}
                  onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, max_tokens: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="w-[100px] space-y-1">
                <label htmlFor="edit-prompt-style-icon" className="text-xs font-semibold text-muted-foreground">{t("settings_field_icon")}</label>
                <Input
                  id="edit-prompt-style-icon"
                  name="prompt_style_icon"
                  value={editingPromptForm.icon}
                  onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, icon: e.target.value }))}
                  className="w-[100px]"
                />
              </div>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditPromptOpen(false)}>{t("settings_btn_cancel")}</Button>
            <Button type="button" onClick={() => void savePromptStyleEdit()} disabled={savingEdit}>
              {savingEdit ? t("settings_btn_saving") : t("settings_btn_validate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PromptIaPanel;
