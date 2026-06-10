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

import { cn } from "@/lib/utils";

interface TtsPlayButtonProps {
  isPlaying: boolean;
  onPress: () => void;
  supported: boolean;
  isLoading?: boolean;
  /** `onDark` : médiations / overlay photo. `onLight` : fond clair (modale). */
  variant?: "onDark" | "onLight";
}

export function TtsPlayButton({
  isPlaying,
  onPress,
  supported,
  isLoading = false,
  variant = "onDark",
}: TtsPlayButtonProps) {
  const { t } = useTranslation("visitor");

  if (!supported) return null;

  const ringOffset = variant === "onLight" ? "focus-visible:ring-offset-white" : "focus-visible:ring-offset-[#1E1E1E]";

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={isLoading ? t("tts_loading_aria") : isPlaying ? t("tts_stop_aria") : t("tts_play_aria")}
      aria-pressed={isPlaying}
      title={isLoading ? t("tts_loading") : isPlaying ? t("tts_stop") : t("tts_play")}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2",
        ringOffset,
        isLoading &&
          (variant === "onLight"
            ? "cursor-wait border-gray-300 bg-gray-100 text-gray-500"
            : "cursor-wait border-white/25 bg-white/10 text-[#F0F0F0]/70"),
        !isLoading &&
          isPlaying &&
          (variant === "onLight"
            ? "border-[#E63946] bg-[#E63946]/12 text-[#C1121F] shadow-sm hover:bg-[#E63946]/20"
            : "border-[#E63946] bg-[#E63946]/30 text-[#FF8A8A] shadow-[0_0_10px_rgba(230,57,70,0.3)] hover:bg-[#E63946]/40 focus-visible:ring-[#E63946]/70"),
        !isLoading &&
          !isPlaying &&
          (variant === "onLight"
            ? "border-gray-400 bg-white text-gray-800 shadow-sm hover:border-gray-500 hover:bg-gray-50 focus-visible:ring-gray-400/60"
            : "border-white/35 bg-[#2A2A2A] text-[#F0F0F0] shadow-[0_1px_4px_rgba(0,0,0,0.4)] hover:border-white/55 hover:bg-[#353535] hover:text-white focus-visible:ring-white/50"),
      )}
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
