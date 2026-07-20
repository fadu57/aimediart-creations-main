import {
  MEDIATION_UI_LANGS,
  type MediationUiLang,
  resolveMediationUiLang,
} from "@/lib/artworkDescriptionI18n";

export function createEmptyTitleByLang(): Record<MediationUiLang, string> {
  return { fr: "", en: "", de: "", es: "", it: "" };
}

/** JSONB `artwork_title_i18n` + repli sur `artwork_title` (legacy). */
export function normalizeTitleToByLang(
  rawI18n: unknown,
  legacyTitle: string | null | undefined,
): Record<MediationUiLang, string> {
  const out = createEmptyTitleByLang();
  const legacy = (legacyTitle ?? "").trim();

  if (rawI18n != null && typeof rawI18n === "object" && !Array.isArray(rawI18n)) {
    const o = rawI18n as Record<string, unknown>;
    for (const L of MEDIATION_UI_LANGS) {
      const v = o[L];
      if (typeof v === "string") out[L] = v.trim();
    }
  }

  if (legacy && !MEDIATION_UI_LANGS.some((L) => out[L].length > 0)) {
    out.fr = legacy;
  } else if (legacy && !(out.fr ?? "").trim()) {
    out.fr = legacy;
  }

  return out;
}

export function titleTextForLang(
  byLang: Record<MediationUiLang, string>,
  languageTag: string,
  options?: { fallback?: boolean; legacyTitle?: string | null },
): string {
  const preferred = resolveMediationUiLang(languageTag);
  const fromPreferred = (byLang[preferred] ?? "").trim();
  if (fromPreferred) return fromPreferred;

  if (options?.fallback === false) return "";

  if (preferred !== "fr") {
    const fr = (byLang.fr ?? "").trim();
    if (fr) return fr;
  }
  for (const L of MEDIATION_UI_LANGS) {
    const s = (byLang[L] ?? "").trim();
    if (s) return s;
  }
  return (options?.legacyTitle ?? "").trim();
}

export function serializeTitleByLang(
  byLang: Record<MediationUiLang, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const L of MEDIATION_UI_LANGS) {
    const s = (byLang[L] ?? "").trim();
    if (s) out[L] = s;
  }
  return out;
}

export function titleByLangDraftFingerprint(byLang: Record<MediationUiLang, string>): string {
  const out: Record<string, string> = {};
  for (const L of MEDIATION_UI_LANGS) {
    out[L] = byLang[L] ?? "";
  }
  return JSON.stringify(out);
}

/** Titre source pour la traduction : langue primaire, sinon FR, sinon premier non vide. */
export function resolveTitleTranslationSource(
  byLang: Record<MediationUiLang, string>,
  preferredLang: MediationUiLang,
  legacyTitle?: string | null,
): { lang: MediationUiLang; text: string } | null {
  const preferred = (byLang[preferredLang] ?? "").trim();
  if (preferred) return { lang: preferredLang, text: preferred };
  const fr = (byLang.fr ?? "").trim();
  if (fr) return { lang: "fr", text: fr };
  for (const L of MEDIATION_UI_LANGS) {
    const s = (byLang[L] ?? "").trim();
    if (s) return { lang: L, text: s };
  }
  const legacy = (legacyTitle ?? "").trim();
  if (legacy) return { lang: preferredLang, text: legacy };
  return null;
}
