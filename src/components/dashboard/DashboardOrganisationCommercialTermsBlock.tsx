import { Link } from "react-router-dom";

import {
  formatMissingConventionFieldsSentence,
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
  const planCode = agency.commercial_plan_code?.trim() || null;
  const commercialNotes = agency.commercial_notes?.trim() || null;
  const primarySubscribeButton = subscribeButtons.find((button) => button.variant === "primary");
  const missingFields = listMissingConventionAgencyFields(agency);
  const missingFieldsSentence = formatMissingConventionFieldsSentence(missingFields);

  const subscriptionStart = subscriptionStartedAt?.trim()
    ? formatDateFr(subscriptionStartedAt)
    : "À la souscription";
  const subscriptionEnd = subscriptionExpiresAt?.trim()
    ? formatDateFr(subscriptionExpiresAt)
    : agency.sponsor_valid_until?.trim()
      ? formatDateFr(agency.sponsor_valid_until)
      : "12 mois après la souscription";

  return (
    <div className="rounded-lg border border-[#9d2525]/25 bg-[#fff9f7]/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Remises commerciales accordées</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Les conditions commerciales suivantes vous ont été accordées :
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Abonnement</dt>
          <dd className="mt-0.5 font-medium text-foreground">{planCode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Motif</dt>
          <dd className="mt-0.5 text-foreground">{commercialNotes ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Remise annuelle TTC
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
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Durée</dt>
          <dd className="mt-0.5 text-foreground">
            Début · <span className="font-medium">{subscriptionStart}</span>
            {" — "}
            Fin · <span className="font-medium">{subscriptionEnd}</span>
          </dd>
        </div>
      </dl>

      <p className="text-sm leading-4 text-muted-foreground">
        {missingFields.length > 0 ? (
          <>
            Si vous acceptez ces conditions commerciales, {missingFieldsSentence} Une fois que vous avez complété
            ces informations manquantes, cliquez sur le bouton ci-dessous « Convention de sponsoring avec AIMEDIArt
            », apposez votre tampon et votre signature et envoyez-nous ce document.
          </>
        ) : (
          <>
            Si vous acceptez ces conditions commerciales, cliquez sur le bouton ci-dessous « Convention de
            sponsoring avec AIMEDIArt », apposez votre tampon et votre signature et envoyez-nous ce document.
          </>
        )}
      </p>

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
