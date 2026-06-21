import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  engagementPlanHref,
  type UpgradePlanCode,
} from "@/lib/organisation/planLimits";
import { fetchPricingByPlanCode, toPricingNumber } from "@/lib/organisation/publicHomeData";
import {
  getAlternatePlanCode,
  getPlanDisplayLabel,
  switchOrganisationPlan,
  type SwitchablePlanCode,
} from "@/lib/organisationPlanSwitch";

/** Passage payant Horizon — désactivé tant que le paiement en ligne n’est pas actif. */
const PAID_PLAN_SWITCHES_DISABLED = true;

const ETINCELLE_UPGRADE_PLANS: UpgradePlanCode[] = ["ATELIER", "HORIZON"];
const ETINCELLE_PRICED_PLANS = [...ETINCELLE_UPGRADE_PLANS, "RAYONNEMENT"] as const;

type EtincellePricedPlan = (typeof ETINCELLE_PRICED_PLANS)[number];

const PLAN_ACTION_GRADIENT_FIRST_START = "#D89427";
const PLAN_ACTION_GRADIENT_FIRST_END = "#D57F27";
const PLAN_ACTION_GRADIENT_LAST_END = "#B86060";
const PLAN_ACTION_STEP_COUNT = 4;
const PLAN_ACTION_TEXT_COLOR = "#FFFAF5";

const PLAN_ACTION_BTN_CLASS =
  "h-[60px] w-full rounded-lg px-3 whitespace-normal py-2 hover:opacity-90 hover:!bg-transparent !shadow-none border-0";

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function toHexColor(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHexColors(from: string, to: string, ratio: number): string {
  const [r0, g0, b0] = parseHexColor(from);
  const [r1, g1, b1] = parseHexColor(to);
  const t = Math.min(1, Math.max(0, ratio));
  return toHexColor(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t);
}

/** Même écart que le 1er bouton (#D89427 → #D57F27), appliqué à la teinte finale #B86060. */
function planActionGradientLastStart(): string {
  const [firstStartR, firstStartG] = parseHexColor(PLAN_ACTION_GRADIENT_FIRST_START);
  const [firstEndR, firstEndG] = parseHexColor(PLAN_ACTION_GRADIENT_FIRST_END);
  const [lastEndR, lastEndG, lastEndB] = parseHexColor(PLAN_ACTION_GRADIENT_LAST_END);
  return toHexColor(
    lastEndR + (firstStartR - firstEndR),
    lastEndG + (firstStartG - firstEndG),
    lastEndB,
  );
}

function planActionButtonGradient(stepIndex: number): { from: string; to: string } {
  const lastStart = planActionGradientLastStart();
  const t = PLAN_ACTION_STEP_COUNT <= 1 ? 0 : stepIndex / (PLAN_ACTION_STEP_COUNT - 1);
  return {
    from: mixHexColors(PLAN_ACTION_GRADIENT_FIRST_START, lastStart, t),
    to: mixHexColors(PLAN_ACTION_GRADIENT_FIRST_END, PLAN_ACTION_GRADIENT_LAST_END, t),
  };
}

function planActionButtonStyle(stepIndex: number): CSSProperties {
  const { from, to } = planActionButtonGradient(stepIndex);
  return {
    backgroundColor: "transparent",
    backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
    color: PLAN_ACTION_TEXT_COLOR,
  };
}

const DEVIS_QUOTE_BTN_CLASS = `${PLAN_ACTION_BTN_CLASS} text-base font-semibold`;

const RAYONNEMENT_DEVIS_HREF = "/organisation/commencer?intent=devis&plan=Rayonnement";
const ZENITH_DEVIS_HREF = "/organisation/commencer?intent=devis&plan=ZENITH";

function formatMonthlyTtcLabel(value: unknown): string {
  const n = toPricingNumber(value);
  if (n == null) return "— €/mois";
  const amount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
  return `${amount}/mois`;
}

function formatPlanSecondaryLine(
  plan: string,
  monthly: number | null | undefined,
  options?: { quoteFallback?: boolean },
): string {
  const n = toPricingNumber(monthly);
  if (n != null && n > 0) {
    return `${plan} · ${formatMonthlyTtcLabel(n)}`;
  }
  if (options?.quoteFallback) {
    return `${plan} · Sur devis`;
  }
  return `${plan} · ${formatMonthlyTtcLabel(monthly)}`;
}

type DashboardPlanActionsProps = {
  organisationId: string;
  subscriptionId: string;
  currentPlanCode: string | null | undefined;
  isEtincelle?: boolean;
  onChanged: () => void;
};

export function DashboardPlanActions({
  organisationId,
  subscriptionId,
  currentPlanCode,
  isEtincelle = false,
  onChanged,
}: DashboardPlanActionsProps) {
  const [switching, setSwitching] = useState(false);
  const [monthlyByPlan, setMonthlyByPlan] = useState<Partial<Record<EtincellePricedPlan, number | null>>>({});
  const alternatePlan = getAlternatePlanCode(currentPlanCode);
  const isPaidSwitch =
    PAID_PLAN_SWITCHES_DISABLED && alternatePlan === "HORIZON";

  useEffect(() => {
    if (!isEtincelle) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ETINCELLE_PRICED_PLANS.map(async (plan) => {
          const row = await fetchPricingByPlanCode(plan);
          return [plan, row?.pricing_monthly_ttc_eur ?? null] as const;
        }),
      );
      if (cancelled) return;
      setMonthlyByPlan(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [isEtincelle]);

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

  if (isEtincelle) {
    return (
      <div className="flex w-full flex-col items-stretch gap-2">
        {ETINCELLE_UPGRADE_PLANS.map((plan, index) => (
          <Button
            key={plan}
            asChild
            type="button"
            className={`${PLAN_ACTION_BTN_CLASS} flex flex-col items-center justify-center gap-0.5 leading-tight`}
            style={planActionButtonStyle(index)}
          >
            <Link to={engagementPlanHref(plan)} className="flex flex-col items-center justify-center gap-0.5 leading-tight">
              <span className="text-xs font-normal">Passer à l&apos;abonnement</span>
              <span className="text-sm font-semibold">
                {formatPlanSecondaryLine(plan, monthlyByPlan[plan])}
              </span>
            </Link>
          </Button>
        ))}
        <Button
          asChild
          type="button"
          className={`${PLAN_ACTION_BTN_CLASS} flex flex-col items-center justify-center gap-0.5 leading-tight`}
          style={planActionButtonStyle(2)}
        >
          <Link
            to={RAYONNEMENT_DEVIS_HREF}
            className="flex flex-col items-center justify-center gap-0.5 leading-tight"
          >
            <span className="text-xs font-normal">Passer à l&apos;abonnement</span>
            <span className="w-[200px] text-sm font-semibold">
              {formatPlanSecondaryLine("RAYONNEMENT", monthlyByPlan.RAYONNEMENT, { quoteFallback: true })}
            </span>
          </Link>
        </Button>
        <Link to={ZENITH_DEVIS_HREF} className="block w-full">
          <Button
            type="button"
            size="sm"
            className={DEVIS_QUOTE_BTN_CLASS}
            style={planActionButtonStyle(3)}
          >
            Devis Zénith
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      {alternatePlan ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={switching || isPaidSwitch}
          title={
            isPaidSwitch
              ? "Passage à Horizon : paiement en ligne bientôt disponible"
              : undefined
          }
          onClick={() => void handleSwitch(alternatePlan)}
        >
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Passer à {getPlanDisplayLabel(alternatePlan)}
        </Button>
      ) : null}
      <Link to={ZENITH_DEVIS_HREF} className="block w-full">
        <Button
          type="button"
          size="sm"
          className={DEVIS_QUOTE_BTN_CLASS}
          style={planActionButtonStyle(3)}
        >
          Devis Zénith
        </Button>
      </Link>
    </div>
  );
}
