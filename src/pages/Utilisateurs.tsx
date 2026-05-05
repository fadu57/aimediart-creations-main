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

// ---------------------------------------------------------------------------
// Nouveau modèle :
//   profiles        → first_name, last_name, phone
//   agency_users    → agency_id, role_id
//   expo_user_role  → expo_id
//   auth.users      → email (non accessible côté client — non affiché ici)
//
// Soft-delete : profiles.deleted_at — colonne unifiée pour toutes les corbeilles.
// La suppression retire les rattachements agence + expo (agency_users, expo_user_role).
// Le profil (profiles) est conservé pour préserver l'historique auth.
// ---------------------------------------------------------------------------
type AdminUserRow = {
  id: string;
  role_id: number | null;
  agency_id: string | null;
  expo_id: string | null;
  first_name: string | null;
  last_name: string | null;
  birth_year: string | null;
  phone: string | null;
  email: string | null; // non pré-chargé — saisie admin via edge function seulement
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

type SortKey = "last_name" | "first_name" | "agency" | "expo" | "role";
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
  if (currentRoleId === 1) return [];
  if (currentRoleId === 2) return [];
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
  const [sortKey, setSortKey] = useState<SortKey>("last_name");
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
      const expoLabel = (row.expo_id && expoLabelById.get(row.expo_id)) || "";
      [row.last_name, row.first_name, roleLabel, agencyLabel, expoLabel]
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
      const expoLabel = (row.expo_id && expoLabelById.get(row.expo_id)) || "";
      const haystack = [
        row.last_name || "",
        row.first_name || "",
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
      if (sortKey === "last_name") return row.last_name?.trim() || "";
      if (sortKey === "first_name") return row.first_name?.trim() || "";
      if (sortKey === "agency") return (row.agency_id && agencyLabelById.get(row.agency_id)) || "";
      if (sortKey === "expo") return (row.expo_id && expoLabelById.get(row.expo_id)) || "";
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

  // -------------------------------------------------------------------------
  // Chargement de la liste via RPC get_all_users_with_roles
  // La fonction SQL retourne role_id unifié (agency_users ou app_metadata),
  // agency_id, expo_id, first_name, last_name, phone pour chaque utilisateur.
  // -------------------------------------------------------------------------
  const loadUsers = async () => {
    if (!canAccess) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");

    if (rpcErr) {
      setRows([]);
      setError(rpcErr.message);
      setLoading(false);
      return;
    }

    // Mapping du résultat RPC vers AdminUserRow
    let merged: AdminUserRow[] = (
      (data as Array<{
        id?: string | null;
        role_id?: number | null;
        agency_id?: string | null;
        expo_id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        phone?: string | null;
      }> | null) ?? []
    )
      .filter((r) => typeof r.id === "string" && r.id.trim())
      .map((r) => ({
        id: String(r.id),
        role_id: typeof r.role_id === "number" ? r.role_id : null,
        agency_id: r.agency_id ?? null,
        expo_id: r.expo_id ?? null,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        birth_year: null,
        phone: r.phone ?? null,
        email: null, // auth.users.email non accessible côté client
      }));

    // Filtrage par rôle visible (même logique que l'ancienne requête SQL)
    if (currentRoleId === 2) {
      merged = merged.filter((r) => r.role_id !== 1);
    } else if (visibleRoleIds !== null && visibleRoleIds.length > 0) {
      merged = merged.filter((r) => r.role_id != null && visibleRoleIds.includes(r.role_id));
    }

    // Tri initial par nom
    merged.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || "", "fr"));

    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, [canAccess, currentRoleId]);

  const openUserCard = (row: AdminUserRow) => {
    setDialogUserId(row.id);
  };

  // -------------------------------------------------------------------------
  // Suppression douce : marque profiles.deleted_at = now().
  // La fiche reste dans la base et est restaurable via /utilisateurs-corbeille.
  // Le RPC get_all_users_with_roles doit filtrer profiles.deleted_at IS NULL.
  // -------------------------------------------------------------------------
  const deleteUser = async () => {
    if (!deleteTarget || !canDeleteUsers) return;

    const roleId = deleteTarget.role_id;
    if (currentRoleId === 2 && roleId === 1) {
      toast.error("Suppression non autorisée pour ce rôle.");
      return;
    }
    if (currentRoleId === 4 && roleId != null && ![4, 5, 6].includes(roleId)) {
      toast.error("Suppression non autorisée pour ce rôle.");
      return;
    }

    setDeleting(true);
    try {
      const uid = deleteTarget.id;

      const { error: softErr } = await supabase
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", uid);
      if (softErr) throw softErr;

      toast.success("Utilisateur envoyé en corbeille.");
      setDeleteTarget(null);
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  // Vérifie si l'utilisateur ciblé est le dernier admin organisation de son agence.
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
        .from("agency_users")
        .select("user_id")
        .eq("role_id", 4)
        .eq("agency_id", deleteTarget.agency_id)
        .neq("user_id", deleteTarget.id)
        .limit(1);
      if (cancelled) return;
      if (qErr) {
        setDeleteLastRole4InOrg(false);
        return;
      }
      const remaining = (data as Array<{ user_id?: string }> | null) ?? [];
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
              placeholder="Rechercher (nom, prénom, rôle...)"
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
                    <SortButtons column="first_name" />
                  </th>
                  <th className="w-36 px-2 py-1">
                    Nom
                    <SortButtons column="last_name" />
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
                        <span className="block truncate whitespace-nowrap" title={row.first_name || "—"}>
                          {row.first_name || "—"}
                        </span>
                      </td>
                      <td className="w-36 px-2 py-1">
                        <span className="block truncate whitespace-nowrap" title={row.last_name || "—"}>
                          {row.last_name || "—"}
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
                          title={(row.expo_id && expoLabelById.get(row.expo_id)) || "—"}
                        >
                          {(row.expo_id && expoLabelById.get(row.expo_id)) || "—"}
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
                      La suppression peut laisser l'organisation sans administrateur.
                    </>
                  ) : (
                    "Confirmez-vous la suppression de cet Admin organisation ?"
                  )}
                  <br />
                  {deleteTarget ? `Utilisateur ciblé : ${deleteTarget.first_name || ""} ${deleteTarget.last_name || ""}` : ""}
                </>
              ) : (
                <>
                  Voulez-vous vraiment supprimer cet utilisateur ?
                  {deleteTarget ? ` (${deleteTarget.first_name || ""} ${deleteTarget.last_name || ""})` : ""}
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
