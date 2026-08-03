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
import {
  claimMediationAudioPlayback,
  interruptMediationAudioPlayback,
  releaseMediationAudioPlayback,
} from "@/lib/mediationAudioPlayback";
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

  /** Vitesse de lecture HTML (1 = normal). Ex. personae Pote / Conteur. */
  playbackRate?: number;

  /** Ouvre le dialogue de génération (fiche œuvre) au lieu de lancer F+M sur la langue courante. */
  onGenerateClick?: () => void;

  /** Bouton pour rouvrir le dialogue lorsque des voix existent déjà. */
  onManageVoicesClick?: () => void;

  /** Désactive la génération (ex. plan Étincelle). */
  generateDisabled?: boolean;

  /** Message affiché à droite du bouton lorsque generateDisabled est true. */
  generateDisabledHint?: string;

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

  playbackRate = 1,

  onGenerateClick,

  onManageVoicesClick,

  generateDisabled = false,

  generateDisabledHint,

}: AudioPlayerProps) {

  const { t } = useTranslation("artwork_modal");
  const audioGuard = useIndoorAudioGuard();

  const [files, setFiles] = useState<AudioFile[]>([]);

  const [loading, setLoading] = useState(true);

  const [generating, setGenerating] = useState(false);

  const [playingGender, setPlayingGender] = useState<AudioGender | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPlaybackRef = useRef<() => void>(() => {});

  stopPlaybackRef.current = () => {

    audioRef.current?.pause();

    audioRef.current = null;

    setPlayingGender(null);

    releaseMediationAudioPlayback(stopPlaybackRef.current);

  };

  const stopPlayback = useCallback(() => {

    stopPlaybackRef.current();

  }, []);

  const urlCacheRef = useRef<Map<string, string>>(new Map());

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



  useEffect(() => {
    // Précharge l'URL signée dès que les fichiers sont prêts, pour que le
    // clic puisse appeler play() de façon synchrone avec la vraie source déjà
    // en main — indispensable sur WebKit (Safari desktop/iOS, Chrome iOS) où
    // un await réseau entre le geste utilisateur et audio.play() fait
    // échouer la lecture en silence (aucune erreur visible côté visiteur).
    [playF?.storage_path, playM?.storage_path]
      .filter((p): p is string => !!p && !urlCacheRef.current.has(p))
      .forEach((path) => {
        urlCacheRef.current.set(path, "");
        void getAudioUrl(path)
          .then((url) => urlCacheRef.current.set(path, url))
          .catch(() => urlCacheRef.current.delete(path));
      });
  }, [playF?.storage_path, playM?.storage_path]);



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

      stopPlayback();

    };

  }, [stopPlayback]);



  useEffect(() => {

    return audioGuard.registerPauseCallback(stopPlayback);

  }, [audioGuard, stopPlayback]);



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



    interruptMediationAudioPlayback();

    stopPlayback();

    let audio: HTMLAudioElement | undefined;
    // Hors du try : doit rester lisible dans le catch et dans les handlers
    // onended/onerror pour le diagnostic (quelle branche a été empruntée).
    let cachedUrl: string | undefined;

    const diagContext = () => ({
      branch: cachedUrl ? "cache" : "network",
      readyState: audio?.readyState,
      networkState: audio?.networkState,
      currentSrc: audio?.currentSrc,
      mediaErrorCode: audio?.error?.code,
      mediaErrorMessage: audio?.error?.message,
    });

    try {

      // iOS Safari n'autorise play() qu'appelé de façon synchrone dans le
      // geste utilisateur : un await réseau (signature de l'URL) avant le
      // premier play() casse cette activation et la lecture échoue en
      // silence (aucune erreur visible, le bouton semble ne rien faire).
      // Si l'URL est déjà en cache (préchargée dès que les fichiers sont
      // prêts, cf. useEffect plus haut), on l'assigne ici avant le premier
      // play() : ce play() synchrone porte alors la VRAIE source, sans
      // attente réseau intercalée. Sinon, on retombe sur l'amorçage à vide
      // puis l'attente réseau ci-dessous (même risque WebKit que par le passé,
      // cas rare : clic avant la fin du préchargement).
      audio = new Audio();
      audioRef.current = audio;
      cachedUrl = urlCacheRef.current.get(file.storage_path) || undefined;
      if (cachedUrl) {
        // URL déjà préchargée : le VRAI play() (plus bas) porte directement
        // cette source, sans second play() réel sur le même élément (root
        // cause suspectée du NotSupportedError observé en prod, non encore
        // confirmée sur Safari réel — cf. AIM-30). .load() explicite ajouté
        // par prudence : sur un élément jamais attaché au DOM, l'assignation
        // seule de .src pourrait ne pas suffire sur WebKit.
        audio.src = cachedUrl;
        audio.load();
      } else {
        try {
          // Safari peut lever NotSupportedError de façon SYNCHRONE (pas une
          // promesse rejetée) quand play() est appelé sans src encore défini.
          // Le .catch() ci-dessous ne couvre que le rejet de promesse ; sans ce
          // try/catch, l'exception remonte au catch englobant et avorte tout le
          // flux avant même la résolution de l'URL signée.
          void audio.play().catch(() => {});
        } catch {
          /* ignore : l'activation du geste utilisateur reste effective pour le play() réel plus bas */
        }
      }

      setPlayingGender(gender);

      claimMediationAudioPlayback(stopPlaybackRef.current);

      audio.onended = () => {
        if (audioRef.current !== audio) return; // remplacé entre-temps (ex. re-clic F/M)
        stopPlayback();
      };

      audio.onerror = () => {
        if (audioRef.current !== audio) return; // remplacé entre-temps (ex. re-clic F/M)
        console.error("[AudioPlayer] lecture impossible :", diagContext());
        stopPlayback();
      };

      if (!cachedUrl) {
        const url = await getAudioUrl(file.storage_path);

        if (audioRef.current !== audio) return; // stoppé/remplacé pendant l'attente réseau

        audio.src = url;
        urlCacheRef.current.set(file.storage_path, url);
        audio.load();
      }

      // playbackRate doit être (ré)appliqué après le(s) load() ci-dessus :
      // l'algorithme de chargement HTML média remet playbackRate à sa valeur
      // par défaut (1), donc l'assigner avant load() serait silencieusement
      // écrasé dans la branche réseau.
      const rate =
        typeof playbackRate === "number" && Number.isFinite(playbackRate) && playbackRate > 0
          ? Math.min(1.25, Math.max(0.85, playbackRate))
          : 1;
      audio.playbackRate = rate;
      // Garde le pitch perçu plus naturel sur navigateurs qui supportent preservesPitch.
      try {
        (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        (audio as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
        (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      } catch {
        /* ignore */
      }

      await audio.play();

    } catch (e) {

      if (audio && audioRef.current !== audio) return; // remplacé entre-temps (ex. re-clic F/M) : ne pas couper la lecture en cours

      // Contexte de diagnostic conservé volontairement : deux correctifs
      // précédents sur ce même symptôme (NotSupportedError WebKit) se sont
      // révélés insuffisants une fois testés en prod. Ces valeurs permettent
      // de trancher au prochain échec plutôt que de recommencer un cycle de
      // suppositions.
      console.error(
        "[AudioPlayer] échec de lecture :",
        e instanceof Error ? `${e.name} — ${e.message}` : e,
        diagContext(),
      );

      stopPlayback();

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

      ? "border-neutral-300 bg-white text-black hover:bg-neutral-100"

      : "border-white/30 bg-[#2A2A2A] text-[#F0F0F0] hover:bg-[#353535]";



  if (loading) {

    if (playOnly) {
      return (
        <div className={cn("flex shrink-0 items-center gap-1", className)} aria-busy="true" aria-label={t("audio_player.loading")}>
          <Loader2 className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", "animate-spin opacity-70")} aria-hidden />
        </div>
      );
    }

    return (

      <div className={cn("flex items-center gap-2 text-xs opacity-70", className)}>

        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />

        <span>{t("audio_player.loading")}</span>

      </div>

    );

  }



  const readyF = !!playF;

  const readyM = !!playM;



  // playOnly (vue visiteur) : n'afficher les boutons que si au moins une voix est prête.
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

            disabled={generating || !text_id || !prompt_style_id || generateDisabled}

            onClick={() => {
              if (generateDisabled) return;
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

          {generateDisabled && generateDisabledHint ? (
            <p className="text-[11px] font-medium text-destructive">{generateDisabledHint}</p>
          ) : null}

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
              // appearance-none : Safari iOS peut styler/écraser les <button> natifs
              "inline-flex shrink-0 touch-manipulation appearance-none items-center rounded-full border font-semibold transition-colors [-webkit-tap-highlight-color:transparent]",
              compact
                ? "min-h-[28px] min-w-0 gap-0.5 px-2 py-1 text-[11px] leading-none"
                : "min-h-[28px] gap-1.5 px-2.5 py-1 text-xs leading-none",
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

            <span className="whitespace-nowrap">{gender === "F" ? t("audio_player.voice_f") : t("audio_player.voice_m")}</span>

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


