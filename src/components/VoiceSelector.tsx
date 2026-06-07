/**
 * VoiceSelector — sélecteur de voix de synthèse pour une langue donnée.
 *
 * À intégrer dans une zone "paramètres" ou accessible via un bouton discret.
 * Utilise `filterVoicesForLang` pour ne lister que les voix compatibles.
 *
 * Exemple d'intégration dans VisitorView :
 *   <VoiceSelector
 *     lang={language}
 *     voices={tts.availableVoices}
 *     preferredVoiceName={tts.preferredVoices[language]}
 *     onChange={(name) => tts.setPreferredVoice(language, name)}
 *   />
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { filterVoicesForLang } from "@/hooks/useTextToSpeechWithVoices";

// ── Types ────────────────────────────────────────────────────────────────────

interface VoiceSelectorProps {
  /** Code langue : '2 lettres' ou 'xx-XX' */
  lang: string;
  /** Liste complète des voix (tts.availableVoices) */
  voices: SpeechSynthesisVoice[];
  /** Nom de la voix actuellement sélectionnée pour cette langue */
  preferredVoiceName?: string;
  /** Appelé quand l'utilisateur choisit une voix */
  onChange: (voiceName: string) => void;
  /** Classes CSS supplémentaires sur le conteneur */
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Rend un label lisible : "Google français (fr-FR)" */
function voiceLabel(voice: SpeechSynthesisVoice): string {
  const suffix = voice.lang ? ` (${voice.lang})` : "";
  return `${voice.name}${suffix}`;
}

// ── Composant ────────────────────────────────────────────────────────────────

export function VoiceSelector({
  lang,
  voices,
  preferredVoiceName,
  onChange,
  className = "",
}: VoiceSelectorProps) {
  const { t } = useTranslation("visitor");

  const filteredVoices = useMemo(
    () => filterVoicesForLang(voices, lang),
    [voices, lang],
  );

  const selectId = `voice-selector-${lang}`;

  const LANG_FLAG: Record<string, string> = {
    fr: "🇫🇷", de: "🇩🇪", en: "🇬🇧", es: "🇪🇸", it: "🇮🇹",
  };
  const base = lang.split(/[-_]/)[0].toLowerCase();
  const flag = LANG_FLAG[base] ?? "🔊";
  const hasVoices = filteredVoices.length > 0;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="shrink-0 text-sm" aria-hidden>{flag}</span>
      <label
        htmlFor={hasVoices ? selectId : undefined}
        className="shrink-0 text-[11px] text-[#F0F0F0]/50"
      >
        {t("tts_voice_label")}
      </label>

      {hasVoices ? (
        <select
          id={selectId}
          value={preferredVoiceName ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("tts_voice_aria")}
          className={[
            "min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-[#1E1E1E]",
            "px-2 py-1 text-[11px] text-[#F0F0F0]/75",
            "transition hover:border-white/25",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
            "cursor-pointer",
          ].join(" ")}
        >
          <option value="">{t("tts_voice_auto")}</option>
          {filteredVoices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voiceLabel(voice)}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-[11px] italic text-[#F0F0F0]/25">
          {t("tts_voice_none")}
        </span>
      )}
    </div>
  );
}
