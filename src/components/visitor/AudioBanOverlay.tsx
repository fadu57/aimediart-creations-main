import { ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AudioBanOverlayProps = {
  open: boolean;
};

/** Écran de blocage persistant après bannissement admin — AlertDialog Radix (focus trap). */
export function AudioBanOverlay({ open }: AudioBanOverlayProps) {
  const { t } = useTranslation("visitor");

  return (
    <AlertDialog
      open={open}
      onOpenChange={() => {
        /* Bannissement persistant : pas de fermeture côté UI. */
      }}
    >
      <AlertDialogContent
        overlayClassName="z-[300] bg-[#0a0a0a]/95"
        className="z-[300] w-full max-w-[320px] gap-0 rounded-2xl border-2 border-[#E63946] bg-[#1a1a1a] p-6 text-center shadow-[0_0_40px_rgba(230,57,70,0.35)] sm:rounded-2xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <ShieldOff className="mx-auto h-12 w-12 text-[#E63946]" aria-hidden />
        <AlertDialogTitle id="audio-ban-title" className="mt-4 text-lg font-bold text-white">
          {t("indoor_audio.ban_title")}
        </AlertDialogTitle>
        <AlertDialogDescription
          id="audio-ban-desc"
          className="mt-3 text-sm leading-relaxed text-[#F0F0F0]/85"
        >
          {t("indoor_audio.ban_message")}
        </AlertDialogDescription>
      </AlertDialogContent>
    </AlertDialog>
  );
}
