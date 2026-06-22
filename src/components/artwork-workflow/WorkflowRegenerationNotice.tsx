import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkflowRegenerationNoticeProps = {
  lines: string[];
  canUnlock: boolean;
  unlocked: boolean;
  onUnlock: () => void;
  className?: string;
};

export function WorkflowRegenerationNotice({
  lines,
  canUnlock,
  unlocked,
  onUnlock,
  className,
}: WorkflowRegenerationNoticeProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-medium leading-snug text-destructive">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {canUnlock && !unlocked ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/5"
          onClick={onUnlock}
        >
          Débloquer une regénération (admin)
        </Button>
      ) : null}
      {canUnlock && unlocked ? (
        <p className="text-[11px] font-medium text-amber-800">Regénération admin débloquée.</p>
      ) : null}
    </div>
  );
}
