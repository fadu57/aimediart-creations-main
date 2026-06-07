/**
 * useTextToSpeech — lecture vocale via Web Speech API.
 *
 * Usage :
 *   const tts = useTextToSpeech();
 *   // Au clic sur un bloc de médiation :
 *   tts.speak(slide.text, language);
 *   // Pour afficher le modal de consentement si nécessaire :
 *   {tts.showConsentModal && <TtsConsentModal onGrant={tts.grantConsent} onDismiss={tts.dismissConsent} />}
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type TtsVoiceMode = "headphones" | "no_headphones";

export interface TtsState {
  /** Lecture en cours */
  isSpeaking: boolean;
  /** Texte actuellement lu (null si silence) */
  speakingText: string | null;
  /** Consentement déjà donné (mémorisé localStorage) */
  hasConsent: boolean;
  /** Mode audio mémorisé */
  voiceMode: TtsVoiceMode | null;
  /** Modal de consentement à afficher */
  showConsentModal: boolean;
  /** API disponible dans ce navigateur */
  supported: boolean;
  /** Lire text dans lang (déclenche le modal si premier usage) */
  speak: (text: string, lang: string) => void;
  /** Stopper la lecture en cours */
  stop: () => void;
  /** Accorder le consentement et lancer la lecture en attente */
  grantConsent: (mode: TtsVoiceMode) => void;
  /** Fermer le modal sans lire */
  dismissConsent: () => void;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const LS_CONSENT = "aimediart_tts_consent_v1";
const LS_MODE = "aimediart_tts_mode_v1";

/** Mapping codes ISO app → locales SpeechSynthesis */
const SPEECH_LANG_MAP: Record<string, string> = {
  fr: "fr-FR",
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  it: "it-IT",
};

// ── Utilitaires ──────────────────────────────────────────────────────────────

function mapToSpeechLocale(lang: string): string {
  const base = lang.split(/[-_]/)[0].toLowerCase();
  return SPEECH_LANG_MAP[base] ?? lang;
}

function pickBestVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | undefined {
  const lower = locale.toLowerCase();
  const base = lower.split("-")[0];
  // Priorité 1 : correspondance exacte
  const exact = voices.find((v) => v.lang.toLowerCase() === lower);
  if (exact) return exact;
  // Priorité 2 : même langue (fr-CA pour fr-FR, etc.)
  return voices.find((v) => v.lang.toLowerCase().startsWith(base));
}

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* privé / SSR */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTextToSpeech(): TtsState {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [hasConsent, setHasConsent] = useState<boolean>(() => lsGet(LS_CONSENT) === "1");
  const [voiceMode, setVoiceMode] = useState<TtsVoiceMode | null>(() => {
    const s = lsGet(LS_MODE);
    return s === "headphones" || s === "no_headphones" ? s : null;
  });
  const [showConsentModal, setShowConsentModal] = useState(false);

  /** Texte + langue mis en attente pendant que le modal est ouvert */
  const pendingRef = useRef<{ text: string; lang: string } | null>(null);

  // Annuler la lecture à la destruction du composant
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setSpeakingText(null);
  }, [supported]);

  /** Lance effectivement la lecture (consentement déjà acquis). */
  const _doSpeak = useCallback(
    (text: string, lang: string, mode: TtsVoiceMode) => {
      if (!supported) return;

      // Stoppe toute lecture précédente
      window.speechSynthesis.cancel();

      const locale = mapToSpeechLocale(lang);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      utterance.volume = mode === "no_headphones" ? 0.1 : 1.0;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Sélection de la meilleure voix disponible
      const applyVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const voice = pickBestVoice(voices, locale);
          if (voice) utterance.voice = voice;
        }
      };
      applyVoice();

      // Sur certains navigateurs (Chrome), les voix chargent en async
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
          applyVoice();
          window.speechSynthesis.onvoiceschanged = null;
        };
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSpeakingText(text);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setSpeakingText(null);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setSpeakingText(null);
      };

      window.speechSynthesis.speak(utterance);
      // Mise à jour optimiste pour retour immédiat sur mobile
      setIsSpeaking(true);
      setSpeakingText(text);
    },
    [supported],
  );

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!supported) return;

      // Toggle : si ce texte est déjà en lecture → stopper
      if (isSpeaking && speakingText === text) {
        stop();
        return;
      }

      // Premier usage ou choix non mémorisé → modal de consentement
      if (!hasConsent || voiceMode === null) {
        pendingRef.current = { text, lang };
        setShowConsentModal(true);
        return;
      }

      _doSpeak(text, lang, voiceMode);
    },
    [supported, isSpeaking, speakingText, hasConsent, voiceMode, stop, _doSpeak],
  );

  const grantConsent = useCallback(
    (mode: TtsVoiceMode) => {
      lsSet(LS_CONSENT, "1");
      lsSet(LS_MODE, mode);
      setHasConsent(true);
      setVoiceMode(mode);
      setShowConsentModal(false);

      // Lancer la lecture en attente
      if (pendingRef.current) {
        const { text, lang } = pendingRef.current;
        pendingRef.current = null;
        _doSpeak(text, lang, mode);
      }
    },
    [_doSpeak],
  );

  const dismissConsent = useCallback(() => {
    setShowConsentModal(false);
    pendingRef.current = null;
  }, []);

  return {
    isSpeaking,
    speakingText,
    hasConsent,
    voiceMode,
    showConsentModal,
    supported,
    speak,
    stop,
    grantConsent,
    dismissConsent,
  };
}
