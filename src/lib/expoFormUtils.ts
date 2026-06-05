/** Formulaire exposition : colonnes `*_id` exclues (liaisons gérées ailleurs). */

const READONLY_KEYS_INSERT = new Set(["updated_at"]);

/** Champs masqués dans le formulaire (techniques, redondants ou gérés par pickers dédiés). */
const HIDDEN_EXPO_KEYS = new Set([
  "id",
  "logo2_expo",
  "ref_expo",
  "deleted_at",
  "created_at",
  // Curator : remplacé par le picker user
  "curator",
  "curator_name",
  "curator_firstname",
  "email_ref_expo",
  "curator_email",
  // Horaires : géré par ExpoHorairesEditor
  "expo_horaires",
]);

/** Colonnes affichées / éditables (hors clés étrangères `*_id`). */
export function isExpoFormColumn(key: string): boolean {
  return !key.endsWith("_id");
}

export function filterExpoFormKeys(keys: string[]): string[] {
  return keys.filter((k) => isExpoFormColumn(k) && !HIDDEN_EXPO_KEYS.has(k));
}

export function isReadonlyExpoKey(key: string, mode: "create" | "edit"): boolean {
  if (mode === "edit" && key === "id") return true;
  if (READONLY_KEYS_INSERT.has(key)) return true;
  return false;
}

export function skipKeyOnInsert(key: string): boolean {
  return READONLY_KEYS_INSERT.has(key);
}

export function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    id: "Identifiant (UUID)",
    expo_name: "Nom de l’exposition",
    logo_expo: "Logo de l’exposition",
    expo_logo: "Logo de l’exposition",
    created_at: "Créé le",
    updated_at: "Modifié le",
    description: "Description",
    notes: "Notes",
    location: "Lieu",
    dates: "Dates",
    slug: "Slug",
    status: "Statut",
    curator: "Commissaire d'expo",
    curator_name: "Commissaire d'expo",
    expo_descript_i18n: "Descriptif expo",
    lieu_expo: "Lieu de l'exposition",
    adress_expo: "Adresse",
    zip_expo: "Code postal",
    city_expo: "Ville",
    date_expo_du: "Du",
    date_expo_au: "Au",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

/** Colonne URL du logo : même idée que `logo_agency` sur les agences. */
export function isExpoLogoField(key: string): boolean {
  const k = key.toLowerCase();
  return k === "logo_expo" || k === "expo_logo";
}

/** Ordre : id, noms connus, puis le reste, timestamps en fin. */
export function sortExpoFieldKeys(keys: string[]): string[] {
  const filtered = filterExpoFormKeys(keys);
  const ts = filtered.filter((k) => k.endsWith("_at")).sort();
  const rest = filtered.filter((k) => !k.endsWith("_at"));
  const priority = ["id", "expo_name", "logo_expo", "expo_logo"];
  const head = priority.filter((k) => rest.includes(k));
  const mid = rest.filter((k) => !priority.includes(k)).sort((a, b) => a.localeCompare(b, "fr"));
  return [...head, ...mid, ...ts];
}

export function valueToInputString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

export function parseInputForKey(key: string, raw: string): unknown {
  const t = raw.trim();
  if (t === "") return null;
  if (key.endsWith("_at")) return t;
  if ((key.includes("json") || key.includes("metadata") || key.includes("data") || key.endsWith("_i18n")) && (t.startsWith("{") || t.startsWith("["))) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return t;
    }
  }
  return t;
}
