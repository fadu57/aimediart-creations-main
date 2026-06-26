import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  listMissingConventionAgencyFields,
} from "@/lib/agencyIdentity";
import { formatCommercialDiscountEurInput } from "@/lib/organisation/commercialTerms";
import type { SubscribeButtonSpec } from "@/lib/organisation/planLimits";
import { subscribePlanHref } from "@/lib/organisation/planLimits";
import type { DashboardAgency } from "@/hooks/useDashboardProfile";
import { SponsoringConventionButton } from "@/components/dashboard/SponsoringConventionButton";
import { Button } from "@/components/ui/button";

type DashboardOrganisationCommercialTermsBlockProps = {
  agency: DashboardAgency;
  organisationId: string;
  subscriptionStartedAt?: string | null;
  subscriptionExpiresAt?: string | null;
  subscribeButtons?: SubscribeButtonSpec[];
};

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatAnnualDiscountEur(monthlyEur: number | null | undefined): string {
  const eur = Number(monthlyEur) || 0;
  if (eur <= 0) return "—";
  const annual = Math.round(eur * 12 * 100) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(annual);
}

export function DashboardOrganisationCommercialTermsBlock({
  agency,
  organisationId,
  subscriptionStartedAt,
  subscriptionExpiresAt,
  subscribeButtons = [],
}: DashboardOrganisationCommercialTermsBlockProps) {
  const { t } = useTranslation("dashboard");
  const planCode = agency.commercial_plan_code?.trim() || null;
  const commercialNotes = agency.commercial_notes?.trim() || null;
  const primarySubscribeButton = subscribeButtons.find((button) => button.variant === "primary");
  const missingFields = listMissingConventionAgencyFields(agency);

  const subscriptionStart = subscriptionStartedAt?.trim()
    ? formatDateFr(subscriptionStartedAt)
    : t("org_terms.at_subscription");
  const subscriptionEnd = subscriptionExpiresAt?.trim()
    ? formatDateFr(subscriptionExpiresAt)
    : agency.sponsor_valid_until?.trim()
      ? formatDateFr(agency.sponsor_valid_until)
      : t("org_terms.twelve_months_after");

  return (
    <div className="rounded-lg border border-[#9d2525]/25 bg-[#fff9f7]/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{t("org_terms.title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("org_terms.intro")}
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("org_terms.field_plan")}</dt>
          <dd className="mt-0.5 font-medium text-foreground">{planCode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("org_terms.field_reason")}</dt>
          <dd className="mt-0.5 text-foreground">{commercialNotes ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("org_terms.field_annual_discount")}
          </dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatAnnualDiscountEur(agency.discount_amount_eur)}
            {Number(agency.discount_amount_eur) > 0 ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({formatCommercialDiscountEurInput(Number(agency.discount_amount_eur) || 0)} × 12)
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("org_terms.field_duration")}</dt>
          <dd className="mt-0.5 space-y-1 text-foreground">
            <div>
              {t("org_terms.start")} · <span className="font-medium">{subscriptionStart}</span>
            </div>
            <div>
              {t("org_terms.end")} · <span className="font-medium">{subscriptionEnd}</span>
            </div>
          </dd>
        </div>
      </dl>

      <div className="space-y-2 text-sm leading-4 text-muted-foreground">
        {missingFields.length > 0 ? (
          <>
            <p>
              {t("org_terms.complete_missing")}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[#9d2525]">
              {missingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            <p>
              {t("org_terms.convention_instructions_after_fields")}
            </p>
          </>
        ) : (
          <p>
            {t("org_terms.convention_instructions")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SponsoringConventionButton organisationId={organisationId} />
        {primarySubscribeButton ? (
          <Button
            asChild
            size="sm"
            className="gradient-gold gradient-gold-hover-bg text-primary-foreground sm:flex-1"
          >
            <Link to={subscribePlanHref(primarySubscribeButton.plan)}>{primarySubscribeButton.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
