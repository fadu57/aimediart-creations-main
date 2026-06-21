import { Building2, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavigationMode } from "@/lib/navigationMode";
import { navigationModeLabel } from "@/lib/resolveEffectiveAuth";

type DashboardNavigationModeSelectorProps = {
  navigationMode: NavigationMode;
  globalRoleId: number | null;
  agencyRoleId: number | null;
  onChange: (mode: NavigationMode) => void;
};

export function DashboardNavigationModeSelector({
  navigationMode,
  globalRoleId,
  agencyRoleId,
  onChange,
}: DashboardNavigationModeSelectorProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mode de navigation</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant={navigationMode === "global" ? "default" : "outline"}
          className={cn(
            "h-auto min-h-10 flex-1 justify-start gap-2 px-3 py-2 text-left",
            navigationMode === "global" && "gradient-gold gradient-gold-hover-bg text-primary-foreground",
          )}
          onClick={() => onChange("global")}
        >
          <Shield className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{navigationModeLabel("global")}</span>
            {globalRoleId != null ? (
              <span className="block text-xs opacity-80">Niveau {globalRoleId}</span>
            ) : null}
          </span>
        </Button>
        <Button
          type="button"
          variant={navigationMode === "organisation" ? "default" : "outline"}
          className={cn(
            "h-auto min-h-10 flex-1 justify-start gap-2 px-3 py-2 text-left",
            navigationMode === "organisation" && "gradient-gold gradient-gold-hover-bg text-primary-foreground",
          )}
          onClick={() => onChange("organisation")}
        >
          <Building2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{navigationModeLabel("organisation")}</span>
            {agencyRoleId != null ? (
              <span className="block text-xs opacity-80">Niveau {agencyRoleId}</span>
            ) : null}
          </span>
        </Button>
      </div>
    </div>
  );
}
