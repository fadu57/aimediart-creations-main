import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  getAudioFiles,
  getAudioUrl,
  triggerAudioGeneration,
  type AudioFile,
  type AudioGender,
  type AudioTextType,
} from "@/services/audioService";
import { cn } from "@/lib/utils";

type AudioPlayerProps = {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  className?: string;
  variant?: "onDark" | "onLight";
};

const POLL_MS = 5000;

function pickFileForGender(files: AudioFile[], gender: AudioGender, lang: string, prompt_style_id: string) {
  return files.find(
    (f) =>
      f.gender === gender &&
      f.lang === lang &&
      f.prompt_style_id === prompt_style_id,
  );
}

export function AudioPlayer({
  text_id,
  text_type,
  lang,
  prompt_style_id,
  className,
  variant = "onDark",
}: AudioPlayerProps) {
  const { t } = useTranslation("artwork_modal");
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [playingGender, setPlayingGender] = useState<AudioGender | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(async () => {
    if (!text_id?.trim() || !prompt_style_id?.trim()) {
      setFiles([]);
      setLoading(false);
      return;
    }
    const rows = await getAudioFiles(text_id, text_type);
    setFiles(rows);
    setLoading(false);
    return rows;
  }, [text_id, text_type]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const fileF = pickFileForGender(files, "F", lang, prompt_style_id);
  const fileM = pickFileForGender(files, "M", lang, prompt_style_id);
  const isGenerating =
    generating ||
    fileF?.status === "generating" ||
    fileM?.status === "generating" ||
    fileF?.status === "pending" ||
    fileM?.status === "pending";

  useEffect(() => {
    if (!isGenerating) return;
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [isGenerating, refresh]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingGender(null);
  };

  const handlePlay = async (gender: AudioGender) => {
    const file = gender === "F" ? fileF : fileM;
    if (!file || file.status !== "ready" || !file.storage_path) return;

    if (playingGender === gender) {
      stopPlayback();
      return;
    }

    stopPlayback();
    try {
      const url = await getAudioUrl(file.storage_path);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingGender(gender);
      audio.onended = () => setPlayingGender(null);
      audio.onerror = () => {
        console.error("[AudioPlayer] lecture impossible");
        setPlayingGender(null);
      };
      await audio.play();
    } catch (e) {
      console.error("[AudioPlayer] getAudioUrl:", e);
      setPlayingGender(null);
    }
  };

  const handleGenerate = () => {
    setGenerating(true);
    void triggerAudioGeneration({ text_id, text_type, lang, prompt_style_id })
      .catch(console.error)
      .finally(() => {
        setGenerating(false);
        void refresh();
      });
  };

  const shellClass =
    variant === "onLight"
      ? "border-neutral-200 bg-neutral-50 text-neutral-800"
      : "border-white/20 bg-white/5 text-white";

  const btnClass =
    variant === "onLight"
      ? "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100"
      : "border-white/30 bg-[#2A2A2A] text-[#F0F0F0] hover:bg-[#353535]";

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs opacity-70", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        <span>{t("audio_player.loading")}</span>
      </div>
    );
  }

  const readyF = fileF?.status === "ready" && !!fileF.storage_path;
  const readyM = fileM?.status === "ready" && !!fileM.storage_path;
  const hasAnyFile = !!fileF || !!fileM;

  if (!hasAnyFile || (!readyF && !readyM && !isGenerating)) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("h-8 gap-1.5 text-xs", btnClass)}
          disabled={generating || !text_id || !prompt_style_id}
          onClick={handleGenerate}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
          )}
          {t("audio_player.generate")}
        </Button>
      </div>
    );
  }

  if (isGenerating && !readyF && !readyM) {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", shellClass, className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
        <span>{t("audio_player.generating")}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {(["F", "M"] as const).map((gender) => {
        const file = gender === "F" ? fileF : fileM;
        const ready = file?.status === "ready" && !!file.storage_path;
        const busy = file?.status === "generating" || file?.status === "pending";
        const isPlaying = playingGender === gender;

        if (!file && !busy) return null;

        return (
          <button
            key={gender}
            type="button"
            disabled={!ready && !busy}
            onClick={() => void handlePlay(gender)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              btnClass,
              !ready && busy && "cursor-wait opacity-70",
              isPlaying && "border-[#E63946] text-[#E63946]",
            )}
            aria-label={t(gender === "F" ? "audio_player.play_f" : "audio_player.play_m")}
          >
            {busy && !ready ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : isPlaying ? (
              <Pause className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{gender === "F" ? t("audio_player.voice_f") : t("audio_player.voice_m")}</span>
          </button>
        );
      })}
    </div>
  );
}
