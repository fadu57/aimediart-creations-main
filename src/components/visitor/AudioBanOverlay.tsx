import { ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";

type AudioBanOverlayProps = {
  open: boolean;
};

/** Écran de blocage persistant après bannissement admin. */
export function AudioBanOverlay({ open }: AudioBanOverlayProps) {
  const { t } = useTranslation("visitor");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0a0a0a]/95 p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="audio-ban-title"
      aria-describedby="audio-ban-desc"
    >
      <div className="w-full max-w-[320px] rounded-2xl border-2 border-[#E63946] bg-[#1a1a1a] p-6 text-center shadow-[0_0_40px_rgba(230,57,70,0.35)]">
        <ShieldOff className="mx-auto h-12 w-12 text-[#E63946]" aria-hidden />
        <h2 id="audio-ban-title" className="mt-4 text-lg font-bold text-white">
          {t("indoor_audio.ban_title")}
        </h2>
        <p id="audio-ban-desc" className="mt-3 text-sm leading-relaxed text-[#F0F0F0]/85">
          {t("indoor_audio.ban_message")}
        </p>
      </div>
    </div>
  );
}
