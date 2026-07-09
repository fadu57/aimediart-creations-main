import type { EntityCostDisplay } from "@/lib/costs";
import { cn } from "@/lib/utils";

type EntityCostLabelProps = {
  display: EntityCostDisplay;
  unavailableLabel: string;
  prefixLabel: string;
  className?: string;
};

export function EntityCostLabel({
  display,
  unavailableLabel,
  prefixLabel,
  className,
}: EntityCostLabelProps) {
  if (display.status === "unavailable") {
    return <span className={cn("text-destructive italic", className)}>{unavailableLabel}</span>;
  }

  return (
    <span className={cn("text-destructive", className)}>
      {prefixLabel}{" "}
      <strong className="font-bold">{display.usdFormatted}</strong>
      {display.eurFormatted ? (
        <>
          {" "}
          (<strong className="font-bold">{display.eurFormatted}</strong>)
        </>
      ) : null}
    </span>
  );
}
