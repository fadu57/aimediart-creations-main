import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import VisitorWelcome from "@/pages/visitor/VisitorWelcome";

const DEFAULT_EXPO_ID = "98eebfcb-98b1-47d8-b75a-6ccbbb087d97";
const GATE_KEY = "visitor_expo_gate_done";

function buildPreviewSearchParams(expoId: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("expo_id", expoId);
  params.set("preview_gate", "1");
  return params;
}

/**
 * Prévisualisation locale de la page de présentation expo visiteur (/visitor).
 */
export default function VisitorExpoPreview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || DEFAULT_EXPO_ID;
  const previewParams = buildPreviewSearchParams(expoId);

  useEffect(() => {
    const next = buildPreviewSearchParams(expoId);
    const currentExpo = searchParams.get("expo_id")?.trim() ?? "";
    const currentPreview = searchParams.get("preview_gate") ?? "";
    if (currentExpo !== expoId || currentPreview !== "1") {
      setSearchParams(next, { replace: true });
    }
  }, [expoId, searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(GATE_KEY);
  }, [expoId]);

  return (
    <div className="flex min-h-screen flex-col bg-[#121212]">
      <div className="border-b border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-neutral-100">Présentation expo (dev)</span>
          <Link
            className="rounded border border-neutral-600 px-2 py-0.5 hover:bg-neutral-800"
            to={`/dev/visitor-expo?${previewParams.toString()}`}
          >
            Rejouer l&apos;accueil
          </Link>
          <Link
            className="rounded border border-neutral-600 px-2 py-0.5 hover:bg-neutral-800"
            to={`/visitor?${previewParams.toString()}`}
          >
            URL publique /visitor
          </Link>
          <Link
            className="rounded border border-neutral-600 px-2 py-0.5 hover:bg-neutral-800"
            to={`/dev/visitor-form?expo_id=${encodeURIComponent(expoId)}`}
          >
            Formulaire carnet
          </Link>
          <Link
            className="rounded border border-neutral-600 px-2 py-0.5 hover:bg-neutral-800"
            to={`/artwork?expo_id=${encodeURIComponent(expoId)}&embed=1`}
          >
            Portail œuvre (embed)
          </Link>
        </div>
      </div>
      <VisitorWelcome />
    </div>
  );
}
