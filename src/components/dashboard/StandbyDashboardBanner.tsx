import { useState } from "react";
import { MoonStar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOrganisationStandby } from "@/providers/OrganisationStandbyProvider";

export function StandbyDashboardBanner() {
  const { t } = useTranslation("header");
  const { state, isStandbyNavRestricted, cancelStandbyRequest } = useOrganisationStandby();
  const [cancelling, setCancelling] = useState(false);

  if (!isStandbyNavRestricted) return null;

  const effectiveAt = state.standby_effective_at ?? state.next_renewal_at;
  const effectiveLabel =
    effectiveAt && !Number.isNaN(new Date(effectiveAt).getTime())
      ? new Date(effectiveAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : null;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelStandbyRequest();
      toast.success(t("standby_cancel_success"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("standby_cancel_error"));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Alert className="border-amber-300/80 bg-amber-50/90 text-foreground">
      <MoonStar className="h-4 w-4 text-amber-700" />
      <AlertTitle className="text-amber-950">{t("standby_mode_active_title")}</AlertTitle>
      <AlertDescription className="space-y-3 text-sm text-foreground/85">
        <p>{t("standby_mode_active_desc")}</p>
        {effectiveLabel ? <p>{t("standby_mode_effective_at", { date: effectiveLabel })}</p> : null}
        {state.can_cancel_standby_request ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-400 bg-white"
            disabled={cancelling}
            onClick={() => void handleCancel()}
          >
            {cancelling ? t("standby_cancel_loading") : t("standby_cancel_cta")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t("standby_cancel_closed")}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
