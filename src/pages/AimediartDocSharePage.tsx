/**
 * Route publique /aimediart-doc-share?t=<share_token>
 * Redirige vers l’edge aimediart-doc-share (URL signée Storage).
 * Pas d’auth requise.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function edgeShareUrl(token: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/functions/v1/aimediart-doc-share?t=${encodeURIComponent(token)}`;
}

export default function AimediartDocSharePage() {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = (params.get("t") ?? "").trim();
    if (!UUID_RE.test(token)) {
      setError("Lien de partage invalide ou incomplet.");
      return;
    }
    const url = edgeShareUrl(token);
    if (!url) {
      setError("Configuration serveur incomplète.");
      return;
    }
    window.location.replace(url);
  }, [params]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#121212] px-4 text-[#F0F0F0]">
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] px-4 text-[#F0F0F0]">
      <p className="text-center text-sm text-muted-foreground">Ouverture du document…</p>
    </main>
  );
}
