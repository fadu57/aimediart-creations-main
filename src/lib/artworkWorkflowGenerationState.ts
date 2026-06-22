import type { MediationDescriptionKey, MediationUiLang } from "@/lib/artworkDescriptionI18n";

/** Tous les personas sont remplis pour chaque langue prévue par le plan. */
export function areAllPlanMediationsGenerated(params: {
  descriptionsByLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>;
  langs: readonly MediationUiLang[];
  styleKeys: readonly MediationDescriptionKey[];
}): boolean {
  const { descriptionsByLang, langs, styleKeys } = params;
  if (langs.length === 0 || styleKeys.length === 0) return false;
  return langs.every((lang) =>
    styleKeys.every((key) => (descriptionsByLang[lang]?.[key] ?? "").trim().length > 0),
  );
}
