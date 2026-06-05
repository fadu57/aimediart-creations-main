import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";

export const UI_LANGUAGE_OPTIONS: Array<{ value: UiLanguage; label: string; flagClass: string }> = [
  { value: "fr", label: "FR", flagClass: "fi fi-fr" },
  { value: "de", label: "DE", flagClass: "fi fi-de" },
  { value: "en", label: "EN", flagClass: "fi fi-gb" },
  { value: "es", label: "ES", flagClass: "fi fi-es" },
  { value: "it", label: "IT", flagClass: "fi fi-it" },
];

type UiLanguageSelectorProps = {
  className?: string;
  selectClassName?: string;
};

/** Sélecteur de langue UI (drapeau + liste), même principe que le header général. */
export function UiLanguageSelector({ className, selectClassName }: UiLanguageSelectorProps) {
  const { language, setLanguage } = useUiLanguage();
  const { t } = useTranslation("header");
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((option) => option.value === language) ?? UI_LANGUAGE_OPTIONS[0];

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-white px-1.5", className)}>
      <span className={activeLanguage.flagClass} aria-hidden />
      <select
        id="visitorLanguageSelector"
        value={language}
        onChange={(e) => setLanguage(e.target.value as UiLanguage)}
        className={cn("h-7 w-[64px] bg-transparent text-[10px] font-semibold outline-none", selectClassName)}
        aria-label={t("language_label")}
        title={t("language_label")}
      >
        {UI_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
