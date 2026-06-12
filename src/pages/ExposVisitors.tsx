import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArchiveRestore, Eye, Loader2, Trash2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";

type VisitorRow = {
  id: string;
  source: "visitors" | "profiles";
  first_name?: string | null;
  last_name?: string | null;
  pseudo?: string | null;
  email?: string | null;
  agency_id?: string | null;
  expo_id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

type AgencyOption = { id: string; name_agency: string | null };
type ExpoOption  = { id: string; expo_name: string | null };
type SortKey = "name" | "pseudo" | "email" | "agency" | "expo" | "created_at";
type SortDir = "asc" | "desc";

function formatDate(value: string | null | undefined): string {
  const raw = value?.trim() || "";
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("fr-FR");
}

const DATE_FILTER_INPUT_CLASS =
  "relative h-7 w-[112px] shrink-0 cursor-pointer items-center justify-start px-1.5 text-xs [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";

function openDatePickerOnClick(e: React.MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // ignore (déjà ouvert ou navigateur non compatible)
  }
}

export default function ExposVisitors() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterExpoId = searchParams.get("expo_id")?.trim() || null;
  const { loading: authLoading, role_id: currentRoleId, agency_id: currentAgencyId } = useAuthUser();
  const canAccess = typeof currentRoleId === "number" && currentRoleId >= 1 && currentRoleId <= 4;

  const [rows, setRows]         = useState<VisitorRow[]>([]);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [expos, setExpos]       = useState<ExpoOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("name");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");

  // Filtres par colonne
  const [filterName, setFilterName]       = useState("");
  const [filterPseudo, setFilterPseudo]   = useState("");
  const [filterExpoFilter, setFilterExpoFilter] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo]     = useState("");

  const [deleteConfirmRow, setDeleteConfirmRow] = useState<VisitorRow | null>(null);
  const canRestore = typeof currentRoleId === "number" && currentRoleId < 4;

  const agencyById = useMemo(
    () => new Map(agencies.map((a) => [a.id, a.name_agency?.trim() || a.id])),
    [agencies],
  );
  const expoById = useMemo(
    () => new Map(expos.map((e) => [e.id, e.expo_name?.trim() || e.id])),
    [expos],
  );

  const load = useCallback(async () => {
    if (!canAccess) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    const [{ data: agenciesData }, { data: exposData }] = await Promise.all([
      supabase.from("agencies").select("id, name_agency"),
      supabase.from("expos").select("id, expo_name").is("deleted_at", null),
    ]);
    setAgencies((agenciesData as AgencyOption[] | null) ?? []);
    setExpos((exposData as ExpoOption[] | null) ?? []);

    // ── 1. Visiteurs anonymes depuis public.visitors ──────────────────────────
    const { data: anonData, error: anonErr } = await supabase
      .from("visitors")
      .select("id, visitor_name, visitor_pseudo, last_seen_at, deleted_at");

    if (anonErr) {
      console.warn("[ExposVisitors] visitors RLS/erreur :", anonErr.code, anonErr.message);
    } else {
      console.debug("[ExposVisitors] visitors count :", anonData?.length ?? 0);
    }

    type AnonRow = {
      id?: string | null;
      visitor_name?: string | null;
      visitor_pseudo?: string | null;
      last_seen_at?: string | null;
      deleted_at?: string | null;
    };
    const anonRows: VisitorRow[] = ((anonData ?? []) as AnonRow[])
      .filter((v) => v.id && !v.deleted_at)
      .map((v) => ({
        id: String(v.id),
        source: "visitors" as const,
        first_name: "Anonyme",
        last_name: null,
        pseudo: v.visitor_pseudo?.trim() || null,
        email: null,
        agency_id: null,
        expo_id: null,
        created_at: v.last_seen_at ?? null,
        deleted_at: v.deleted_at ?? null,
      }));

    const { data: deletedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .not("deleted_at", "is", null);
    const deletedProfileIds = new Set(
      ((deletedProfiles ?? []) as Array<{ id?: string | null }>)
        .map((p) => p.id?.trim())
        .filter(Boolean) as string[],
    );

    // ── 2. Tente le RPC global (utilisateurs enregistrés) ────────────────────
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
    if (!rpcErr && Array.isArray(rpcData)) {
      type R = {
        id?: string | null; user_id?: string | null;
        role_id?: unknown;
        first_name?: string | null; last_name?: string | null;
        email?: string | null;
        agency_id?: string | null; expo_id?: string | null;
        created_at?: string | null;
      };
      let registered = (rpcData as R[])
        .filter((r) => {
          const rid = r.role_id === null || r.role_id === undefined ? null
            : typeof r.role_id === "number" ? r.role_id
            : typeof r.role_id === "string" ? Number(r.role_id) : null;
          return rid === 7 || rid === null;
        })
        .map((r): VisitorRow => ({
          id: (typeof r.id === "string" ? r.id : r.user_id as string) || "",
          source: "profiles",
          first_name: r.first_name ?? null,
          last_name: r.last_name ?? null,
          email: r.email ?? null,
          agency_id: r.agency_id ?? null,
          expo_id: r.expo_id ?? null,
          created_at: r.created_at ?? null,
        }))
        .filter((r) => r.id && !deletedProfileIds.has(r.id));

      if (currentRoleId === 4 && currentAgencyId) {
        registered = registered.filter((r) => r.agency_id?.trim() === currentAgencyId.trim());
      }

      // Déduplique par id (anon en premier, registered en priorité si même id)
      const seen = new Set<string>();
      const merged: VisitorRow[] = [];
      for (const r of [...registered, ...anonRows]) {
        if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
      }
      setRows(merged);
      setLoading(false);
      return;
    }

    // ── 3. Fallback profiles (role_id = 7 ou NULL) ───────────────────────────
    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, username");

    if (profileErr) {
      setError(profileErr.message);
      setLoading(false);
      return;
    }

    const profileRows: VisitorRow[] = (
      (profileData ?? []) as Array<{
        id?: string | null; first_name?: string | null; last_name?: string | null; username?: string | null;
      }>
    ).map((p) => ({
      id: String(p.id ?? ""),
      source: "profiles" as const,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      pseudo: p.username ?? null,
      email: null,
      agency_id: null,
      expo_id: null,
      created_at: null,
    })).filter((r) => r.id && !deletedProfileIds.has(r.id));

    // Fusionner profiles + anonymes (dédupliqué)
    const seen = new Set<string>(profileRows.map((r) => r.id));
    const merged = [...profileRows, ...anonRows.filter((r) => !seen.has(r.id))];
    setRows(merged);
    setLoading(false);
  }, [canAccess, currentRoleId, currentAgencyId]);

  const softDelete = async (row: VisitorRow) => {
    const table = row.source === "visitors" ? "visitors" : "profiles";
    const { error: err } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id);
    if (err) { alert(`Erreur : ${err.message}`); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    let list = rows.filter((r) => !r.deleted_at);
    // Filtre expo depuis URL (?expo_id=...)
    if (filterExpoId) {
      list = list.filter((r) => r.expo_id?.trim() === filterExpoId);
    }
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      list = list.filter((r) =>
        `${r.first_name || ""} ${r.last_name || ""}`.trim().toLowerCase().includes(q),
      );
    }
    if (filterPseudo.trim()) {
      const q = filterPseudo.trim().toLowerCase();
      list = list.filter((r) => (r.pseudo || "").toLowerCase().includes(q));
    }
    if (filterExpoFilter) {
      list = list.filter((r) => r.expo_id?.trim() === filterExpoFilter);
    }
    if (filterDateFrom) {
      list = list.filter((r) => r.created_at && r.created_at >= filterDateFrom);
    }
    if (filterDateTo) {
      // Inclure toute la journée de fin
      const end = filterDateTo + "T23:59:59";
      list = list.filter((r) => r.created_at && r.created_at <= end);
    }
    return list;
  }, [rows, filterExpoId, filterName, filterPseudo, filterExpoFilter, filterDateFrom, filterDateTo]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    const pick = (r: VisitorRow): string => {
      if (sortKey === "name")       return `${r.first_name || ""} ${r.last_name || ""}`.trim();
      if (sortKey === "pseudo")     return r.pseudo?.trim() || "";
      if (sortKey === "email")      return r.email?.trim() || "";
      if (sortKey === "agency")     return (r.agency_id && agencyById.get(r.agency_id)) || "";
      if (sortKey === "expo")       return (r.expo_id && expoById.get(r.expo_id)) || "";
      return r.created_at?.trim() || "";
    };
    list.sort((a, b) => {
      const cmp = pick(a).localeCompare(pick(b), "fr", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortKey, sortDir, agencyById, expoById]);

  const SortButtons = ({ column }: { column: SortKey }) => (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      <button
        type="button"
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${
          sortKey === column && sortDir === "asc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => { setSortKey(column); setSortDir("asc"); }}
      >↑</button>
      <button
        type="button"
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${
          sortKey === column && sortDir === "desc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => { setSortKey(column); setSortDir("desc"); }}
      >↓</button>
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
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="backoffice-toolbar-outline-btn" onClick={() => navigate("/expos")}>
          ← Retour aux expositions
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>
            {filterExpoId
              ? `Visiteurs — ${expoById.get(filterExpoId) ?? filterExpoId}`
              : "Visiteurs inscrits"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="backoffice-toolbar-outline-btn h-7 gap-1 text-xs" asChild>
              <Link to="/visiteurs-corbeille">
                <ArchiveRestore className="h-3.5 w-3.5" />
                Corbeille
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {sortedRows.length} visiteur{sortedRows.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-8 px-1 py-1" />
                  <th className="w-44 px-2 py-1">Nom <SortButtons column="name" /></th>
                  <th className="w-36 px-2 py-1">Pseudo <SortButtons column="pseudo" /></th>
                  <th className="w-52 px-2 py-1">Email <SortButtons column="email" /></th>
                  <th className="w-36 px-2 py-1">Exposition <SortButtons column="expo" /></th>
                  <th className="w-52 px-2 py-1 text-center">
                    Inscription du … au <SortButtons column="created_at" />
                  </th>
                  <th className="w-8 px-1 py-1" />
                </tr>
                <tr className="border-b bg-muted/20">
                  <td className="px-1 py-1" />
                  <td className="px-2 py-1">
                    <Input
                      type="text"
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      placeholder="Filtrer…"
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="text"
                      value={filterPseudo}
                      onChange={(e) => setFilterPseudo(e.target.value)}
                      placeholder="Filtrer…"
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1" />
                  <td className="px-2 py-1">
                    <select
                      value={filterExpoFilter}
                      onChange={(e) => setFilterExpoFilter(e.target.value)}
                      className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">Toutes</option>
                      {expos.map((e) => (
                        <option key={e.id} value={e.id}>{e.expo_name ?? e.id}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex flex-row items-center gap-1">
                      <Input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        onClick={openDatePickerOnClick}
                        title="Du"
                        className={DATE_FILTER_INPUT_CLASS}
                      />
                      <Input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        onClick={openDatePickerOnClick}
                        title="Au"
                        className={DATE_FILTER_INPUT_CLASS}
                      />
                    </div>
                  </td>
                  <td className="px-1 py-1" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const name   = `${row.first_name || ""} ${row.last_name || ""}`.trim() || "—";
                  const pseudo = row.pseudo?.trim() || "—";
                  const expo   = (row.expo_id && expoById.get(row.expo_id)) || "—";
                  const goDetail = () => navigate(`/expos/visitors/${row.id}?source=${row.source}`);
                  return (
                    <tr
                      key={row.id}
                      className="border-b cursor-pointer hover:bg-muted/30"
                      onClick={goDetail}
                    >
                      {/* Œil — gauche */}
                      <td className="px-1 py-1 text-center" onClick={(e) => { e.stopPropagation(); goDetail(); }}>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </span>
                      </td>
                      <td className="px-2 py-1 truncate" title={name}>{name}</td>
                      <td className="px-2 py-1 truncate" title={pseudo}>{pseudo}</td>
                      <td className="px-2 py-1 truncate" title={row.email || ""}>{row.email || "—"}</td>
                      <td className="px-2 py-1 truncate" title={expo}>{expo}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{formatDate(row.created_at)}</td>
                      {/* Supprimer — droite */}
                      <td className="px-1 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Supprimer"
                          onClick={() => setDeleteConfirmRow(row)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-2 text-muted-foreground">
                      Aucun visiteur inscrit.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(deleteConfirmRow)}
        onOpenChange={(open) => !open && setDeleteConfirmRow(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce visiteur ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Vous allez supprimer{" "}
                  <span className="font-medium text-foreground">
                    {deleteConfirmRow
                      ? `${deleteConfirmRow.first_name || ""} ${deleteConfirmRow.last_name || ""}`.trim()
                        || deleteConfirmRow.pseudo?.trim()
                        || "ce visiteur"
                      : "ce visiteur"}
                  </span>
                  .
                </p>
                <p className="font-semibold text-destructive">
                  Cette suppression n&apos;est pas définitive.
                </p>
                <p>
                  Le visiteur sera déplacé dans la{" "}
                  <Link to="/visiteurs-corbeille" className="font-medium text-foreground underline underline-offset-2">
                    corbeille visiteurs
                  </Link>
                  {" "}et pourra être restauré
                  {canRestore
                    ? " depuis cette page."
                    : " par un administrateur (niveaux 1 à 3)."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteConfirmRow) return;
                void softDelete(deleteConfirmRow);
                setDeleteConfirmRow(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
