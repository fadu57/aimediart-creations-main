import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, LogIn, Mail, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildLoginHrefFromVisitor,
  clearLoginTrackerSession,
  getVisitorData as fetchVisitorSnapshot,
  persistLoginTrackerSession,
  type VisitorCaptureResult,
} from "@/lib/visitorTracking";

const BRAND_WORD = "text-[#E63946]";

/**
 * Capture silencieuse : géoloc (ipapi.co, HTTPS), IP/ville/CP/pays/fuseau, fingerprint (hash),
 * langue `navigator.language` (repli `fr`), détails device (JSONB).
 * Délègue à `@/lib/visitorTracking` pour un seul point de vérité.
 */
async function getVisitorData(): Promise<VisitorCaptureResult> {
  return fetchVisitorSnapshot();
}

/**
 * Hub « après les tarifs » : connexion, création de compte (même écran /login), devis sur mesure.
 * Paramètres d’URL : `intent=devis` | `intent=souscrire` (défaut), `plan=nom affiché` (optionnel).
 * Géoloc + fingerprint + langue : chargement silencieux via `getVisitorData()` (ipapi.co HTTPS), stocké dans `geoData`
 * et réinjecté dans les liens `/login?...&city=&zip=&country=&lang=&fp=&tz=` (+ sessionStorage pour IP / device JSONB).
 */
export default function PublicHomeCommencer() {
  const [searchParams] = useSearchParams();
  const intent = (searchParams.get("intent") ?? "souscrire").toLowerCase();
  const isDevis = intent === "devis";
  const plan = searchParams.get("plan")?.trim() ?? "";

  const [geoData, setGeoData] = useState<VisitorCaptureResult | null>(null);

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
    return buildLoginHrefFromVisitor(extra, geoData);
  }, [plan, geoData]);

  return (
    <div className="relative min-h-screen bg-white text-[#1f1f1f]">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(230,57,70,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative z-10">
        <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1060px] items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <Link
              to="/home#tarifs"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              Retour aux tarifs
            </Link>
            <Link to="/home" className={cn("font-serif text-lg font-semibold tracking-tight", BRAND_WORD)}>
              AIMEDIArt
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[640px] px-5 py-10 sm:px-6 sm:py-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#E63946]">Étape suivante</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-[2.1rem]">
            {isDevis ? "Demande sur mesure" : "Accéder à votre espace"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {isDevis
              ? "L’offre Rayonnement s’adapte à votre événement. Voici comment poursuivre, selon votre situation."
              : "Pour commander ou activer une offre, vous passez par l’espace sécurisé AIMEDIArt (connexion ou création de compte organisation)."}
          </p>

          {!isDevis && plan ? (
            <p className="mt-4 rounded-2xl border border-neutral-200 bg-[#faf9f7] px-4 py-3 text-sm text-foreground/90">
              <span className="font-semibold text-foreground">Offre concernée :</span> {plan}
            </p>
          ) : null}

          <ul className="mt-8 space-y-4 text-sm leading-relaxed text-foreground/85">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                <LogIn className="h-4 w-4 text-[#9d2525]" aria-hidden />
              </span>
              <span>
                <strong className="text-foreground">Déjà un compte ?</strong> Connectez-vous pour poursuivre la configuration,
                le catalogue ou le suivi d’exposition.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                <Sparkles className="h-4 w-4 text-[#9d2525]" aria-hidden />
              </span>
              <span>
                <strong className="text-foreground">Première fois ?</strong> Sur l’écran suivant, utilisez « Créer un compte »
                avec votre e-mail professionnel ; vous compléterez les informations d’organisation selon votre parcours.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                <FileText className="h-4 w-4 text-[#9d2525]" aria-hidden />
              </span>
              <span>
                <strong className="text-foreground">Grand public / visiteur ?</strong> L’inscription visiteur se fait depuis le
                parcours scan sur place ; cette page sert surtout aux <em>équipes exposition</em>.
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
                <Button asChild className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90">
                  <Link to="/home#contact">Aller au formulaire contact</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl border-neutral-300">
                  <Link to={loginBase}>
                    <Mail className="mr-2 h-4 w-4" aria-hidden />
                    J’ai déjà un compte — connexion
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="rounded-xl bg-[#9d2525] text-white hover:bg-[#9d2525]/90">
                <Link to={loginBase}>
                  <LogIn className="mr-2 h-4 w-4" aria-hidden />
                  Connexion ou créer un compte
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl border-neutral-300">
                <Link to="/home#contact">Une question avant de s’engager</Link>
              </Button>
            </div>
          )}

          <section className="mt-12 border-t border-neutral-200 pt-8">
            <h2 className="font-serif text-lg font-semibold text-foreground">Autres idées de contenu (évolutif)</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Comparer en un coup d’œil ce qui est inclus dans chaque offre (œuvres, visiteurs, médiation).</li>
              <li>Lien vers une FAQ « facturation, résiliation, conservation des données ».</li>
              <li>Témoignage court d’une structure ayant monté son expo avec AIMEDIArt.</li>
              <li>Bloc « délai de mise en route » (ex. sous 48 h ouvrées après validation du compte).</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
