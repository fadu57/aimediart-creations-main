import { useEffect, useMemo, useState } from "react";

import { Loader2, RotateCw, Square } from "lucide-react";

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
  promptStyleLabels?: Record<string, string>;
  onRetryLang?: (lang: string) => void;
  onCancelLang?: (lang: string) => void | Promise<void>;
  /** chips = compact en ligne (bios) ; list = une ligne par langue sous le lecteur audio */
  layout?: "chips" | "list";
  /** Affiche toutes les langues passées, y compris sans cible audio (état « — »). */
  showAllLanguages?: boolean;
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
  if (status === "partial") return "◐";
  if (status === "error") return "!";
  return "—";
}

function statusClass(status: VoiceGenderStatus): string {
  if (status === "ready") return "text-emerald-600";
  if (status === "generating" || status === "pending") return "text-amber-600";
  if (status === "partial") return "text-amber-700/80";
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
    (s) => s.progress.generating > 0 || s.F === "generating" || s.M === "generating",
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

type LangRowProps = {
  lang: string;
  layout: "chips" | "list";
  hasTarget: boolean;
  st: LangVoiceAggregate;
  progress: LangVoiceAggregate["progress"];
  errorsTooltip?: string;
  queued: number;
  isWorking: boolean;
  canRetry: boolean;
  showBar: boolean;
  percent: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onRetryLang?: (lang: string) => void;
  onCancelLang?: (lang: string) => void | Promise<void>;
};

function LangStatusRow({
  lang,
  layout,
  hasTarget,
  st,
  progress,
  errorsTooltip,
  queued,
  isWorking,
  canRetry,
  showBar,
  percent,
  t,
  onRetryLang,
  onCancelLang,
}: LangRowProps) {
  const langKey = normLang(lang);

  const actionButtons = (
    <>
      {isWorking && onCancelLang ? (
        <button
          type="button"
          className="inline-flex shrink-0 rounded p-1 text-amber-800 hover:bg-amber-100"
          title={t("audio_voice_status.cancel_lang")}
          aria-label={t("audio_voice_status.cancel_lang")}
          onClick={() => void onCancelLang(langKey)}
        >
          <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
        </button>
      ) : null}
      {!isWorking && progress.error > 0 && onRetryLang ? (
        <button
          type="button"
          className="inline-flex shrink-0 rounded p-1 text-destructive hover:bg-destructive/10"
          title={t("audio_voice_status.retry_lang")}
          aria-label={t("audio_voice_status.retry_lang")}
          onClick={() => onRetryLang(langKey)}
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      {canRetry && progress.error === 0 && onRetryLang ? (
        <button
          type="button"
          className="inline-flex shrink-0 rounded p-1 text-amber-800 hover:bg-amber-100"
          title={t("audio_voice_status.continue_lang")}
          aria-label={t("audio_voice_status.continue_lang")}
          onClick={() => onRetryLang(langKey)}
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </>
  );

  if (layout === "list") {
    return (
      <div
        key={lang}
        className="flex flex-col gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-[2rem] font-semibold text-amber-950">{lang.toUpperCase()}</span>
          {!hasTarget ? (
            <span className="text-xs italic text-muted-foreground">{t("audio_voice_status.no_text")}</span>
          ) : (
            <>
              <span className={cn("inline-flex items-center gap-1", statusClass(st.F))} title={t("audio_voice_status.voice_f")}>
                <span className="text-xs text-muted-foreground">{t("audio_voice_status.voice_f")}</span>
                <span className="font-semibold">{statusSymbol(st.F)}</span>
              </span>
              <span className={cn("inline-flex items-center gap-1", statusClass(st.M))} title={t("audio_voice_status.voice_m")}>
                <span className="text-xs text-muted-foreground">{t("audio_voice_status.voice_m")}</span>
                <span className="font-semibold">{statusSymbol(st.M)}</span>
              </span>
            </>
          )}
          {isWorking ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden />
          ) : null}
          {hasTarget ? (
            <span className="ml-auto flex items-center gap-1">{actionButtons}</span>
          ) : null}
        </div>
        {showBar ? (
          <>
            <Progress
              value={percent}
              className={cn(
                "h-2 bg-amber-100",
                isWorking && "[&>div]:bg-amber-600",
                !isWorking && progress.error > 0 && "[&>div]:bg-destructive/70",
              )}
            />
            <span
              className={cn(
                "text-xs",
                !isWorking && progress.error > 0 ? "text-destructive" : "text-muted-foreground",
              )}
              title={errorsTooltip}
            >
              {progressLabel(t, progress, queued, isWorking)}
            </span>
          </>
        ) : null}
      </div>
    );
  }

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
        {actionButtons}
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
  onCancelLang,
  layout = "chips",
  showAllLanguages = false,
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

  if (targets.length === 0 && !(showAllLanguages && languages.length > 0)) return null;

  const visibleLangs = showAllLanguages
    ? [...languages]
    : languages.filter((lang) => langHasTargets(lang, targetsByLang));

  return (
    <div
      className={cn(
        layout === "list"
          ? "flex w-full flex-col gap-2"
          : "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] leading-tight text-muted-foreground",
        className,
      )}
      aria-label={t("audio_voice_status.aria")}
    >
      {layout === "list" ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
          {t("audio_voice_status.label")}
        </p>
      ) : (
        <span className="shrink-0 font-semibold uppercase tracking-wide text-foreground/80">
          {t("audio_voice_status.label")}
        </span>
      )}

      {loading && !Object.keys(statusMap).length ? (
        <Loader2
          className={cn("shrink-0 animate-spin", layout === "list" ? "h-4 w-4" : "h-3 w-3")}
          aria-hidden
        />
      ) : null}

      {visibleLangs.map((lang) => {
        const langKey = normLang(lang);
        const hasTarget = langHasTargets(lang, targetsByLang);
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
          hasTarget &&
          (isOptimistic ||
          activeCount > 0 ||
          st.F === "generating" ||
          st.M === "generating");
        const canRetry =
          hasTarget &&
          !isWorking &&
          progress.total > 0 &&
          progress.ready < progress.total &&
          onRetryLang;
        const showBar =
          hasTarget &&
          progress.total > 0 &&
          (isWorking || progress.ready < progress.total || progress.error > 0);
        const percent =
          progress.total > 0 ? Math.round((progress.ready / progress.total) * 100) : isOptimistic ? 5 : 0;

        return (
          <LangStatusRow
            key={lang}
            lang={lang}
            layout={layout}
            hasTarget={hasTarget}
            st={st}
            progress={progress}
            errorsTooltip={errorsTooltip}
            queued={queued}
            isWorking={isWorking}
            canRetry={!!canRetry}
            showBar={showBar}
            percent={percent}
            t={t}
            onRetryLang={onRetryLang}
            onCancelLang={onCancelLang}
          />
        );
      })}
    </div>
  );
}
