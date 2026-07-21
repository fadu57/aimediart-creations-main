/**
 * TtsConsentModal — consentement RGPD lecture vocale.
 * Dialog Radix (focus trap) — UI inchangée.
 */

import { useTranslation } from "react-i18next";
import { Headphones, Volume1, X } from "lucide-react";
import type { TtsVoiceMode } from "@/hooks/useTextToSpeech";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface TtsConsentModalProps {
  onGrant: (mode: TtsVoiceMode) => void;
  onDismiss: () => void;
}

export function TtsConsentModal({ onGrant, onDismiss }: TtsConsentModalProps) {
  const { t } = useTranslation("visitor");

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent
        hideCloseButton
        overlayClassName="z-[300] bg-black/70 backdrop-blur-sm"
        className={cn(
          "z-[300] w-full max-w-[360px] gap-0 rounded-2xl border border-white/10 bg-[#1E1E1E] p-5 shadow-2xl sm:rounded-2xl",
        )}
      >
        <button
          type="button"
          aria-label={t("tts_consent_cancel")}
          onClick={onDismiss}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[#F0F0F0]/75 transition hover:bg-white/10 hover:text-[#F0F0F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="mb-3 flex justify-center" aria-hidden>
          <span className="text-4xl">🎧</span>
        </div>

        <DialogTitle
          id="tts-consent-title"
          className="mb-2 text-center text-[15px] font-bold text-[#F0F0F0]"
        >
          {t("tts_consent_title")}
        </DialogTitle>

        <DialogDescription
          id="tts-consent-desc"
          className="mb-5 text-center text-[12px] leading-[1.6] text-[#F0F0F0]/85"
        >
          {t("tts_consent_desc")}
        </DialogDescription>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-[#E63946]/40 bg-[#E63946]/10 px-4 py-3 text-left text-sm font-medium text-[#F0F0F0] transition hover:bg-[#E63946]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E63946]/60"
            onClick={() => onGrant("headphones")}
          >
            <Headphones className="h-5 w-5 shrink-0 text-[#E63946]" aria-hidden />
            <div>
              <p className="font-semibold leading-tight">{t("tts_consent_headphones")}</p>
              <p className="mt-0.5 text-[11px] text-[#F0F0F0]/75">{t("tts_consent_headphones_hint")}</p>
            </div>
          </button>

          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-[#F0F0F0] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            onClick={() => onGrant("no_headphones")}
          >
            <Volume1 className="h-5 w-5 shrink-0 text-[#F0F0F0]/75" aria-hidden />
            <div>
              <p className="font-semibold leading-tight">{t("tts_consent_no_headphones")}</p>
              <p className="mt-0.5 text-[11px] text-[#F0F0F0]/75">{t("tts_consent_no_headphones_hint")}</p>
            </div>
          </button>

          <button
            type="button"
            className="mt-1 py-1 text-center text-[12px] text-[#F0F0F0]/70 transition hover:text-[#F0F0F0] focus-visible:outline-none focus-visible:underline"
            onClick={onDismiss}
          >
            {t("tts_consent_cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
