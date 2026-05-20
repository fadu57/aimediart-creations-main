import { useEffect, useMemo, useState } from "react";

import {
  fetchMediationGenerationMode,
  resolveMediationGenerationLangs,
  uiLanguageToMediationLang,
  type MediationGenerationMode,
} from "@/lib/mediationGenerationLocales";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { useUiLanguage } from "@/providers/UiLanguageProvider";

export function useMediationGenerationConfig() {
  const { language: uiLanguage } = useUiLanguage();
  const [mode, setMode] = useState<MediationGenerationMode>("single_plus_optional");
  const [modeLoading, setModeLoading] = useState(true);
  const [optionalLang, setOptionalLang] = useState<MediationUiLang | null>(null);

  useEffect(() => {
    let cancelled = false;
    setModeLoading(true);
    void (async () => {
      const m = await fetchMediationGenerationMode();
      if (!cancelled) {
        setMode(m);
        setModeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primaryLang = useMemo(() => uiLanguageToMediationLang(uiLanguage), [uiLanguage]);

  const generationLangs = useMemo(
    () =>
      resolveMediationGenerationLangs({
        mode,
        primaryLang,
        optionalLang,
      }),
    [mode, primaryLang, optionalLang],
  );

  const allowsOptionalLang = mode === "single_plus_optional";

  return {
    mode,
    modeLoading,
    primaryLang,
    optionalLang,
    setOptionalLang,
    generationLangs,
    allowsOptionalLang,
    isAllLanguagesMode: mode === "all_languages",
  };
}
