import { useEffect, useMemo, useState } from "react";

import { Loader2, RotateCw, Square } from "lucide-react";

import { useTranslation } from "react-i18next";

import { Progress } from "@/components/ui/progress";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { cn } from "@/lib/utils";
import {
  audioVoiceCellKey,
  fetchAudioVoiceStatusMapByCell,
  getPendingAudioJobsByCell,
  subscribeAudioQueue,
  type AudioVoiceLangTarget,
  type LangVoiceAggregate,
  type VoiceGenderStatus,
} from "@/services/audioService";

const POLL_MS = 2000;

type MediationPersonaEntry = {
  key: string;
  label: string;
  promptStyleId?: string | null;
};

type MediationAllVoicesStatusProps = {
  artworkId: string;
  personas: readonly MediationPersonaEntry[];
  languages: readonly MediationUiLang[];
  descriptionsByLang: Record<string, Record<string, string>>;
  refreshKey?: number;
  optimisticCells?: readonly string[];
  onOptimisticCellDone?: (cellKey: string) => void;
  onRetryCell?: (lang: string, styleKey: string, promptStyleId: string) => void;
  onCancelCell?: (lang: string, promptStyleId: string) => void | Promise<void>;
  className?: string;
};

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

function cellHasText(
  descriptionsByLang: Record<string, Record<string, string>>,
  styleKey: string,
  lang: string,
): boolean {
  return !!(descriptionsByLang[lang]?.[styleKey] ?? "").trim();
}

function buildMediationVoiceTargets(
  artworkId: string,
  personas: readonly MediationPersonaEntry[],
  descriptionsByLang: Record<string, Record<string, string>>,
  languages: readonly string[],
): AudioVoiceLangTarget[] {
  const targets: AudioVoiceLangTarget[] = [];
  for (const persona of personas) {
    const promptStyleId = persona.promptStyleId?.trim();
    if (!promptStyleId) continue;
    for (const lng of languages) {
      if (!cellHasText(descriptionsByLang, persona.key, lng)) continue;
      targets.push({
        lang: lng,
        text_id: artworkId,
        prompt_style_id: promptStyleId,
      });
    }
  }
  return targets;
}

function hasInProgress(
  map: Record<string, LangVoiceAggregate>,
  pendingByCell: Record<string, number>,
): boolean {
  if (Object.values(pendingByCell).some((n) => n > 0)) return true;
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

type PersonaSortMetrics = {
  tier: number;
  ready: number;
  total: number;
  readyRatio: number;
};

function getCellAggregate(
  persona: MediationPersonaEntry,
  lang: string,
  descriptionsByLang: Record<string, Record<string, string>>,
  statusMap: Record<string, LangVoiceAggregate>,
  pendingByCell: Record<string, number>,
  optimisticSet: Set<string>,
): {
  hasText: boolean;
  hasTarget: boolean;
  progress: LangVoiceAggregate["progress"];
  isWorking: boolean;
  langSortTier: number;
} {
  const langKey = normLang(lang);
  const promptStyleId = persona.promptStyleId?.trim() ?? "";
  const hasText = cellHasText(descriptionsByLang, persona.key, lang);
  const hasTarget = hasText && !!promptStyleId;
  const cellKey = hasTarget ? audioVoiceCellKey(lang, promptStyleId) : "";
  const st = (cellKey ? statusMap[cellKey] : undefined) ?? {
    F: "none" as const,
    M: "none" as const,
    progress: { ready: 0, total: 0, generating: 0, error: 0 },
    errors: [],
  };
  const { progress } = st;
  const queued = cellKey ? (pendingByCell[cellKey] ?? 0) : 0;
  const isOptimistic = cellKey ? optimisticSet.has(cellKey) : false;
  const activeCount = progress.generating + queued;
  const isWorking =
    hasTarget &&
    (isOptimistic || activeCount > 0 || st.F === "generating" || st.M === "generating");

  let langSortTier = 4;
  if (!hasText) langSortTier = 5;
  else if (!hasTarget) langSortTier = 4;
  else if (progress.total > 0 && progress.ready === progress.total) langSortTier = 0;
  else if (progress.ready > 0) langSortTier = 1;
  else if (isWorking) langSortTier = 2;
  else langSortTier = 3;

  return { hasText, hasTarget, progress, isWorking, langSortTier };
}

function personaSortMetrics(
  persona: MediationPersonaEntry,
  languages: readonly string[],
  descriptionsByLang: Record<string, Record<string, string>>,
  statusMap: Record<string, LangVoiceAggregate>,
  pendingByCell: Record<string, number>,
  optimisticSet: Set<string>,
): PersonaSortMetrics {
  let ready = 0;
  let total = 0;
  let inProgress = false;

  for (const lang of languages) {
    const cell = getCellAggregate(
      persona,
      lang,
      descriptionsByLang,
      statusMap,
      pendingByCell,
      optimisticSet,
    );
    if (!cell.hasTarget) continue;
    ready += cell.progress.ready;
    total += cell.progress.total;
    if (cell.isWorking) inProgress = true;
  }

  if (total === 0) {
    return { tier: 4, ready: 0, total: 0, readyRatio: 0 };
  }
  if (ready === total) {
    return { tier: 0, ready, total, readyRatio: 1 };
  }
  if (ready > 0) {
    return { tier: 1, ready, total, readyRatio: ready / total };
  }
  if (inProgress) {
    return { tier: 2, ready, total, readyRatio: 0 };
  }
  return { tier: 3, ready, total, readyRatio: 0 };
}

function comparePersonaVoiceOrder(
  a: MediationPersonaEntry,
  b: MediationPersonaEntry,
  languages: readonly string[],
  descriptionsByLang: Record<string, Record<string, string>>,
  statusMap: Record<string, LangVoiceAggregate>,
  pendingByCell: Record<string, number>,
  optimisticSet: Set<string>,
): number {
  const metricsA = personaSortMetrics(
    a,
    languages,
    descriptionsByLang,
    statusMap,
    pendingByCell,
    optimisticSet,
  );
  const metricsB = personaSortMetrics(
    b,
    languages,
    descriptionsByLang,
    statusMap,
    pendingByCell,
    optimisticSet,
  );

  if (metricsA.tier !== metricsB.tier) return metricsA.tier - metricsB.tier;
  if (metricsA.readyRatio !== metricsB.readyRatio) return metricsB.readyRatio - metricsA.readyRatio;
  if (metricsA.ready !== metricsB.ready) return metricsB.ready - metricsA.ready;
  return a.label.localeCompare(b.label, "fr");
}

/** Suivi voix F/M pour tous les personas × langues de médiation d'une œuvre. */
export function MediationAllVoicesStatus({
  artworkId,
  personas,
  languages,
  descriptionsByLang,
  refreshKey = 0,
  optimisticCells = [],
  onOptimisticCellDone,
  onRetryCell,
  onCancelCell,
  className,
}: MediationAllVoicesStatusProps) {
  const { t } = useTranslation("artwork_modal");
  const [loading, setLoading] = useState(true);
  const [statusMap, setStatusMap] = useState<Record<string, LangVoiceAggregate>>({});
  const [pendingByCell, setPendingByCell] = useState<Record<string, number>>(() => ({
    ...getPendingAudioJobsByCell(artworkId),
  }));

  const targets = useMemo(
    () => buildMediationVoiceTargets(artworkId, personas, descriptionsByLang, languages),
    [artworkId, personas, descriptionsByLang, languages],
  );

  const optimisticSet = useMemo(() => new Set(optimisticCells), [optimisticCells]);

  const sortedPersonas = useMemo(
    () =>
      [...personas].sort((a, b) =>
        comparePersonaVoiceOrder(
          a,
          b,
          languages,
          descriptionsByLang,
          statusMap,
          pendingByCell,
          optimisticSet,
        ),
      ),
    [personas, languages, descriptionsByLang, statusMap, pendingByCell, optimisticSet],
  );

  const sortedLanguagesByPersona = useMemo(() => {
    const map = new Map<string, MediationUiLang[]>();
    for (const persona of sortedPersonas) {
      const sorted = [...languages].sort((langA, langB) => {
        const cellA = getCellAggregate(
          persona,
          langA,
          descriptionsByLang,
          statusMap,
          pendingByCell,
          optimisticSet,
        );
        const cellB = getCellAggregate(
          persona,
          langB,
          descriptionsByLang,
          statusMap,
          pendingByCell,
          optimisticSet,
        );
        if (cellA.langSortTier !== cellB.langSortTier) {
          return cellA.langSortTier - cellB.langSortTier;
        }
        if (cellA.progress.ready !== cellB.progress.ready) {
          return cellB.progress.ready - cellA.progress.ready;
        }
        return langA.localeCompare(langB, "fr");
      });
      map.set(persona.key, sorted);
    }
    return map;
  }, [sortedPersonas, languages, descriptionsByLang, statusMap, pendingByCell, optimisticSet]);

  useEffect(() => {
    return subscribeAudioQueue(() => {
      setPendingByCell({ ...getPendingAudioJobsByCell(artworkId) });
    });
  }, [artworkId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void fetchAudioVoiceStatusMapByCell("mediation", targets).then((map) => {
      if (!cancelled) {
        setStatusMap(map);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [targets, refreshKey]);

  useEffect(() => {
    if (!hasInProgress(statusMap, pendingByCell)) return;
    const id = window.setInterval(() => {
      void fetchAudioVoiceStatusMapByCell("mediation", targets).then(setStatusMap);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [statusMap, pendingByCell, targets]);

  useEffect(() => {
    if (!onOptimisticCellDone || optimisticSet.size === 0) return;
    for (const cellKey of optimisticSet) {
      const p = statusMap[cellKey]?.progress;
      const queued = pendingByCell[cellKey] ?? 0;
      if (p && (queued > 0 || p.generating > 0 || p.ready > 0)) {
        onOptimisticCellDone(cellKey);
      }
    }
  }, [statusMap, pendingByCell, optimisticSet, onOptimisticCellDone]);

  return (
    <div className={cn("flex w-full flex-col gap-4", className)} aria-label={t("audio_voice_status.aria")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
        {t("audio_voice_status.label")}
      </p>

      {loading && !Object.keys(statusMap).length ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
      {sortedPersonas.map((persona) => (
        <section key={persona.key} className="flex min-w-0 flex-col gap-1.5">
          <h4 className="text-sm font-semibold text-foreground">{persona.label}</h4>
          <div className="flex flex-col gap-1.5 pl-1">
            {(sortedLanguagesByPersona.get(persona.key) ?? languages).map((lang) => {
              const langKey = normLang(lang);
              const promptStyleId = persona.promptStyleId?.trim() ?? "";
              const hasText = cellHasText(descriptionsByLang, persona.key, lang);
              const hasTarget = hasText && !!promptStyleId;
              const cellKey = hasTarget ? audioVoiceCellKey(lang, promptStyleId) : "";
              const st = (cellKey ? statusMap[cellKey] : undefined) ?? {
                F: "none" as const,
                M: "none" as const,
                progress: { ready: 0, total: 0, generating: 0, error: 0 },
                errors: [],
              };
              const { progress } = st;
              const queued = cellKey ? (pendingByCell[cellKey] ?? 0) : 0;
              const isOptimistic = cellKey ? optimisticSet.has(cellKey) : false;
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
                !!onRetryCell;
              const showBar =
                hasTarget &&
                progress.total > 0 &&
                (isWorking || progress.ready < progress.total || progress.error > 0);
              const percent =
                progress.total > 0
                  ? Math.round((progress.ready / progress.total) * 100)
                  : isOptimistic
                    ? 5
                    : 0;

              return (
                <div
                  key={`${persona.key}-${lang}`}
                  className="flex flex-col gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-[2rem] font-semibold text-amber-950">{lang.toUpperCase()}</span>
                    {!hasText ? (
                      <span className="text-xs italic text-muted-foreground">
                        {t("audio_voice_status.no_text")}
                      </span>
                    ) : !promptStyleId ? (
                      <span className="text-xs italic text-muted-foreground">
                        {t("audio_voice_status.no_persona_audio")}
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn("inline-flex items-center gap-1", statusClass(st.F))}
                          title={t("audio_voice_status.voice_f")}
                        >
                          <span className="text-xs text-muted-foreground">{t("audio_voice_status.voice_f")}</span>
                          <span className="font-semibold">{statusSymbol(st.F)}</span>
                        </span>
                        <span
                          className={cn("inline-flex items-center gap-1", statusClass(st.M))}
                          title={t("audio_voice_status.voice_m")}
                        >
                          <span className="text-xs text-muted-foreground">{t("audio_voice_status.voice_m")}</span>
                          <span className="font-semibold">{statusSymbol(st.M)}</span>
                        </span>
                      </>
                    )}
                    {isWorking ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden />
                    ) : null}
                    {hasTarget ? (
                      <span className="ml-auto flex items-center gap-1">
                        {isWorking && onCancelCell && promptStyleId ? (
                          <button
                            type="button"
                            className="inline-flex shrink-0 rounded p-1 text-amber-800 hover:bg-amber-100"
                            title={t("audio_voice_status.cancel_lang")}
                            aria-label={t("audio_voice_status.cancel_lang")}
                            onClick={() => void onCancelCell(langKey, promptStyleId)}
                          >
                            <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                          </button>
                        ) : null}
                        {!isWorking && progress.error > 0 && onRetryCell ? (
                          <button
                            type="button"
                            className="inline-flex shrink-0 rounded p-1 text-destructive hover:bg-destructive/10"
                            title={t("audio_voice_status.retry_lang")}
                            aria-label={t("audio_voice_status.retry_lang")}
                            onClick={() => onRetryCell(langKey, persona.key, promptStyleId)}
                          >
                            <RotateCw className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : null}
                        {canRetry && progress.error === 0 ? (
                          <button
                            type="button"
                            className="inline-flex shrink-0 rounded p-1 text-amber-800 hover:bg-amber-100"
                            title={t("audio_voice_status.continue_lang")}
                            aria-label={t("audio_voice_status.continue_lang")}
                            onClick={() => onRetryCell!(langKey, persona.key, promptStyleId)}
                          >
                            <RotateCw className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </span>
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
                      >
                        {progressLabel(t, progress, queued, isWorking)}
                      </span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}
