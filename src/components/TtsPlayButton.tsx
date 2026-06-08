/**
 * TtsPlayButton — bouton lecture vocale discret pour les blocs de médiation.
 *
 * Props :
 *   text      — texte à lire (le contenu du bloc)
 *   lang      — langue ISO 2 lettres ('fr', 'de', 'en', 'es', 'it')
 *   isPlaying — true si CE bloc est actuellement lu
 *   onPress   — callback appelé au clic (speak ou stop)
 *   supported — false si Web Speech API indisponible → bouton masqué
 */

import { Loader2, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TtsPlayButtonProps {
  isPlaying: boolean;
  onPress: () => void;
  supported: boolean;
  isLoading?: boolean;
}

export function TtsPlayButton({ isPlaying, onPress, supported, isLoading = false }: TtsPlayButtonProps) {
  const { t } = useTranslation("visitor");

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={isLoading ? t("tts_loading_aria") : isPlaying ? t("tts_stop_aria") : t("tts_play_aria")}
      aria-pressed={isPlaying}
      title={isLoading ? t("tts_loading") : isPlaying ? t("tts_stop") : t("tts_play")}
      className={[
        "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[#1E1E1E]",
        isLoading
          ? "border-white/10 bg-white/5 text-[#F0F0F0]/35 cursor-wait"
          : isPlaying
          ? "border-[#E63946]/50 bg-[#E63946]/15 text-[#E63946] focus-visible:ring-[#E63946]/60 hover:bg-[#E63946]/25"
          : "border-white/10 bg-white/5 text-[#F0F0F0]/45 focus-visible:ring-white/30 hover:bg-white/10 hover:text-[#F0F0F0]/75",
      ].join(" ")}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      ) : isPlaying ? (
        <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span aria-hidden className="leading-none">
        {isLoading ? t("tts_loading") : isPlaying ? t("tts_stop") : t("tts_play")}
      </span>
    </button>
  );
}
