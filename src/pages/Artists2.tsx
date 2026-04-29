import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArchiveRestore, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";
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

type ArtistRow = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_nickname?: string | null;
  artist_specialty?: string | null;
  artist_typ?: string | null;
};

type SortKey = "nom" | "prenom" | "pseudo" | "specialite";
type SortDir = "asc" | "desc";

function text(value: string | null | undefined): string {
  return value?.trim() || "";
}

function specialtyLabel(row: ArtistRow): string {
  const raw = text(row.artist_specialty) || text(row.artist_typ);
  if (!raw) return "";
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

export default function Artists2() {
  const navigate = useNavigate();
  const { loading: authLoading, role_id } = useAuthUser();
  const canAccess = role_id !== 7;

  const [rows, setRows] = useState<ArtistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nom");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [archiveTarget, setArchiveTarget] = useState<ArtistRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!canAccess) {
      setRows([]);
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from("artists")
        .select("artist_id, artist_firstname, artist_lastname, artist_nickname, artist_typ")
        .is("artist_deleted_at", null)
        .order("artist_lastname", { ascending: true, nullsFirst: false });
      if (qErr) {
        setError(qErr.message);
        setRows([]);
      } else {
        setRows((data as ArtistRow[] | null) ?? []);
      }
      setLoading(false);
    })();
  }, [canAccess]);

  const archiveArtist = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    const { error: updErr } = await supabase
      .from("artists")
      .update({ artist_deleted_at: new Date().toISOString() })
      .eq("artist_id", archiveTarget.artist_id);
    if (updErr) {
      toast.error(updErr.message);
    } else {
      toast.success("Artiste archivé.");
      setArchiveTarget(null);
      const { data } = await supabase
        .from("artists")
        .select("artist_id, artist_firstname, artist_lastname, artist_nickname, artist_typ")
        .is("artist_deleted_at", null)
        .order("artist_lastname", { ascending: true, nullsFirst: false });
      setRows((data as ArtistRow[] | null) ?? []);
    }
    setArchiving(false);
  };

  const searchSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      [text(r.artist_firstname), text(r.artist_lastname), text(r.artist_nickname), specialtyLabel(r)]
        .filter(Boolean)
        .forEach((v) => set.add(v));
    }
    return Array.from(set).slice(0, 250);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        text(r.artist_firstname),
        text(r.artist_lastname),
        text(r.artist_nickname),
        specialtyLabel(r),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    const pick = (r: ArtistRow): string => {
      if (sortKey === "nom") return text(r.artist_lastname);
      if (sortKey === "prenom") return text(r.artist_firstname);
      if (sortKey === "pseudo") return text(r.artist_nickname);
      return specialtyLabel(r);
    };
    list.sort((a, b) => {
      const cmp = pick(a).localeCompare(pick(b), "fr", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortKey, sortDir]);

  const SortButtons = ({ column }: { column: SortKey }) => (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      <button
        type="button"
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${
          sortKey === column && sortDir === "asc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => {
          setSortKey(column);
          setSortDir("asc");
        }}
      >
        ↑
      </button>
      <button
        type="button"
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${
          sortKey === column && sortDir === "desc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => {
          setSortKey(column);
          setSortDir("desc");
        }}
      >
        ↓
      </button>
    </span>
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => navigate("/artistes")}>
          Retour
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/artistes-corbeille" className="inline-flex items-center gap-2">
            <ArchiveRestore className="h-4 w-4" /> Corbeille
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Artistes — Tableau complet</CardTitle>
          <div className="relative w-full md:w-[360px]">
            <Input
              type="text"
              list="artists2-search-suggestions"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher (nom, prénom, pseudo, spécialité...)"
              className="h-8 pr-8"
            />
            {searchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Effacer la recherche"
                title="Effacer"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <datalist id="artists2-search-suggestions">
              {searchSuggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-44 px-2 py-1">Prénom <SortButtons column="prenom" /></th>
                  <th className="w-44 px-2 py-1">Nom <SortButtons column="nom" /></th>
                  <th className="w-44 px-2 py-1">Pseudo <SortButtons column="pseudo" /></th>
                  <th className="px-2 py-1">Spécialité <SortButtons column="specialite" /></th>
                  <th className="w-10 px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.artist_id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/artist/edit/${encodeURIComponent(r.artist_id)}`)}
                  >
                    <td className="px-2 py-1 truncate" title={text(r.artist_firstname) || "—"}>
                      {text(r.artist_firstname) || "—"}
                    </td>
                    <td className="px-2 py-1 truncate" title={text(r.artist_lastname) || "—"}>
                      {text(r.artist_lastname) || "—"}
                    </td>
                    <td className="px-2 py-1 truncate" title={text(r.artist_nickname) || "—"}>
                      {text(r.artist_nickname) || "—"}
                    </td>
                    <td className="px-2 py-1 truncate" title={specialtyLabel(r) || "—"}>
                      {specialtyLabel(r) || "—"}
                    </td>
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
                        aria-label="Archiver l'artiste"
                        title="Archiver"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-2 text-muted-foreground">
                      Aucun artiste visible.
                    </td>
                  </tr>
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
                void archiveArtist();
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

