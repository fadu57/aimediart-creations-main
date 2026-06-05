import { useCallback, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatVisitorRecoveryCodeDisplay,
  generateVisitorRecoveryCode,
  getStoredVisitorRecoveryCode,
} from "@/lib/visitorRecoveryLink";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Code affiché juste après génération (première fois). */
  initialCode?: string | null;
  initialDisplay?: string | null;
  allowRegenerate?: boolean;
};

export function VisitorLinkCodeDialog({
  open,
  onOpenChange,
  initialCode,
  initialDisplay,
  allowRegenerate = false,
}: Props) {
  const { t } = useTranslation("landing");
  const [code, setCode] = useState(initialCode?.trim() ?? "");
  const [display, setDisplay] = useState(initialDisplay?.trim() ?? "");
  const [busy, setBusy] = useState(false);

  const effectiveCode = code || getStoredVisitorRecoveryCode() || "";
  const effectiveDisplay =
    display || (effectiveCode ? formatVisitorRecoveryCodeDisplay(effectiveCode) : "");

  const handleCopy = useCallback(async () => {
    if (!effectiveDisplay) return;
    try {
      await navigator.clipboard.writeText(effectiveDisplay.replace(/-/g, ""));
      toast.success(t("visitor_gate.recovery_code.toast_copied"));
    } catch {
      toast.error(t("visitor_gate.recovery_code.toast_copy_failed"));
    }
  }, [effectiveDisplay, t]);

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      const result = await generateVisitorRecoveryCode(true);
      if (!result.ok) {
        toast.error(t("visitor_gate.recover.errors.generic"));
        return;
      }
      setCode(result.code);
      setDisplay(result.display);
      toast.success(t("visitor_gate.recovery_code.toast_regenerated"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px]">
        <DialogHeader>
          <DialogTitle>{t("visitor_gate.recovery_code.title")}</DialogTitle>
          <DialogDescription>{t("visitor_gate.recovery_code.description")}</DialogDescription>
        </DialogHeader>
        {effectiveDisplay ? (
          <p
            className="rounded-lg border border-border bg-muted/30 py-4 text-center font-mono text-2xl font-bold tracking-[0.2em] text-foreground"
            aria-label={t("visitor_gate.recovery_code.code_aria")}
          >
            {effectiveDisplay}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("visitor_gate.recovery_code.unavailable")}</p>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {effectiveDisplay ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => void handleCopy()}>
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              {t("visitor_gate.recovery_code.btn_copy")}
            </Button>
          ) : null}
          {allowRegenerate ? (
            <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => void handleRegenerate()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("visitor_gate.recovery_code.btn_regenerate")}
            </Button>
          ) : null}
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
            {t("visitor_gate.recovery_code.btn_done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
