import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GED_DESCRIPTION_MAX_LEN } from "@/lib/aimediartDocuments";
import { cn } from "@/lib/utils";

type GedFolderCommentControlProps = {
  description: string | null | undefined;
  disabled?: boolean;
  /** Affiche le bouton « ajouter » quand le dossier est ouvert (sinon icône seulement s’il y a un commentaire). */
  allowAdd?: boolean;
  onSave: (value: string | null) => Promise<{ error: string | null }>;
};

/**
 * Symbole visible uniquement s’il y a un commentaire (survol = lecture).
 * Ouverture du dossier : bouton pour ajouter / modifier.
 */
export function GedFolderCommentControl({
  description,
  disabled,
  allowAdd = false,
  onSave,
}: GedFolderCommentControlProps) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(description ?? "");
  const [saving, setSaving] = useState(false);
  const hasComment = Boolean(description?.trim());
  const showControl = hasComment || allowAdd || open;

  useEffect(() => {
    if (open) setDraft(description ?? "");
  }, [open, description]);

  if (!showControl) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await onSave(draft);
    setSaving(false);
    if (error) return;
    setOpen(false);
  };

  const triggerButton = (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "h-7 w-7 shrink-0",
        hasComment && "text-[#E63946] hover:text-[#E63946]",
      )}
      disabled={disabled || saving}
      aria-label={hasComment ? t("aimediart_docs.comment_edit") : t("aimediart_docs.comment_add")}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={250}>
        <Tooltip open={open ? false : undefined}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            </span>
          </TooltipTrigger>
          {hasComment ? (
            <TooltipContent
              side="top"
              className="max-w-[min(20rem,90vw)] whitespace-pre-wrap text-left text-xs leading-snug"
            >
              {description}
            </TooltipContent>
          ) : (
            <TooltipContent side="top" className="text-xs">
              {t("aimediart_docs.comment_add")}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        align="start"
        className="z-[60] w-[min(20rem,92vw)] space-y-2 p-3"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium text-neutral-700">
          {t("aimediart_docs.comment_title")}
        </p>
        <Textarea
          value={draft}
          maxLength={GED_DESCRIPTION_MAX_LEN}
          rows={3}
          className="min-h-[4.5rem] resize-none text-xs leading-snug"
          placeholder={t("aimediart_docs.comment_placeholder")}
          aria-label={t("aimediart_docs.comment_title")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {draft.trim().length}/{GED_DESCRIPTION_MAX_LEN}
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              {t("aimediart_docs.comment_cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("aimediart_docs.comment_save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
