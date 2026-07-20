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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CARTEL_CUSTOM_MAX_MM,
  CARTEL_FORMATS,
  clampCartelCustomSizeToMinimum,
  formatCustomDimensionsLabel,
  getCartelMinCustomSizeMm,
  isValidCartelCustomSizeMm,
  sizeValueFromMm,
  sizeValueToMm,
  type CartelFormatId,
  type CartelFormatSelection,
  type CartelPresetFormatId,
  type CartelSizeUnit,
} from "@/lib/cartelPdfFormats";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { cn } from "@/lib/utils";

export type CartelExtraTitleLangOption = {
  lang: MediationUiLang;
  label: string;
  preview: string;
};

type CartelFormatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: CartelFormatSelection, extraLangs: MediationUiLang[]) => void;
  artworkTitle?: string | null;
  /** Nombre d'œuvres en mode génération groupée. */
  batchCount?: number;
  /** Langues de titre disponibles en plus du titre principal (UI). */
  extraTitleLangOptions?: readonly CartelExtraTitleLangOption[];
};

const DEFAULT_FORMAT: CartelPresetFormatId = "a6-portrait";
const DEFAULT_CUSTOM_WIDTH_MM = 105;
const DEFAULT_CUSTOM_HEIGHT_MM = 148;

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
        "flex cursor-pointer items-start gap-1.5 rounded px-1.5 py-1 transition-colors hover:bg-muted/40",
        selectedId === format.id && "bg-muted/60",
      )}
    >
      <RadioGroupItem id={`cartel-format-${format.id}`} value={format.id} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-xs font-medium">{t(format.labelKey)}</div>
        <div className="text-[10px] text-muted-foreground">
          {format.dimensionsLabel}
          {format.landscapeDuplex ? ` — ${t("pdf_format_landscape_hint")}` : ""}
        </div>
      </div>
    </label>
  );
}

function parseDimInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatDimForInput(mm: number, unit: CartelSizeUnit): string {
  const v = sizeValueFromMm(mm, unit);
  const rounded = Math.round(v * 100) / 100;
  return String(rounded);
}

export function CartelFormatDialog({
  open,
  onOpenChange,
  onConfirm,
  artworkTitle,
  batchCount,
  extraTitleLangOptions = [],
}: CartelFormatDialogProps) {
  const { t } = useTranslation("catalogue");
  const [selectedId, setSelectedId] = useState<CartelFormatId>(DEFAULT_FORMAT);
  const [selectedExtraLangs, setSelectedExtraLangs] = useState<MediationUiLang[]>([]);
  const [sizeUnit, setSizeUnit] = useState<CartelSizeUnit>("mm");
  const [widthInput, setWidthInput] = useState(String(DEFAULT_CUSTOM_WIDTH_MM));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_CUSTOM_HEIGHT_MM));

  useEffect(() => {
    if (open) {
      setSelectedId(DEFAULT_FORMAT);
      setSelectedExtraLangs([]);
      setSizeUnit("mm");
      setWidthInput(String(DEFAULT_CUSTOM_WIDTH_MM));
      setHeightInput(String(DEFAULT_CUSTOM_HEIGHT_MM));
    }
  }, [open]);

  const rectangularFormats = useMemo(() => CARTEL_FORMATS.filter((f) => f.group === "rectangular"), []);
  const squareFormats = useMemo(() => CARTEL_FORMATS.filter((f) => f.group === "square"), []);

  const minCustomSize = useMemo(
    () => getCartelMinCustomSizeMm(selectedExtraLangs.length),
    [selectedExtraLangs.length],
  );

  const customSizeMm = useMemo(() => {
    const w = parseDimInput(widthInput);
    const h = parseDimInput(heightInput);
    if (w == null || h == null) return undefined;
    return {
      widthMm: sizeValueToMm(w, sizeUnit),
      heightMm: sizeValueToMm(h, sizeUnit),
    };
  }, [widthInput, heightInput, sizeUnit]);

  const customValid = isValidCartelCustomSizeMm(customSizeMm, selectedExtraLangs.length);
  const canConfirm = selectedId !== "custom" || customSizeMm != null;

  // Si les langues supplémentaires rendent la taille trop petite → forcer les minima.
  useEffect(() => {
    if (selectedId !== "custom" || !customSizeMm) return;
    if (isValidCartelCustomSizeMm(customSizeMm, selectedExtraLangs.length)) return;
    const clamped = clampCartelCustomSizeToMinimum(customSizeMm, selectedExtraLangs.length);
    setWidthInput(formatDimForInput(clamped.widthMm, sizeUnit));
    setHeightInput(formatDimForInput(clamped.heightMm, sizeUnit));
  }, [selectedExtraLangs.length, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExtraLang = (lang: MediationUiLang) => {
    setSelectedExtraLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  const switchUnit = (nextUnit: CartelSizeUnit) => {
    if (nextUnit === sizeUnit) return;
    const w = parseDimInput(widthInput);
    const h = parseDimInput(heightInput);
    if (w != null && h != null) {
      const widthMm = sizeValueToMm(w, sizeUnit);
      const heightMm = sizeValueToMm(h, sizeUnit);
      setWidthInput(formatDimForInput(widthMm, nextUnit));
      setHeightInput(formatDimForInput(heightMm, nextUnit));
    }
    setSizeUnit(nextUnit);
  };

  const applyMinimumDimensions = () => {
    setSelectedId("custom");
    setWidthInput(formatDimForInput(minCustomSize.widthMm, sizeUnit));
    setHeightInput(formatDimForInput(minCustomSize.heightMm, sizeUnit));
  };

  const handleCustomBlur = () => {
    const w = parseDimInput(widthInput);
    const h = parseDimInput(heightInput);
    if (w == null || h == null) {
      applyMinimumDimensions();
      return;
    }
    const raw = {
      widthMm: sizeValueToMm(w, sizeUnit),
      heightMm: sizeValueToMm(h, sizeUnit),
    };
    if (!isValidCartelCustomSizeMm(raw, selectedExtraLangs.length)) {
      const clamped = clampCartelCustomSizeToMinimum(raw, selectedExtraLangs.length);
      setWidthInput(formatDimForInput(clamped.widthMm, sizeUnit));
      setHeightInput(formatDimForInput(clamped.heightMm, sizeUnit));
    }
  };

  const handleConfirm = () => {
    if (selectedId === "custom") {
      const w = parseDimInput(widthInput);
      const h = parseDimInput(heightInput);
      const raw =
        w != null && h != null
          ? { widthMm: sizeValueToMm(w, sizeUnit), heightMm: sizeValueToMm(h, sizeUnit) }
          : minCustomSize;
      const customSizeMmResolved = isValidCartelCustomSizeMm(raw, selectedExtraLangs.length)
        ? raw
        : clampCartelCustomSizeToMinimum(raw, selectedExtraLangs.length);
      onConfirm({ formatId: "custom", customSizeMm: customSizeMmResolved }, selectedExtraLangs);
      onOpenChange(false);
      return;
    }
    onConfirm({ formatId: selectedId }, selectedExtraLangs);
    onOpenChange(false);
  };

  const description =
    batchCount != null && batchCount > 1
      ? t("pdf_format_dialog_desc_batch", { count: batchCount })
      : artworkTitle?.trim()
        ? t("pdf_format_dialog_desc_named", { title: artworkTitle.trim() })
        : t("pdf_format_dialog_desc");

  const minWDisplay = formatDimForInput(minCustomSize.widthMm, sizeUnit);
  const minHDisplay = formatDimForInput(minCustomSize.heightMm, sizeUnit);
  const maxDisplay = formatDimForInput(CARTEL_CUSTOM_MAX_MM, sizeUnit);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,100%)] w-[calc(100vw-1.5rem)] flex-col gap-2 overflow-hidden p-3 sm:max-w-3xl sm:p-4">
        <DialogHeader className="shrink-0 space-y-0.5 border-0 pb-0">
          <DialogTitle className="text-base">{t("pdf_format_dialog_title")}</DialogTitle>
          <DialogDescription className="line-clamp-2 text-xs">{description}</DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selectedId}
          onValueChange={(v) => setSelectedId(v as CartelFormatId)}
          className="min-h-0 flex-1 gap-2 overflow-hidden"
        >
          <div className="grid min-h-0 gap-2 md:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1">
              <Label className="text-xs font-semibold">{t("pdf_format_group_rectangular")}</Label>
              <div className="grid grid-cols-2 gap-0.5 rounded-md border border-border/60 p-1">
                {rectangularFormats.map((format) => (
                  <FormatOption key={format.id} format={format} selectedId={selectedId} t={t} />
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-1">
              <Label className="text-xs font-semibold">{t("pdf_format_group_square")}</Label>
              <div className="grid grid-cols-2 gap-0.5 rounded-md border border-border/60 p-1">
                {squareFormats.map((format) => (
                  <FormatOption key={format.id} format={format} selectedId={selectedId} t={t} />
                ))}
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-1">
            <Label className="text-xs font-semibold">{t("pdf_format_group_custom")}</Label>
            <div
              className={cn(
                "rounded-md border border-border/60 p-2",
                selectedId === "custom" && "bg-muted/40",
              )}
            >
              <label
                htmlFor="cartel-format-custom"
                className="flex cursor-pointer items-start gap-2"
              >
                <RadioGroupItem id="cartel-format-custom" value="custom" className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="leading-tight">
                    <div className="text-xs font-medium">{t("pdf_format_custom")}</div>
                    <div className="text-[10px] text-muted-foreground">{t("pdf_format_custom_help")}</div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-[5.5rem] flex-1 flex-col gap-0.5">
                      <Label htmlFor="cartel-custom-width" className="text-[10px] text-muted-foreground">
                        {t("pdf_format_custom_width")}
                      </Label>
                      <Input
                        id="cartel-custom-width"
                        type="text"
                        inputMode="decimal"
                        value={widthInput}
                        disabled={selectedId !== "custom"}
                        onChange={(e) => {
                          setSelectedId("custom");
                          setWidthInput(e.target.value);
                        }}
                        onFocus={() => setSelectedId("custom")}
                        onBlur={handleCustomBlur}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex min-w-[5.5rem] flex-1 flex-col gap-0.5">
                      <Label htmlFor="cartel-custom-height" className="text-[10px] text-muted-foreground">
                        {t("pdf_format_custom_height")}
                      </Label>
                      <Input
                        id="cartel-custom-height"
                        type="text"
                        inputMode="decimal"
                        value={heightInput}
                        disabled={selectedId !== "custom"}
                        onChange={(e) => {
                          setSelectedId("custom");
                          setHeightInput(e.target.value);
                        }}
                        onFocus={() => setSelectedId("custom")}
                        onBlur={handleCustomBlur}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-[10px] text-muted-foreground">{t("pdf_format_custom_unit")}</Label>
                      <div className="flex h-8 overflow-hidden rounded-md border border-input">
                        <button
                          type="button"
                          className={cn(
                            "px-2.5 text-xs",
                            sizeUnit === "mm" ? "bg-muted font-semibold" : "bg-background text-muted-foreground",
                          )}
                          onClick={() => {
                            setSelectedId("custom");
                            switchUnit("mm");
                          }}
                        >
                          mm
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "border-l border-input px-2.5 text-xs",
                            sizeUnit === "cm" ? "bg-muted font-semibold" : "bg-background text-muted-foreground",
                          )}
                          onClick={() => {
                            setSelectedId("custom");
                            switchUnit("cm");
                          }}
                        >
                          cm
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedId === "custom" ? (
                    <p
                      className={cn(
                        "text-[10px] leading-snug",
                        customValid ? "text-muted-foreground" : "text-destructive",
                      )}
                    >
                      {customValid && customSizeMm
                        ? formatCustomDimensionsLabel(
                            customSizeMm.widthMm,
                            customSizeMm.heightMm,
                            sizeUnit,
                          )
                        : t("pdf_format_custom_min_required", {
                            width: minWDisplay,
                            height: minHDisplay,
                            unit: sizeUnit,
                            max: maxDisplay,
                          })}
                    </p>
                  ) : null}
                </div>
              </label>
            </div>
          </div>
        </RadioGroup>

        {extraTitleLangOptions.length > 0 ? (
          <div className="shrink-0 space-y-1 border-t border-border/60 pt-2">
            <Label className="text-xs font-semibold">{t("pdf_extra_title_langs_label")}</Label>
            <p className="text-[10px] text-muted-foreground leading-snug">{t("pdf_extra_title_langs_help")}</p>
            <div className="flex flex-wrap gap-1">
              {extraTitleLangOptions.map((opt) => {
                const checked = selectedExtraLangs.includes(opt.lang);
                return (
                  <label
                    key={opt.lang}
                    title={opt.preview || undefined}
                    className={cn(
                      "flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border/50 px-2 py-1 text-xs hover:bg-muted/40",
                      checked && "border-[#E63946]/40 bg-muted/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[#E63946]"
                      checked={checked}
                      onChange={() => toggleExtraLang(opt.lang)}
                    />
                    <span className="font-semibold uppercase">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <DialogFooter className="shrink-0 gap-2 border-0 pt-1 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("pdf_format_cancel")}
          </Button>
          <Button type="button" size="sm" disabled={!canConfirm} onClick={handleConfirm}>
            {t("pdf_format_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

