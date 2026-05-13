/**
 * Champs `prompt_style` utilisés pour le libellé multilingue en UI.
 */
export type PromptStyleLabelFields = {
  id?: string | number;
  /** Ancien champ — dernier repli avant `id`. */
  name?: string | null;
  code?: string | null;
  name_fr?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  name_es?: string | null;
  name_it?: string | null;
};

/**
 * Libellé affiché depuis `prompt_style`, aligné sur les colonnes Supabase.
 *
 * Ordre :
 *   1. `name_<lang>` (ex. `name_en` pour lang="en")
 *   2. `name_fr` si la langue demandée est vide
 *   3. `name`
 *   4. `id` en string
 */
export function getStyleLabelFromDb(style: PromptStyleLabelFields, currentLang: string): string {
  const lang = currentLang.split("-")[0].toLowerCase();
  const col = `name_${lang}` as keyof PromptStyleLabelFields;
  const localized = style[col];
  if (typeof localized === "string" && localized.trim()) return localized.trim();

  if (style.name_fr?.trim()) return style.name_fr.trim();
  if (style.name?.trim()) return style.name.trim();
  return style.id != null ? String(style.id) : "";
}
