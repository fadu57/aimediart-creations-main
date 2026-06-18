import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, LogIn, Mail, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { ConnectedExpoQuoteDialog } from "@/components/ConnectedExpoQuoteDialog";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";
import {
  buildLoginHrefFromVisitor,
  clearLoginTrackerSession,
  getVisitorData as fetchVisitorSnapshot,
  persistLoginTrackerSession,
  type VisitorCaptureResult,
} from "@/lib/visitorTracking";

const BRAND_WORD = "text-[#E63946]";

async function getVisitorData(): Promise<VisitorCaptureResult> {
  return fetchVisitorSnapshot();
}

/**
 * Hub « après les tarifs » : connexion, création de compte, devis Rayonnement.
 */
export default function PublicHomeCommencer() {
  const { t } = useTranslation("home");
  const [searchParams] = useSearchParams();
  const { session, loading: authLoading } = useAuthUser();
  const intent = (searchParams.get("intent") ?? "souscrire").toLowerCase();
  const isDevis = intent === "devis";
  const isVeille = intent === "veille";
  const plan = searchParams.get("plan")?.trim() ?? "";
  const isAuthenticated = Boolean(session?.user);

  const [geoData, setGeoData] = useState<VisitorCaptureResult | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    clearLoginTrackerSession();
    let cancelled = false;
    void (async () => {
      try {
        const data = await getVisitorData();
        if (!cancelled) setGeoData(data);
      } catch {
        if (!cancelled) setGeoData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!geoData) return;
    persistLoginTrackerSession({
      ip: geoData.ip || null,
      deviceDetails: geoData.deviceDetails,
      fingerprint: geoData.fingerprint,
    });
  }, [geoData]);

  const loginBase = useMemo(() => {
    const extra: Record<string, string> = {};
    if (plan) extra.plan = plan;
    if (isVeille) extra.redirect = "/dashboard";
    return buildLoginHrefFromVisitor(extra, geoData);
  }, [plan, geoData, isVeille]);

  return (
    <div className="relative min-h-screen bg-white text-[#1f1f1f]">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(230,57,70,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative z-10">
        <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto grid max-w-[1060px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 sm:px-6">
            <Link
              to="/organisation#tarifs"
              className="inline-flex items-center gap-2 justify-self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              Retour aux tarifs
            </Link>
            {isDevis ? (
              <p
                className={cn(
                  "justify-self-center text-center text-xs font-semibold uppercase tracking-wide sm:text-sm",
                  BRAND_WORD,
                )}
              >
                {t("commencer.rayonnement_header")}
              </p>
            ) : (
              <span className="justify-self-center" aria-hidden />
            )}
            <Link
              to="/organisation"
              className="inline-flex shrink-0 justify-self-end"
              aria-label="AIMEDIArt — accueil vitrine"
            >
              <AimediartBrandLogoBlock size="sm" />
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[640px] px-5 py-10 sm:px-6 sm:py-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#E63946]">Étape suivante</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.1rem]">
            {isDevis ? "Demande sur mesure" : isVeille ? "Passer en plan veille" : "Accéder à votre espace"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {isDevis
              ? "L’offre Rayonnement s’adapte à votre événement. Voici comment poursuivre, selon votre situation."
              : isVeille
                ? "Connectez-vous pour demander le passage en plan veille (Atelier ou Horizon, abonnement mensuel uniquement)."
                : "Pour commander ou activer une offre, vous passez par l’espace sécurisé AIMEDIArt (connexion ou création de compte organisation)."}
          </p>

          {!isDevis && plan ? (
            <p className="mt-4 rounded-2xl border border-neutral-200 bg-[#faf9f7] px-4 py-3 text-sm text-foreground/90">
              <span className="font-semibold text-foreground">Offre concernée :</span> {plan}
            </p>
          ) : null}

          <ul className="mt-8 space-y-4 text-sm leading-relaxed text-foreground/85">
            {!isAuthenticated && !authLoading ? (
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                  <LogIn className="h-4 w-4 text-[#9d2525]" aria-hidden />
                </span>
                <span>
                  <strong className="text-foreground">Déjà un compte ?</strong> Connectez-vous pour poursuivre la
                  configuration, le catalogue ou le suivi d’exposition.
                </span>
              </li>
            ) : null}
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                <Sparkles className="h-4 w-4 text-[#9d2525]" aria-hidden />
              </span>
              <span>
                <strong className="text-foreground">Première fois ?</strong> Sur l’écran suivant, utilisez « Créer un
                compte » avec votre e-mail professionnel ; vous compléterez les informations d’organisation selon votre
                parcours.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                <FileText className="h-4 w-4 text-[#9d2525]" aria-hidden />
              </span>
              <span>
                <strong className="text-foreground">Grand public / visiteur ?</strong> L’inscription visiteur se fait
                depuis le parcours scan sur place ; cette page sert surtout aux <em>équipes exposition</em>.
              </span>
            </li>
          </ul>

          {isDevis ? (
            <div className="mt-10 space-y-4 rounded-2xl border border-neutral-300/70 bg-[#faf9f7] p-5 shadow-[0_10px_22px_rgba(0,0,0,0.04)]">
              <p className="text-sm font-semibold text-foreground">Proposition de contenu — devis Rayonnement</p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Indiquez dates, lieu, fréquentation attendue et besoins (œuvres, médiation, diffusion).</li>
                <li>Un membre de l’équipe vous répond pour caler un échange et une proposition chiffrée.</li>
              </ul>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90"
                  onClick={() => setQuoteOpen(true)}
                >
                  {t("commencer.quote_cta")}
                </Button>
                {!isAuthenticated && !authLoading ? (
                  <Button asChild variant="outline" className="rounded-xl border-neutral-300">
                    <Link to={loginBase}>
                      <Mail className="mr-2 h-4 w-4" aria-hidden />
                      J’ai déjà un compte — connexion
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {!isAuthenticated && !authLoading ? (
                <Button asChild className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90">
                  <Link to={loginBase}>
                    <LogIn className="mr-2 h-4 w-4" aria-hidden />
                    {isVeille ? "Connexion pour activer la veille" : "Connexion ou créer un compte"}
                  </Link>
                </Button>
              ) : (
                <Button asChild className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90">
                  <Link to="/dashboard">Accéder à mon espace</Link>
                </Button>
              )}
            </div>
          )}
        </main>
      </div>

      <ConnectedExpoQuoteDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        title={t("commencer.quote_form_title")}
        needDescriptionLabel={t("commencer.need_description")}
        showFloorPlan={false}
      />
    </div>
  );
}
