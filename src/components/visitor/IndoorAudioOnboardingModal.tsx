import { Headphones } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IndoorAudioOnboardingModalProps = {
  open: boolean;
  onAccept: () => void;
};

/** Modal de courtoisie audio — approche déclarative, sans détection matérielle. */
export function IndoorAudioOnboardingModal({ open, onAccept }: IndoorAudioOnboardingModalProps) {
  const { t } = useTranslation("visitor");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 p-4 sm:items-center"
      role="presentation"
    >
      <div
        className={cn(
          "w-full max-w-[340px] rounded-2xl border border-white/15 bg-[#1E1E1E] p-5 text-[#F0F0F0] shadow-2xl",
          "animate-in fade-in slide-in-from-bottom-4 duration-300",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="indoor-audio-onboarding-title"
      >
        <div className="mb-3 flex items-center gap-2">
          <Headphones className="h-6 w-6 shrink-0 text-emerald-400" aria-hidden />
          <h2 id="indoor-audio-onboarding-title" className="text-base font-bold leading-tight">
            {t("indoor_audio.title")}
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-[#F0F0F0]/90">{t("indoor_audio.courtesy_message")}</p>

        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
          {t("indoor_audio.ban_warning")}
        </p>

        <Button
          type="button"
          className="mt-4 w-full rounded-full bg-[#E63946] font-semibold hover:bg-[#c92f3b]"
          onClick={onAccept}
        >
          {t("indoor_audio.accept")}
        </Button>
      </div>
    </div>
  );
}
