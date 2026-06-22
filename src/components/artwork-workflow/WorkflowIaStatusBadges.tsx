import { cn } from "@/lib/utils";

const badgeClass =
  "inline-flex w-full min-w-0 items-center rounded-full border px-3 py-0.5 text-left text-[11px] font-medium";

type WorkflowIaStatusBadgesProps = {
  hasImageAnalysis: boolean;
  mediationCount: number;
  mediationLangsLabel: string;
  voiceReadyCount: number;
  voiceExpectedCount: number;
  voiceLangsLabel: string;
  onOpenVoices?: () => void;
};

export function WorkflowIaStatusBadges({
  hasImageAnalysis,
  mediationCount,
  mediationLangsLabel,
  voiceReadyCount,
  voiceExpectedCount,
  voiceLangsLabel,
  onOpenVoices,
}: WorkflowIaStatusBadgesProps) {
  const hasExpectedVoices = voiceExpectedCount > 0;
  const voiceComplete = hasExpectedVoices && voiceReadyCount >= voiceExpectedCount;
  const voicePartial = hasExpectedVoices && voiceReadyCount > 0 && voiceReadyCount < voiceExpectedCount;

  return (
    <div className="flex w-full max-w-[14.5rem] flex-col gap-1.5">
      <span
        className={cn(
          badgeClass,
          hasImageAnalysis
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-[#E63946] bg-[#E63946] text-white",
        )}
      >
        Image analysée : {hasImageAnalysis ? "Oui" : "Non"}
      </span>
      <span
        className={cn(
          badgeClass,
          mediationCount > 0
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-[#E63946] bg-[#E63946] text-white",
        )}
      >
        Médiations générées : {mediationCount}
        {mediationLangsLabel ? ` (${mediationLangsLabel})` : ""}
      </span>
      <span
        role={onOpenVoices ? "button" : undefined}
        tabIndex={onOpenVoices ? 0 : undefined}
        className={cn(
          badgeClass,
          !hasExpectedVoices
            ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
            : voiceComplete
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : voicePartial
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-[#E63946] bg-[#E63946] text-white",
          onOpenVoices && "cursor-pointer justify-between gap-1.5 transition-colors hover:brightness-95",
        )}
        onClick={onOpenVoices}
        onKeyDown={
          onOpenVoices
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenVoices();
                }
              }
            : undefined
        }
      >
        Voix générées : {hasExpectedVoices ? `${voiceReadyCount}/${voiceExpectedCount}` : "—"}
        {voiceLangsLabel ? ` (${voiceLangsLabel})` : ""}
      </span>
    </div>
  );
}
