import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { VisitorDiaryRegistrationDialog } from "@/components/visitor/VisitorDiaryRegistrationDialog";

const DEFAULT_EXPO_ID = "98eebfcb-98b1-47d8-b75a-6ccbbb087d97";

/**
 * Prévisualisation locale du formulaire carnet de voyage (dev uniquement).
 */
export default function VisitorFormPreview() {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant") ?? "anonymous";
  const expoId = searchParams.get("expo_id")?.trim() || DEFAULT_EXPO_ID;
  const isAuthenticated = variant === "authenticated";
  const [dialogOpen, setDialogOpen] = useState(true);

  return (
    <div className="min-h-screen bg-neutral-200 p-4">
      <div className="mx-auto mb-4 flex max-w-lg flex-wrap items-center gap-2 text-sm text-neutral-800">
        <span className="font-semibold">Prévisualisation :</span>
        <Link
          className="rounded border border-neutral-400 bg-white px-2 py-1 hover:bg-neutral-50"
          to={`/dev/visitor-form?variant=anonymous&expo_id=${encodeURIComponent(expoId)}`}
        >
          Visiteur anonyme
        </Link>
        <Link
          className="rounded border border-neutral-400 bg-white px-2 py-1 hover:bg-neutral-50"
          to={`/dev/visitor-form?variant=authenticated&expo_id=${encodeURIComponent(expoId)}`}
        >
          Visiteur connecté
        </Link>
        <Link
          className="rounded border border-neutral-400 bg-white px-2 py-1 hover:bg-neutral-50"
          to={`/dev/visitor-expo?expo_id=${encodeURIComponent(expoId)}&preview_gate=1`}
        >
          Présentation expo
        </Link>
        <Link
          className="rounded border border-neutral-400 bg-white px-2 py-1 hover:bg-neutral-50"
          to={`/visitor?expo_id=${encodeURIComponent(expoId)}`}
        >
          Portail visiteur (avatar)
        </Link>
      </div>

      {!dialogOpen ? (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-neutral-300 bg-white p-6 text-center text-sm text-neutral-700">
          <p>Formulaire fermé.</p>
          <button
            type="button"
            className="rounded-md border border-neutral-400 bg-white px-3 py-2 hover:bg-neutral-50"
            onClick={() => setDialogOpen(true)}
          >
            Rouvrir le formulaire
          </button>
        </div>
      ) : null}

      <VisitorDiaryRegistrationDialog
        open={dialogOpen}
        expoId={expoId}
        initialFirstName={isAuthenticated ? "Jean" : ""}
        initialLastName={isAuthenticated ? "Dupont" : ""}
        initialEmail={isAuthenticated ? "visiteur@exemple.com" : ""}
        initialZipCode={isAuthenticated ? "75001" : ""}
        initialCity={isAuthenticated ? "Paris" : ""}
        initialCountryCode="FR"
        isAuthenticated={isAuthenticated}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          setDialogOpen(false);
          window.alert("Formulaire validé (preview — aucune écriture réelle bloquée côté UI).");
        }}
      />
    </div>
  );
}
