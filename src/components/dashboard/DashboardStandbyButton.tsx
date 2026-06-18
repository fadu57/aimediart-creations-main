import { useState } from "react";
import { useTranslation } from "react-i18next";

import { StandbyPlanModal, type StandbyPlanCode } from "@/components/organisation/StandbyPlanModal";
import { Button } from "@/components/ui/button";

type DashboardStandbyButtonProps = {
  planCode: StandbyPlanCode;
  planDisplayName: string;
  monthlyPriceEur: number;
  className?: string;
};

export function DashboardStandbyButton({
  planCode,
  planDisplayName,
  monthlyPriceEur,
  className,
}: DashboardStandbyButtonProps) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={className}
        style={{ backgroundColor: "rgb(157, 37, 37)", color: "white" }}
        onClick={() => setOpen(true)}
      >
        {t("standby_modal.cta_primary")}
      </Button>
      <StandbyPlanModal
        open={open}
        onOpenChange={setOpen}
        planCode={planCode}
        planDisplayName={planDisplayName}
        monthlyPriceEur={monthlyPriceEur}
      />
    </>
  );
}
