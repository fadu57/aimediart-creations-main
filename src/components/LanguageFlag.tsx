import deFlag from "flag-icons/flags/4x3/de.svg";
import esFlag from "flag-icons/flags/4x3/es.svg";
import frFlag from "flag-icons/flags/4x3/fr.svg";
import gbFlag from "flag-icons/flags/4x3/gb.svg";
import itFlag from "flag-icons/flags/4x3/it.svg";

import { cn } from "@/lib/utils";
import type { UiLanguage } from "@/providers/UiLanguageProvider";

/** SVG 4x3 — uniquement les 5 langues UI (pas le CSS flag-icons complet). */
const UI_LANGUAGE_FLAG_SRC: Record<UiLanguage, string> = {
  fr: frFlag,
  de: deFlag,
  en: gbFlag,
  es: esFlag,
  it: itFlag,
};

type LanguageFlagProps = {
  lang: UiLanguage;
  className?: string;
};

/** Drapeau miniature pour le sélecteur de langue (vitrine + header). */
export function LanguageFlag({ lang, className }: LanguageFlagProps) {
  return (
    <img
      src={UI_LANGUAGE_FLAG_SRC[lang]}
      alt=""
      aria-hidden
      width={18}
      height={14}
      className={cn(
        "inline-block h-3.5 w-[1.15rem] shrink-0 rounded-[2px] object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
        className,
      )}
      loading="lazy"
      decoding="async"
    />
  );
}
