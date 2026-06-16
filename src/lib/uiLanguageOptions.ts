import type { UiLanguage } from "@/providers/UiLanguageProvider";

/** Options langue UI — le rendu drapeau est géré par `<LanguageFlag />`. */
export const UI_LANGUAGE_OPTIONS: Array<{ value: UiLanguage; label: string }> = [
  { value: "fr", label: "FR" },
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
  { value: "es", label: "ES" },
  { value: "it", label: "IT" },
];
