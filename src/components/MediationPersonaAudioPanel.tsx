import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MediationAllVoicesStatus } from "@/components/MediationAllVoicesStatus";
import { Button } from "@/components/ui/button";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { cn } from "@/lib/utils";
import {
  fetchMediationVoiceFillState,
  hasPendingAudioForArtwork,
  subscribeAudioQueue,
  type MediationVoiceFillState,
} from "@/services/audioService";

const FILL_STATE_POLL_MS = 2000;

export type MediationPersonaEntry = {
  key: string;
  label: string;
  promptStyleId?: string | null;
};

export type MediationPersonaAudioPanelProps = {
  /** Active le polling / abonnements file audio. */
  active: boolean;
  artworkId: string;
  personas: readonly MediationPersonaEntry[];
  languages: readonly MediationUiLang[];
  descriptionsByLang: Record<string, Record<string, string>>;
  refreshKey: number;
  optimisticCells: readonly string[];
  onOptimisticCellDone: (cellKey: string) => void;
  onRetryCell: (lang: string, styleKey: string, promptStyleId: string) => void;
  onCancelCell: (lang: string, promptStyleId: string) => void | Promise<void>;
  onFillMissing: () => void | Promise<void>;
  /** Variante intégrée dans l'onglet Audio du workflow. */
  variant?: "dialog" | "inline";
  onClose?: () => void;
};

export function MediationPersonaAudioPanel({
  active,
  artworkId,
  personas,
  languages,
  descriptionsByLang,
  refreshKey,
  optimisticCells,
  onOptimisticCellDone,
  onRetryCell,
  onCancelCell,
  onFillMissing,
  variant = "dialog",
  onClose,
}: MediationPersonaAudioPanelProps) {
  const { t } = useTranslation("artwork_modal");
  const [queueActive, setQueueActive] = useState(false);
  const [fillState, setFillState] = useState<MediationVoiceFillState | null>(null);

  const syncQueueActive = useCallback(() => {
    setQueueActive(hasPendingAudioForArtwork(artworkId));
  }, [artworkId]);

  const refreshFillState = useCallback(() => {
    if (!active || !artworkId) return;
    void fetchMediationVoiceFillState({
      artworkId,
      personas,
      languages,
      descriptionsByLang,
    }).then(setFillState);
  }, [active, artworkId, personas, languages, descriptionsByLang]);

  useEffect(() => {
    if (!active) return;
    syncQueueActive();
    refreshFillState();
    return subscribeAudioQueue(() => {
      syncQueueActive();
      refreshFillState();
    });
  }, [active, syncQueueActive, refreshFillState]);

  useEffect(() => {
    if (!active) return;
    refreshFillState();
  }, [active, refreshFillState, refreshKey]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(refreshFillState, FILL_STATE_POLL_MS);
    return () => window.clearInterval(id);
  }, [active, refreshFillState]);

  const generationsInProgress = queueActive || optimisticCells.length > 0;
  const allReady = fillState?.allReady ?? false;
  const hasExpectedVoices = (fillState?.totalExpected ?? 0) > 0;
  const canFillMissing = hasExpectedVoices && !allReady && (fillState?.missingCount ?? 0) > 0;

  const buttonLabel = allReady
    ? t("audio_generate_dialog.all_voices_ready")
    : t("audio_generate_dialog.fill_missing");

  const buttonDisabled = !hasExpectedVoices || allReady || !canFillMissing || generationsInProgress;

  const isInline = variant === "inline";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        isInline ? "min-h-0 flex-1 rounded-lg border border-border/60 bg-background" : "max-h-full",
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border/60 bg-background text-left",
          isInline ? "px-3 py-3 sm:px-4" : "px-5 py-4 pr-14",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className={cn("font-semibold leading-none", isInline ? "text-sm" : "text-lg")}>
              {t("audio_generate_dialog.title")}
            </h3>
            <p className="text-xs text-muted-foreground sm:text-sm">{t("audio_generate_dialog.desc")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-0.5 shrink-0 gap-1.5 text-xs"
            disabled={buttonDisabled}
            onClick={() => void onFillMissing()}
          >
            {generationsInProgress ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : allReady ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            ) : (
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
            )}
            {buttonLabel}
          </Button>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", isInline ? "px-3 py-3 sm:px-4" : "px-5 py-4")}>
        <MediationAllVoicesStatus
          artworkId={artworkId}
          personas={personas}
          languages={languages}
          descriptionsByLang={descriptionsByLang}
          refreshKey={refreshKey}
          optimisticCells={optimisticCells}
          onOptimisticCellDone={onOptimisticCellDone}
          onRetryCell={onRetryCell}
          onCancelCell={onCancelCell}
        />
      </div>

      {!isInline && onClose ? (
        <div className="shrink-0 flex-col gap-2 border-t border-border/60 px-5 py-3">
          {generationsInProgress ? (
            <p className="text-xs text-muted-foreground">{t("audio_generate_dialog.background_hint")}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("audio_generate_dialog.close")}
            </Button>
          </div>
        </div>
      ) : generationsInProgress ? (
        <p className="shrink-0 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground sm:px-4">
          {t("audio_generate_dialog.background_hint")}
        </p>
      ) : null}
    </div>
  );
}
