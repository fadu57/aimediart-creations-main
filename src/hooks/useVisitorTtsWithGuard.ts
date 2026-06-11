/**
 * TTS visiteur couplé à la garde audio intérieur (consentement, ban, écouteurs).
 * À utiliser uniquement sous IndoorAudioGuardProvider.
 */

import { useCallback, useEffect } from "react";

import { useGoogleTts } from "@/hooks/useGoogleTts";
import { useIndoorAudioGuard } from "@/hooks/useIndoorAudioGuard";

export function useVisitorTtsWithGuard() {
  const guard = useIndoorAudioGuard();
  const tts = useGoogleTts();

  useEffect(() => {
    return guard.registerPauseCallback(() => tts.stop());
  }, [guard, tts]);

  const speak = useCallback(
    (text: string, language: string) => {
      if (!guard.assertCanPlay()) return Promise.resolve();
      return tts.speak(text, language);
    },
    [guard, tts],
  );

  return {
    ...tts,
    speak,
    guard,
  };
}
