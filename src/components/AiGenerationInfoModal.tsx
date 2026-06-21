import { useState } from "react";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import aiGenerationButtonLeft from "@/assets/ai-generation-button-left.png";
import aiGenerationButtonRight from "@/assets/ai-generation-button-right.png";
import aiGenerationModalBg from "@/assets/ai-generation-modal-bg.png";

type AiGenerationInfoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function WorkflowStep({
  text,
  variant,
  compact,
}: {
  text: string;
  variant: "prompt" | "output";
  compact?: boolean;
}) {
  const isPrompt = variant === "prompt";
  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-xl border px-2.5 py-2 text-center leading-snug break-words",
        compact
          ? "min-w-0 flex-1 text-[0.72rem] sm:text-xs"
          : "min-w-0 flex-1 text-xs sm:text-[0.8rem]",
        isPrompt
          ? "border-sky-400/70 bg-sky-100 text-sky-950"
          : "border-amber-400/70 bg-amber-100 font-semibold text-amber-950",
      )}
    >
      {text}
    </div>
  );
}

function WorkflowRow({
  steps,
  startIndex,
  compact,
}: {
  steps: string[];
  startIndex: number;
  compact?: boolean;
}) {
  return (
    <div className="flex w-full items-stretch justify-center gap-1 sm:gap-1.5">
      {steps.map((step, index) => (
        <div key={`${startIndex + index}-${step.slice(0, 12)}`} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5">
          {index > 0 ? (
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-sky-400/90 sm:h-4 sm:w-4" aria-hidden />
          ) : null}
          <WorkflowStep
            text={step}
            variant={(startIndex + index) % 2 === 0 ? "prompt" : "output"}
            compact={compact}
          />
        </div>
      ))}
    </div>
  );
}

export function AiGenerationInfoModal({ open, onOpenChange }: AiGenerationInfoModalProps) {
  const { t } = useTranslation("home");
  const ns = "hero.ai_generation";
  const workflowRaw = t(`${ns}.workflow_steps`, { returnObjects: true });
  const workflowSteps = Array.isArray(workflowRaw)
    ? workflowRaw
    : [
        "Prompt pour générer la bio de l'artiste (plus l'artiste est connu, plus c'est précis)",
        "Bio générée",
        "Prompt pour analyser la photo de l'œuvre selon 5 critères",
        "Description de l'œuvre générée",
        "Prompt pour générer les 8 textes de médiation",
        "8 textes de médiation générés",
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(90vh,820px)] max-h-[min(90vh,820px)] w-[calc(100vw-2rem)] !max-w-[860px] flex-col gap-0 overflow-hidden border-neutral-300/80 bg-[#faf8f5] p-0 sm:max-w-[860px] sm:rounded-2xl"
        hideCloseButton
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
      >
        {/* Photo visible à droite (desktop) */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 left-[650px] hidden overflow-hidden sm:block sm:rounded-r-2xl"
          aria-hidden
        >
          <img
            src={aiGenerationModalBg}
            alt=""
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-black/10 via-transparent to-[#faf8f5]" />
        </div>

        {/* Bandeau photo (mobile) */}
        <div className="relative h-28 shrink-0 overflow-hidden sm:hidden" aria-hidden>
          <img
            src={aiGenerationModalBg}
            alt=""
            className="h-full w-full object-cover object-[center_35%]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#faf8f5]/25 to-[#faf8f5]" />
        </div>

        {/* Texte sur fond opaque — ne recouvre pas la photo à droite */}
        <div className="relative z-10 flex h-full min-h-0 flex-col bg-[#faf8f5] sm:w-[650px] sm:max-w-[650px]">
        <DialogHeader className="shrink-0 space-y-2 border-b border-neutral-200/90 bg-[#faf8f5] px-5 py-4 sm:px-6">
          <DialogTitle className="pr-8 text-left text-xl text-[#1f1f1f]">
            {t(`${ns}.title`)}
          </DialogTitle>
          <DialogDescription className="-mx-5 w-[calc(100%+2.5rem)] px-5 text-left text-sm leading-relaxed text-[#333] sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6">
            {t(`${ns}.intro`)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#faf8f5] px-5 py-4 pb-6 sm:px-6">
          <section className="w-full rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-[#1f1f1f]">{t(`${ns}.workflow_title`)}</h3>
            <div className="mt-3 flex w-full flex-col gap-2.5" aria-label={t(`${ns}.workflow_title`)}>
              <WorkflowRow steps={workflowSteps.slice(0, 2)} startIndex={0} compact />
              <div className="mx-auto flex w-[274px] justify-center" aria-hidden>
                <ArrowDown className="h-[29px] w-[29px] text-sky-400/90" />
              </div>
              <WorkflowRow steps={workflowSteps.slice(2, 4)} startIndex={2} compact />
              <div className="mx-auto flex w-[274px] justify-center" aria-hidden>
                <ArrowDown className="h-[29px] w-[29px] text-sky-400/90" />
              </div>
              <WorkflowRow steps={workflowSteps.slice(4, 6)} startIndex={4} compact />
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-emerald-200/90 bg-emerald-50 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-emerald-950">{t(`${ns}.editable_title`)}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-emerald-950">{t(`${ns}.editable_body`)}</p>
          </section>

          <p className="mt-4 rounded-2xl border border-neutral-200/90 bg-white p-4 text-sm leading-relaxed text-[#333] shadow-sm">
            {t(`${ns}.persona_warning`)}
          </p>
        </div>

        <div className="shrink-0 border-t border-neutral-200/90 bg-[#faf8f5] px-5 py-4 sm:px-6">
          <Button
            type="button"
            className="h-11 w-full rounded-xl"
            style={{ backgroundColor: "#9d2525", color: "white" }}
            onClick={() => onOpenChange(false)}
          >
            {t(`${ns}.close`)}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type AiGenerationInfoTriggerProps = {
  className?: string;
};

export function AiGenerationInfoTrigger({ className }: AiGenerationInfoTriggerProps) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex h-[4.25rem] w-full overflow-hidden rounded-lg border border-[#9d2525]/80 text-center font-semibold text-white transition sm:h-[100px]",
          "shadow-[0_10px_28px_rgba(157,37,37,0.28)] hover:border-[#8a2020] hover:shadow-[0_14px_36px_rgba(157,37,37,0.38)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9d2525]/40 focus-visible:ring-offset-2",
          className,
        )}
        aria-haspopup="dialog"
      >
        <span className="absolute inset-0 bg-[#181818]" aria-hidden>
          <img
            src={aiGenerationButtonLeft}
            alt=""
            className="absolute left-0 top-0 h-full w-[75px] max-w-none object-cover object-right"
          />
          <img
            src={aiGenerationButtonRight}
            alt=""
            className="absolute right-0 top-0 h-full w-[85px] max-w-none object-cover object-left"
          />
        </span>
        <span className="relative z-10 flex h-full w-full min-w-0 items-center justify-center gap-2.5 px-3 py-2.5 text-base leading-snug sm:px-4 sm:text-lg">
          <span
            className="absolute top-0 bottom-0 left-16 flex w-[320px] flex-wrap items-center justify-center scale-x-[-1] bg-[radial-gradient(circle_at_50%_50%,rgba(157,37,37,1)_57%,transparent_97%)] shadow-[0px_4px_71px_35px_rgba(157,37,37,0.15)]"
            aria-hidden
          />
          <Sparkles className="relative z-10 h-5 w-5 shrink-0 text-white" aria-hidden />
          <span className="relative z-10">{t("hero.ai_generation.button")}</span>
        </span>
      </button>

      <AiGenerationInfoModal open={open} onOpenChange={setOpen} />
    </>
  );
}
