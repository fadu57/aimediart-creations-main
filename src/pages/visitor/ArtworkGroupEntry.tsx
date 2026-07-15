import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { fetchArtworkGroupForVisitor } from "@/lib/artworkGroupFetch";

/** Entrée QR regroupement : redirige vers la 1ère œuvre avec nav groupe. */
export default function ArtworkGroupEntry() {
  const { groupId: groupIdParam } = useParams<{ groupId?: string }>();
  const [searchParams] = useSearchParams();
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const groupId = (groupIdParam ?? "").trim();
      if (!groupId) {
        if (!cancelled) setFailed(true);
        return;
      }

      try {
        const group = await fetchArtworkGroupForVisitor(groupId);
        if (cancelled) return;
        if (!group?.members.length) {
          setFailed(true);
          return;
        }

        const firstArtworkId = group.members[0]?.artwork_id?.trim();
        if (!firstArtworkId) {
          setFailed(true);
          return;
        }

        const qs = new URLSearchParams();
        const expoFromQuery = searchParams.get("expo_id")?.trim() || "";
        const expoId = expoFromQuery || group.expo_id?.trim() || "";
        if (expoId) qs.set("expo_id", expoId);
        qs.set("group_id", groupId);
        qs.set("nav_mode", "artwork_group");

        setRedirectTo(`/artwork/${encodeURIComponent(firstArtworkId)}?${qs.toString()}`);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [groupIdParam, searchParams]);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  if (failed) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <p>Regroupement introuvable ou sans œuvre active.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Chargement du regroupement…</span>
    </div>
  );
}
