import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ArtistWorksHeader from "../components/ArtistWorksHeader";
import CubeSlider from "../components/CubeSlider";
import { type ArtworkCubeItem } from "../components/CubeFace";
import { supabase } from "@/lib/supabase";

type ArtworkRow = {
  artwork_id: string;
  artwork_title: string | null;
  artwork_image_url: string | null;
  artwork_description: unknown;
  artwork_artist_id?: string | null;
};

type ArtistRow = {
  artist_firstname: string | null;
  artist_lastname: string | null;
  artist_nickname: string | null;
};

const modulo = (value: number, base: number) => ((value % base) + base) % base;
const NEXT_ARTWORK_MESSAGE = "œuvres-artiste-next";

const normalizeDescription = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = (value as Record<string, unknown>).fr ?? (value as Record<string, unknown>).text;
    if (typeof candidate === "string") return candidate;
  }
  return "Sans description";
};

const OeuvresArtiste = () => {
  const { artistId } = useParams<{ artistId: string }>();
  const [artistName, setArtistName] = useState("Artiste");
  const [artworks, setArtworks] = useState<ArtworkCubeItem[]>([]);
  const [currentArtworkIndex, setCurrentArtworkIndex] = useState(0);
  const [rotationStep, setRotationStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const loadArtistAndArtworks = async () => {
      setLoading(true);
      const routeParam = artistId?.trim();
      if (!routeParam) {
        setArtworks([]);
        setArtistName("Artiste");
        setCurrentArtworkIndex(0);
        setRotationStep(0);
        setLoading(false);
        return;
      }

      let resolvedArtistId = routeParam;
      let initialArtworkId: string | null = null;

      let { data: artworksData } = await supabase
        .from("artworks")
        .select("artwork_id, artwork_title, artwork_image_url, artwork_description, artwork_artist_id")
        .eq("artwork_artist_id", resolvedArtistId)
        .is("artwork_deleted_at", null)
        .order("artwork_created_at", { ascending: true })
        .returns<ArtworkRow[]>();

      // Compatibilité: si l'URL contient un artwork_id au lieu d'un artist_id.
      if (!artworksData || artworksData.length === 0) {
        const { data: seedArtwork } = await supabase
          .from("artworks")
          .select("artwork_id, artwork_artist_id")
          .eq("artwork_id", routeParam)
          .is("artwork_deleted_at", null)
          .maybeSingle<{ artwork_id: string; artwork_artist_id: string | null }>();

        const candidateArtistId = seedArtwork?.artwork_artist_id?.trim();
        if (candidateArtistId) {
          resolvedArtistId = candidateArtistId;
          initialArtworkId = seedArtwork?.artwork_id ?? null;

          const { data: fallbackArtworks } = await supabase
            .from("artworks")
            .select("artwork_id, artwork_title, artwork_image_url, artwork_description, artwork_artist_id")
            .eq("artwork_artist_id", resolvedArtistId)
            .is("artwork_deleted_at", null)
            .order("artwork_created_at", { ascending: true })
            .returns<ArtworkRow[]>();

          artworksData = fallbackArtworks ?? [];
        }
      }

      const { data: artistData } = await supabase
        .from("artists")
        .select("artist_firstname, artist_lastname, artist_nickname")
        .eq("artist_id", resolvedArtistId)
        .maybeSingle<ArtistRow>();

      if (artistData) {
        const computedName =
          artistData.artist_nickname ||
          [artistData.artist_firstname, artistData.artist_lastname].filter(Boolean).join(" ") ||
          "Artiste";
        setArtistName(computedName);
      }

      const mapped =
        artworksData?.map((row) => ({
          id: row.artwork_id,
          title: row.artwork_title || "Oeuvre sans titre",
          imageUrl: row.artwork_image_url || "/placeholder.svg",
          description: normalizeDescription(row.artwork_description),
        })) ?? [];

      setArtworks(mapped);
      const initialIndex =
        initialArtworkId && mapped.length > 0 ? Math.max(0, mapped.findIndex((item) => item.id === initialArtworkId)) : 0;
      setCurrentArtworkIndex(initialIndex);
      setRotationStep(0);
      setIsMenuOpen(false);
      setLoading(false);
    };

    void loadArtistAndArtworks();
  }, [artistId]);

  const controlsDisabled = artworks.length <= 1;

  const handlePrev = () => {
    if (controlsDisabled) return;
    setCurrentArtworkIndex((prev) => modulo(prev - 1, artworks.length));
    setRotationStep((prev) => prev - 1);
  };

  const handleNext = () => {
    if (controlsDisabled) return;
    setCurrentArtworkIndex((prev) => modulo(prev + 1, artworks.length));
    setRotationStep((prev) => prev + 1);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string } | null;
      if (!payload || payload.type !== NEXT_ARTWORK_MESSAGE) return;
      if (artworks.length <= 1) return;
      setCurrentArtworkIndex((prev) => modulo(prev + 1, artworks.length));
      setRotationStep((prev) => prev + 1);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [artworks.length]);

  const pageStyle = useMemo(
    () => ({
      background:
        "radial-gradient(circle at 50% 25%, rgba(91, 33, 182, 0.35), rgba(2, 6, 23, 1) 65%)",
    }),
    []
  );

  return (
    <div className="min-h-screen overflow-hidden text-white" style={pageStyle}>
      <ArtistWorksHeader
        artistName={artistName}
        onPrev={handlePrev}
        onNext={handleNext}
        onToggleMenu={() => setIsMenuOpen((prev) => !prev)}
        onCloseMenu={() => setIsMenuOpen(false)}
        isMenuOpen={isMenuOpen}
      />

      <main className="relative mx-auto h-screen w-[360px] overflow-hidden pt-[56px]">
        {loading ? (
          <div className="flex h-full items-start justify-center pt-16 text-sm text-slate-200/90">
            Chargement des œuvres...
          </div>
        ) : (
          <CubeSlider
            artworks={artworks}
            currentArtworkIndex={currentArtworkIndex}
            rotationStep={rotationStep}
          />
        )}
      </main>
    </div>
  );
};

export default OeuvresArtiste;
