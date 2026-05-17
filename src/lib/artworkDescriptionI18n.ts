import { inferJsonKeyFromDisplayName } from "@/lib/inferPromptStyleKey";

/** Langues d’interface pour les blocs de médiation stockés en JSON (niveau supérieur du JSONB). */
export const MEDIATION_UI_LANGS = ["fr", "en", "de", "es", "it"] as const;
export type MediationUiLang = (typeof MEDIATION_UI_LANGS)[number];

export const MEDIATION_DESCRIPTION_KEYS = [
  "enfant",
  "expert",
  "ado",
  "conteur",
  "rap",
  "poetique",
  "simple",
  "neutre",
] as const;
export type MediationDescriptionKey = (typeof MEDIATION_DESCRIPTION_KEYS)[number];

export function isMediationUiLang(code: string): code is MediationUiLang {
  return (MEDIATION_UI_LANGS as readonly string[]).includes(code);
}

export function resolveMediationUiLang(languageTag: string | undefined): MediationUiLang {
  const code = (languageTag ?? "fr").split("-")[0].toLowerCase();
  return isMediationUiLang(code) ? code : "fr";
}

export function emptyMediationDescriptionsRecord(): Record<MediationDescriptionKey, string> {
  return {
    enfant: "",
    expert: "",
    ado: "",
    conteur: "",
    rap: "",
    poetique: "",
    simple: "",
    neutre: "",
  };
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
 * Normalise le JSONB `artwork_description` :
 * - format historique : clés de style à la racine (une seule langue implicite = fr) ;
 * - format multilingue : `fr` / `en` / … → objet par style.
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
      const bucket = o[L];
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      const b = bucket as Record<string, unknown>;
      for (const key of MEDIATION_DESCRIPTION_KEYS) {
        const v = b[key];
        out[L][key] = typeof v === "string" ? v : "";
      }
    }
    return out;
  }

  for (const key of MEDIATION_DESCRIPTION_KEYS) {
    const v = o[key];
    out.fr[key] = typeof v === "string" ? v : "";
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

type StyleLike = {
  code?: string | null;
  name?: string | null;
  id?: string | number;
};

function stringFromObj(obj: Record<string, string | null | undefined>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v.trim() : "";
}

const MEDIATION_FALLBACK_ORDER: MediationDescriptionKey[] = [
  "enfant",
  "expert",
  "simple",
  "neutre",
  "ado",
  "conteur",
  "poetique",
  "rap",
];

function firstNonEmptyMediationText(obj: Record<string, string | null | undefined>): string {
  for (const k of MEDIATION_FALLBACK_ORDER) {
    const t = stringFromObj(obj, k);
    if (t) return t;
  }
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function mediationTextForStyleInner(
  obj: Record<string, string | null | undefined>,
  style: StyleLike | undefined,
): string {
  if (!style) return "";

  if (style.code?.trim()) {
    const byCode = stringFromObj(obj, style.code.trim());
    if (byCode) return byCode;
  }

  const nameKey = style.name;
  if (nameKey != null && nameKey !== "") {
    const direct = stringFromObj(obj, nameKey);
    if (direct) return direct;
  }

  const inferred = inferJsonKeyFromDisplayName(style.name);
  if (inferred) {
    const byInferred = stringFromObj(obj, inferred);
    if (byInferred) return byInferred;
  }

  const byId = stringFromObj(obj, String(style.id));
  if (byId) return byId;

  const simple = stringFromObj(obj, "simple");
  if (simple) return simple;

  return firstNonEmptyMediationText(obj);
}

/**
 * Texte de médiation pour une langue visiteur donnée, avec repli sur `fr` puis première langue non vide.
 */
export function mediationTextForStyleAndLang(
  artworkDescription: unknown,
  style: StyleLike | undefined,
  viewerLanguageTag: string,
): string {
  const byLang = normalizeArtworkDescriptionToByLang(artworkDescription);
  const preferred = resolveMediationUiLang(viewerLanguageTag);

  const tryLang = (L: MediationUiLang): Record<string, string | null | undefined> => byLang[L];

  const order: MediationUiLang[] = [preferred, "fr", ...MEDIATION_UI_LANGS.filter((x) => x !== preferred && x !== "fr")];

  for (const L of order) {
    const obj = tryLang(L);
    if (!Object.values(obj).some((s) => typeof s === "string" && s.trim())) continue;
    const text = mediationTextForStyleInner(obj, style);
    if (text) return text;
  }

  return "";
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
    const keys: MediationDescriptionKey[] = [
      "enfant",
      "simple",
      "neutre",
      "expert",
      "ado",
      "conteur",
      "rap",
      "poetique",
    ];
    for (const k of keys) {
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
