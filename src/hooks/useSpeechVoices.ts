/**
 * useSpeechVoices — chargement et sélection des voix de synthèse vocale (Web Speech API).
 *
 * Gère le cas Chrome/Android où `getVoices()` retourne un tableau vide au premier appel
 * et où les voix arrivent via l'événement `voiceschanged`.
 *
 * Usage :
 *   const { voices, getBestVoiceForLang, isLoadingVoices } = useSpeechVoices();
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Mapping application → locales SpeechSynthesis ────────────────────────────

/**
 * Correspondances codes app (2 lettres) → locales SpeechSynthesis préférées.
 * L'ordre dans le tableau détermine la priorité de match exact.
 */
export const LANG_TO_LOCALES: Record<string, string[]> = {
  fr: ["fr-FR", "fr-BE", "fr-CA", "fr-CH"],
  de: ["de-DE", "de-AT", "de-CH"],
  en: ["en-GB", "en-US", "en-AU", "en-IE", "en-IN"],
  es: ["es-ES", "es-MX", "es-US", "es-AR"],
  it: ["it-IT", "it-CH"],
};

// ── Scoring de qualité des voix ───────────────────────────────────────────────

/**
 * Heuristique : les voix "naturelles" ont tendance à contenir ces mots-clés.
 * On préfère les voix Google, Apple et Microsoft Zira/Hazel (meilleures).
 */
const HIGH_QUALITY_PATTERNS = [
  /google/i,
  /natural/i,
  /premium/i,
  /enhanced/i,
  /neural/i,
  /siri/i,
  /amelie/i, // macOS FR
  /thomas/i, // macOS FR
  /anna/i,   // macOS DE
  /zira/i,   // Windows EN
  /hazel/i,  // Windows EN
  /jorge/i,  // macOS ES
  /alice/i,  // macOS IT
];

function qualityScore(voice: SpeechSynthesisVoice): number {
  let score = 0;
  for (const pattern of HIGH_QUALITY_PATTERNS) {
    if (pattern.test(voice.name)) { score += 10; break; }
  }
  // Les voix locales (non réseau) ont tendance à être plus stables
  if (voice.localService) score += 2;
  return score;
}

// ── Sélection de la meilleure voix ───────────────────────────────────────────

/**
 * Retourne la meilleure voix disponible pour un code langue donné.
 *
 * @param voices  Liste complète des voix disponibles
 * @param lang    Code ISO : '2 lettres' (ex: 'fr') ou 'xx-XX' (ex: 'fr-FR')
 *
 * Stratégie :
 *  1. Voix avec correspondance locale exacte (fr-FR), triées par score qualité
 *  2. Voix avec même préfixe (fr-*), triées par score qualité
 *  3. Première voix disponible (fallback absolu)
 */
export function getBestVoiceForLang(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;

  const base = lang.split(/[-_]/)[0].toLowerCase();
  const preferredLocales = LANG_TO_LOCALES[base] ?? [];
  const inputLocale = lang.includes("-") ? lang.toLowerCase() : undefined;

  const scored = (list: SpeechSynthesisVoice[]) =>
    [...list].sort((a, b) => qualityScore(b) - qualityScore(a));

  // Priorité 1 : correspondance exacte sur le locale fourni
  if (inputLocale) {
    const exact = scored(voices.filter((v) => v.lang.toLowerCase() === inputLocale));
    if (exact.length) return exact[0];
  }

  // Priorité 2 : locales préférées pour cette langue (dans l'ordre de la map)
  for (const locale of preferredLocales) {
    const match = scored(voices.filter((v) => v.lang.toLowerCase() === locale.toLowerCase()));
    if (match.length) return match[0];
  }

  // Priorité 3 : n'importe quelle voix avec le bon préfixe
  const byPrefix = scored(voices.filter((v) => v.lang.toLowerCase().startsWith(base)));
  if (byPrefix.length) return byPrefix[0];

  // Priorité 4 : fallback absolu (voix quelconque)
  return voices[0];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSpeechVoicesResult {
  /** Toutes les voix disponibles dans ce navigateur */
  voices: SpeechSynthesisVoice[];
  /** true tant que les voix n'ont pas encore été chargées */
  isLoadingVoices: boolean;
  /** Message d'erreur si Web Speech non supporté */
  error?: string;
  /** Sélectionne la meilleure voix pour un code langue donné */
  getBestVoiceForLang: (lang: string) => SpeechSynthesisVoice | undefined;
}

export function useSpeechVoices(): UseSpeechVoicesResult {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const loadedRef = useRef(false);

  const loadVoices = useCallback(() => {
    if (!supported) return;
    const list = window.speechSynthesis.getVoices();
    if (list.length > 0) {
      setVoices(list);
      setIsLoadingVoices(false);
      loadedRef.current = true;
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) {
      setIsLoadingVoices(false);
      return;
    }

    // Tentative synchrone (Firefox, Safari)
    loadVoices();

    // Chrome/Android : les voix arrivent en différé via voiceschanged
    const handler = () => { loadVoices(); };
    window.speechSynthesis.addEventListener("voiceschanged", handler);

    // Fallback polling : certains navigateurs n'émettent pas voiceschanged
    const timer = setInterval(() => {
      if (loadedRef.current) { clearInterval(timer); return; }
      loadVoices();
    }, 300);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      // Si toujours vide après 3s, on arrête d'attendre
      setIsLoadingVoices(false);
    }, 3000);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [supported, loadVoices]);

  const getBest = useCallback(
    (lang: string) => getBestVoiceForLang(voices, lang),
    [voices],
  );

  return {
    voices,
    isLoadingVoices,
    error: !supported ? "Web Speech API non supportée par ce navigateur." : undefined,
    getBestVoiceForLang: getBest,
  };
}
