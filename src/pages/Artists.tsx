import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AddArtistDialog } from "@/components/AddArtistDialog";
import { useAuthUser } from "@/hooks/useAuthUser";
import { canCreateArtist } from "@/lib/authUser";
import { ARTIST_PHOTO_PLACEHOLDER } from "@/lib/artistAssets";
import { supabase } from "@/lib/supabase";
import { Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useUiLanguage } from "@/providers/UiLanguageProvider";

type ArtistRow = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_nickname?: string | null;
  artist_photo_url?: string | null;
  artist_specialty?: string | null;
  artist_typ?: string | null;
  artist_deleted_at?: string | null;
};

function formatArtistTyp(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

const Artists = () => {
  const { t } = useUiLanguage();
  const { loading: authLoading, role_name } = useAuthUser();
  const canAddArtist = !authLoading && canCreateArtist(role_name);

  const [artists, setArtists] = useState<ArtistRow[] | null>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  /** `null` = nouvel artiste ; sinon ouverture de la fiche en lecture. */
  const [dialogArtistId, setDialogArtistId] = useState<string | null>(null);

  const loadArtists = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    setError(null);

    try {
      const urlOk = Boolean(
        import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
      );
      if (!urlOk) {
        setError(
          "Configuration Supabase manquante : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.",
        );
        setArtists([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("artists")
        .select("*")
        .is("artist_deleted_at", null)
        .order("artist_lastname");

      if (import.meta.env.DEV) {
        console.debug("[Artistes] lecture table `artists`", {
          rows: data?.length ?? 0,
          error: fetchError?.message ?? null,
        });
      }

      if (fetchError) {
        setError(fetchError.message);
        setArtists([]);
      } else {
        setArtists((data as ArtistRow[] | null) ?? []);
      }
      setLoading(false);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[Artistes] chargement :", e);
      }
      setError("Erreur inattendue lors du chargement des artistes.");
      setArtists([]);
      setLoading(false);
    }
  }, [authLoading]);

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);

  if (!artists && !loading) {
    return <div>Erreur de chargement</div>;
  }

  const filteredArtists = (artists ?? []).filter((artist) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const fullName =
      [artist?.artist_firstname, artist?.artist_lastname].filter(Boolean).join(" ").trim().toLowerCase() || "";
    const nickname = (artist?.artist_nickname ?? "").toLowerCase();
    const typLine = formatArtistTyp(artist?.artist_specialty ?? artist?.artist_typ ?? null).toLowerCase();
    return fullName.includes(q) || nickname.includes(q) || typLine.includes(q);
  });
  const searchSuggestions = [
    ...new Set(
      (artists ?? [])
        .flatMap((artist) => {
          const fullName = [artist?.artist_firstname, artist?.artist_lastname].filter(Boolean).join(" ").trim();
          const nickname = (artist?.artist_nickname ?? "").trim();
          return [fullName, nickname].filter(Boolean);
        }),
    ),
  ];

  return artists ? (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col gap-3 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="flex w-full items-center gap-4 md:max-w-[680px]">
          <div>
          <h2 className="text-3xl font-serif font-bold text-white">{t("Artistes")}</h2>
          </div>
          <div className="relative w-[210px] min-w-[210px] max-w-[210px]">
            <Input
              type="text"
              list="artists-search-suggestions"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("Rechercher un artiste...")}
              className="h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white pr-9"
            />
            {searchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("Effacer la recherche")}
                title={t("Effacer")}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <datalist id="artists-search-suggestions">
              {searchSuggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAddArtist && (
            <Button
              type="button"
              className="gradient-gold gradient-gold-hover-bg text-primary-foreground gap-2"
              onClick={() => {
                setDialogArtistId(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> {t("Nouvel artiste")}
            </Button>
          )}
          <Button type="button" variant="outline" className="gap-2" asChild>
            <Link to="/artistes/artistes2">Tableau</Link>
          </Button>
        </div>
      </div>

      <AddArtistDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setDialogArtistId(null);
        }}
        artistId={dialogArtistId}
        onSuccess={() => void loadArtists()}
      />

      {loading && (
        <p className="text-sm text-muted-foreground">{t("Chargement des artistes…")}</p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filteredArtists.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">
          {t("Aucun artiste trouvé.")}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {filteredArtists.map((artist) => {
          const fullName =
            [artist?.artist_firstname, artist?.artist_lastname].filter(Boolean).join(" ").trim() || "Sans nom";
          const label = (artist?.artist_nickname ?? "").trim() || fullName;
          const typLine = formatArtistTyp(artist?.artist_specialty ?? artist?.artist_typ ?? null);
          const photoSrc = (artist?.artist_photo_url ?? "").trim() || ARTIST_PHOTO_PLACEHOLDER;
          return (
            <Card
              key={artist?.artist_id}
              className="glass-card group overflow-hidden hover:shadow-xl transition-all duration-300"
            >
              <CardContent className="relative p-0">
                <Link
                  to={`/artist/edit/${artist?.artist_id}`}
                  className="flex gap-4 p-4 cursor-pointer text-inherit no-underline outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-2 ring-border bg-muted/30">
                    <img
                      src={photoSrc}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-serif font-bold leading-tight">{label}</h3>
                    {typLine ? (
                      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{typLine}</p>
                    ) : null}
                  </div>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="container py-8">
      <p className="text-sm text-muted-foreground">Aucun artiste trouvé.</p>
    </div>
  );
};

export default Artists;
