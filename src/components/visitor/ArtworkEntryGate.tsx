import { useEffect, useState } from "react";
import { Navigate, Outlet, useParams, useSearchParams } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { isVisitorExpoGateDone, markVisitorExpoGateDone } from "@/lib/visitorExpoGateSession";
import { getStoredVisitorUuid } from "@/lib/visitorIdentity";

type GateState = "checking" | "pass" | "redirect";

/**
 * Retourne l'état initial de façon synchrone.
 * - "pass"     → gate déjà franchie, UUID visiteur présent, ou pas d'artworkId
 * - "checking" → besoin de vérifier la session Supabase (async)
 */
function computeInitialState(id: string): GateState {
  if (!id) return "pass";
  if (isVisitorExpoGateDone()) return "pass";
  // Visiteur déjà identifié (anonyme ou auth précédente) → bypass
  if (getStoredVisitorUuid()) {
    markVisitorExpoGateDone();
    return "pass";
  }
  return "checking";
}

/**
 * QR œuvre : passage obligatoire par la landing /visitor avant la page œuvre.
 * Exception : si l'utilisateur est déjà identifié (UUID visiteur en localStorage)
 * ou possède une session Supabase active (anon ou authentifiée), il passe directement.
 */
export function ArtworkEntryGate() {
  const { artworkId } = useParams<{ artworkId?: string }>();
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() ?? "";
  const id = artworkId?.trim() ?? "";

  const [gateState, setGateState] = useState<GateState>(() => computeInitialState(id));

  useEffect(() => {
    if (gateState !== "checking") return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        markVisitorExpoGateDone();
        setGateState("pass");
      } else {
        setGateState("redirect");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [gateState]);

  if (gateState === "checking") return null;

  if (gateState === "redirect") {
    const qs = new URLSearchParams();
    if (expoId) qs.set("expo_id", expoId);
    qs.set("artwork_id", id);
    return <Navigate to={`/visitor?${qs.toString()}`} replace />;
  }

  return <Outlet />;
}
