import { useCallback, useEffect, useState } from "react";

import { CheckCircle2, Loader2, Volume2 } from "lucide-react";

import { useTranslation } from "react-i18next";

import { MediationAllVoicesStatus } from "@/components/MediationAllVoicesStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";
import {
  fetchMediationVoiceFillState,
  hasPendingAudioForArtwork,
  subscribeAudioQueue,
  type MediationVoiceFillState,
} from "@/services/audioService";

const FILL_STATE_POLL_MS = 2000;

type MediationPersonaEntry = {
  key: string;
  label: string;
  promptStyleId?: string | null;
};

type MediationPersonaAudioDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
};

/** Modal de suivi génération audio (tous personas × langues), au-dessus de la fiche œuvre. */
export function MediationPersonaAudioDialog({
  open,
  onOpenChange,
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
}: MediationPersonaAudioDialogProps) {
  const { t } = useTranslation("artwork_modal");
  const [queueActive, setQueueActive] = useState(false);
  const [fillState, setFillState] = useState<MediationVoiceFillState | null>(null);

  const syncQueueActive = useCallback(() => {
    setQueueActive(hasPendingAudioForArtwork(artworkId));
  }, [artworkId]);

  const refreshFillState = useCallback(() => {
    if (!open || !artworkId) return;
    void fetchMediationVoiceFillState({
      artworkId,
      personas,
      languages,
      descriptionsByLang,
    }).then(setFillState);
  }, [open, artworkId, personas, languages, descriptionsByLang]);

  useEffect(() => {
    if (!open) return;
    syncQueueActive();
    refreshFillState();
    return subscribeAudioQueue(() => {
      syncQueueActive();
      refreshFillState();
    });
  }, [open, syncQueueActive, refreshFillState]);

  useEffect(() => {
    if (!open) return;
    refreshFillState();
  }, [open, refreshFillState, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refreshFillState, FILL_STATE_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, refreshFillState]);

  const generationsInProgress = queueActive || optimisticCells.length > 0;
  const allReady = fillState?.allReady ?? false;
  const hasExpectedVoices = (fillState?.totalExpected ?? 0) > 0;
  const canFillMissing = hasExpectedVoices && !allReady && (fillState?.missingCount ?? 0) > 0;

  const buttonLabel = allReady
    ? t("audio_generate_dialog.all_voices_ready")
    : t("audio_generate_dialog.fill_missing");

  const buttonDisabled = !hasExpectedVoices || allReady || !canFillMissing || generationsInProgress;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={false}
        overlayClassName="z-[60]"
        className="z-[60] flex max-h-[min(85vh,40rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&+button]:z-[61]"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 bg-background px-5 py-4 pr-14 text-left">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogTitle>{t("audio_generate_dialog.title")}</DialogTitle>
              <DialogDescription>{t("audio_generate_dialog.desc")}</DialogDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-0.5 shrink-0 gap-1.5"
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
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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

        <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-border/60 px-5 py-3 sm:flex-col sm:items-stretch sm:space-x-0">
          {generationsInProgress ? (
            <p className="text-xs text-muted-foreground">{t("audio_generate_dialog.background_hint")}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("audio_generate_dialog.close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
