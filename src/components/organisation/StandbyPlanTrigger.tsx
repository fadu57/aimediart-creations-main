import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { StandbyPlanModal, type StandbyPlanCode } from "@/components/organisation/StandbyPlanModal";

type StandbyPlanTriggerProps = {
  planCode: StandbyPlanCode;
  planDisplayName: string;
  monthlyPriceEur: number;
  className?: string;
};

export function StandbyPlanTrigger({
  planCode,
  planDisplayName,
  monthlyPriceEur,
  className,
}: StandbyPlanTriggerProps) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/90",
          "bg-gradient-to-r from-amber-50 via-amber-100/90 to-amber-50 px-0.5 py-2.5",
          "text-sm font-bold tracking-wide text-amber-950 shadow-[0_4px_14px_rgba(245,158,11,0.22)]",
          "transition hover:border-amber-500 hover:from-amber-100 hover:to-amber-100/80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2",
          className,
        )}
        aria-haspopup="dialog"
      >
        <Star
          className="h-4 w-4 shrink-0 fill-amber-500 text-amber-500 transition group-hover:scale-110"
          aria-hidden
        />
        <span className="flex min-w-0 flex-col items-center leading-snug">
          <span className="whitespace-nowrap">{t("standby_modal.trigger_label_line1")}</span>
          <span className="whitespace-nowrap text-xs font-semibold normal-case tracking-normal">
            {t("standby_modal.trigger_label_line2")}
          </span>
        </span>
      </button>

      {open ? (
        <StandbyPlanModal
          open={open}
          onOpenChange={setOpen}
          planCode={planCode}
          planDisplayName={planDisplayName}
          monthlyPriceEur={monthlyPriceEur}
        />
      ) : null}
    </>
  );
}
