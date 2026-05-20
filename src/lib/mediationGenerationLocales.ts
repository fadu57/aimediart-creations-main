import { supabase } from "@/lib/supabase";
import {
  DEFAULT_MEDIATION_GENERATION,
  SETTINGS_KEYS,
  type SettingsMediationGeneration,
  type SettingsMediationGenerationMode,
} from "@/lib/settingsKeys";
import {
  MEDIATION_UI_LANGS,
  type MediationUiLang,
  resolveMediationUiLang,
} from "@/lib/artworkDescriptionI18n";
import { parseJsonSetting } from "@/lib/settingsKeys";
import type { UiLanguage } from "@/providers/UiLanguageProvider";

export type MediationGenerationMode = SettingsMediationGenerationMode;

export function parseMediationGenerationMode(raw: unknown): MediationGenerationMode {
  if (raw === "all_languages") return "all_languages";
  return "single_plus_optional";
}

export function parseMediationGenerationSetting(raw: string | null | undefined): SettingsMediationGeneration {
  const parsed = parseJsonSetting<SettingsMediationGeneration>(raw, DEFAULT_MEDIATION_GENERATION);
  return { mode: parseMediationGenerationMode(parsed.mode) };
}

export function uiLanguageToMediationLang(uiLang: UiLanguage | string): MediationUiLang {
  return resolveMediationUiLang(uiLang);
}

/**
 * Langues cibles pour un clic « Générer » / « Régénérer ».
 * - `all_languages` : les 5 langues stockées.
 * - `single_plus_optional` : langue UI (Header / catalogue) + au plus une autre choisie en fiche.
 */
export function resolveMediationGenerationLangs(params: {
  mode: MediationGenerationMode;
  primaryLang: MediationUiLang;
  optionalLang: MediationUiLang | null;
}): MediationUiLang[] {
  if (params.mode === "all_languages") {
    return [...MEDIATION_UI_LANGS];
  }
  const primary = params.primaryLang;
  const extra =
    params.optionalLang && params.optionalLang !== primary ? params.optionalLang : null;
  return extra ? [primary, extra] : [primary];
}

export async function fetchMediationGenerationMode(): Promise<MediationGenerationMode> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.mediationGeneration)
    .maybeSingle();

  if (error) {
    console.warn("[mediationGenerationLocales] fetch mode:", error.message);
    return DEFAULT_MEDIATION_GENERATION.mode;
  }

  const raw = (data as { value?: unknown } | null)?.value;
  const str =
    raw == null
      ? ""
      : typeof raw === "string"
        ? raw
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : String(raw);
  return parseMediationGenerationSetting(str).mode;
}
