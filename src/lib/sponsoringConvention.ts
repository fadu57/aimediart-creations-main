import { supabase } from "@/lib/supabase";

type SponsoringConventionResponse = {
  signed_url?: string;
  viewer_url?: string;
  filename?: string;
  error?: string;
};

function readFunctionErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "string" || !error.trim()) return null;
  if (error === "no_commercial_discount") {
    return "Aucune remise commerciale n'est enregistrée pour cette organisation.";
  }
  if (error === "authentication_required") {
    return "Session expirée — reconnectez-vous.";
  }
  if (error === "template_not_found") {
    return "Modèle Word introuvable sur le serveur.";
  }
  if (error.startsWith("storage_")) {
    return "Impossible de préparer l'ouverture du document Word.";
  }
  return error;
}

function triggerDocxDownload(signedUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = signedUrl;
  link.download = filename;
  link.rel = "noopener noreferrer";
  link.click();
}

/** Ouvre la convention dans Word Online (nouvel onglet) ou télécharge le DOCX en secours. */
export async function openSponsoringConventionDocument(organisationId: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Session expirée — reconnectez-vous.");
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  if (!baseUrl || !anonKey) {
    throw new Error("Configuration Supabase manquante.");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/functions/v1/generate-sponsoring-convention`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organisation_id: organisationId }),
    });
  } catch {
    throw new Error(
      "Connexion au serveur impossible. Vérifiez votre réseau ou réessayez après redéploiement de la fonction.",
    );
  }

  const payload = (await response.json()) as SponsoringConventionResponse;
  if (!response.ok) {
    throw new Error(readFunctionErrorMessage(payload) ?? `Impossible de générer la convention (${response.status}).`);
  }

  const viewerUrl = payload.viewer_url?.trim();
  const signedUrl = payload.signed_url?.trim();
  const filename = payload.filename?.trim() || "convention-sponsoring-aimediart.docx";

  if (!viewerUrl || !signedUrl) {
    throw new Error("Réponse serveur incomplète.");
  }

  const popup = window.open(viewerUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    triggerDocxDownload(signedUrl, filename);
  }
}
