import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArchiveRestore, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";
import { hasFullDataAccess } from "@/lib/authUser";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ArtworkRow = {
  artwork_id: string;
  artwork_title?: string | null;
  artwork_artist_id?: string | null;
  artwork_agency_id?: string | null;
  artwork_expo_id?: string | null;
  artwork_status?: string | null;
};

type ArtistRow = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_name?: string | null;
  artist_prenom?: string | null;
};

type AgencyRow = { id: string; name_agency?: string | null };
type ExpoRow = { id: string; expo_name?: string | null };

type SortKey = "titre" | "artiste" | "agency" | "expo" | "status";
type SortDir = "asc" | "desc";

function text(v: string | null | undefined): string {
  return v?.trim() || "";
}

export default function Catalogue2() {
  const navigate = useNavigate();
  const { loading: authLoading, role_id, role_name } = useAuthUser();
  const canAccess = (typeof role_id === "number" && role_id >= 1 && role_id <= 6) || hasFullDataAccess(role_name);

  const [rows, setRows] = useState<ArtworkRow[]>([]);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [agencies, setAgencies] = useState<AgencyRow[]>([]);
  const [expos, setExpos] = useState<ExpoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("titre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [archiveTarget, setArchiveTarget] = useState<ArtworkRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  const artistById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) {
      const label =
        `${text(a.artist_firstname) || text(a.artist_prenom)} ${text(a.artist_lastname) || text(a.artist_name)}`.trim() ||
        a.artist_id;
      map.set(a.artist_id, label);
    }
    return map;
  }, [artists]);
  const agencyById = useMemo(() => new Map(agencies.map((a) => [a.id, text(a.name_agency) || a.id])), [agencies]);
  const expoById = useMemo(() => new Map(expos.map((e) => [e.id, text(e.expo_name) || e.id])), [expos]);

  useEffect(() => {
    if (!canAccess) {
      setRows([]);
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      const [{ data: artworksData, error: artworksErr }, { data: artistsData }, { data: agenciesData }, { data: exposData }] =
        await Promise.all([
          supabase
            .from("artworks")
            .select("artwork_id, artwork_title, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status")
            .is("deleted_at", null)
            .order("artwork_title", { ascending: true, nullsFirst: false }),
          supabase.from("artists").select("artist_id, artist_firstname, artist_lastname, artist_name, artist_prenom"),
          supabase.from("agencies").select("id, name_agency"),
          supabase.from("expos").select("id, expo_name"),
        ]);
      if (artworksErr) {
        setRows([]);
        setError(artworksErr.message);
      } else {
        setRows((artworksData as ArtworkRow[] | null) ?? []);
      }
      setArtists((artistsData as ArtistRow[] | null) ?? []);
      setAgencies((agenciesData as AgencyRow[] | null) ?? []);
      setExpos((exposData as ExpoRow[] | null) ?? []);
      setLoading(false);
    })();
  }, [canAccess]);

  const archiveArtwork = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    const { error: updErr } = await supabase
      .from("artworks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("artwork_id", archiveTarget.artwork_id);
    if (updErr) {
      toast.error(updErr.message);
    } else {
      toast.success("Œuvre archivée.");
      setArchiveTarget(null);
      setRows((prev) => prev.filter((r) => r.artwork_id !== archiveTarget.artwork_id));
    }
    setArchiving(false);
  };

  const searchSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      [text(r.artwork_title), artistById.get(r.artwork_artist_id || "") || "", agencyById.get(r.artwork_agency_id || "") || "", expoById.get(r.artwork_expo_id || "") || "", text(r.artwork_status)]
        .filter(Boolean)
        .forEach((v) => set.add(v));
    }
    return Array.from(set).slice(0, 250);
  }, [rows, artistById, agencyById, expoById]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        text(r.artwork_title),
        artistById.get(r.artwork_artist_id || "") || "",
        agencyById.get(r.artwork_agency_id || "") || "",
        expoById.get(r.artwork_expo_id || "") || "",
        text(r.artwork_status),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchTerm, artistById, agencyById, expoById]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    const pick = (r: ArtworkRow): string => {
      if (sortKey === "titre") return text(r.artwork_title);
      if (sortKey === "artiste") return artistById.get(r.artwork_artist_id || "") || "";
      if (sortKey === "agency") return agencyById.get(r.artwork_agency_id || "") || "";
      if (sortKey === "expo") return expoById.get(r.artwork_expo_id || "") || "";
      return text(r.artwork_status);
    };
    list.sort((a, b) => {
      const cmp = pick(a).localeCompare(pick(b), "fr", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortKey, sortDir, artistById, agencyById, expoById]);

  const SortButtons = ({ column }: { column: SortKey }) => (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      <button type="button" className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${sortKey === column && sortDir === "asc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setSortKey(column); setSortDir("asc"); }}>↑</button>
      <button type="button" className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${sortKey === column && sortDir === "desc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setSortKey(column); setSortDir("desc"); }}>↓</button>
    </span>
  );

  if (authLoading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => navigate("/catalogue")}>Retour</Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/catalogue-corbeille" className="inline-flex items-center gap-2">
            <ArchiveRestore className="h-4 w-4" /> Corbeille
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Catalogue — Tableau complet</CardTitle>
          <div className="relative w-full md:w-[360px]">
            <Input type="text" list="catalogue2-search-suggestions" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher (titre, artiste, agence, expo...)" className="h-8 pr-8" />
            {searchTerm.trim().length > 0 && (
              <button type="button" onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground" aria-label="Effacer la recherche" title="Effacer">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <datalist id="catalogue2-search-suggestions">{searchSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : error ? <p className="text-sm text-destructive">{error}</p> : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-64 px-2 py-1">Titre <SortButtons column="titre" /></th>
                  <th className="w-52 px-2 py-1">Artiste <SortButtons column="artiste" /></th>
                  <th className="w-52 px-2 py-1">Organisation <SortButtons column="agency" /></th>
                  <th className="w-52 px-2 py-1">Expo <SortButtons column="expo" /></th>
                  <th className="w-28 px-2 py-1">Statut <SortButtons column="status" /></th>
                  <th className="w-10 px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.artwork_id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/œuvre/${encodeURIComponent(r.artwork_id)}`)}
                  >
                    <td className="px-2 py-1 truncate" title={text(r.artwork_title) || "—"}>{text(r.artwork_title) || "—"}</td>
                    <td className="px-2 py-1 truncate" title={artistById.get(r.artwork_artist_id || "") || "—"}>{artistById.get(r.artwork_artist_id || "") || "—"}</td>
                    <td className="px-2 py-1 truncate" title={agencyById.get(r.artwork_agency_id || "") || "—"}>{agencyById.get(r.artwork_agency_id || "") || "—"}</td>
                    <td className="px-2 py-1 truncate" title={expoById.get(r.artwork_expo_id || "") || "—"}>{expoById.get(r.artwork_expo_id || "") || "—"}</td>
                    <td className="px-2 py-1 truncate" title={text(r.artwork_status) || "—"}>{text(r.artwork_status) || "—"}</td>
                    <td className="px-2 py-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-[30px] w-[30px] text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchiveTarget(r);
                        }}
                        aria-label="Archiver l'œuvre"
                        title="Archiver"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-2 text-muted-foreground">Aucune œuvre visible.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ATTENTION - La suppression est définitive. Supprimer avec le maximum de discernement sinon vous risquez
              de problèmes avec votre application
            </AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void archiveArtwork();
              }}
            >
              {archiving ? "Archivage..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

