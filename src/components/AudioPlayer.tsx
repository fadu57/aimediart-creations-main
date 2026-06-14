import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

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

import { useIndoorAudioGuard } from "@/hooks/useIndoorAudioGuard";
import { cn } from "@/lib/utils";



type AudioPlayerProps = {

  text_id: string;

  text_type: AudioTextType;

  lang: string;

  prompt_style_id: string;

  className?: string;

  variant?: "onDark" | "onLight";

  /** Vue visiteur : lecture audio uniquement, pas de génération. */

  playOnly?: boolean;

  /** Boutons Voix F/M plus petits, alignés sur une seule ligne. */

  compact?: boolean;

  /** Ouvre le dialogue de génération (fiche œuvre) au lieu de lancer F+M sur la langue courante. */
  onGenerateClick?: () => void;

  /** Bouton pour rouvrir le dialogue lorsque des voix existent déjà. */
  onManageVoicesClick?: () => void;

};



const POLL_MS = 5000;

const STALE_GENERATING_MS = 3 * 60 * 1000;



function normLang(l: string): string {

  return l.trim().toLowerCase().slice(0, 2);

}



/** Correspondance stricte langue + persona (état génération / erreur). */

function pickFileStrict(

  files: AudioFile[],

  gender: AudioGender,

  lang: string,

  prompt_style_id: string,

) {

  return files.find(

    (f) =>

      f.gender === gender &&

      normLang(f.lang) === normLang(lang) &&

      f.prompt_style_id === prompt_style_id,

  );

}



/** Cherche un fichier audio prêt : langue demandée → fr → autre ; style exact → autre style. */

function pickFileForPlay(files: AudioFile[], gender: AudioGender, lang: string, prompt_style_id: string) {

  const langCandidates = [

    ...new Set([normLang(lang), "fr", ...files.map((f) => normLang(f.lang))]),

  ].filter(Boolean);



  for (const l of langCandidates) {

    const exact = files.find(

      (f) =>

        f.gender === gender &&

        normLang(f.lang) === l &&

        f.prompt_style_id === prompt_style_id &&

        f.status === "ready" &&

        f.storage_path,

    );

    if (exact) return exact;

  }

  for (const l of langCandidates) {

    const loose = files.find(

      (f) => f.gender === gender && normLang(f.lang) === l && f.status === "ready" && f.storage_path,

    );

    if (loose) return loose;

  }

  return (

    files.find(

      (f) =>

        f.gender === gender && f.prompt_style_id === prompt_style_id && f.status === "ready" && f.storage_path,

    ) ?? files.find((f) => f.gender === gender && f.status === "ready" && f.storage_path)

  );

}



function isActiveGeneration(file: AudioFile | undefined): boolean {

  if (!file || (file.status !== "generating" && file.status !== "pending")) return false;

  const ts = file.updated_at ?? file.created_at;

  if (!ts) return false;

  return Date.now() - new Date(ts).getTime() <= STALE_GENERATING_MS;

}



function isFailedGeneration(file: AudioFile | undefined): boolean {

  if (!file) return false;

  if (file.status === "error") return true;

  if (file.status !== "generating" && file.status !== "pending") return false;

  const ts = file.updated_at ?? file.created_at;

  if (!ts) return true;

  return Date.now() - new Date(ts).getTime() > STALE_GENERATING_MS;

}



export function AudioPlayer({

  text_id,

  text_type,

  lang,

  prompt_style_id,

  className,

  variant = "onDark",

  playOnly = false,

  compact = false,

  onGenerateClick,

  onManageVoicesClick,

}: AudioPlayerProps) {

  const { t } = useTranslation("artwork_modal");
  const audioGuard = useIndoorAudioGuard();

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

  }, [text_id, text_type, prompt_style_id]);



  useEffect(() => {

    setLoading(true);

    void refresh();

  }, [refresh]);



  const fileF = pickFileStrict(files, "F", lang, prompt_style_id);

  const fileM = pickFileStrict(files, "M", lang, prompt_style_id);

  const playF = pickFileForPlay(files, "F", lang, prompt_style_id);

  const playM = pickFileForPlay(files, "M", lang, prompt_style_id);



  const isGenerating =

    generating || isActiveGeneration(fileF) || isActiveGeneration(fileM);

  const hasFailed = isFailedGeneration(fileF) || isFailedGeneration(fileM);



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



  useEffect(() => {

    return audioGuard.registerPauseCallback(() => stopPlayback());

  }, [audioGuard]);



  const handlePlay = async (gender: AudioGender, e?: MouseEvent) => {

    e?.preventDefault();

    e?.stopPropagation();

    if (!audioGuard.assertCanPlay()) return;



    const file = gender === "F" ? playF : playM;

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

    if (playOnly) return null;

    return (

      <div className={cn("flex items-center gap-2 text-xs opacity-70", className)}>

        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />

        <span>{t("audio_player.loading")}</span>

      </div>

    );

  }



  const readyF = !!playF;

  const readyM = !!playM;



  if (playOnly) {

    if (!readyF && !readyM) return null;

  } else if (!readyF && !readyM && !isGenerating) {

    return (

      <div className={cn("flex flex-col gap-1.5", className)}>

        {hasFailed && (

          <p className={cn("text-[11px] opacity-80", variant === "onLight" ? "text-red-700" : "text-red-300")}>

            {t("audio_player.error")}

          </p>

        )}

        <div className="flex flex-wrap items-center gap-2">

          <Button

            type="button"

            size="sm"

            variant="outline"

            className={cn("h-8 gap-1.5 text-xs", btnClass)}

            disabled={generating || !text_id || !prompt_style_id}

            onClick={() => {
              if (onGenerateClick) onGenerateClick();
              else handleGenerate();
            }}

          >

            {generating ? (

              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />

            ) : (

              <Volume2 className="h-3.5 w-3.5" aria-hidden />

            )}

            {hasFailed ? t("audio_player.retry") : t("audio_player.generate")}

          </Button>

        </div>

      </div>

    );

  }



  if (!playOnly && isGenerating && !readyF && !readyM) {

    return (

      <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", shellClass, className)}>

        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />

        <span>{t("audio_player.generating")}</span>

      </div>

    );

  }



  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  return (

    <div
      className={cn(
        "flex items-center shrink-0",
        compact ? "flex-nowrap gap-1" : "flex-wrap gap-2",
        className,
      )}
    >

      {(["F", "M"] as const).map((gender) => {

        const file = gender === "F" ? fileF : fileM;

        const playFile = gender === "F" ? playF : playM;

        const ready = !!playFile;

        const busy = isActiveGeneration(file);

        const isPlaying = playingGender === gender;



        if (playOnly) {

          if (!ready) return null;

        } else if (!file && !busy && !ready) {

          return null;

        }



        return (

          <button

            key={gender}

            type="button"

            disabled={!ready}

            onClick={(e) => void handlePlay(gender, e)}

            className={cn(

              "inline-flex items-center rounded-full border font-semibold transition-colors",

              compact ? "gap-1 px-2 py-0.5 text-[10px]" : "gap-1.5 px-2.5 py-1 text-[11px]",

              btnClass,

              !playOnly && !ready && busy && "cursor-wait opacity-70",

              !ready && "cursor-not-allowed opacity-50",

              isPlaying && "border-[#E63946] text-[#E63946]",

            )}

            aria-label={t(gender === "F" ? "audio_player.play_f" : "audio_player.play_m")}

          >

            {!playOnly && busy && !ready ? (

              <Loader2 className={cn(iconSize, "animate-spin shrink-0")} aria-hidden />

            ) : isPlaying ? (

              <Pause className={cn(iconSize, "shrink-0")} aria-hidden />

            ) : (

              <Play className={cn(iconSize, "shrink-0")} aria-hidden />

            )}

            <span>{gender === "F" ? t("audio_player.voice_f") : t("audio_player.voice_m")}</span>

          </button>

        );

      })}

      {!playOnly && onManageVoicesClick ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("h-8 gap-1.5 text-xs", btnClass)}
          onClick={onManageVoicesClick}
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
          {t("audio_player.manage_voices")}
        </Button>
      ) : null}

    </div>

  );

}


