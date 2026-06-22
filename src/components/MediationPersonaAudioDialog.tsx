import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MediationPersonaAudioPanel,
  type MediationPersonaAudioPanelProps,
} from "@/components/MediationPersonaAudioPanel";

type MediationPersonaAudioDialogProps = Omit<
  MediationPersonaAudioPanelProps,
  "active" | "variant" | "onClose"
> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Modal de suivi génération audio (tous personas × langues), au-dessus de la fiche œuvre. */
export function MediationPersonaAudioDialog({
  open,
  onOpenChange,
  ...panelProps
}: MediationPersonaAudioDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={false}
        overlayClassName="z-[60]"
        className="z-[60] flex h-[min(85vh,40rem)] max-h-[min(85vh,40rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&+button]:z-[61]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Audio médiation</DialogTitle>
          <DialogDescription>Suivi des voix</DialogDescription>
        </DialogHeader>
        <MediationPersonaAudioPanel
          {...panelProps}
          active={open}
          variant="dialog"
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
