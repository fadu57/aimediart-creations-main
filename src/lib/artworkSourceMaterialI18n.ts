import {
  MEDIATION_UI_LANGS,
  type MediationUiLang,
  resolveMediationUiLang,
} from "@/lib/artworkDescriptionI18n";

export function createEmptySourceMaterialByLang(): Record<MediationUiLang, string> {
  return { fr: "", en: "", de: "", es: "", it: "" };
}

/** JSONB `artwork_source_material_i18n` + repli sur `artwork_source_material` (legacy FR). */
export function normalizeSourceMaterialToByLang(
  rawI18n: unknown,
  legacyText: string | null | undefined,
): Record<MediationUiLang, string> {
  const out = createEmptySourceMaterialByLang();
  const legacy = (legacyText ?? "").trim();

  if (rawI18n != null && typeof rawI18n === "object" && !Array.isArray(rawI18n)) {
    const o = rawI18n as Record<string, unknown>;
    for (const L of MEDIATION_UI_LANGS) {
      const v = o[L];
      if (typeof v === "string") out[L] = v.trim();
    }
  }

  if (legacy && !MEDIATION_UI_LANGS.some((L) => out[L].length > 0)) {
    out.fr = legacy;
  }

  return out;
}

export function sourceMaterialTextForLang(
  byLang: Record<MediationUiLang, string>,
  languageTag: string,
  options?: { fallback?: boolean },
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
  return "";
}

export function hasAnySourceMaterial(byLang: Record<MediationUiLang, string>): boolean {
  return MEDIATION_UI_LANGS.some((L) => (byLang[L] ?? "").trim().length > 0);
}

export function serializeSourceMaterialByLang(
  byLang: Record<MediationUiLang, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const L of MEDIATION_UI_LANGS) {
    const s = (byLang[L] ?? "").trim();
    if (s) out[L] = s;
  }
  return out;
}

export function sourceMaterialDraftFingerprint(byLang: Record<MediationUiLang, string>): string {
  const out: Record<string, string> = {};
  for (const L of MEDIATION_UI_LANGS) {
    out[L] = byLang[L] ?? "";
  }
  return JSON.stringify(out);
}
