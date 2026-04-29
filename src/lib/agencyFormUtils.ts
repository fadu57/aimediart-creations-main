/** Utilitaires formulaire agence — aligner les libellés si la table évolue. */

const READONLY_KEYS_INSERT = new Set(["created_at", "updated_at"]);

export function isReadonlyAgencyKey(key: string, mode: "create" | "edit"): boolean {
  if (mode === "edit" && key === "id") return true;
  if (READONLY_KEYS_INSERT.has(key)) return true;
  return false;
}

/** Ne pas envoyer à l’insert (générés côté base). */
export function skipKeyOnInsert(key: string): boolean {
  return READONLY_KEYS_INSERT.has(key);
}

export function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    id: "Identifiant (UUID)",
    name_agency: "Nom de l’agence",
    created_at: "Créé le",
    updated_at: "Modifié le",
    email: "E-mail",
    phone: "Téléphone",
    address: "Adresse",
    website: "Site web",
    description: "Description",
    logo_agency: "Logo de l’agence",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

/** Champ logo : upload → URL stockée dans `logo_agency`. */
export function isAgencyLogoField(key: string): boolean {
  return key === "logo_agency";
}

/** Ne pas afficher dans le formulaire (UUID généré à la création). */
export function isHiddenAgencyFormKey(key: string): boolean {
  return key === "id";
}

/** Ordre d’affichage : id, nom métier, puis le reste, timestamps en fin. */
export function sortAgencyFieldKeys(keys: string[]): string[] {
  const ts = keys.filter((k) => k.endsWith("_at")).sort();
  const rest = keys.filter((k) => !k.endsWith("_at"));
  const priority = ["id", "name_agency", "logo_agency"];
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
  if ((key.includes("json") || key.includes("metadata") || key.includes("data")) && (t.startsWith("{") || t.startsWith("["))) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return t;
    }
  }
  return t;
}
