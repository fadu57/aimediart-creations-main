import { type ReactNode, useEffect, useState } from "react";
import { Check, MoonStar, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthUser } from "@/hooks/useAuthUser";
import { canUseStandbyPlanFeatures } from "@/lib/organisationStandby";
import { useOrganisationStandby } from "@/providers/OrganisationStandbyProvider";
import { fetchPricingByPlanCode, type PricingRow } from "@/lib/organisation/publicHomeData";
import { cn } from "@/lib/utils";

export type StandbyPlanCode = "ATELIER" | "HORIZON";

const STANDBY_PRICING_PLAN_CODES: StandbyPlanCode[] = ["ATELIER", "HORIZON"];

type StandbyPlanModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planCode: StandbyPlanCode;
  planDisplayName: string;
  monthlyPriceEur: number;
};

function ModalSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-neutral-200/80 bg-white p-4", className)}>
      <h3 className="text-sm font-semibold text-[#1f1f1f]">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#9d2525]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function StandbyPlanModal({
  open,
  onOpenChange,
  planCode,
  planDisplayName,
  monthlyPriceEur,
}: StandbyPlanModalProps) {
  const { t, i18n } = useTranslation("home");
  const navigate = useNavigate();
  const { session, role_id } = useAuthUser();
  const { state, requestStandby } = useOrganisationStandby();
  const [submitting, setSubmitting] = useState(false);
  const [standbyPricingRows, setStandbyPricingRows] = useState<PricingRow[]>([]);
  const ns = "standby_modal";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const rows = await Promise.all(
        STANDBY_PRICING_PLAN_CODES.map((code) => fetchPricingByPlanCode(code)),
      );
      if (!cancelled) {
        setStandbyPricingRows(rows.filter((row): row is PricingRow => row != null));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const formatStandbyPrice = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);

  const standbyPlanLineLabel = (row: PricingRow): string | null => {
    const price = row.standby_monthly_price_ttc_eur;
    if (typeof price !== "number" || price <= 0) return null;
    const planName =
      row.display_name?.trim() || row.pricing_plan?.trim() || row.plan_code?.trim() || "—";
    return t(`${ns}.pricing_plan_line`, { plan: planName, price: formatStandbyPrice(price) });
  };

  const whenItems = t(`${ns}.when_items`, { returnObjects: true }) as string[];
  const essentialsItems = t(`${ns}.essentials_items`, { returnObjects: true }) as string[];
  const eligibilityItems = t(`${ns}.eligibility_items`, { returnObjects: true }) as string[];
  const accessibleItems = t(`${ns}.accessible_items`, { returnObjects: true }) as string[];
  const changesItems = t(`${ns}.changes_items`, { returnObjects: true }) as string[];
  const compareRows = t(`${ns}.compare_rows`, { returnObjects: true }) as Array<{
    label: string;
    active: string;
    standby: string;
  }>;

  const subscribePath = `/login?redirect=${encodeURIComponent("/dashboard")}`;

  const handlePrimaryAction = async () => {
    if (!session?.user) {
      onOpenChange(false);
      navigate(subscribePath);
      return;
    }
    if (!canUseStandbyPlanFeatures(role_id)) {
      toast.error(t(`${ns}.error_role`));
      return;
    }
    if (state.is_nav_restricted) {
      toast.info(t(`${ns}.error_already_pending`));
      onOpenChange(false);
      navigate("/dashboard");
      return;
    }
    if (!state.can_request_standby) {
      toast.error(t(`${ns}.error_not_eligible`));
      return;
    }
    setSubmitting(true);
    try {
      await requestStandby();
      toast.success(t(`${ns}.request_success`));
      onOpenChange(false);
      navigate("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(`${ns}.request_error`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92vh,880px)] max-w-[min(96vw,42rem)] flex-col gap-0 overflow-hidden border-neutral-200 p-0 sm:rounded-3xl"
        hideCloseButton
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
      >
        <DialogHeader className="shrink-0 space-y-2 border-b border-neutral-200/80 bg-gradient-to-br from-amber-50/90 via-[#faf8f5] to-white px-5 py-5 text-left sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm">
                <MoonStar className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <DialogTitle className="text-xl leading-tight text-[#1f1f1f] sm:text-2xl">
                  {t(`${ns}.title`)}
                </DialogTitle>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-800/80">
                  {t(`${ns}.badge`, { plan: planDisplayName })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground"
              aria-label={t(`${ns}.close`)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-foreground/80">
            {t(`${ns}.subtitle`)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#faf9f7] px-5 py-4 sm:px-6">
          <ModalSection title={t(`${ns}.essentials_title`)} className="border-amber-200/80 bg-amber-50/60">
            <BulletList items={essentialsItems} />
          </ModalSection>

          <ModalSection title={t(`${ns}.purpose_title`)}>
            <p>{t(`${ns}.purpose_text`)}</p>
          </ModalSection>

          <ModalSection title={t(`${ns}.when_title`)}>
            <BulletList items={whenItems} />
          </ModalSection>

          <ModalSection title={t(`${ns}.eligibility_title`)} className="border-neutral-300/80 bg-white">
            <p className="mb-2">{t(`${ns}.eligibility_intro`)}</p>
            <BulletList items={eligibilityItems} />
          </ModalSection>

          <ModalSection title={t(`${ns}.commercial_logic_title`)} className="border-[#9d2525]/15 bg-[#fdf8f7]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9d2525]">
                  {t(`${ns}.commercial_monthly_label`)}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{t(`${ns}.commercial_monthly_text`)}</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                  {t(`${ns}.commercial_annual_label`)}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{t(`${ns}.commercial_annual_text`)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm font-medium text-foreground/90">{t(`${ns}.commercial_no_cumul`)}</p>
          </ModalSection>

          <div className="grid gap-3 sm:grid-cols-2">
            <ModalSection title={t(`${ns}.accessible_title`)} className="bg-emerald-50/40">
              <BulletList items={accessibleItems} />
            </ModalSection>
            <ModalSection title={t(`${ns}.changes_title`)} className="bg-sky-50/35">
              <BulletList items={changesItems} />
            </ModalSection>
          </div>

          <ModalSection title={t(`${ns}.compare_title`)}>
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full min-w-[280px] text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/80">
                    <th className="px-3 py-2 font-medium text-muted-foreground" scope="col" />
                    <th className="px-3 py-2 font-semibold text-[#9d2525]" scope="col">
                      {t(`${ns}.compare_active`)}
                    </th>
                    <th className="px-3 py-2 font-semibold text-amber-800" scope="col">
                      {t(`${ns}.compare_standby`)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((row) => (
                    <tr key={row.label} className="border-b border-neutral-100 last:border-0">
                      <th className="px-3 py-2.5 font-medium text-foreground/90" scope="row">
                        {row.label}
                      </th>
                      <td className="px-3 py-2.5 text-foreground/80">{row.active}</td>
                      <td className="px-3 py-2.5 text-foreground/80">{row.standby}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModalSection>

          <ModalSection title={t(`${ns}.pricing_title`)} className="border-amber-200/70 bg-amber-50/50">
            <p className="text-sm text-foreground/75">{t(`${ns}.pricing_note`)}</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {standbyPricingRows.map((row) => {
                const label = standbyPlanLineLabel(row);
                if (!label) return null;
                return <li key={row.plan_code ?? row.pricing_id ?? label}>{label}</li>;
              })}
              <li>{t(`${ns}.pricing_etincelle`)}</li>
              <li>{t(`${ns}.pricing_rayonnement`)}</li>
            </ul>
          </ModalSection>

          <ModalSection title={t(`${ns}.reactivation_title`)}>
            <p>{t(`${ns}.reactivation_text`)}</p>
          </ModalSection>
        </div>

        <div className="shrink-0 flex flex-col gap-2 border-t border-neutral-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-neutral-300"
            onClick={() => onOpenChange(false)}
          >
            {t(`${ns}.cta_secondary`)}
          </Button>
          <Button
            type="button"
            className="h-11 rounded-xl font-semibold shadow-sm"
            style={{ backgroundColor: "#9D2525", color: "white" }}
            disabled={submitting}
            onClick={() => void handlePrimaryAction()}
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            {submitting ? t(`${ns}.request_loading`) : t(`${ns}.cta_primary`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
