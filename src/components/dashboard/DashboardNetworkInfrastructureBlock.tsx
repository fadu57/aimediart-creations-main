import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Wifi } from "lucide-react";

import { ConnectedExpoQuoteDialog } from "@/components/ConnectedExpoQuoteDialog";
import { Button } from "@/components/ui/button";

const PACK_KEYS = ["solo", "standard", "grand"] as const;
type PackKey = (typeof PACK_KEYS)[number];

type DashboardNetworkInfrastructureBlockProps = {
  defaultOrgName?: string;
};

export function DashboardNetworkInfrastructureBlock({
  defaultOrgName = "",
}: DashboardNetworkInfrastructureBlockProps) {
  const { t } = useTranslation("home");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackKey | null>(null);

  const openQuoteForPack = (pack: PackKey) => {
    setSelectedPack(pack);
    setQuoteOpen(true);
  };

  const defaultNeedDescription = selectedPack
    ? t("connexion.sections.packs.items." + selectedPack + ".title")
    : undefined;

  return (
    <>
      <div className="rounded-lg border border-[rgba(184,97,96,0.6)] bg-muted/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#211A16]">
            <Wifi className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
            Infrastructure Réseau
          </p>
          <Link
            to="/organisation#connectivite"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Voir la présentation
          </Link>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{t("connexion.sections.packs.intro")}</p>

        <ul className="space-y-2">
          {PACK_KEYS.map((key) => (
            <li
              key={key}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0 flex-1 text-xs leading-relaxed">
                <span className="font-semibold text-foreground">
                  {t(`connexion.sections.packs.items.${key}.title`)}
                </span>
                {" — "}
                <span className="text-muted-foreground">{t(`connexion.sections.packs.items.${key}.desc`)}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="backoffice-toolbar-outline-btn h-auto min-h-9 w-full shrink-0 flex-col items-center justify-center gap-0 px-2 py-1.5 text-xs leading-snug sm:w-[9rem]"
                onClick={() => openQuoteForPack(key)}
                aria-label={t("connexion.sections.packs.estimate_button_aria", {
                  pack: t(`connexion.sections.packs.items.${key}.title`),
                })}
              >
                <span className="block font-normal text-muted-foreground">
                  {t("connexion.sections.packs.estimate_label")}
                </span>
                <span className="mt-0.5 block font-semibold text-foreground">
                  {t(`connexion.sections.packs.items.${key}.estimate`)}
                </span>
              </Button>
            </li>
          ))}
        </ul>

        <p className="text-[11px] italic leading-relaxed text-destructive">
          {t("connexion.sections.packs.estimate_footnote")}
        </p>
      </div>

      <ConnectedExpoQuoteDialog
        open={quoteOpen}
        onOpenChange={(open) => {
          setQuoteOpen(open);
          if (!open) setSelectedPack(null);
        }}
        defaultOrgName={defaultOrgName}
        defaultNeedDescription={defaultNeedDescription}
      />
    </>
  );
}
