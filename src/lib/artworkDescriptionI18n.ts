import {
  MEDIATION_VISITOR_STYLE_CODES,
  type MediationVisitorStyleCode,
} from "@/lib/mediationStyleCodes";

/** Langues d’interface pour les blocs de médiation stockés en JSON (niveau supérieur du JSONB). */
export const MEDIATION_UI_LANGS = ["fr", "en", "de", "es", "it"] as const;
export type MediationUiLang = (typeof MEDIATION_UI_LANGS)[number];

/** Alias : même tuple que {@link MEDIATION_VISITOR_STYLE_CODES}. */
export const MEDIATION_DESCRIPTION_KEYS = MEDIATION_VISITOR_STYLE_CODES;
export type MediationDescriptionKey = MediationVisitorStyleCode;

const CANONICAL_MEDIATION_KEY_SET = new Set<string>(MEDIATION_DESCRIPTION_KEYS);

export function isMediationUiLang(code: string): code is MediationUiLang {
  return (MEDIATION_UI_LANGS as readonly string[]).includes(code);
}

export function resolveMediationUiLang(languageTag: string | undefined): MediationUiLang {
  const code = (languageTag ?? "fr").split("-")[0].toLowerCase();
  return isMediationUiLang(code) ? code : "fr";
}

export function emptyMediationDescriptionsRecord(): Record<MediationDescriptionKey, string> {
  const o = {} as Record<MediationDescriptionKey, string>;
  for (const k of MEDIATION_DESCRIPTION_KEYS) {
    o[k] = "";
  }
  return o;
}

/** État vide pour les 5 langues d’édition des médiations. */
export function createEmptyDescriptionsByLang(): Record<MediationUiLang, Record<MediationDescriptionKey, string>> {
  const empty = emptyMediationDescriptionsRecord();
  return {
    fr: { ...empty },
    en: { ...empty },
    de: { ...empty },
    es: { ...empty },
    it: { ...empty },
  };
}

/**
 * Normalise le JSONB `artwork_description_i18n` vers les 8 clés canoniques par langue.
 * Seules les clés de style reconnues sont lues ; pas d’alias entre styles.
 * Formats : chaîne seule → `simple` ; racine plate (historique) ; ou `fr` / `en` / … avec objets par style.
 */
export function normalizeArtworkDescriptionToByLang(
  raw: unknown,
): Record<MediationUiLang, Record<MediationDescriptionKey, string>> {
  const out = createEmptyDescriptionsByLang();

  if (raw == null) return out;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return out;
    for (const L of MEDIATION_UI_LANGS) {
      out[L] = { ...emptyMediationDescriptionsRecord(), simple: s };
    }
    return out;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) return out;

  const o = raw as Record<string, unknown>;
  const langKeys = Object.keys(o).filter(isMediationUiLang);
  const hasNestedBuckets =
    langKeys.length > 0 &&
    langKeys.some((lk) => {
      const v = o[lk];
      return v !== null && typeof v === "object" && !Array.isArray(v);
    });

  if (hasNestedBuckets) {
    for (const L of MEDIATION_UI_LANGS) {
      const bucket = getMediationLangBucketFromRaw(o, L);
      for (const key of MEDIATION_DESCRIPTION_KEYS) {
        out[L][key] = mediationBucketValueStrict(bucket, key);
      }
    }
    return out;
  }

  const bucketFr = getMediationLangBucketFromRaw(o, "fr");
  for (const key of MEDIATION_DESCRIPTION_KEYS) {
    out.fr[key] = mediationBucketValueStrict(bucketFr, key);
  }
  return out;
}

export function serializeMediationDescriptionsByLang(
  byLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const L of MEDIATION_UI_LANGS) {
    result[L] = { ...byLang[L] };
  }
  return result;
}

/** Chaîne JSON stable pour comparer les brouillons (ordre des clés fixe). */
export function serializeMediationDraftFingerprint(
  byLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>,
): string {
  const sorted: Record<string, Record<string, string>> = {};
  for (const L of MEDIATION_UI_LANGS) {
    sorted[L] = {};
    for (const k of [...MEDIATION_DESCRIPTION_KEYS].sort()) {
      sorted[L][k] = (byLang[L][k] ?? "").trim();
    }
  }
  return JSON.stringify(sorted);
}

/** Normalise une clé de style côté JSON (casse, accents, tirets Unicode, underscores) pour lookup stable. */
export function normalizeMediationStyleKeyForLookup(key: string): string {
  const s = key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g, "-")
    .replace(/_/g, "-");
  return s.trim();
}

function looseIsMediationUiLangKey(key: string): boolean {
  const c = key.trim().toLowerCase();
  return (MEDIATION_UI_LANGS as readonly string[]).includes(c);
}

/** Bucket objet pour une langue (clé exacte `fr` ou variante de casse). */
function getNestedLangBucketObject(
  o: Record<string, unknown>,
  lang: MediationUiLang,
): Record<string, unknown> | null {
  const direct = o[lang];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  const hit = Object.entries(o).find(([k]) => k.trim().toLowerCase() === lang);
  if (!hit) return null;
  const v = hit[1];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function tryParseArtworkDescriptionRecordString(raw: string): Record<string, unknown> | null {
  const s = raw.trim();
  if (!s.startsWith("{")) return null;
  try {
    const p = JSON.parse(s) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    /* texte libre */
  }
  return null;
}

function coerceMediationBucketStringValue(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v).trim();
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

/** Clés « meta » parfois stockées à côté des personas dans le même objet langue (réponse IA, brouillons). */
const MEDIATION_LANG_BUCKET_METADATA_KEYS = new Set([
  "analyse-et-reflexion",
  "analyse-globale",
]);

/**
 * Remplit un bucket plat (clés = uniquement les 8 codes canoniques) :
 * chaînes directes, enveloppes { text | … }, objets imbriqués (ex. mediations_par_style.*).
 */
function fillBucketFromEntriesDeep(out: Record<string, string>, obj: Record<string, unknown>, depth = 0): void {
  const maxDepth = 8;
  if (depth > maxDepth) return;

  for (const [k, v] of Object.entries(obj)) {
    const nk = normalizeMediationStyleKeyForLookup(k);
    if (!nk) continue;
    if (MEDIATION_LANG_BUCKET_METADATA_KEYS.has(nk)) continue;

    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const unwrapped = coerceMediationBucketStringValue(
        o.text ?? o.content ?? o.value ?? o.body ?? o.markdown,
      );
      if (unwrapped && CANONICAL_MEDIATION_KEY_SET.has(nk)) {
        if (!out[nk]) out[nk] = unwrapped;
        continue;
      }
      fillBucketFromEntriesDeep(out, o, depth + 1);
      continue;
    }

    const text = coerceMediationBucketStringValue(v);
    if (text && !out[nk] && CANONICAL_MEDIATION_KEY_SET.has(nk)) out[nk] = text;
  }
}

/** Lit le bucket d’une langue : uniquement les clés des 8 styles canoniques (plus métadonnées ignorées). */
export function getMediationLangBucketFromRaw(raw: unknown, lang: MediationUiLang): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw == null) return out;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return out;
    const asObj = tryParseArtworkDescriptionRecordString(s);
    if (asObj) return getMediationLangBucketFromRaw(asObj, lang);
    const nk = normalizeMediationStyleKeyForLookup("simple");
    if (nk) out[nk] = s;
    return out;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;

  const hasNestedBuckets = Object.keys(o).some((lk) => {
    if (!looseIsMediationUiLangKey(lk)) return false;
    const v = o[lk];
    return v !== null && typeof v === "object" && !Array.isArray(v);
  });

  if (hasNestedBuckets) {
    const bucket = getNestedLangBucketObject(o, lang);
    if (bucket) fillBucketFromEntriesDeep(out, bucket);
    return out;
  }

  if (lang !== "fr") return out;
  const flatObj = Object.fromEntries(Object.entries(o).filter(([k]) => !looseIsMediationUiLangKey(k)));
  fillBucketFromEntriesDeep(out, flatObj);
  return out;
}

/** Valeur pour une clé canonique uniquement (normalisation Unicode / casse / tirets comme pour les clés en JSON). */
function mediationBucketValueStrict(bucket: Record<string, string>, styleKey: string): string {
  const nk = normalizeMediationStyleKeyForLookup(styleKey);
  if (!nk || !CANONICAL_MEDIATION_KEY_SET.has(nk)) return "";
  const v = bucket[nk];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Texte pour un code canonique : même clé dans la langue préférée, puis en `fr` si vide.
 */
export function mediationTextForStyleCodeAndLang(
  artworkDescriptionI18n: unknown,
  styleCode: string,
  viewerLanguageTag: string,
): string {
  const preferred = resolveMediationUiLang(viewerLanguageTag);
  const fromLang = (L: MediationUiLang) =>
    mediationBucketValueStrict(getMediationLangBucketFromRaw(artworkDescriptionI18n, L), styleCode);

  const primary = fromLang(preferred);
  if (primary) return primary;
  if (preferred !== "fr") {
    const frText = fromLang("fr");
    if (frText) return frText;
  }
  return "";
}

/** Langues pour lesquelles au moins un texte de médiation est renseigné dans le JSONB. */
export function getMediationFilledUiLangs(raw: unknown): MediationUiLang[] {
  const byLang = normalizeArtworkDescriptionToByLang(raw);
  return MEDIATION_UI_LANGS.filter((L) =>
    Object.values(byLang[L]).some((s) => s.trim().length > 0),
  );
}

/** Nombre max de styles non vides sur une langue (pour indicateurs type catalogue). */
export function countMaxMediationStylesAcrossLangs(raw: unknown): number {
  const byLang = normalizeArtworkDescriptionToByLang(raw);
  let best = 0;
  for (const L of MEDIATION_UI_LANGS) {
    const c = Object.values(byLang[L]).filter((s) => s.trim().length > 0).length;
    if (c > best) best = c;
  }
  return best;
}

/** Extrait un extrait lisible pour listes (cube, etc.). */
export function teaserFromArtworkDescription(raw: unknown, preferLang?: string): string {
  const byLang = normalizeArtworkDescriptionToByLang(raw);
  const first = preferLang ? resolveMediationUiLang(preferLang) : "fr";
  const order: MediationUiLang[] = [first, ...MEDIATION_UI_LANGS.filter((x) => x !== first)];

  for (const L of order) {
    for (const v of Object.values(byLang[L])) {
      const s = v.trim();
      if (s) return s.length > 200 ? `${s.slice(0, 200).trimEnd()}…` : s;
    }
  }
  return "";
}

/** Texte principal affiché sur la fiche œuvre (premier champ connu non vide, selon la langue UI). */
export function primaryBlurbFromArtworkDescription(raw: unknown, languageTag: string): string {
  const byLang = normalizeArtworkDescriptionToByLang(raw);
  const preferred = resolveMediationUiLang(languageTag);
  const order: MediationUiLang[] = [preferred, "fr", ...MEDIATION_UI_LANGS.filter((x) => x !== preferred && x !== "fr")];

  const pickFromBucket = (bucket: Record<MediationDescriptionKey, string>): string => {
    for (const k of MEDIATION_DESCRIPTION_KEYS) {
      const s = bucket[k].trim();
      if (s) return s;
    }
    return "";
  };

  for (const L of order) {
    const text = pickFromBucket(byLang[L]);
    if (text) return text;
  }

  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}
