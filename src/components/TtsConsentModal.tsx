/**
 * TtsConsentModal — modal de consentement RGPD pour la lecture vocale.
 * S'affiche une seule fois par appareil/navigateur (choix mémorisé via localStorage).
 * Rendu en portail au-dessus de tout le contenu.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Headphones, Volume1, X } from "lucide-react";
import type { TtsVoiceMode } from "@/hooks/useTextToSpeech";

interface TtsConsentModalProps {
  onGrant: (mode: TtsVoiceMode) => void;
  onDismiss: () => void;
}

export function TtsConsentModal({ onGrant, onDismiss }: TtsConsentModalProps) {
  const { t } = useTranslation("visitor");
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap minimal : focus sur le panel à l'ouverture
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Fermer sur Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center p-4 sm:items-center">
      {/* Fond sombre */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden
        onClick={onDismiss}
      />

      {/* Panneau */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tts-consent-title"
        aria-describedby="tts-consent-desc"
        tabIndex={-1}
        className="relative z-10 w-full max-w-[360px] rounded-2xl border border-white/10 bg-[#1E1E1E] p-5 shadow-2xl focus:outline-none"
      >
        {/* Bouton fermer */}
        <button
          type="button"
          aria-label={t("tts_consent_cancel")}
          onClick={onDismiss}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[#F0F0F0]/40 transition hover:bg-white/10 hover:text-[#F0F0F0]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        {/* Icône */}
        <div className="mb-3 flex justify-center" aria-hidden>
          <span className="text-4xl">🎧</span>
        </div>

        {/* Titre */}
        <h2
          id="tts-consent-title"
          className="mb-2 text-center text-[15px] font-bold text-[#F0F0F0]"
        >
          {t("tts_consent_title")}
        </h2>

        {/* Description */}
        <p
          id="tts-consent-desc"
          className="mb-5 text-center text-[12px] leading-[1.6] text-[#F0F0F0]/65"
        >
          {t("tts_consent_desc")}
        </p>

        {/* Options */}
        <div className="flex flex-col gap-2">
          {/* Avec écouteurs */}
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-[#E63946]/40 bg-[#E63946]/10 px-4 py-3 text-left text-sm font-medium text-[#F0F0F0] transition hover:bg-[#E63946]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E63946]/60"
            onClick={() => onGrant("headphones")}
          >
            <Headphones className="h-5 w-5 shrink-0 text-[#E63946]" aria-hidden />
            <div>
              <p className="font-semibold leading-tight">{t("tts_consent_headphones")}</p>
              <p className="mt-0.5 text-[11px] text-[#F0F0F0]/55">{t("tts_consent_headphones_hint")}</p>
            </div>
          </button>

          {/* Sans écouteurs */}
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-[#F0F0F0] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            onClick={() => onGrant("no_headphones")}
          >
            <Volume1 className="h-5 w-5 shrink-0 text-[#F0F0F0]/55" aria-hidden />
            <div>
              <p className="font-semibold leading-tight">{t("tts_consent_no_headphones")}</p>
              <p className="mt-0.5 text-[11px] text-[#F0F0F0]/55">{t("tts_consent_no_headphones_hint")}</p>
            </div>
          </button>

          {/* Annuler */}
          <button
            type="button"
            className="mt-1 py-1 text-center text-[12px] text-[#F0F0F0]/35 transition hover:text-[#F0F0F0]/65 focus-visible:outline-none focus-visible:underline"
            onClick={onDismiss}
          >
            {t("tts_consent_cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
