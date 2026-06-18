import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getAlternatePlanCode,
  getPlanDisplayLabel,
  switchOrganisationPlan,
  type SwitchablePlanCode,
} from "@/lib/organisationPlanSwitch";

/** Passage vers Horizon : payant — désactivé tant que le paiement en ligne n’est pas actif. */
const PAID_PLAN_SWITCHES_DISABLED = true;

type DashboardPlanActionsProps = {
  organisationId: string;
  subscriptionId: string;
  currentPlanCode: string | null | undefined;
  onChanged: () => void;
};

export function DashboardPlanActions({
  organisationId,
  subscriptionId,
  currentPlanCode,
  onChanged,
}: DashboardPlanActionsProps) {
  const [switching, setSwitching] = useState(false);
  const alternatePlan = getAlternatePlanCode(currentPlanCode);
  const isPaidSwitch =
    PAID_PLAN_SWITCHES_DISABLED && alternatePlan === "HORIZON";

  const handleSwitch = async (target: SwitchablePlanCode) => {
    if (PAID_PLAN_SWITCHES_DISABLED && target === "HORIZON") return;
    setSwitching(true);
    try {
      const { error } = await switchOrganisationPlan(organisationId, subscriptionId, target);
      if (error) {
        toast.error("Changement de plan impossible", { description: error });
        return;
      }
      toast.success(`Abonnement mis à jour vers ${getPlanDisplayLabel(target)}.`);
      onChanged();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {alternatePlan ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={switching || isPaidSwitch}
          title={
            isPaidSwitch
              ? "Passage à Horizon : paiement en ligne bientôt disponible"
              : undefined
          }
          onClick={() => void handleSwitch(alternatePlan)}
        >
          {switching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-4 w-4 mr-2" />
          )}
          Passer à {getPlanDisplayLabel(alternatePlan)}
        </Button>
      ) : null}
      <Button asChild type="button" variant="secondary" size="sm">
        <Link to="/organisation/commencer?intent=devis&plan=Rayonnement">
          <FileText className="h-4 w-4 mr-2" />
          Devis Rayonnement
        </Link>
      </Button>
    </div>
  );
}
