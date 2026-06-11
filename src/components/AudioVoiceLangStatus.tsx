import { useEffect, useMemo, useState } from "react";

import { Loader2, RotateCw } from "lucide-react";

import { useTranslation } from "react-i18next";



import {

  fetchAudioVoiceStatusMap,

  getPendingAudioJobsByLang,

  subscribeAudioQueue,

  type AudioTextType,

  type AudioVoiceLangTarget,

  type AudioVoiceErrorDetail,
  type LangVoiceAggregate,
  type VoiceGenderStatus,
} from "@/services/audioService";

import { Progress } from "@/components/ui/progress";

import { cn } from "@/lib/utils";



const POLL_MS = 2000;



type AudioVoiceLangTargetInput = AudioVoiceLangTarget | AudioVoiceLangTarget[] | null | undefined;



type AudioVoiceLangStatusProps = {

  languages: readonly string[];

  text_type: AudioTextType;

  targetsByLang: Record<string, AudioVoiceLangTargetInput>;

  refreshKey?: number;

  optimisticLangs?: readonly string[];

  onOptimisticLangDone?: (lang: string) => void;
  /** Libellés persona par `prompt_style_id` (infobulle erreurs). */
  promptStyleLabels?: Record<string, string>;
  /** Relance la génération pour une langue (bouton ↻ si erreurs). */
  onRetryLang?: (lang: string) => void;
  className?: string;
};

function formatErrorsTooltip(
  errors: AudioVoiceErrorDetail[],
  promptStyleLabels?: Record<string, string>,
): string {
  return errors
    .map((e) => {
      const persona = promptStyleLabels?.[e.prompt_style_id]?.trim() || e.prompt_style_id.slice(0, 8);
      return `Voix ${e.gender} · ${persona} : ${e.message}`;
    })
    .join("\n");
}



function normLang(lang: string): string {

  return lang.trim().toLowerCase().slice(0, 2);

}



function statusSymbol(status: VoiceGenderStatus): string {

  if (status === "ready") return "✓";

  if (status === "generating" || status === "pending") return "…";

  if (status === "error") return "!";

  return "—";

}



function statusClass(status: VoiceGenderStatus): string {

  if (status === "ready") return "text-emerald-600";

  if (status === "generating" || status === "pending") return "text-amber-600";

  if (status === "error") return "text-destructive";

  return "text-muted-foreground/60";

}



function flattenTargets(

  languages: readonly string[],

  targetsByLang: Record<string, AudioVoiceLangTargetInput>,

): AudioVoiceLangTarget[] {

  const out: AudioVoiceLangTarget[] = [];

  for (const lang of languages) {

    const langKey = normLang(lang);

    const raw = targetsByLang[lang] ?? targetsByLang[langKey];

    if (!raw) continue;

    const list = Array.isArray(raw) ? raw : [raw];

    for (const t of list) {

      if (t?.text_id?.trim() && t.prompt_style_id?.trim()) out.push(t);

    }

  }

  return out;

}



function langHasTargets(

  lang: string,

  targetsByLang: Record<string, AudioVoiceLangTargetInput>,

): boolean {

  const langKey = normLang(lang);

  const raw = targetsByLang[lang] ?? targetsByLang[langKey];

  if (!raw) return false;

  const list = Array.isArray(raw) ? raw : [raw];

  return list.some((t) => t?.text_id?.trim() && t.prompt_style_id?.trim());

}



function hasInProgress(

  map: Record<string, LangVoiceAggregate>,

  pendingByLang: Record<string, number>,

): boolean {

  if (Object.values(pendingByLang).some((n) => n > 0)) return true;

  return Object.values(map).some(

    (s) =>

      s.progress.generating > 0 ||

      s.F === "generating" ||

      s.F === "pending" ||

      s.M === "generating" ||

      s.M === "pending",

  );

}



function progressLabel(

  t: (key: string, opts?: Record<string, unknown>) => string,

  progress: LangVoiceAggregate["progress"],

  queued: number,

  isWorking: boolean,

): string {

  const active = progress.generating + queued;

  if (isWorking && active > 0) {

    return t("audio_voice_status.progress_generating", {

      ready: progress.ready,

      total: progress.total,

      active,

    });

  }

  if (progress.error > 0 && progress.ready < progress.total) {
    const pending = Math.max(
      0,
      progress.total - progress.ready - progress.generating - progress.error,
    );
    if (pending > 0) {
      return t("audio_voice_status.progress_errors_pending", {
        ready: progress.ready,
        total: progress.total,
        error: progress.error,
        pending,
      });
    }
    return t("audio_voice_status.progress_errors", {
      ready: progress.ready,
      total: progress.total,
      error: progress.error,
    });
  }

  return t("audio_voice_status.progress", {

    ready: progress.ready,

    total: progress.total,

  });

}



export function AudioVoiceLangStatus({

  languages,

  text_type,

  targetsByLang,

  refreshKey = 0,

  optimisticLangs = [],

  onOptimisticLangDone,
  promptStyleLabels,
  onRetryLang,
  className,
}: AudioVoiceLangStatusProps) {

  const { t } = useTranslation("artwork_modal");

  const [loading, setLoading] = useState(true);

  const [statusMap, setStatusMap] = useState<Record<string, LangVoiceAggregate>>({});

  const [pendingByLang, setPendingByLang] = useState<Record<string, number>>(() => ({

    ...getPendingAudioJobsByLang(),

  }));



  const targets = useMemo(

    () => flattenTargets(languages, targetsByLang),

    [languages, targetsByLang],

  );



  const optimisticSet = useMemo(

    () => new Set(optimisticLangs.map(normLang)),

    [optimisticLangs],

  );



  useEffect(() => {

    return subscribeAudioQueue(() => {

      setPendingByLang({ ...getPendingAudioJobsByLang() });

    });

  }, []);



  useEffect(() => {

    let cancelled = false;

    setLoading(true);



    void fetchAudioVoiceStatusMap(text_type, targets).then((map) => {

      if (!cancelled) {

        setStatusMap(map);

        setLoading(false);

      }

    });



    return () => {

      cancelled = true;

    };

  }, [text_type, targets, refreshKey]);



  useEffect(() => {

    if (!hasInProgress(statusMap, pendingByLang)) return;

    const id = window.setInterval(() => {

      void fetchAudioVoiceStatusMap(text_type, targets).then(setStatusMap);

    }, POLL_MS);

    return () => window.clearInterval(id);

  }, [statusMap, pendingByLang, text_type, targets]);



  useEffect(() => {

    if (!onOptimisticLangDone || optimisticSet.size === 0) return;

    for (const langKey of optimisticSet) {

      const p = statusMap[langKey]?.progress;

      const queued = pendingByLang[langKey] ?? 0;

      if (p && (queued > 0 || p.generating > 0 || p.ready > 0)) {

        onOptimisticLangDone(langKey);

      }

    }

  }, [statusMap, pendingByLang, optimisticSet, onOptimisticLangDone]);



  if (targets.length === 0) return null;



  return (

    <div

      className={cn(

        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] leading-tight text-muted-foreground",

        className,

      )}

      aria-label={t("audio_voice_status.aria")}

    >

      <span className="shrink-0 font-semibold uppercase tracking-wide text-foreground/80">

        {t("audio_voice_status.label")}

      </span>

      {loading && !Object.keys(statusMap).length ? (

        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />

      ) : null}

      {languages.map((lang) => {

        const langKey = normLang(lang);

        if (!langHasTargets(lang, targetsByLang)) return null;



        const st = statusMap[langKey] ?? {

          F: "none" as const,

          M: "none" as const,

          progress: { ready: 0, total: 0, generating: 0, error: 0 },
          errors: [],
        };

        const { progress, errors } = st;
        const errorsTooltip =
          errors.length > 0 ? formatErrorsTooltip(errors, promptStyleLabels) : undefined;

        const queued = pendingByLang[langKey] ?? 0;

        const isOptimistic = optimisticSet.has(langKey);

        const activeCount = progress.generating + queued;

        const isWorking =

          isOptimistic ||

          activeCount > 0 ||

          st.F === "generating" ||

          st.F === "pending" ||

          st.M === "generating" ||

          st.M === "pending";

        const showBar =

          progress.total > 0 &&

          (isWorking || progress.ready < progress.total || progress.error > 0);

        const percent =

          progress.total > 0 ? Math.round((progress.ready / progress.total) * 100) : isOptimistic ? 5 : 0;



        return (

          <span

            key={lang}

            className="inline-flex min-w-[5.5rem] shrink-0 flex-col gap-0.5 rounded border border-border/50 bg-background/80 px-1.5 py-1"

          >

            <span className="inline-flex items-center gap-0.5">

              <span className="font-semibold text-foreground/90">{lang.toUpperCase()}</span>

              <span className="text-muted-foreground/50">:</span>

              <span className={cn("font-medium", statusClass(st.F))} title={t("audio_voice_status.voice_f")}>

                F{statusSymbol(st.F)}

              </span>

              <span className={cn("font-medium", statusClass(st.M))} title={t("audio_voice_status.voice_m")}>

                M{statusSymbol(st.M)}

              </span>

              {isWorking ? (
                <Loader2 className="ml-0.5 h-2.5 w-2.5 shrink-0 animate-spin text-amber-600" aria-hidden />
              ) : null}
              {!isWorking && progress.error > 0 && onRetryLang ? (
                <button
                  type="button"
                  className="ml-0.5 inline-flex shrink-0 rounded p-0.5 text-destructive hover:bg-destructive/10"
                  title={t("audio_voice_status.retry_lang")}
                  aria-label={t("audio_voice_status.retry_lang")}
                  onClick={() => onRetryLang(langKey)}
                >
                  <RotateCw className="h-2.5 w-2.5" aria-hidden />
                </button>
              ) : null}
            </span>

            {showBar ? (

              <>

                <Progress

                  value={percent}

                  className={cn(

                    "h-1 bg-muted",

                    isWorking && "[&>div]:bg-amber-600 [&>div]:transition-all",

                    !isWorking && progress.error > 0 && "[&>div]:bg-destructive/70",

                  )}

                />

                <span
                  className={cn(
                    "cursor-default text-[9px] leading-none",
                    !isWorking && progress.error > 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                  title={errorsTooltip}
                >
                  {progressLabel(t, progress, queued, isWorking)}
                </span>

              </>

            ) : null}

          </span>

        );

      })}

    </div>

  );

}


