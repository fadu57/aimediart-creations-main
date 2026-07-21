import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AddArtistDialog } from "@/components/AddArtistDialog";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { useAuthUser } from "@/hooks/useAuthUser";
import { canCreateArtist } from "@/lib/authUser";
import { ARTIST_PHOTO_PLACEHOLDER } from "@/lib/artistAssets";
import { computeArtistAgeYears, getDaysUntilNextBirthday } from "@/lib/artistAge";
import { getMissingArtistFieldItems } from "@/lib/artistMissingFields";
import { supabase } from "@/lib/supabase";
import { Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { MissingArtistFieldHint } from "@/components/MissingArtistFieldHint";
import { useTranslation } from "react-i18next";

type ArtistRow = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_nickname?: string | null;
  artist_photo_url?: string | null;
  artist_specialty?: string | null;
  artist_typ?: string | null;
  artist_birth_date?: string | null;
  artist_death_date?: string | null;
  artist_vivant?: boolean | null;
  artist_pays?: string | null;
  pays?: string | null;
  artist_adresse?: string | null;
  artist_adresse2?: string | null;
  artist_address?: string | null;
  artist_zipcode?: string | null;
  artist_ville?: string | null;
  artist_city?: string | null;
  artist_email?: string | null;
  artist_phone?: string | null;
  deleted_at?: string | null;
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
  const { t } = useTranslation("artists");
  const { loading: authLoading, role_name } = useAuthUser();
  const canAddArtist = !authLoading && canCreateArtist(role_name);

  const [artists, setArtists] = useState<ArtistRow[] | null>([]);
  const [artworkCountByArtist, setArtworkCountByArtist] = useState<Record<string, number>>({});
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
          t("error_supabase_config"),
        );
        setArtists([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("artists")
        .select("*")
        .is("deleted_at", null)
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
        setArtworkCountByArtist({});
      } else {
        setArtists((data as ArtistRow[] | null) ?? []);

        const { data: artworkRows, error: artworkCountError } = await supabase
          .from("artworks")
          .select("artwork_artist_id")
          .is("deleted_at", null);

        if (artworkCountError) {
          setArtworkCountByArtist({});
        } else {
          const counts: Record<string, number> = {};
          for (const row of artworkRows ?? []) {
            const artistId = (row as { artwork_artist_id?: string | null }).artwork_artist_id;
            if (artistId) counts[artistId] = (counts[artistId] ?? 0) + 1;
          }
          setArtworkCountByArtist(counts);
        }
      }
      setLoading(false);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[Artistes] chargement :", e);
      }
      setError(t("error_load_unexpected"));
      setArtists([]);
      setLoading(false);
    }
  }, [authLoading]);

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);

  if (!artists && !loading) {
    return <div>{t("error_load_crash")}</div>;
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
      <div className="sticky top-16 z-30 flex flex-col gap-3 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:gap-4">
        <h2 className="shrink-0 text-3xl font-serif font-bold text-white">{t("page_title")}</h2>

        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="relative w-[210px] min-w-[210px] max-w-[210px] shrink-0">
            <Input
              type="text"
              list="artists-search-suggestions"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("search_placeholder")}
              className="h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white pr-9"
            />
            {searchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("search_clear_aria")}
                title={t("search_clear_title")}
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

          <BackofficeStickyAgencyLogoSlot className="min-h-[60px] w-auto max-w-[180px] shrink-0 flex-none px-2" />

          <div className="flex shrink-0 items-center gap-2 md:ml-auto">
            {canAddArtist && (
              <Button
                type="button"
                className="gradient-gold gradient-gold-hover-bg text-primary-foreground gap-2"
                onClick={() => {
                  setDialogArtistId(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> {t("btn_new_artist")}
              </Button>
            )}
            <Button type="button" variant="outline" className="backoffice-toolbar-outline-btn gap-2" asChild>
              <Link to="/artistes/artistes2">{t("btn_table_view")}</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 px-1.5 py-1.5 text-sm text-[#F0F0F0]/80">
        <p className="leading-[18px]">
          {t("info_shared_profiles")}
        </p>
        <p className="font-semibold leading-[18px]" style={{ color: "#D99726" }}>
          {t("info_bio_only")}
        </p>
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
        <p className="text-sm text-muted-foreground">{t("loading_artists")}</p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filteredArtists.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">
          {t("empty_artists")}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {filteredArtists.map((artist) => {
          const fullName =
            [artist?.artist_firstname, artist?.artist_lastname].filter(Boolean).join(" ").trim() || t("artist_no_name");
          const label = (artist?.artist_nickname ?? "").trim() || fullName;
          const typLine = formatArtistTyp(artist?.artist_specialty ?? artist?.artist_typ ?? null);
          const photoSrc = (artist?.artist_photo_url ?? "").trim() || ARTIST_PHOTO_PLACEHOLDER;
          const ageYears = computeArtistAgeYears(
            artist.artist_birth_date,
            artist.artist_death_date,
            artist.artist_vivant !== false,
          );
          const ageLabel =
            ageYears === null ? t("form_age_missing") : t("form_age_years", { count: ageYears });
          const daysUntilBirthday = getDaysUntilNextBirthday(
            artist.artist_birth_date,
            artist.artist_vivant !== false,
          );
          const birthdayLabel =
            daysUntilBirthday === null
              ? null
              : daysUntilBirthday === 0
                ? t("birthday_today")
                : daysUntilBirthday === 1
                  ? t("birthday_in_one_day")
                  : t("birthday_in_days", { count: daysUntilBirthday });
          const missingFields = getMissingArtistFieldItems(artist, t);
          return (
            <Card
              key={artist?.artist_id}
              className="glass-card group overflow-hidden hover:shadow-xl transition-all duration-300"
            >
              <CardContent className="relative p-0">
                <Link
                  to={`/artist/edit/${artist?.artist_id}`}
                  className={`flex gap-4 p-4 cursor-pointer text-inherit no-underline outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl ${
                    artist.artist_vivant !== false && missingFields.length > 0 ? "pb-2" : ""
                  }`}
                >
                  <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-2xl ring-2 ring-border bg-muted/30">
                    <img
                      key={photoSrc}
                      src={photoSrc}
                      alt={label}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-lg font-serif font-bold leading-tight">{label}</h3>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span
                          className={
                            ageYears === null
                              ? "text-sm font-black tabular-nums italic text-destructive"
                              : "text-sm font-black tabular-nums text-muted-foreground"
                          }
                        >
                          {ageLabel}
                        </span>
                        {birthdayLabel ? (
                          <span className="text-[11px] font-medium leading-tight text-amber-500 text-right">
                            {birthdayLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {typLine ? (
                      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{typLine}</p>
                    ) : null}
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug tabular-nums">
                      {t("card_artworks_count", { count: artworkCountByArtist[artist.artist_id] ?? 0 })}
                    </p>
                  </div>
                </Link>
                {artist.artist_vivant !== false && missingFields.length > 0 ? (
                  <div className="px-4 pb-4 pt-0 text-xs leading-snug">
                    {missingFields.map((field, index) => (
                      <span key={field.id}>
                        {index > 0 ? ", " : null}
                        {field.hintKey ? (
                          <MissingArtistFieldHint
                            label={field.label}
                            hint={t(field.hintKey)}
                            learnWhyLabel={t("missing_field_learn_why", { field: field.label })}
                          />
                        ) : (
                          <span className="italic text-destructive">{field.label}</span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="container py-8">
      <p className="text-sm text-muted-foreground">{t("empty_artists")}</p>
    </div>
  );
};

export default Artists;
