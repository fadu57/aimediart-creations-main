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

const NAME_LOCALE_ORDER: (keyof PromptStyleLabelFields)[] = [
  "name_fr",
  "name_en",
  "name_de",
  "name_es",
  "name_it",
];

/**
 * Libellé affiché depuis `prompt_style`, aligné sur les colonnes Supabase.
 *
 * Ordre :
 *   1. `name_<lang>` (ex. `name_en` pour lang="en")
 *   2. autres `name_*` dans l’ordre fr → en → de → es → it (sans redonder la colonne déjà testée)
 *   3. `name` (colonne historique)
 *   4. `id` en string
 */
export function getStyleLabelFromDb(style: PromptStyleLabelFields, currentLang: string): string {
  const lang = currentLang.split("-")[0].toLowerCase();
  const tryCol = (key: keyof PromptStyleLabelFields): string | null => {
    const v = style[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const primaryKey = `name_${lang}` as keyof PromptStyleLabelFields;
  const primary = tryCol(primaryKey);
  if (primary) return primary;

  for (const k of NAME_LOCALE_ORDER) {
    if (k === primaryKey) continue;
    const v = tryCol(k);
    if (v) return v;
  }

  const legacy = tryCol("name");
  if (legacy) return legacy;

  return style.id != null ? String(style.id) : "";
}
