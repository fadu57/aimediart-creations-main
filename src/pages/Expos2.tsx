import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

type ExpoRow = {
  id: string;
  expo_id?: string | null;
  expo_name?: string | null;
  agency_id?: string | null;
  curator_fistname?: string | null;
  curator_firstname?: string | null;
  curator_name?: string | null;
  date_expo_du?: string | null;
  date_expo_au?: string | null;
};

type AgencyOption = {
  id: string;
  name_agency: string | null;
};

type SortKey = "expo_name" | "agency" | "curator" | "date_du" | "date_au";
type SortDir = "asc" | "desc";

function formatDate(value: string | null | undefined): string {
  const raw = value?.trim() || "";
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("fr-FR");
}

export default function Expos2() {
  const { t } = useTranslation("expos");
  const navigate = useNavigate();
  const { loading: authLoading, role_id: currentRoleId, agency_id: currentAgencyId } = useAuthUser();
  const canAccess = currentRoleId === 1 || currentRoleId === 2 || currentRoleId === 3 || currentRoleId === 4;

  const [rows, setRows] = useState<ExpoRow[]>([]);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("expo_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [archiveTarget, setArchiveTarget] = useState<ExpoRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  const agencyById = useMemo(
    () => new Map(agencies.map((a) => [a.id, a.name_agency?.trim() || a.id])),
    [agencies],
  );

  const load = async () => {
    if (!canAccess) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let exposQuery = supabase.from("expos").select("*").is("deleted_at", null).order("expo_name", { ascending: true, nullsFirst: false });
    if (currentRoleId === 4 && currentAgencyId) exposQuery = exposQuery.eq("agency_id", currentAgencyId);
    const { data: exposData, error: exposErr } = await exposQuery;
    const { data: agenciesData } = await supabase.from("agencies").select("id, name_agency");

    if (exposErr) {
      setRows([]);
      setError(exposErr.message);
      setLoading(false);
      return;
    }
    setRows(((exposData as ExpoRow[] | null) ?? []).filter((r) => r.id));
    setAgencies((agenciesData as AgencyOption[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [canAccess, currentRoleId, currentAgencyId]);

  const archiveExpo = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    const { error: updErr } = await supabase
      .from("expos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", archiveTarget.id);
    if (updErr) {
      toast.error(updErr.message);
    } else {
      toast.success("Exposition archivée.");
      setArchiveTarget(null);
      await load();
    }
    setArchiving(false);
  };

  const searchSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const agency = (row.agency_id && agencyById.get(row.agency_id)) || "";
      const curatorFirstname = row.curator_fistname || row.curator_firstname || "";
      const curator = `${curatorFirstname} ${row.curator_name || ""}`.trim();
      [row.expo_name, row.expo_id, agency, curator].forEach((v) => {
        const t = (v || "").trim();
        if (t) set.add(t);
      });
    }
    return Array.from(set).slice(0, 250);
  }, [rows, agencyById]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const agency = (row.agency_id && agencyById.get(row.agency_id)) || "";
      const curatorFirstname = row.curator_fistname || row.curator_firstname || "";
      const curator = `${curatorFirstname} ${row.curator_name || ""}`.trim();
      const haystack = [row.expo_name || "", row.expo_id || "", row.id, agency, curator].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchTerm, agencyById]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    const pick = (row: ExpoRow): string => {
      if (sortKey === "expo_name") return row.expo_name?.trim() || row.expo_id?.trim() || row.id;
      if (sortKey === "agency") return (row.agency_id && agencyById.get(row.agency_id)) || "";
      if (sortKey === "curator") {
        const curatorFirstname = row.curator_fistname || row.curator_firstname || "";
        return `${curatorFirstname} ${row.curator_name || ""}`.trim();
      }
      if (sortKey === "date_du") return row.date_expo_du?.trim() || "";
      return row.date_expo_au?.trim() || "";
    };
    list.sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      const cmp = av.localeCompare(bv, "fr", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortKey, sortDir, agencyById]);

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
    <div className="mx-auto w-full min-w-0 max-w-[1200px] px-3 py-4 sm:px-4 sm:py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => navigate("/expos")}>
          {t("tableau.back")}
        </Button>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link to="/expos/visitors" className="inline-flex items-center justify-center gap-2">
              Visiteurs inscrits
            </Link>
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link to="/expos-corbeille" className="inline-flex items-center justify-center gap-2">
              <ArchiveRestore className="h-4 w-4" /> {t("tableau.corbeille")}
            </Link>
          </Button>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t("tableau.title")}</CardTitle>
          <div className="relative w-full md:w-[360px]">
            <Input
              type="text"
              list="expos2-search-suggestions"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("tableau.search")}
              className="h-8 pr-8"
            />
            {searchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("page.clearSearch")}
                title={t("page.clear")}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <datalist id="expos2-search-suggestions">
              {searchSuggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 p-0 sm:p-6">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground sm:px-0">{t("tableau.loading")}</p>
          ) : error ? (
            <p className="px-4 py-3 text-sm text-destructive sm:px-0">{error}</p>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {sortedRows.map((row) => {
                  const agency = (row.agency_id && agencyById.get(row.agency_id)) || "—";
                  const curatorFirstname = row.curator_fistname || row.curator_firstname || "";
                  const curator = `${curatorFirstname} ${row.curator_name || ""}`.trim() || "—";
                  return (
                    <div
                      key={row.id}
                      className="min-w-0 cursor-pointer space-y-2 rounded-lg border border-border/60 p-3 hover:bg-muted/30"
                      onClick={() => navigate(`/expos?expo=${encodeURIComponent(row.id)}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 font-medium leading-snug" title={row.expo_name || row.id}>
                          {row.expo_name || row.id}
                        </p>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchiveTarget(row);
                          }}
                          aria-label={t("tableau.archiveAriaLabel")}
                          title={t("tableau.archiveTitle")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                        <dt className="text-xs text-muted-foreground">{t("tableau.colOrganisation")}</dt>
                        <dd className="min-w-0 truncate" title={agency}>{agency}</dd>
                        <dt className="text-xs text-muted-foreground">{t("tableau.colCommissaire")}</dt>
                        <dd className="min-w-0 truncate" title={curator}>{curator}</dd>
                        <dt className="text-xs text-muted-foreground">{t("tableau.colDu")}</dt>
                        <dd>{formatDate(row.date_expo_du)}</dd>
                        <dt className="text-xs text-muted-foreground">{t("tableau.colAu")}</dt>
                        <dd>{formatDate(row.date_expo_au)}</dd>
                      </dl>
                    </div>
                  );
                })}
                {sortedRows.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">{t("tableau.empty")}</p>
                )}
              </div>

              <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full min-w-[48rem] table-fixed text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-64 px-2 py-1">{t("tableau.colExposition")} <SortButtons column="expo_name" /></th>
                  <th className="w-56 px-2 py-1">{t("tableau.colOrganisation")} <SortButtons column="agency" /></th>
                  <th className="w-52 px-2 py-1">{t("tableau.colCommissaire")} <SortButtons column="curator" /></th>
                  <th className="w-32 px-2 py-1">{t("tableau.colDu")} <SortButtons column="date_du" /></th>
                  <th className="w-32 px-2 py-1">{t("tableau.colAu")} <SortButtons column="date_au" /></th>
                  <th className="w-10 px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const agency = (row.agency_id && agencyById.get(row.agency_id)) || "—";
                  const curatorFirstname = row.curator_fistname || row.curator_firstname || "";
                  const curator = `${curatorFirstname} ${row.curator_name || ""}`.trim() || "—";
                  return (
                    <tr
                      key={row.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/expos?expo=${encodeURIComponent(row.id)}`)}
                    >
                      <td className="px-2 py-1 truncate" title={row.expo_name || row.id}>{row.expo_name || row.id}</td>
                      <td className="px-2 py-1 truncate" title={agency}>{agency}</td>
                      <td className="px-2 py-1 truncate" title={curator}>{curator}</td>
                      <td className="px-2 py-1">{formatDate(row.date_expo_du)}</td>
                      <td className="px-2 py-1">{formatDate(row.date_expo_au)}</td>
                      <td className="px-2 py-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-[30px] w-[30px] text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchiveTarget(row);
                          }}
                        aria-label={t("tableau.archiveAriaLabel")}
                        title={t("tableau.archiveTitle")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-2 text-muted-foreground">
                      {t("tableau.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tableau.archiveWarning")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>{t("tableau.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void archiveExpo();
              }}
            >
              {archiving ? t("tableau.archiving") : t("tableau.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

