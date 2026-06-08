/**
 * VoiceSelector — choix de voix Google Cloud TTS Neural2 (masculin / féminin).
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getGoogleTtsVoiceName, type GoogleTtsGender } from "@/lib/googleTtsVoices";

interface VoiceSelectorProps {
  gender: GoogleTtsGender;
  onChange: (gender: GoogleTtsGender) => void;
  language: string;
  className?: string;
}

const LANG_FLAG: Record<string, string> = {
  fr: "🇫🇷", de: "🇩🇪", en: "🇬🇧", es: "🇪🇸", it: "🇮🇹",
};

export function VoiceSelector({
  gender,
  onChange,
  language,
  className = "",
}: VoiceSelectorProps) {
  const { t } = useTranslation("visitor");

  const base = language.split(/[-_]/)[0].toLowerCase();
  const flag = LANG_FLAG[base] ?? "🔊";

  const options = useMemo(
    () =>
      (["FEMALE", "MALE"] as const).map((g) => ({
        gender: g,
        voiceName: getGoogleTtsVoiceName(language, g),
      })),
    [language],
  );

  const selectId = `voice-selector-${base}`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="shrink-0 text-sm" aria-hidden>{flag}</span>
      <label htmlFor={selectId} className="shrink-0 text-[11px] text-[#F0F0F0]/50">
        {t("tts_voice_label")}
      </label>
      <select
        id={selectId}
        value={gender}
        onChange={(e) => onChange(e.target.value as GoogleTtsGender)}
        aria-label={t("tts_voice_aria")}
        className={[
          "min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-[#1E1E1E]",
          "px-2 py-1 text-[11px] text-[#F0F0F0]/75",
          "transition hover:border-white/25",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
          "cursor-pointer",
        ].join(" ")}
      >
        {options.map(({ gender: g, voiceName }) => (
          <option key={g} value={g}>
            {voiceName}
          </option>
        ))}
      </select>
    </div>
  );
}
