import { supabase } from "@/lib/supabase";
import { publicUrlForStorageObject } from "@/lib/storagePaths";

export const VISITOR_AVATARS_BUCKET = "avatars";

const SUPPORTED_LOCALES = ["fr", "en", "de", "es", "it"] as const;
type AvatarLocale = (typeof SUPPORTED_LOCALES)[number];

/** Colonnes réellement utilisées (pas image_path : chemin dérivé de Storage adjective_en + noun_en). */
const CATALOG_SELECT =
  "id, storage_bucket, adjective_en, noun_en, full_pseudo_fr, full_pseudo_en, full_pseudo_de, full_pseudo_es, full_pseudo_it";

const AVATAR_OBJECT_PATH_RE = /^[a-z0-9]+_[a-z0-9]+\.(jpg|png)$/i;
const CATALOG_PAGE_SIZE = 1000;
const STORAGE_LIST_PAGE_SIZE = 1000;

export type VisitorPoolAvatar = {
  id: string;
  /** Libellé affiché : full_pseudo_{locale} + 3 chiffres aléatoires (ex. ZèbrePoétique321) */
  pseudo: string;
  objectPath: string;
  imageUrl: string;
};

function normalizeLocale(locale: string): AvatarLocale {
  const code = (locale ?? "fr").trim().slice(0, 2).toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(code) ? (code as AvatarLocale) : "fr";
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Clé catalogue (sans extension) alignée sur Storage : adorable_tiger.jpg | .png */
function storageBaseKeyFromRow(row: Record<string, unknown>): string | null {
  const adj = normalizeToken(row.adjective_en);
  const noun = normalizeToken(row.noun_en);
  if (!adj || !noun) return null;
  return `${adj}_${noun}`;
}

function storageBaseKeyFromPath(path: string): string {
  return normalizeImagePath(path).replace(/\.(jpe?g|png|webp)$/i, "");
}

function normalizeImagePath(path: string): string {
  return path.replace(/^\/+/, "").toLowerCase();
}

/** Colonne full_pseudo_fr / full_pseudo_en / … (sans suffixe numérique). */
function pickFullPseudoBase(row: Record<string, unknown>, locale: string): string | null {
  const loc = normalizeLocale(locale);
  return pickString(row, `full_pseudo_${loc}`);
}

function randomThreeDigits(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

/** Pseudo visiteur affiché : base lexicale + 3 chiffres (ex. PoétiqueZèbre → PoétiqueZèbre321). */
export function buildVisitorDisplayPseudo(fullPseudoBase: string): string {
  const base = fullPseudoBase.trim().replace(/\s+/g, "");
  return base ? `${base}${randomThreeDigits()}` : randomThreeDigits();
}

/** Extrait le suffixe numérique (3 chiffres) d’un pseudo déjà attribué. */
export function extractPseudoNumericSuffix(pseudo: string): string {
  const match = pseudo.trim().match(/(\d{3})$/);
  return match?.[1] ?? "";
}

/** Reconstruit le pseudo affiché avec une base lexicale et un suffixe existant. */
export function buildVisitorDisplayPseudoWithSuffix(fullPseudoBase: string, suffix: string): string {
  const base = fullPseudoBase.trim().replace(/\s+/g, "");
  const digits = /^\d{3}$/.test(suffix) ? suffix : "";
  if (!base) return digits || pseudoFallbackOnlyDigits(digits);
  return `${base}${digits}`;
}

function pseudoFallbackOnlyDigits(digits: string): string {
  return digits || randomThreeDigits();
}

/**
 * Adapte le pseudo stocké à la locale UI via avatar_object_path + catalogue public.avatars.
 * Conserve le suffixe numérique (ex. GorilleCoquin351 → GorilleMalizioso351 en IT).
 */
export async function localizeVisitorPoolPseudo(
  objectPath: string,
  storedPseudo: string,
  locale: string,
): Promise<string> {
  const path = normalizeImagePath(objectPath);
  const suffix = extractPseudoNumericSuffix(storedPseudo);
  if (!path) return storedPseudo.trim();

  const catalog = await loadAvatarCatalogIndex();
  const row = catalog.get(storageBaseKeyFromPath(path));
  const pseudoBase = row ? pickFullPseudoBase(row, locale) : null;
  if (!pseudoBase) return storedPseudo.trim();

  return buildVisitorDisplayPseudoWithSuffix(pseudoBase, suffix);
}

type CatalogRow = Record<string, unknown>;
type CatalogIndex = Map<string, CatalogRow>;

let catalogByStorageKey: CatalogIndex | null = null;

/** Indexe tout le catalogue (paginé) : clé fichier → ligne public.avatars. */
async function loadAvatarCatalogIndex(): Promise<CatalogIndex> {
  if (catalogByStorageKey) return catalogByStorageKey;

  const index: CatalogIndex = new Map();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("avatars")
      .select(CATALOG_SELECT)
      .range(offset, offset + CATALOG_PAGE_SIZE - 1);

    if (error) {
      if (import.meta.env.DEV) {
        console.warn("[visitorAvatarPool] Lecture public.avatars :", error.message);
      }
      break;
    }

    if (!data?.length) break;

    for (const row of data as CatalogRow[]) {
      const key = storageBaseKeyFromRow(row);
      if (key) index.set(key, row);
    }

    if (data.length < CATALOG_PAGE_SIZE) break;
    offset += CATALOG_PAGE_SIZE;
  }

  catalogByStorageKey = index;

  if (import.meta.env.DEV && index.size === 0) {
    console.warn(
      "[visitorAvatarPool] Catalogue vide — exécuter supabase/sql/avatars_full_pseudo_public_select.sql (policy + GRANT).",
    );
  }

  return index;
}

/** Fichiers réellement présents dans le bucket Storage (seuls avatars « générés »). */
async function listGeneratedStoragePaths(): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(VISITOR_AVATARS_BUCKET).list("", {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error || !data?.length) break;

    for (const entry of data) {
      if (entry.id != null && AVATAR_OBJECT_PATH_RE.test(entry.name)) {
        paths.push(entry.name.toLowerCase());
      }
    }

    if (data.length < STORAGE_LIST_PAGE_SIZE) break;
    offset += STORAGE_LIST_PAGE_SIZE;
  }

  return paths;
}

function rowToPoolAvatar(row: CatalogRow, objectPath: string, locale: string): VisitorPoolAvatar | null {
  const pseudoBase = pickFullPseudoBase(row, locale);
  if (!pseudoBase) return null;
  const pseudo = buildVisitorDisplayPseudo(pseudoBase);

  const bucket = pickString(row, "storage_bucket") || VISITOR_AVATARS_BUCKET;
  const resolvedPath = normalizeImagePath(objectPath);
  const imageUrl = publicUrlForStorageObject(bucket, resolvedPath);
  if (!imageUrl) return null;

  return {
    id: String(row.id ?? objectPath),
    pseudo,
    objectPath: resolvedPath,
    imageUrl,
  };
}

/**
 * Avatar aléatoire : fichier présent dans Storage + métadonnées public.avatars
 * (full_pseudo_{locale}). Image = fichier listé dans le bucket Storage.
 */
export type FetchRandomVisitorPoolAvatarOptions = {
  /** Chemins Storage déjà proposés (évite les doublons). */
  excludeObjectPaths?: readonly string[];
};

export async function fetchRandomVisitorPoolAvatar(
  locale: string,
  options?: FetchRandomVisitorPoolAvatarOptions,
): Promise<VisitorPoolAvatar | null> {
  const exclude = new Set((options?.excludeObjectPaths ?? []).map((p) => normalizeImagePath(p)));

  const [storagePaths, catalog] = await Promise.all([listGeneratedStoragePaths(), loadAvatarCatalogIndex()]);

  const pool = storagePaths
    .map((path) => ({ path, row: catalog.get(storageBaseKeyFromPath(path)) }))
    .filter((entry): entry is { path: string; row: CatalogRow } => {
      if (exclude.has(entry.path)) return false;
      if (!entry.row) return false;
      return pickFullPseudoBase(entry.row, locale) != null;
    });

  if (!pool.length) {
    if (import.meta.env.DEV) {
      console.warn("[visitorAvatarPool] Aucune paire Storage+catalogue pour la locale", {
        locale: normalizeLocale(locale),
        storageCount: storagePaths.length,
        catalogSize: catalog.size,
      });
    }
    return null;
  }

  const maxAttempts = Math.min(8, pool.length);
  const tried = new Set<number>();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let index = Math.floor(Math.random() * pool.length);
    let guard = 0;
    while (tried.has(index) && guard < pool.length) {
      index = Math.floor(Math.random() * pool.length);
      guard += 1;
    }
    tried.add(index);

    const { path, row } = pool[index];
    const pick = rowToPoolAvatar(row, path, locale);
    if (pick) return pick;
  }

  return null;
}

export function clearVisitorAvatarPseudoIndexCache(): void {
  catalogByStorageKey = null;
}
