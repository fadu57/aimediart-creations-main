import { MEDIATION_UI_LANGS, type MediationUiLang } from "@/lib/artworkDescriptionI18n";

/** Privilège réservé à l'admin général (global_role_id 1) : langues optionnelles en fiche œuvre. */
export const ADMIN_GENERAL_MAX_OPTIONAL_MEDIATION_LANGS = 4;

export function isAdminGeneralMediationOverride(globalRoleId: number | null | undefined): boolean {
  return globalRoleId === 1;
}

export function resolveWorkflowOptionalLangMax(params: {
  globalRoleId: number | null | undefined;
  planMaxLangs: number;
  experimentalWorkflow: boolean;
}): number {
  if (isAdminGeneralMediationOverride(params.globalRoleId) && params.experimentalWorkflow) {
    return ADMIN_GENERAL_MAX_OPTIONAL_MEDIATION_LANGS;
  }
  return Math.max(0, params.planMaxLangs - 1);
}

export function resolveWorkflowPlanGenerationLangs(params: {
  planMaxLangs: number;
  primaryLang: MediationUiLang;
  optionalLangs: MediationUiLang[];
  allLanguagesMode: boolean;
  adminGeneralOverride: boolean;
}): MediationUiLang[] {
  if (params.adminGeneralOverride) {
    const extras = params.optionalLangs.filter((lng) => lng !== params.primaryLang);
    return [params.primaryLang, ...extras].slice(0, 1 + ADMIN_GENERAL_MAX_OPTIONAL_MEDIATION_LANGS);
  }
  if (params.planMaxLangs <= 1) return [params.primaryLang];
  if (params.allLanguagesMode) return [...MEDIATION_UI_LANGS];
  const extras = params.optionalLangs.filter((lng) => lng !== params.primaryLang);
  return [params.primaryLang, ...extras].slice(0, params.planMaxLangs);
}

export function resolvePlanMaxMediationLangs(input: {
  includedMax: number | null | undefined;
  includedMin: number | null | undefined;
  isEtincelle?: boolean;
}): number {
  const raw = input.includedMax ?? input.includedMin ?? (input.isEtincelle ? 1 : MEDIATION_UI_LANGS.length);
  return Math.min(MEDIATION_UI_LANGS.length, Math.max(1, raw));
}

export function planMediationAllowsOptionalLang(maxLangs: number): boolean {
  return maxLangs > 1 && maxLangs < MEDIATION_UI_LANGS.length;
}

export function planMediationAllLanguagesUnlocked(maxLangs: number): boolean {
  return maxLangs >= MEDIATION_UI_LANGS.length;
}

export function resolvePlanMediationGenerationLangs(params: {
  maxLangs: number;
  primaryLang: MediationUiLang;
  optionalLang: MediationUiLang | null;
}): MediationUiLang[] {
  if (params.maxLangs <= 1) return [params.primaryLang];
  if (planMediationAllLanguagesUnlocked(params.maxLangs)) return [...MEDIATION_UI_LANGS];
  const extra =
    params.optionalLang && params.optionalLang !== params.primaryLang ? params.optionalLang : null;
  return extra ? [params.primaryLang, extra] : [params.primaryLang];
}

export function buildPlanEnabledMediationLangSet(params: {
  maxLangs: number;
  primaryLang: MediationUiLang;
  optionalLang: MediationUiLang | null;
}): Set<MediationUiLang> {
  if (params.maxLangs <= 1) return new Set([params.primaryLang]);
  if (planMediationAllLanguagesUnlocked(params.maxLangs)) return new Set(MEDIATION_UI_LANGS);
  const langs: MediationUiLang[] = [params.primaryLang];
  if (params.optionalLang && params.optionalLang !== params.primaryLang) {
    langs.push(params.optionalLang);
  }
  return new Set(langs);
}

export function isMediationLangEnabledForPlan(
  lang: MediationUiLang,
  planEnabledSet: Set<MediationUiLang>,
  legacyLangsWithContent: MediationUiLang[],
): boolean {
  if (planEnabledSet.has(lang)) return true;
  return legacyLangsWithContent.includes(lang);
}
