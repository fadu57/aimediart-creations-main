import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TextEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  /**
   * `mediation` : texte poétique / IA — pas de soulignement (faux positifs fréquents).
   * `prose` : description source — correction native du navigateur activée.
   */
  editorKind?: "mediation" | "prose";
  /** Langue du contenu édité (ex. onglet FR). Utilisée pour l'attribut `lang`. */
  contentLang?: string;
};

const SPELL_CHECK_LOCALE: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
};

function resolveTextLocale(lang: string): string {
  const raw = lang.trim();
  if (!raw) return "fr-FR";
  const base = raw.toLowerCase().split(/[-_]/)[0];
  if (SPELL_CHECK_LOCALE[base]) return SPELL_CHECK_LOCALE[base];
  if (raw.includes("-") || raw.includes("_")) return raw.replace("_", "-");
  return "fr-FR";
}

/** Attributs pour bloquer Grammarly / Microsoft Editor (soulignements massifs hors sujet). */
const GRAMMAR_EXTENSION_BLOCK_PROPS = {
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-lt-active": "false",
} as const;

/**
 * Modal d'édition empilé (Radix Dialog) — compatible avec le focus trap du modal œuvre parent.
 */
export function TextEditModal({
  open,
  onOpenChange,
  title,
  description,
  value,
  onSave,
  placeholder,
  minRows = 10,
  editorKind = "mediation",
  contentLang,
}: TextEditModalProps) {
  const { t, i18n } = useTranslation("artwork_modal");
  const textLocale = resolveTextLocale(contentLang ?? i18n.language);
  const enableSpellCheck = editorKind === "prose";
  const [draft, setDraft] = useState(value);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setConfirmDiscardOpen(false);
    }
  }, [open, value]);

  // Certains webviews (ex. navigateur intégré IDE) ignorent les props React : forcer l'attribut DOM.
  useEffect(() => {
    const el = textareaRef.current;
    if (!open || !el) return;
    el.spellcheck = enableSpellCheck;
    el.setAttribute("spellcheck", enableSpellCheck ? "true" : "false");
    el.setAttribute("autocomplete", "off");
    el.setAttribute("translate", "no");
  }, [open, enableSpellCheck, draft]);

  const isDirty = open && draft !== value;

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      requestClose();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          overlayClassName="z-[100]"
          lang={textLocale}
          className={cn(
            "z-[101] flex max-h-[92dvh] w-[min(100vw-1rem,32rem)] max-w-lg flex-col gap-0 overflow-hidden p-0",
          )}
          hideCloseButton={false}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            textareaRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmDiscardOpen(true);
            }
          }}
          onPointerDownOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmDiscardOpen(true);
            }
          }}
          onInteractOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setConfirmDiscardOpen(true);
            }
          }}
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-5">
            <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5" lang={textLocale}>
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              rows={minRows}
              spellCheck={enableSpellCheck}
              lang={textLocale}
              autoComplete="off"
              translate="no"
              autoCorrect={enableSpellCheck ? undefined : "off"}
              autoCapitalize="off"
              className="min-h-[220px] w-full resize-y text-sm leading-relaxed"
              {...GRAMMAR_EXTENSION_BLOCK_PROPS}
            />
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            <Button type="button" variant="outline" onClick={requestClose}>
              {t("text_edit.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(draft);
                onOpenChange(false);
              }}
            >
              {t("text_edit.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("text_edit.unsaved_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("text_edit.unsaved_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("text_edit.continue_editing")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setConfirmDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              {t("text_edit.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
