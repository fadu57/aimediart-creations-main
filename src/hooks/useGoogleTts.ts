/**
 * useGoogleTts — lecture vocale via Google Cloud Text-to-Speech (Edge Function google-tts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface UseGoogleTtsReturn {
  speak: (text: string, language: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  speakingText: string;
  error: string | null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useGoogleTts(): UseGoogleTtsReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speakingText, setSpeakingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const requestIdRef = useRef(0);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch {
        /* déjà arrêté */
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
    setSpeakingText("");
  }, []);

  useEffect(() => {
    return () => {
      stop();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [stop]);

  const fetchAudioBuffer = useCallback(
    async (text: string, language: string): Promise<AudioBuffer> => {
      const { data, error: invokeError } = await supabase.functions.invoke<{
        audioContent?: string;
        voiceName?: string;
        error?: string;
      }>("google-tts", {
        body: { text, language, randomVoice: true },
      });

      if (invokeError) {
        throw new Error(invokeError.message || "Appel google-tts échoué.");
      }

      const apiError = data?.error;
      if (apiError) {
        throw new Error(apiError);
      }

      const audioContent = data?.audioContent;
      if (!audioContent) {
        throw new Error("Réponse google-tts sans audio.");
      }

      const ctx = getAudioContext();
      const arrayBuffer = base64ToArrayBuffer(audioContent);
      return ctx.decodeAudioData(arrayBuffer.slice(0));
    },
    [getAudioContext],
  );

  const playBuffer = useCallback(
    (buffer: AudioBuffer, text: string, requestId: number) => {
      const ctx = getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      sourceRef.current = source;

      source.onended = () => {
        if (requestIdRef.current !== requestId) return;
        sourceRef.current = null;
        setIsSpeaking(false);
        setSpeakingText("");
      };

      source.start(0);
      setIsSpeaking(true);
      setSpeakingText(text);
    },
    [getAudioContext],
  );

  const speak = useCallback(
    async (text: string, language: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (isSpeaking && speakingText === trimmed) {
        stop();
        return;
      }

      stop();
      const requestId = requestIdRef.current;
      setError(null);
      setIsLoading(true);
      setSpeakingText(trimmed);

      try {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const buffer = await fetchAudioBuffer(trimmed, language);
        if (requestIdRef.current !== requestId) return;

        setIsLoading(false);
        playBuffer(buffer, trimmed, requestId);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        const message = err instanceof Error ? err.message : "Erreur de lecture vocale.";
        console.warn("[useGoogleTts]", message);
        setError(message);
        setIsLoading(false);
        setIsSpeaking(false);
        setSpeakingText("");
      }
    },
    [fetchAudioBuffer, getAudioContext, isSpeaking, playBuffer, speakingText, stop],
  );

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    speakingText,
    error,
  };
}
