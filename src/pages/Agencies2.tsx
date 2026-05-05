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

type AgencyRow = {
  id: string;
  name_agency?: string | null;
  logo_agency?: string | null;
};

type SortKey = "name" | "id";
type SortDir = "asc" | "desc";

function text(v: string | null | undefined): string {
  return v?.trim() || "";
}

export default function Agencies2() {
  const navigate = useNavigate();
  const { loading: authLoading, role_id, role_name, agency_id } = useAuthUser();
  const canAccess = (typeof role_id === "number" && role_id >= 1 && role_id <= 6) || hasFullDataAccess(role_name);

  const [rows, setRows] = useState<AgencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [archiveTarget, setArchiveTarget] = useState<AgencyRow | null>(null);
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
      let query = supabase.from("agencies").select("id, name_agency, logo_agency").is("deleted_at", null).order("name_agency", { ascending: true, nullsFirst: false });
      if (role_id === 4 && agency_id) query = query.eq("id", agency_id);
      const { data, error: qErr } = await query;
      if (qErr) {
        setRows([]);
        setError(qErr.message);
      } else {
        setRows((data as AgencyRow[] | null) ?? []);
      }
      setLoading(false);
    })();
  }, [canAccess, role_id, agency_id]);

  const archiveAgency = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    const { error: updErr } = await supabase
      .from("agencies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", archiveTarget.id);
    if (updErr) {
      toast.error(updErr.message);
    } else {
      toast.success("Organisation archivée.");
      setArchiveTarget(null);
      setRows((prev) => prev.filter((r) => r.id !== archiveTarget.id));
    }
    setArchiving(false);
  };

  const searchSuggestions = useMemo(
    () => [...new Set(rows.flatMap((r) => [text(r.name_agency), r.id].filter(Boolean)))].slice(0, 250),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${text(r.name_agency)} ${r.id}`.toLowerCase().includes(q));
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    const pick = (r: AgencyRow) => (sortKey === "name" ? text(r.name_agency) : r.id);
    list.sort((a, b) => {
      const cmp = pick(a).localeCompare(pick(b), "fr", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortKey, sortDir]);

  const SortButtons = ({ column }: { column: SortKey }) => (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      <button type="button" className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${sortKey === column && sortDir === "asc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setSortKey(column); setSortDir("asc"); }}>↑</button>
      <button type="button" className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${sortKey === column && sortDir === "desc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setSortKey(column); setSortDir("desc"); }}>↓</button>
    </span>
  );

  if (authLoading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => navigate("/agencies")}>Retour</Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/agencies-corbeille" className="inline-flex items-center gap-2">
            <ArchiveRestore className="h-4 w-4" /> Corbeille
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Organisations — Tableau complet</CardTitle>
          <div className="relative w-full md:w-[360px]">
            <Input type="text" list="agencies2-search-suggestions" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher (nom, id...)" className="h-8 pr-8" />
            {searchTerm.trim().length > 0 && (
              <button type="button" onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground" aria-label="Effacer la recherche" title="Effacer">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <datalist id="agencies2-search-suggestions">{searchSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : error ? <p className="text-sm text-destructive">{error}</p> : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-64 px-2 py-1">Organisation <SortButtons column="name" /></th>
                  <th className="w-72 px-2 py-1">ID <SortButtons column="id" /></th>
                  <th className="w-10 px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/agencies?agency=${encodeURIComponent(r.id)}`)}
                  >
                    <td className="px-2 py-1 truncate" title={text(r.name_agency) || "—"}>{text(r.name_agency) || "—"}</td>
                    <td className="px-2 py-1 truncate" title={r.id}>{r.id}</td>
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
                        aria-label="Archiver l'organisation"
                        title="Archiver"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr><td colSpan={3} className="px-2 py-2 text-muted-foreground">Aucune organisation visible.</td></tr>
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
                void archiveAgency();
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

