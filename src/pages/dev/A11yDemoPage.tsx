import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AudioBanOverlay } from "@/components/visitor/AudioBanOverlay";
import { IndoorAudioOnboardingModal } from "@/components/visitor/IndoorAudioOnboardingModal";

/**
 * Page DEV uniquement — pour visualiser les correctifs a11y lot 1 dans le navigateur.
 * Route : /dev/a11y-demo
 */
export default function A11yDemoPage() {
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showBan, setShowBan] = useState(false);

  return (
    <div className="min-h-screen bg-[#121212] px-4 py-8 text-[#F0F0F0]">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#E63946]">
            Démo accessibilité (DEV)
          </p>
          <h1 className="text-2xl font-bold">Lot 1 — voir les changements</h1>
          <p className="text-sm text-[#F0F0F0]/75">
            Cette page n’existe qu’en développement. Elle sert à constater les correctifs clavier
            sans refaire tout le parcours musée.
          </p>
        </header>

        <section className="rounded-xl border border-white/15 bg-[#1E1E1E] p-4 space-y-3">
          <h2 className="text-base font-semibold">1. Skip link « Aller au contenu »</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-[#F0F0F0]/85">
            <li>Clique dans la page (ou recharge).</li>
            <li>
              Appuie sur <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">Tab</kbd>{" "}
              une fois.
            </li>
            <li>Un bouton rouge « Aller au contenu » apparaît en haut à gauche.</li>
            <li>
              Entrée → le focus saute ici (zone{" "}
              <code className="text-xs text-[#E63946]">#main-content</code>).
            </li>
          </ol>
        </section>

        <section className="rounded-xl border border-white/15 bg-[#1E1E1E] p-4 space-y-3">
          <h2 className="text-base font-semibold">2. Focus visible (Login)</h2>
          <p className="text-sm text-[#F0F0F0]/85">
            Va sur la page Login, puis Tab jusqu’au bouton œil (mot de passe) : un anneau apparaît.
          </p>
          <Button asChild className="w-full rounded-full bg-[#E63946] hover:bg-[#c92f3b]">
            <Link to="/login">Ouvrir /login</Link>
          </Button>
        </section>

        <section className="rounded-xl border border-white/15 bg-[#1E1E1E] p-4 space-y-3">
          <h2 className="text-base font-semibold">3. Modale audio intérieur</h2>
          <p className="text-sm text-[#F0F0F0]/85">
            Ouvre la modale, puis Tab : le focus reste <strong>dans</strong> la boîte (piège à
            focus).
          </p>
          <Button
            type="button"
            className="w-full rounded-full bg-[#E63946] hover:bg-[#c92f3b]"
            onClick={() => {
              setShowBan(false);
              setShowAudioModal(true);
            }}
          >
            Afficher la modale audio
          </Button>
        </section>

        <section className="rounded-xl border border-white/15 bg-[#1E1E1E] p-4 space-y-3">
          <h2 className="text-base font-semibold">4. Écran audio bloqué</h2>
          <p className="text-sm text-[#F0F0F0]/85">
            Plein écran non fermable (comme en prod). Pour quitter la démo : recharge la page (F5).
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full border-[#E63946] text-[#E63946] hover:bg-[#E63946]/10"
            onClick={() => {
              setShowAudioModal(false);
              setShowBan(true);
            }}
          >
            Afficher l’écran ban
          </Button>
        </section>

        <p className="text-center text-xs text-[#F0F0F0]/50">
          Retour vitrine : <Link className="underline" to="/organisation">/organisation</Link>
        </p>
      </div>

      <IndoorAudioOnboardingModal
        open={showAudioModal}
        onAccept={() => setShowAudioModal(false)}
      />
      <AudioBanOverlay open={showBan} />
    </div>
  );
}
