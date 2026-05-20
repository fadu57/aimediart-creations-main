import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CARTEL_FORMATS, type CartelFormatId } from "@/lib/cartelPdfFormats";
import { cn } from "@/lib/utils";

type CartelFormatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (formatId: CartelFormatId) => void;
  artworkTitle?: string | null;
};

const DEFAULT_FORMAT: CartelFormatId = "a6-portrait";

function FormatOption({
  format,
  selectedId,
  t,
}: {
  format: (typeof CARTEL_FORMATS)[number];
  selectedId: CartelFormatId;
  t: (key: string) => string;
}) {
  return (
    <label
      htmlFor={`cartel-format-${format.id}`}
      className={cn(
        "flex h-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/40",
        selectedId === format.id && "bg-muted/60",
      )}
    >
      <RadioGroupItem id={`cartel-format-${format.id}`} value={format.id} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug">{t(format.labelKey)}</div>
        <div className="text-xs text-muted-foreground">
          {format.dimensionsLabel}
          {format.landscapeDuplex ? ` — ${t("pdf_format_landscape_hint")}` : ""}
        </div>
      </div>
    </label>
  );
}

export function CartelFormatDialog({ open, onOpenChange, onConfirm, artworkTitle }: CartelFormatDialogProps) {
  const { t } = useTranslation("catalogue");
  const [selectedId, setSelectedId] = useState<CartelFormatId>(DEFAULT_FORMAT);

  useEffect(() => {
    if (open) setSelectedId(DEFAULT_FORMAT);
  }, [open]);

  const rectangularFormats = useMemo(() => CARTEL_FORMATS.filter((f) => f.group === "rectangular"), []);
  const squareFormats = useMemo(() => CARTEL_FORMATS.filter((f) => f.group === "square"), []);

  const handleConfirm = () => {
    onConfirm(selectedId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("pdf_format_dialog_title")}</DialogTitle>
          <DialogDescription>
            {artworkTitle?.trim()
              ? t("pdf_format_dialog_desc_named", { title: artworkTitle.trim() })
              : t("pdf_format_dialog_desc")}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedId} onValueChange={(v) => setSelectedId(v as CartelFormatId)} className="gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("pdf_format_group_rectangular")}</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border/60 p-2">
              {rectangularFormats.map((format) => (
                <FormatOption key={format.id} format={format} selectedId={selectedId} t={t} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("pdf_format_group_square")}</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border/60 p-2">
              {squareFormats.map((format) => (
                <FormatOption key={format.id} format={format} selectedId={selectedId} t={t} />
              ))}
            </div>
          </div>
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("pdf_format_cancel")}
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {t("pdf_format_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
