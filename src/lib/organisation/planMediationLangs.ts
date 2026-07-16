import { MEDIATION_UI_LANGS, type MediationUiLang } from "@/lib/artworkDescriptionI18n";

/** Nb max de langues optionnelles pour staff SaaS (1–3) en plus de la langue primaire. */
export const ADMIN_GENERAL_MAX_OPTIONAL_MEDIATION_LANGS = 4;

/** Privilège SaaS global (role_id 1–3) : pas de plafond abonnement sur les langues. */
export function isGlobalStaffMediationLangUnlock(globalRoleId: number | null | undefined): boolean {
  return typeof globalRoleId === "number" && globalRoleId >= 1 && globalRoleId <= 3;
}

/** @deprecated Préférer isGlobalStaffMediationLangUnlock — conservé pour les appels existants (role 1). */
export function isAdminGeneralMediationOverride(globalRoleId: number | null | undefined): boolean {
  return isGlobalStaffMediationLangUnlock(globalRoleId);
}

export function resolveWorkflowOptionalLangMax(params: {
  globalRoleId: number | null | undefined;
  planMaxLangs: number;
  experimentalWorkflow: boolean;
}): number {
  if (isGlobalStaffMediationLangUnlock(params.globalRoleId) && params.experimentalWorkflow) {
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
  // Sans donnée pricing : 1 langue (sécurité quota). Les rôles SaaS 1–3 débloquent à part.
  const raw = input.includedMax ?? input.includedMin ?? 1;
  return Math.min(MEDIATION_UI_LANGS.length, Math.max(1, raw));
}

export function resolvePlanMaxAudioLangs(input: {
  includedAudioLangs: number | null | undefined;
  mediationLangsMax: number;
}): number {
  const raw = input.includedAudioLangs ?? input.mediationLangsMax;
  return Math.min(MEDIATION_UI_LANGS.length, Math.max(0, raw));
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
