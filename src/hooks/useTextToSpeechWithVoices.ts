/**
 * useTextToSpeechWithVoices — lecteur vocal complet avec :
 *  - gestion du consentement RGPD + choix écouteurs/sans écouteurs
 *  - sélection automatique de la meilleure voix par langue
 *  - préférences de voix persistées par langue (localStorage)
 *
 * Remplace `useTextToSpeech` — interface compatible + nouvelles props voix.
 *
 * Usage dans VisitorView :
 *   const tts = useTextToSpeechWithVoices();
 *   tts.speak(slide.text, language);
 *   // Optionnel : exposer VoiceSelector pour chaque langue
 *   <VoiceSelector lang={language} voices={tts.availableVoices}
 *     preferredVoiceName={tts.preferredVoices[language]}
 *     onChange={(name) => tts.setPreferredVoice(language, name)} />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechVoices, LANG_TO_LOCALES } from "./useSpeechVoices";

// ── Types ────────────────────────────────────────────────────────────────────

export type TtsVoiceMode = "headphones" | "no_headphones";

/** Voix préférée par langue (ex: { fr: "Google français", en: "Google UK English Female" }) */
export type VoicePreference = Record<string, string>;

export interface UseTextToSpeechWithVoicesOptions {
  /** Clé localStorage pour les préférences de voix (défaut : "aimediart_tts_voices_v1") */
  storageKey?: string;
}

export interface UseTextToSpeechWithVoicesResult {
  // ── Hérité de l'interface TtsState (rétro-compatible) ──
  isSpeaking: boolean;
  speakingText: string | null;
  hasConsent: boolean;
  voiceMode: TtsVoiceMode | null;
  showConsentModal: boolean;
  supported: boolean;
  speak: (text: string, lang: string) => void;
  stop: () => void;
  grantConsent: (mode: TtsVoiceMode) => void;
  dismissConsent: () => void;
  // ── Nouvelles props voix ──
  /** Toutes les voix disponibles dans ce navigateur */
  availableVoices: SpeechSynthesisVoice[];
  /** true pendant le chargement initial des voix */
  isLoadingVoices: boolean;
  /** Retourne la voix préférée ou la meilleure auto pour un code langue */
  getVoiceForLang: (lang: string) => SpeechSynthesisVoice | undefined;
  /** Définir une voix préférée (persiste en localStorage) */
  setPreferredVoice: (lang: string, voiceName: string) => void;
  /** Map des préférences mémorisées */
  preferredVoices: VoicePreference;
}

// ── Constantes localStorage ───────────────────────────────────────────────────

const LS_CONSENT = "aimediart_tts_consent_v1";
const LS_MODE = "aimediart_tts_mode_v1";
const DEFAULT_VOICES_KEY = "aimediart_tts_voices_v1";

// ── Mapping code app → locale SpeechSynthesis ────────────────────────────────

const LANG_MAP: Record<string, string> = {
  fr: "fr-FR",
  de: "de-DE",
  en: "en-GB",
  es: "es-ES",
  it: "it-IT",
};

/** Normalise 'fr' → 'fr-FR', 'fr-FR' → 'fr-FR' */
function normalizeLocale(lang: string): string {
  if (lang.includes("-")) return lang;
  const base = lang.toLowerCase();
  return LANG_MAP[base] ?? lang;
}

/** Extrait le code 2 lettres depuis 'fr-FR' → 'fr' */
function baseLang(lang: string): string {
  return lang.split(/[-_]/)[0].toLowerCase();
}

// ── Helpers localStorage ─────────────────────────────────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* SSR / privé */ }
}
function lsGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* */ }
  return fallback;
}
function lsSetJson(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTextToSpeechWithVoices(
  options: UseTextToSpeechWithVoicesOptions = {},
): UseTextToSpeechWithVoicesResult {
  const storageKey = options.storageKey ?? DEFAULT_VOICES_KEY;

  const { voices, isLoadingVoices, getBestVoiceForLang } = useSpeechVoices();
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  // ── État consentement / volume (rétro-compatible) ──────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [hasConsent, setHasConsent] = useState<boolean>(() => lsGet(LS_CONSENT) === "1");
  const [voiceMode, setVoiceMode] = useState<TtsVoiceMode | null>(() => {
    const s = lsGet(LS_MODE);
    return s === "headphones" || s === "no_headphones" ? s : null;
  });
  const [showConsentModal, setShowConsentModal] = useState(false);

  // ── Préférences de voix par langue ─────────────────────────────────────────
  const [preferredVoices, setPreferredVoicesState] = useState<VoicePreference>(() =>
    lsGetJson<VoicePreference>(storageKey, {}),
  );

  const pendingRef = useRef<{ text: string; lang: string } | null>(null);

  // Nettoyage à la destruction
  useEffect(() => {
    return () => { if (supported) window.speechSynthesis.cancel(); };
  }, [supported]);

  // ── Sélection de voix ──────────────────────────────────────────────────────

  /**
   * Retourne la voix à utiliser pour un code langue.
   * Priorité : voix préférée mémorisée > meilleure voix automatique.
   */
  const getVoiceForLang = useCallback(
    (lang: string): SpeechSynthesisVoice | undefined => {
      const base = baseLang(lang);
      const locale = normalizeLocale(lang);

      // 1. Voix préférée mémorisée (lookup par base ou locale)
      const preferredName = preferredVoices[base] ?? preferredVoices[locale];
      if (preferredName && voices.length) {
        const found = voices.find((v) => v.name === preferredName);
        if (found) return found;
      }

      // 2. Meilleure voix automatique
      return getBestVoiceForLang(locale);
    },
    [voices, preferredVoices, getBestVoiceForLang],
  );

  // ── Persistance de la préférence ──────────────────────────────────────────

  const setPreferredVoice = useCallback(
    (lang: string, voiceName: string) => {
      const base = baseLang(lang);
      setPreferredVoicesState((prev) => {
        const next = { ...prev, [base]: voiceName };
        lsSetJson(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  // ── Lecture ───────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setSpeakingText(null);
  }, [supported]);

  /** Lance effectivement la synthèse (consentement déjà acquis). */
  const _doSpeak = useCallback(
    (text: string, lang: string, mode: TtsVoiceMode) => {
      if (!supported) return;

      // Bloque si les voix ne sont pas encore prêtes
      if (isLoadingVoices && voices.length === 0) {
        console.warn("[TTS] Voix pas encore chargées, réessai dans 500ms…");
        const retry = setTimeout(() => _doSpeak(text, lang, mode), 500);
        return () => clearTimeout(retry);
      }

      window.speechSynthesis.cancel();

      const locale = normalizeLocale(lang);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      utterance.volume = mode === "no_headphones" ? 0.1 : 1.0;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Appliquer la meilleure voix (préférée ou auto)
      const voice = getVoiceForLang(lang);
      if (voice) {
        utterance.voice = voice;
      } else {
        console.warn(`[TTS] Aucune voix trouvée pour '${lang}' (locale: ${locale}).`);
      }

      utterance.onstart = () => { setIsSpeaking(true); setSpeakingText(text); };
      utterance.onend   = () => { setIsSpeaking(false); setSpeakingText(null); };
      utterance.onerror = (e) => {
        console.warn("[TTS] SpeechSynthesisUtterance error:", e.error);
        setIsSpeaking(false);
        setSpeakingText(null);
      };

      window.speechSynthesis.speak(utterance);
      // Mise à jour optimiste (feedback immédiat sur mobile)
      setIsSpeaking(true);
      setSpeakingText(text);
    },
    [supported, isLoadingVoices, voices, getVoiceForLang],
  );

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!supported) return;

      // Toggle : re-clic sur le même bloc → stop
      if (isSpeaking && speakingText === text) { stop(); return; }

      // Premier usage → modal de consentement
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

  // ── Retour ────────────────────────────────────────────────────────────────

  return {
    // Rétro-compatible TtsState
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
    // Nouvelles props voix
    availableVoices: voices,
    isLoadingVoices,
    getVoiceForLang,
    setPreferredVoice,
    preferredVoices,
  };
}

// ── Export utilitaire ────────────────────────────────────────────────────────

/**
 * Filtre les voix disponibles pour une langue donnée (pour VoiceSelector).
 *
 * @param voices  Liste complète des voix
 * @param lang    Code 2 lettres ou locale 'xx-XX'
 */
export function filterVoicesForLang(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice[] {
  const base = baseLang(lang);
  const locales = (LANG_TO_LOCALES[base] ?? []).map((l) => l.toLowerCase());
  return voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith(base) ||
      locales.includes(v.lang.toLowerCase()),
  );
}
