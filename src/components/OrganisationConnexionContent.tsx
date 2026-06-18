import { createElement, useState, type ReactNode } from "react";
import { ArrowRight, Wifi } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

import { ConnectedExpoQuoteDialog } from "@/components/ConnectedExpoQuoteDialog";
import { AIMEDIART_WORD_RED, BRAND_RED_DARK } from "@/components/PublicVitrineShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import connexionSolutionDiagramBg from "@/assets/connexion-solution-diagram-bg.png";
import connexionChallengeNoNetworkPhoto from "@/assets/connexion-challenge-no-network.png";
import connexionSimplicityPlugPlayPhoto from "@/assets/connexion-simplicity-plug-play.png";

const PACK_KEYS = ["solo", "standard", "grand"] as const;
const SOLUTION_BULLETS = ["freedom", "reuse", "performance"] as const;
const SIMPLICITY_BULLETS = ["plug_play", "speed", "discretion"] as const;

const CONNEXION_BOLD = createElement("strong", { className: "font-semibold text-foreground" });

function highlightAimediartBold(text: string): ReactNode {
  const parts = text.split(/(AIMEDIArt)/g);
  return parts.map((part, i) =>
    part === "AIMEDIArt" ? (
      <strong key={`aim-${i}`} className={cn(AIMEDIART_WORD_RED, "font-semibold")}>
        AIMEDIArt
      </strong>
    ) : (
      <span key={`txt-${i}`}>{part}</span>
    ),
  );
}

function SurfaceCardShell({
  children,
  backgroundImage,
  backgroundImageAlt,
  backgroundGradient = "left",
  compact = false,
  quoteCta = false,
}: {
  children: ReactNode;
  backgroundImage?: string;
  backgroundImageAlt?: string;
  backgroundGradient?: "left" | "right";
  compact?: boolean;
  quoteCta?: boolean;
}) {
  return (
    <div className="mx-2 my-3 sm:mx-3 sm:my-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-[2rem] border border-neutral-300/80 bg-[#faf8f5] shadow-[0_12px_28px_rgba(0,0,0,0.06)]",
          quoteCta ? "px-5 py-[18px] sm:px-6" : compact ? "p-3 sm:p-3" : "p-5 sm:p-10 lg:p-12",
        )}
      >
        {backgroundImage ? (
          <>
            <img
              src={backgroundImage}
              alt={backgroundImageAlt ?? ""}
              className={cn(
                "pointer-events-none absolute inset-0 h-full w-full object-cover",
                backgroundGradient === "right" ? "object-left" : "object-right",
              )}
              loading="lazy"
              aria-hidden={!backgroundImageAlt}
            />
            <div
              className={cn(
                "pointer-events-none absolute inset-0",
                backgroundGradient === "right"
                  ? "bg-gradient-to-l from-[#faf8f5] from-[34%] via-[#faf8f5]/90 to-[#faf8f5]/25"
                  : "bg-gradient-to-r from-[#faf8f5] from-[34%] via-[#faf8f5]/90 to-[#faf8f5]/25",
              )}
              aria-hidden
            />
          </>
        ) : (
          <>
            <div
              className="pointer-events-none absolute -right-6 top-20 h-40 w-40 rounded-full bg-[rgba(230,57,70,0.07)] blur-2xl"
              aria-hidden
            />
            <div
              className={cn(
                "absolute right-0 top-0 rounded-bl-[80px] bg-[rgba(168,23,29,0.06)]",
                quoteCta ? "h-[53px] w-[53px]" : "h-28 w-28",
              )}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -left-8 bottom-10 h-16 w-16 rounded-full border border-[rgba(168,23,29,0.2)]"
              aria-hidden
            />
          </>
        )}
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

function ConnexionSectionHeading({
  titleLine1,
  titleLine2,
  titlePrefix,
  compact = false,
}: {
  titleLine1?: string;
  titleLine2?: string;
  titlePrefix?: string;
  compact?: boolean;
}) {
  return (
    <h2
      className={cn(
        "flex w-full flex-col font-serif text-[30px] font-semibold leading-tight tracking-tight text-foreground",
        compact && "gap-0.5",
      )}
    >
      {titlePrefix ? (
        <span className="block">
          {titlePrefix}{" "}
          <strong className={cn(AIMEDIART_WORD_RED, "font-semibold")}>AIMEDIArt</strong>
        </span>
      ) : (
        <span className="block">{titleLine1}</span>
      )}
      {titleLine2 ? (
        <span className={cn("block font-normal leading-snug", !compact && "mt-1")}>{titleLine2}</span>
      ) : null}
    </h2>
  );
}

function ConnexionSectionCard({
  title,
  titleLine1,
  titleLine2,
  titlePrefix,
  children,
  backgroundImage,
  backgroundImageAlt,
  contentAlign = "left",
  contentWidth = "default",
  compact = false,
}: {
  title?: string;
  titleLine1?: string;
  titleLine2?: string;
  titlePrefix?: string;
  children: ReactNode;
  backgroundImage?: string;
  backgroundImageAlt?: string;
  contentAlign?: "left" | "right";
  contentWidth?: "default" | "full" | "narrow";
  compact?: boolean;
}) {
  const contentWrapClass =
    contentAlign === "right"
      ? cn("flex w-full max-w-[450px] flex-col lg:ml-auto", compact && "py-3")
      : contentWidth === "full"
        ? cn("w-full", compact && "pl-6")
        : contentWidth === "narrow"
          ? cn("flex w-full max-w-[450px] flex-col", compact && "py-3 pl-6")
          : "w-full max-w-[42ch]";

  const bodySpacingClass = compact ? "mt-4" : "mt-9";

  return (
    <SurfaceCardShell
      backgroundImage={backgroundImage}
      backgroundImageAlt={backgroundImageAlt}
      backgroundGradient={contentAlign === "right" ? "right" : "left"}
      compact={compact}
    >
      <div className={contentWrapClass}>
        <div className={cn(compact && contentWidth === "full" && "flex flex-col py-3")}>
          {titlePrefix || titleLine1 || titleLine2 ? (
            <ConnexionSectionHeading
              titleLine1={titleLine1}
              titleLine2={titleLine2}
              titlePrefix={titlePrefix}
              compact={compact}
            />
          ) : (
            <h2 className="w-full font-serif text-[30px] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h2>
          )}
        </div>
        <div className={bodySpacingClass}>{children}</div>
      </div>
    </SurfaceCardShell>
  );
}

/** Contenu de la page exposition connectée (réutilisable sur la vitrine). */
export function OrganisationConnexionContent() {
  const { t } = useTranslation("home");
  const [quoteOpen, setQuoteOpen] = useState(false);

  return (
    <>
      <div className="mx-auto w-full max-w-[1060px] px-5 pb-3 sm:px-6">
        <SurfaceCardShell compact>
          <div className="flex items-start gap-3">
            <Wifi className="mt-1.5 h-8 w-8 shrink-0 text-[#E63946]" aria-hidden />
            <h2 className="max-w-[46ch] font-serif text-[30px] font-semibold leading-tight tracking-tight text-[#E63946]">
              <span className="block">{t("connexion.title_line1")}</span>
              <span className="mt-1 block font-normal italic">{t("connexion.title_line2")}</span>
            </h2>
          </div>
        </SurfaceCardShell>

        <div id="connexion-visuals" className="hidden" aria-hidden />

        <div id="connectivite-challenge" className="scroll-mt-[5rem]">
          <SurfaceCardShell>
            <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
            <div className="order-2 w-full shrink-0 lg:order-1 lg:w-[300px]">
              <figure className="overflow-hidden rounded-2xl border border-neutral-300/70 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
                <img
                  src={connexionChallengeNoNetworkPhoto}
                  alt={t("connexion.sections.challenge.image_alt")}
                  className="aspect-[4/3] w-full object-cover object-center sm:aspect-[5/4] lg:aspect-auto lg:h-[350px] lg:min-h-[350px] lg:w-[300px]"
                  loading="lazy"
                />
              </figure>
            </div>
            <div className="order-1 min-w-0 flex-1 lg:order-2">
              <h2 className="max-w-[558px] font-serif text-[30px] font-semibold leading-tight tracking-tight text-foreground">
                {t("connexion.sections.challenge.title")}
              </h2>
              <p className="mt-6 text-sm leading-relaxed text-foreground/80 whitespace-pre-line">
                <Trans
                  i18nKey="connexion.sections.challenge.body"
                  ns="home"
                  components={{ bold: <strong className="font-semibold text-foreground" /> }}
                />
              </p>
            </div>
          </div>
        </SurfaceCardShell>
        </div>

        <ConnexionSectionCard
          titlePrefix={t("connexion.sections.solution.title_prefix")}
          titleLine2={t("connexion.sections.solution.title_line2")}
          backgroundImage={connexionSolutionDiagramBg}
          backgroundImageAlt={t("connexion.sections.solution.image_alt")}
          contentWidth="narrow"
          compact
        >
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">
              {highlightAimediartBold(t("connexion.sections.solution.intro"))}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/80">
              {SOLUTION_BULLETS.map((key) => (
                <li key={key}>
                  <Trans
                    i18nKey={`connexion.sections.solution.bullets.${key}`}
                    ns="home"
                    components={{ bold: CONNEXION_BOLD }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </ConnexionSectionCard>

        <ConnexionSectionCard
          titleLine1={t("connexion.sections.packs.title_line1")}
          titleLine2={t("connexion.sections.packs.title_line2")}
          contentWidth="full"
          compact
        >
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-foreground/80">{t("connexion.sections.packs.intro")}</p>
            <ul className="space-y-3">
              {PACK_KEYS.map((key) => (
                <li
                  key={key}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border border-neutral-300/70 bg-white px-4 py-3 text-sm leading-relaxed shadow-[0_8px_18px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-foreground">
                      {t(`connexion.sections.packs.items.${key}.title`)}
                    </span>
                    {" — "}
                    <span className="text-foreground/80">{t(`connexion.sections.packs.items.${key}.desc`)}</span>
                  </div>
                  <Button
                    type="button"
                    className="h-auto min-h-11 w-full shrink-0 flex-col items-center justify-center gap-0 rounded-xl px-3 py-2 text-xs leading-snug hover:brightness-95 sm:w-[9.5rem]"
                    style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}
                    onClick={() => setQuoteOpen(true)}
                    aria-label={t("connexion.sections.packs.estimate_button_aria", {
                      pack: t(`connexion.sections.packs.items.${key}.title`),
                    })}
                  >
                    <span className="block font-normal">{t("connexion.sections.packs.estimate_label")}</span>
                    <span className="mt-0.5 block font-semibold">
                      {t(`connexion.sections.packs.items.${key}.estimate`)}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs italic leading-relaxed text-[#E63946]">
              {t("connexion.sections.packs.estimate_footnote")}
            </p>
          </div>
        </ConnexionSectionCard>

        <ConnexionSectionCard
          title={t("connexion.sections.simplicity.title")}
          backgroundImage={connexionSimplicityPlugPlayPhoto}
          backgroundImageAlt={t("connexion.sections.simplicity.image_alt")}
          contentAlign="right"
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-foreground/80">{t("connexion.sections.simplicity.intro")}</p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/80">
              {SIMPLICITY_BULLETS.map((key) => (
                <li key={key}>
                  <Trans
                    i18nKey={`connexion.sections.simplicity.bullets.${key}`}
                    ns="home"
                    components={{ bold: CONNEXION_BOLD }}
                  />
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-foreground/80">
              {highlightAimediartBold(t("connexion.sections.simplicity.outro"))}
            </p>
          </div>
        </ConnexionSectionCard>

        <SurfaceCardShell quoteCta>
          <div className="flex h-full flex-wrap flex-col items-center justify-center gap-[54px] text-center sm:flex-row">
            <p className="text-sm leading-relaxed text-foreground">{t("connexion.quote.cta_prefix")}</p>
            <Button
              type="button"
              className="h-11 shrink-0 rounded-xl px-5 text-sm sm:w-auto"
              style={{ backgroundColor: BRAND_RED_DARK, color: "white" }}
              onClick={() => setQuoteOpen(true)}
            >
              {t("connexion.quote.cta_link")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </div>
        </SurfaceCardShell>
      </div>

      <ConnectedExpoQuoteDialog open={quoteOpen} onOpenChange={setQuoteOpen} />
    </>
  );
}
