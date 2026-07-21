import { Headphones } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type IndoorAudioOnboardingModalProps = {
  open: boolean;
  onAccept: () => void;
};

/** Modal de courtoisie audio — Dialog Radix (focus trap + Escape bloqué tant que non accepté). */
export function IndoorAudioOnboardingModal({ open, onAccept }: IndoorAudioOnboardingModalProps) {
  const { t } = useTranslation("visitor");

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        /* Contrôlé par le parent : pas de fermeture sans acceptation. */
      }}
    >
      <DialogContent
        hideCloseButton
        overlayClassName="z-[200] bg-black/75"
        className={cn(
          "z-[200] w-full max-w-[340px] gap-0 rounded-2xl border border-white/15 bg-[#1E1E1E] p-5 text-[#F0F0F0] shadow-2xl",
          "translate-x-[-50%] translate-y-[-50%] sm:rounded-2xl",
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Headphones className="h-6 w-6 shrink-0 text-emerald-400" aria-hidden />
          <DialogTitle
            id="indoor-audio-onboarding-title"
            className="text-base font-bold leading-tight text-[#F0F0F0]"
          >
            {t("indoor_audio.title")}
          </DialogTitle>
        </div>

        <DialogDescription className="text-sm leading-relaxed text-[#F0F0F0]/90">
          {t("indoor_audio.courtesy_message")}
        </DialogDescription>

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
      </DialogContent>
    </Dialog>
  );
}
