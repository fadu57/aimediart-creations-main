import { cn } from "@/lib/utils";

type StepState = "pending" | "active" | "done";

type WorkflowStepIndicatorProps = {
  steps: { label: string; title?: string; subtitle?: string; state: StepState }[];
  /** Sur fond rouge brand (#E63946) dans le header modal. */
  variant?: "default" | "header";
};

export function WorkflowStepIndicator({ steps, variant = "default" }: WorkflowStepIndicatorProps) {
  const onHeader = variant === "header";

  return (
    <ol
      className={cn(
        "flex w-full items-center gap-1 sm:gap-1.5",
        onHeader
          ? "max-sm:grid max-sm:grid-cols-3 max-sm:items-start max-sm:gap-x-2 max-sm:gap-y-2 sm:flex-nowrap"
          : "flex-wrap gap-1.5 sm:gap-2",
      )}
      aria-label="Étapes du formulaire"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5",
            onHeader ? "min-w-0 sm:shrink-0" : "shrink-0",
          )}
        >
          <span
            className={cn(
              "flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none sm:h-6 sm:min-w-[1.5rem] sm:px-1.5 sm:text-[10px]",
              !onHeader && step.state === "done" && "bg-emerald-600 text-white",
              !onHeader && step.state === "active" && "bg-[#E63946] text-white ring-2 ring-[#E63946]/30",
              !onHeader && step.state === "pending" && "bg-muted text-muted-foreground",
              onHeader && step.state === "done" && "bg-emerald-500 text-white",
              onHeader && step.state === "active" && "bg-white text-[#E63946] ring-2 ring-white/40",
              onHeader && step.state === "pending" && "bg-white/20 text-white/90",
            )}
            aria-current={step.state === "active" ? "step" : undefined}
          >
            {index + 1}
          </span>
          <span
            className={cn(
              step.subtitle ? "flex min-w-0 flex-col leading-tight" : "whitespace-nowrap",
              "text-[10px] font-medium sm:text-[11px]",
              !onHeader && step.state === "active" && "text-foreground",
              !onHeader && step.state === "done" && "text-emerald-700",
              !onHeader && step.state === "pending" && "text-muted-foreground",
              onHeader && step.state === "active" && "text-white",
              onHeader && step.state === "done" && "text-emerald-100",
              onHeader && step.state === "pending" && "text-white/70",
            )}
          >
            {step.subtitle ? (
              <>
                <span className="whitespace-nowrap font-semibold">{step.title ?? step.label}</span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[9px] font-normal sm:text-[10px]",
                    onHeader && step.state === "active" && "text-white/90",
                    onHeader && step.state === "done" && "text-emerald-100/90",
                    onHeader && step.state === "pending" && "text-white/60",
                  )}
                >
                  {step.subtitle}
                </span>
              </>
            ) : (
              step.label
            )}
          </span>
          {index < steps.length - 1 ? (
            <span
              className={cn(
                "mx-0.5 h-px w-2 shrink-0 sm:w-2.5",
                onHeader && "max-sm:hidden",
                onHeader ? "bg-white/30" : "bg-border",
              )}
              aria-hidden
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
