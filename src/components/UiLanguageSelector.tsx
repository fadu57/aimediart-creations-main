import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { LanguageFlag } from "@/components/LanguageFlag";
import { UI_LANGUAGE_OPTIONS } from "@/lib/uiLanguageOptions";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";

type UiLanguageSelectorProps = {
  className?: string;
  selectClassName?: string;
};

/** Sélecteur de langue UI (drapeau emoji + liste), sans dépendance flag-icons. */
export function UiLanguageSelector({ className, selectClassName }: UiLanguageSelectorProps) {
  const { language, setLanguage } = useUiLanguage();
  const { t } = useTranslation("header");
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((option) => option.value === language) ?? UI_LANGUAGE_OPTIONS[0];

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-white px-1.5", className)}>
      <LanguageFlag lang={activeLanguage.value} />
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

// Rétrocompatibilité des imports existants
export { UI_LANGUAGE_OPTIONS };
