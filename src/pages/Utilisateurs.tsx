import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArchiveRestore, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { supabase } from "@/lib/supabase";
import Users from "@/pages/Users";

type AdminUserRow = {
  id: string;
  role_id: number | null;
  agency_id: string | null;
  user_expo_id: string | null;
  user_prenom: string | null;
  user_nom: string | null;
  user_age: string | null;
  user_phone: string | null;
  user_email: string | null;
  user_deleted_at?: string | null;
};

type RoleOption = {
  role_id: number;
  label: string;
};

type AgencyOption = {
  id: string;
  name_agency: string;
};

type ExpoOption = {
  id: string;
  expo_id: string | null;
  expo_name: string | null;
};

type SortKey = "user_nom" | "user_prenom" | "agency" | "expo" | "role";
type SortDir = "asc" | "desc";

function normalizeRoleLabel(roleId: number, label: string | null | undefined): string {
  const raw = label?.trim() || `Rôle ${roleId}`;
  if (roleId === 4 && raw.toLowerCase() === "admin agence") return "Admin organisation";
  return raw;
}

function extractRoleNameClair(
  row: { role_name_clair?: unknown; label?: unknown; role_name?: unknown },
  roleId: number,
): string {
  const roleNameClair = typeof row.role_name_clair === "string" ? row.role_name_clair.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const roleName = typeof row.role_name === "string" ? row.role_name.trim() : "";
  return normalizeRoleLabel(roleId, roleNameClair || label || roleName || `Rôle ${roleId}`);
}

function getAllowedRoleIds(currentRoleId: number | null): number[] {
  if (currentRoleId === 1) return []; // role 1 voit tous les rôles, géré côté requête
  if (currentRoleId === 2) return []; // role 2 peut affecter les rôles > 2
  if (currentRoleId === 4) return [4, 5, 6];
  return [];
}

function getVisibleRoleIds(currentRoleId: number | null): number[] | null {
  if (currentRoleId === 1) return null;
  if (currentRoleId === 2) return null;
  if (currentRoleId === 4) return [4, 5, 6];
  return [];
}

export default function Utilisateurs() {
  const navigate = useNavigate();
  const { loading: authLoading, role_id: currentRoleId, user } = useAuthUser();
  const { can, loading: navLoading } = useNavigationMatrix();
  const currentUserId = user?.id ?? "";
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("user_nom");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteLastRole4InOrg, setDeleteLastRole4InOrg] = useState(false);
  const [dialogUserId, setDialogUserId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [agencyOptions, setAgencyOptions] = useState<AgencyOption[]>([]);
  const [expoOptions, setExpoOptions] = useState<ExpoOption[]>([]);
  const allowedRoleIds = useMemo(() => getAllowedRoleIds(currentRoleId), [currentRoleId]);
  const visibleRoleIds = useMemo(() => getVisibleRoleIds(currentRoleId), [currentRoleId]);
  const canAccess = can("menu_user");
  const canDeleteUsers = currentRoleId === 1 || currentRoleId === 2 || currentRoleId === 4;
  const roleLabelById = useMemo(() => new Map(roleOptions.map((r) => [r.role_id, r.label])), [roleOptions]);
  const agencyLabelById = useMemo(
    () => new Map(agencyOptions.map((a) => [a.id, a.name_agency || a.id])),
    [agencyOptions],
  );
  const expoLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const expo of expoOptions) {
      if (!expo.id) continue;
      map.set(expo.id, expo.expo_name?.trim() || expo.expo_id?.trim() || expo.id);
      if (expo.expo_id?.trim()) map.set(expo.expo_id.trim(), expo.expo_name?.trim() || expo.expo_id.trim());
    }
    return map;
  }, [expoOptions]);
  const searchSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const roleLabel = row.role_id != null ? roleLabelById.get(row.role_id) || `Rôle ${row.role_id}` : "";
      const agencyLabel = (row.agency_id && agencyLabelById.get(row.agency_id)) || "";
      const expoLabel = (row.user_expo_id && expoLabelById.get(row.user_expo_id)) || "";
      [row.user_nom, row.user_prenom, row.user_email, roleLabel, agencyLabel, expoLabel]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
        .forEach((v) => set.add(v));
    }
    return Array.from(set).slice(0, 200);
  }, [rows, roleLabelById, agencyLabelById, expoLabelById]);
  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const roleLabel = row.role_id != null ? roleLabelById.get(row.role_id) || `Rôle ${row.role_id}` : "";
      const agencyLabel = (row.agency_id && agencyLabelById.get(row.agency_id)) || "";
      const expoLabel = (row.user_expo_id && expoLabelById.get(row.user_expo_id)) || "";
      const haystack = [
        row.user_nom || "",
        row.user_prenom || "",
        row.user_email || "",
        roleLabel,
        agencyLabel,
        expoLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, searchTerm, roleLabelById, agencyLabelById, expoLabelById]);
  const sortedRows = useMemo(() => {
    const pinnedRole1 = filteredRows.filter((r) => Number(r.role_id) === 1);
    const pinnedRole4 = filteredRows.filter((r) => Number(r.role_id) === 4);
    const others = filteredRows.filter((r) => Number(r.role_id) !== 1 && Number(r.role_id) !== 4);
    const pick = (row: AdminUserRow): string => {
      if (sortKey === "user_nom") return row.user_nom?.trim() || "";
      if (sortKey === "user_prenom") return row.user_prenom?.trim() || "";
      if (sortKey === "agency") return (row.agency_id && agencyLabelById.get(row.agency_id)) || "";
      if (sortKey === "expo") return (row.user_expo_id && expoLabelById.get(row.user_expo_id)) || "";
      // Tri rôle basé sur la valeur numérique role_id, pas sur le libellé.
      return row.role_id != null ? String(row.role_id).padStart(3, "0") : "999";
    };
    const cmp = (a: AdminUserRow, b: AdminUserRow) => {
      const av = pick(a);
      const bv = pick(b);
      const base = av.localeCompare(bv, "fr", { sensitivity: "base" });
      return sortDir === "asc" ? base : -base;
    };
    pinnedRole1.sort(cmp);
    pinnedRole4.sort(cmp);
    others.sort(cmp);
    // Priorité stricte: role 1 toujours en haut, puis role 4, puis le reste.
    return [...pinnedRole1, ...pinnedRole4, ...others];
  }, [filteredRows, sortKey, sortDir, agencyLabelById, expoLabelById, roleLabelById]);

  const SortButtons = ({ column }: { column: SortKey }) => (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      <button
        type="button"
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] leading-none ${
          sortKey === column && sortDir === "asc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => {
          setSortKey(column);
          setSortDir("asc");
        }}
        aria-label="Trier ascendant"
        title="Trier ascendant"
      >
        ↑
      </button>
      <button
        type="button"
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] leading-none ${
          sortKey === column && sortDir === "desc" ? "bg-muted font-bold" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => {
          setSortKey(column);
          setSortDir("desc");
        }}
        aria-label="Trier descendant"
        title="Trier descendant"
      >
        ↓
      </button>
    </span>
  );

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    void (async () => {
      const base = supabase.from("roles_user").select("*").order("role_id", { ascending: true });
      const { data, error: qErr } =
        currentRoleId === 1
          ? await base
          : currentRoleId === 2
            ? await base.gt("role_id", 2)
            : await base.in("role_id", allowedRoleIds);
      if (cancelled) return;
      if (qErr) {
        const fallbackIds =
          currentRoleId === 1
            ? [1, 2, 3, 4, 5, 6, 7]
            : currentRoleId === 2
              ? [3, 4, 5, 6, 7]
              : allowedRoleIds;
        setRoleOptions(fallbackIds.map((id) => ({ role_id: id, label: `Rôle ${id}` })));
        return;
      }
      const mapped =
        ((data as Array<{ role_id?: number | null; role_name_clair?: string | null; label?: string | null; role_name?: string | null }> | null) ?? [])
          .filter((r) => typeof r.role_id === "number")
          .map((r) => ({ role_id: Number(r.role_id), label: extractRoleNameClair(r, Number(r.role_id)) })) ?? [];
      if (mapped.length) {
        setRoleOptions(mapped);
      } else {
        const fallbackIds =
          currentRoleId === 1
            ? [1, 2, 3, 4, 5, 6, 7]
            : currentRoleId === 2
              ? [3, 4, 5, 6, 7]
              : allowedRoleIds;
        setRoleOptions(fallbackIds.map((id) => ({ role_id: id, label: `Rôle ${id}` })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowedRoleIds, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    void (async () => {
      const [{ data: agencies }, { data: expos }] = await Promise.all([
        supabase.from("agencies").select("id, name_agency"),
        supabase.from("expos").select("id, expo_id, expo_name"),
      ]);
      if (cancelled) return;
      setAgencyOptions((agencies as AgencyOption[] | null) ?? []);
      setExpoOptions((expos as ExpoOption[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess]);

  const loadUsers = async () => {
    if (!canAccess) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const runQuery = async () => {
      let q = supabase
        .from("users")
        .select("id, role_id, agency_id, user_expo_id, user_prenom, user_nom, user_age, user_phone, user_email")
        .order("user_nom", { ascending: true, nullsFirst: false });
      if (currentRoleId === 2) return q.neq("role_id", 1);
      if (visibleRoleIds === null) return q;
      if (visibleRoleIds.length === 0) return q;
      return q.in("role_id", visibleRoleIds);
    };

    const { data, error: qErr } = await runQuery();
    if (qErr) {
      setRows([]);
      setError(qErr.message);
      setLoading(false);
      return;
    }
    setRows((data as AdminUserRow[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, [canAccess, currentRoleId]);

  const openUserCard = (row: AdminUserRow) => {
    setDialogUserId(row.id);
  };

  const deleteUser = async () => {
    if (!deleteTarget || !canDeleteUsers) return;
    setDeleting(true);
    try {
      const delQuery = supabase
        .from("users")
        .update({ user_deleted_at: new Date().toISOString() })
        .eq("id", deleteTarget.id);
      const { error: delErr } =
        currentRoleId === 1
          ? await delQuery.neq("role_id", 1)
          : currentRoleId === 2
            ? await delQuery.gt("role_id", 2)
            : await delQuery.in("role_id", allowedRoleIds);
      if (delErr) throw delErr;
      toast.success("Utilisateur archivé dans la corbeille.");
      setDeleteTarget(null);
      await loadUsers();
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!deleteTarget) {
      setDeleteLastRole4InOrg(false);
      return;
    }
    if (Number(deleteTarget.role_id) !== 4 || !deleteTarget.agency_id) {
      setDeleteLastRole4InOrg(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("users")
        .select("id")
        .eq("role_id", 4)
        .eq("agency_id", deleteTarget.agency_id)
        .neq("id", deleteTarget.id)
        .limit(1);
      if (cancelled) return;
      if (qErr) {
        setDeleteLastRole4InOrg(false);
        return;
      }
      const remaining = (data as Array<{ id?: string }> | null) ?? [];
      setDeleteLastRole4InOrg(remaining.length === 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteTarget]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (navLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => navigate("/user")}>
          Retour
        </Button>
        <Button type="button" variant="outline" className="gap-2" asChild>
          <Link to="/utilisateurs-corbeille">
            <ArchiveRestore className="h-4 w-4" /> Corbeille
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Utilisateurs</CardTitle>
          <div className="relative w-full md:w-[360px]">
            <Input
              type="text"
              list="utilisateurs-search-suggestions"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher (nom, prénom, email, rôle...)"
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
            <datalist id="utilisateurs-search-suggestions">
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
                  <th className="w-36 px-2 py-1">
                    Prénom
                    <SortButtons column="user_prenom" />
                  </th>
                  <th className="w-36 px-2 py-1">
                    Nom
                    <SortButtons column="user_nom" />
                  </th>
                  <th className="w-44 px-2 py-1">
                    Organisation
                    <SortButtons column="agency" />
                  </th>
                  <th className="w-44 px-2 py-1">
                    Expo
                    <SortButtons column="expo" />
                  </th>
                  <th className="w-40 px-2 py-1 whitespace-nowrap">
                    Rôle
                    <SortButtons column="role" />
                  </th>
                  <th className="w-10 px-2 py-1" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const isProtectedAdmin = Number(row.role_id) === 1;
                  const isRole4Row = Number(row.role_id) === 4;
                  const isRole2Row = Number(row.role_id) === 2;
                  const isRole2Self = currentRoleId === 2 && isRole2Row && row.id === currentUserId;
                  const canShowDelete = canDeleteUsers && !isProtectedAdmin && !isRole2Self;
                  const rowClass = isProtectedAdmin
                    ? "cursor-pointer bg-red-600 text-white italic font-bold"
                    : isRole4Row || (currentRoleId === 2 && isRole2Row)
                      ? "cursor-pointer text-blue-600 font-bold hover:bg-muted/30"
                      : "cursor-pointer hover:bg-muted/30";

                  const handleOpen = () => openUserCard(row);

                  return (
                    <tr key={row.id} className={`border-b ${rowClass}`} onClick={handleOpen}>
                      <td className="w-36 px-2 py-1">
                        <span className="block truncate whitespace-nowrap" title={row.user_prenom || "—"}>
                          {row.user_prenom || "—"}
                        </span>
                      </td>
                      <td className="w-36 px-2 py-1">
                        <span className="block truncate whitespace-nowrap" title={row.user_nom || "—"}>
                          {row.user_nom || "—"}
                        </span>
                      </td>
                      <td className="w-44 px-2 py-1">
                        <span
                          className="block truncate whitespace-nowrap"
                          title={(row.agency_id && agencyLabelById.get(row.agency_id)) || "—"}
                        >
                          {(row.agency_id && agencyLabelById.get(row.agency_id)) || "—"}
                        </span>
                      </td>
                      <td className="w-44 px-2 py-1">
                        <span
                          className="block truncate whitespace-nowrap"
                          title={(row.user_expo_id && expoLabelById.get(row.user_expo_id)) || "—"}
                        >
                          {(row.user_expo_id && expoLabelById.get(row.user_expo_id)) || "—"}
                        </span>
                      </td>
                      <td className="w-40 px-2 py-1">
                        <span
                          className="block truncate whitespace-nowrap"
                          title={row.role_id != null ? roleLabelById.get(row.role_id) || `Rôle ${row.role_id}` : "—"}
                        >
                          {row.role_id != null ? roleLabelById.get(row.role_id) || `Rôle ${row.role_id}` : "—"}
                        </span>
                      </td>
                      <td className="w-10 px-2 py-1">
                        {canShowDelete ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-[30px] w-[30px] text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(row);
                            }}
                            aria-label="Supprimer l'utilisateur"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        ) : (
                          <div className="h-7 w-7" />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-1.5 text-muted-foreground">
                      Aucun utilisateur visible.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && Number(deleteTarget.role_id) === 4 ? (
                <>
                  <span className="font-semibold text-destructive">
                    Attention critique : vous êtes sur le point de supprimer un Admin organisation.
                  </span>
                  <br />
                  {deleteLastRole4InOrg ? (
                    <>
                      Cet utilisateur semble être le dernier `role_id = 4` de cette organisation.
                      La suppression peut laisser l’organisation sans administrateur.
                    </>
                  ) : (
                    "Confirmez-vous la suppression de cet Admin organisation ?"
                  )}
                  <br />
                  {deleteTarget ? `Utilisateur ciblé : ${deleteTarget.user_prenom || ""} ${deleteTarget.user_nom || ""}` : ""}
                </>
              ) : (
                <>
                  Voulez-vous vraiment supprimer cet utilisateur ?
                  {deleteTarget ? ` (${deleteTarget.user_prenom || ""} ${deleteTarget.user_nom || ""})` : ""}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                void deleteUser();
              }}
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Users
        embeddedDialogOnly
        forcedEditUserId={dialogUserId}
        onDialogClosed={() => setDialogUserId(null)}
        onUserSaved={() => {
          void loadUsers();
        }}
      />

    </div>
  );
}
