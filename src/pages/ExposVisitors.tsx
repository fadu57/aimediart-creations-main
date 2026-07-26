import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";
import { softDeleteVisitor } from "@/lib/visitorSoftDelete";

import { formatFrenchDateTime } from "@/lib/userLastSignIn";

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
  auth_user_id?: string | null;
  avatar_url?: string | null;
  selfie_url?: string | null;
  /** Nombre de comptes profils fusionnés sous le même nom (affichage). */
  duplicate_accounts?: number;
};

function isHttpUrl(u: string | null | undefined): boolean {
  const s = (u ?? "").trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

/** Uniquement le selfie (jamais l’avatar pool / profil). */
function visitorSelfieUrl(row: VisitorRow): string | null {
  if (isHttpUrl(row.selfie_url)) return row.selfie_url!.trim();
  return null;
}

function profileNameKey(first?: string | null, last?: string | null): string | null {
  const f = (first ?? "").trim().toLowerCase();
  const l = (last ?? "").trim().toLowerCase();
  if (!f && !l) return null;
  // Ne pas fusionner les libellés génériques
  if (f === "anonyme" || f === "anonymous") return null;
  return `${f}|${l}`;
}

/** Une ligne par id, puis une ligne par nom complet identique (plusieurs auth.users de test). */
function dedupeRegisteredProfiles(rows: VisitorRow[]): VisitorRow[] {
  const byId = new Map<string, VisitorRow>();
  for (const row of rows) {
    const id = row.id.trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, row);
      continue;
    }
    // Même id (JOIN multi-agence) : garder la ligne la plus « riche »
    const prevScore =
      (prev.email ? 2 : 0) +
      (prev.agency_id ? 1 : 0) +
      (visitorSelfieUrl(prev) ? 3 : 0) +
      (prev.created_at || "").length;
    const nextScore =
      (row.email ? 2 : 0) +
      (row.agency_id ? 1 : 0) +
      (visitorSelfieUrl(row) ? 3 : 0) +
      (row.created_at || "").length;
    if (nextScore > prevScore) byId.set(id, row);
  }

  const byName = new Map<string, VisitorRow>();
  const noName: VisitorRow[] = [];
  for (const row of byId.values()) {
    const key = profileNameKey(row.first_name, row.last_name);
    if (!key) {
      noName.push(row);
      continue;
    }
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { ...row, duplicate_accounts: 1 });
      continue;
    }
    const prevTs = prev.created_at || "";
    const nextTs = row.created_at || "";
    const preferPhoto = !visitorSelfieUrl(prev) && visitorSelfieUrl(row);
    const keep = preferPhoto || nextTs >= prevTs ? row : prev;
    const drop = keep === row ? prev : row;
    byName.set(key, {
      ...keep,
      email: keep.email || drop.email || null,
      pseudo: keep.pseudo || drop.pseudo || null,
      agency_id: keep.agency_id || drop.agency_id || null,
      expo_id: keep.expo_id || drop.expo_id || null,
      avatar_url: keep.avatar_url || drop.avatar_url || null,
      selfie_url: keep.selfie_url || drop.selfie_url || null,
      duplicate_accounts: (prev.duplicate_accounts ?? 1) + 1,
    });
  }
  return [...byName.values(), ...noName];
}

type AgencyOption = { id: string; name_agency: string | null };
type ExpoOption  = { id: string; expo_name: string | null };
type SortKey = "name" | "pseudo" | "email" | "agency" | "expo" | "created_at";
type SortDir = "asc" | "desc";

function formatDate(value: string | null | undefined): string {
  return formatFrenchDateTime(value, "—");
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
  const { t } = useTranslation("expos");
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
  const [photoPreview, setPhotoPreview] = useState<{ url: string; label: string } | null>(null);
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

    // ── 1. Visiteurs anonymes (RPC backoffice, sinon SELECT direct) ───────────
    type AnonRow = {
      id?: string | null;
      visitor_pseudo?: string | null;
      last_seen_at?: string | null;
      deleted_at?: string | null;
      auth_user_id?: string | null;
      fingerprint?: string | null;
      device_fingerprint?: string | null;
      avatar_url?: string | null;
      selfie_url?: string | null;
    };

    let anonRaw: AnonRow[] = [];
    const { data: anonRpcData, error: anonRpcErr } = await supabase.rpc("list_backoffice_anonymous_visitors");
    if (!anonRpcErr && Array.isArray(anonRpcData)) {
      anonRaw = anonRpcData as AnonRow[];
    } else {
      if (anonRpcErr) {
        console.warn("[ExposVisitors] list_backoffice_anonymous_visitors :", anonRpcErr.code, anonRpcErr.message);
      }
      const { data: anonData, error: anonErr } = await supabase
        .from("visitors")
        .select("id, visitor_pseudo, last_seen_at, deleted_at, auth_user_id, fingerprint, device_fingerprint, avatar_url, selfie_url")
        .is("deleted_at", null);
      if (anonErr) {
        console.warn("[ExposVisitors] visitors RLS/erreur :", anonErr.code, anonErr.message);
      }
      anonRaw = (anonData ?? []) as AnonRow[];
    }

    const mapAnonRow = (v: AnonRow): VisitorRow & {
      auth_user_id?: string | null;
      fingerprint?: string | null;
      device_fingerprint?: string | null;
    } => ({
      id: String(v.id),
      source: "visitors" as const,
      first_name: t("visitors.anonymous"),
      last_name: null,
      pseudo: v.visitor_pseudo?.trim() || null,
      email: null,
      agency_id: null,
      expo_id: null,
      created_at: v.last_seen_at ?? null,
      deleted_at: v.deleted_at ?? null,
      auth_user_id: v.auth_user_id?.trim() || null,
      fingerprint: v.fingerprint?.trim() || null,
      device_fingerprint: v.device_fingerprint?.trim() || null,
      avatar_url: v.avatar_url?.trim() || null,
      selfie_url: v.selfie_url?.trim() || null,
    });

    // Une ligne par identité (auth / fingerprint / device), la plus récente (préfère selfie)
    const anonByIdentity = new Map<string, ReturnType<typeof mapAnonRow>>();
    for (const raw of anonRaw) {
      if (!raw.id || raw.deleted_at) continue;
      const row = mapAnonRow(raw);
      const key =
        row.auth_user_id ||
        (row.fingerprint ? `fp:${row.fingerprint}` : null) ||
        (row.device_fingerprint ? `dfp:${row.device_fingerprint}` : null) ||
        `id:${row.id}`;
      const prev = anonByIdentity.get(key);
      const prefer =
        !prev ||
        (isHttpUrl(row.selfie_url) && !isHttpUrl(prev.selfie_url)) ||
        ((row.created_at || "") > (prev.created_at || "") && !(isHttpUrl(prev.selfie_url) && !isHttpUrl(row.selfie_url)));
      if (prefer) anonByIdentity.set(key, row);
    }
    const anonRowsRaw = [...anonByIdentity.values()];
    console.debug("[ExposVisitors] visitors actifs (dédup) :", anonRowsRaw.length);

    const { data: deletedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .not("deleted_at", "is", null);
    const deletedProfileIds = new Set(
      ((deletedProfiles ?? []) as Array<{ id?: string | null }>)
        .map((p) => p.id?.trim())
        .filter(Boolean) as string[],
    );

    /** Selfie uniquement — via auth_user_id, empreinte appareil, ou meta user_photo_url type selfie. */
    const enrichProfilesFromSelfies = async (registered: VisitorRow[]) => {
      const selfieByProfileId = new Map<string, string>();
      const linkedVisitorIds = new Set<string>();

      const { data: selfieRpc, error: selfieErr } = await supabase.rpc("list_backoffice_profile_selfies");
      if (selfieErr) {
        console.warn("[ExposVisitors] list_backoffice_profile_selfies :", selfieErr.code, selfieErr.message);
      } else if (Array.isArray(selfieRpc)) {
        for (const row of selfieRpc as Array<{
          profile_id?: string | null;
          selfie_url?: string | null;
          visitor_id?: string | null;
        }>) {
          const pid = row.profile_id?.trim();
          const url = row.selfie_url?.trim();
          if (pid && isHttpUrl(url) && !selfieByProfileId.has(pid)) {
            selfieByProfileId.set(pid, url!);
          }
          const vid = row.visitor_id?.trim();
          if (vid) linkedVisitorIds.add(vid);
        }
      }

      // Fallback : sessions anonymes déjà chargées, liées par auth_user_id
      for (const anon of anonRowsRaw) {
        const authId = anon.auth_user_id?.trim();
        if (!authId || !isHttpUrl(anon.selfie_url)) continue;
        if (!selfieByProfileId.has(authId)) selfieByProfileId.set(authId, anon.selfie_url!.trim());
        linkedVisitorIds.add(anon.id);
      }

      const enriched = registered.map((r) => {
        const fromMap = selfieByProfileId.get(r.id);
        const linkedAnon = anonRowsRaw.find((a) => a.auth_user_id?.trim() === r.id);
        return {
          ...r,
          pseudo: r.pseudo?.trim() || linkedAnon?.pseudo || null,
          selfie_url: r.selfie_url || fromMap || null,
        };
      });

      return { enriched, linkedVisitorIds };
    };

    const mergeRegisteredAndAnon = async (registeredRaw: VisitorRow[]) => {
      const allRegisteredIds = new Set(registeredRaw.map((r) => r.id));
      const { enriched, linkedVisitorIds } = await enrichProfilesFromSelfies(registeredRaw);
      const registered = dedupeRegisteredProfiles(enriched);

      const anonRows = anonRowsRaw.filter((a) => {
        if (linkedVisitorIds.has(a.id)) return false;
        const authId = a.auth_user_id?.trim();
        if (authId && allRegisteredIds.has(authId)) return false;
        return true;
      });

      const seen = new Set<string>();
      const merged: VisitorRow[] = [];
      for (const r of [...registered, ...anonRows]) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          merged.push(r);
        }
      }
      return merged;
    };

    // ── 2. Tente le RPC global (utilisateurs enregistrés) ────────────────────
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
    if (!rpcErr && Array.isArray(rpcData)) {
      type R = {
        id?: string | null; user_id?: string | null;
        role_id?: unknown;
        first_name?: string | null; last_name?: string | null;
        username?: string | null;
        avatar_url?: string | null;
        email?: string | null;
        agency_id?: string | null; expo_id?: string | null;
        created_at?: string | null;
        last_sign_in_at?: string | null;
      };
      let registered = (rpcData as R[])
        .filter((r) => {
          const rid = r.role_id === null || r.role_id === undefined ? null
            : typeof r.role_id === "number" ? r.role_id
            : typeof r.role_id === "string" ? Number(r.role_id) : null;
          return rid === 7 || rid === null;
        })
        .map((r): VisitorRow => ({
          id: String((typeof r.id === "string" ? r.id : r.user_id) || "").trim(),
          source: "profiles",
          first_name: r.first_name ?? null,
          last_name: r.last_name ?? null,
          pseudo: r.username?.trim() || null,
          email: r.email ?? null,
          agency_id: r.agency_id ?? null,
          expo_id: r.expo_id ?? null,
          created_at: r.last_sign_in_at ?? r.created_at ?? null,
          avatar_url: r.avatar_url?.trim() || null,
        }))
        .filter((r) => r.id && !deletedProfileIds.has(r.id));

      if (currentRoleId === 4 && currentAgencyId) {
        registered = registered.filter((r) => r.agency_id?.trim() === currentAgencyId.trim());
      }

      setRows(await mergeRegisteredAndAnon(registered));
      setLoading(false);
      return;
    }

    // ── 3. Fallback profiles (role_id = 7 ou NULL) ───────────────────────────
    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, username, avatar_url")
      .is("deleted_at", null);

    if (profileErr) {
      setError(profileErr.message);
      setLoading(false);
      return;
    }

    const profileRows: VisitorRow[] = (
      (profileData ?? []) as Array<{
        id?: string | null; first_name?: string | null; last_name?: string | null; username?: string | null; avatar_url?: string | null;
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
      avatar_url: p.avatar_url?.trim() || null,
    })).filter((r) => r.id && !deletedProfileIds.has(r.id));

    setRows(await mergeRegisteredAndAnon(profileRows));
    setLoading(false);
  }, [canAccess, currentRoleId, currentAgencyId, t]);

  const softDelete = async (row: VisitorRow) => {
    const result = await softDeleteVisitor(row.id, row.source);
    if (!result.ok) {
      alert(t("visitors.alert_error", { message: result.message }));
      return;
    }
    // Recharge : cascade fingerprint / jumeaux côté SQL
    await load();
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
    <div className="mx-auto w-full min-w-0 max-w-[1200px] px-3 py-4 sm:px-4 sm:py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="backoffice-toolbar-outline-btn w-full sm:w-auto" onClick={() => navigate("/expos")}>
          {t("visitors.back_to_expos")}
        </Button>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="min-w-0 text-base leading-snug sm:text-lg">
            {filterExpoId
              ? t("visitors.title_for_expo", { name: expoById.get(filterExpoId) ?? filterExpoId })
              : t("visitors.title_registered")}
          </CardTitle>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <Button type="button" variant="outline" size="sm" className="backoffice-toolbar-outline-btn h-8 gap-1 text-xs sm:h-7" asChild>
              <Link to="/visiteurs-corbeille">
                <ArchiveRestore className="h-3.5 w-3.5" />
                {t("visitors.trash")}
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("visitors.count", { count: sortedRows.length })}
            </span>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 p-0 sm:p-6">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground sm:px-0">{t("visitors.loading")}</p>
          ) : error ? (
            <p className="px-4 py-3 text-sm text-destructive sm:px-0">{error}</p>
          ) : (
            <>
              <div className="space-y-3 border-b border-border p-4 md:hidden">
                <Input
                  type="text"
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  placeholder={`${t("visitors.col_name")} — ${t("visitors.filter_placeholder")}`}
                  className="h-9 text-sm"
                />
                <Input
                  type="text"
                  value={filterPseudo}
                  onChange={(e) => setFilterPseudo(e.target.value)}
                  placeholder={`${t("visitors.col_pseudo")} — ${t("visitors.filter_placeholder")}`}
                  className="h-9 text-sm"
                />
                <select
                  value={filterExpoFilter}
                  onChange={(e) => setFilterExpoFilter(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t("visitors.all_f")}</option>
                  {expos.map((e) => (
                    <option key={e.id} value={e.id}>{e.expo_name ?? e.id}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    onClick={openDatePickerOnClick}
                    title={t("visitors.date_from")}
                    className="h-9 min-w-0 flex-1 cursor-pointer text-sm [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    onClick={openDatePickerOnClick}
                    title={t("visitors.date_to")}
                    className="h-9 min-w-0 flex-1 cursor-pointer text-sm [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {sortedRows.map((row) => {
                  const name   = `${row.first_name || ""} ${row.last_name || ""}`.trim() || "—";
                  const pseudo = row.pseudo?.trim() || "—";
                  const expo   = (row.expo_id && expoById.get(row.expo_id)) || "—";
                  const goDetail = () => navigate(`/expos/visitors/${row.id}?source=${row.source}`);
                  return (
                    <div
                      key={row.id}
                      className="min-w-0 cursor-pointer space-y-2 rounded-lg border border-border/60 p-3 hover:bg-muted/30"
                      onClick={goDetail}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          {(() => {
                            const photo = visitorSelfieUrl(row);
                            if (!photo) return null;
                            return (
                              <button
                                type="button"
                                className="shrink-0 rounded-md p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoPreview({ url: photo, label: name });
                                }}
                                aria-label={t("visitors.col_selfie")}
                              >
                                <img
                                  src={photo}
                                  alt=""
                                  className="h-10 w-10 rounded-md object-cover ring-1 ring-border"
                                />
                              </button>
                            );
                          })()}
                          <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug" title={name}>
                            <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
                              <span className="truncate">{name}</span>
                              {(row.duplicate_accounts ?? 1) > 1 ? (
                                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                  {t("visitors.duplicate_accounts", { count: row.duplicate_accounts })}
                                </span>
                              ) : null}
                            </span>
                          </p>
                          {pseudo !== "—" ? (
                            <p className="truncate text-xs text-muted-foreground" title={pseudo}>@{pseudo}</p>
                          ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title={t("visitors.col_name")}
                            onClick={goDetail}
                            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            title={t("visitors.delete")}
                            onClick={() => setDeleteConfirmRow(row)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                        <dt className="text-xs text-muted-foreground">{t("visitors.col_email")}</dt>
                        <dd className="min-w-0 truncate" title={row.email || ""}>{row.email || "—"}</dd>
                        <dt className="text-xs text-muted-foreground">{t("visitors.col_expo")}</dt>
                        <dd className="min-w-0 truncate" title={expo}>{expo}</dd>
                        <dt className="text-xs text-muted-foreground">{t("visitors.col_registration")}</dt>
                        <dd className="text-xs sm:text-sm">{formatDate(row.created_at)}</dd>
                      </dl>
                    </div>
                  );
                })}
                {sortedRows.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">{t("visitors.none")}</p>
                )}
              </div>

              <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full min-w-[52rem] table-fixed text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="w-8 px-1 py-1" />
                  <th className="w-12 px-1 py-1 text-center">{t("visitors.col_selfie")}</th>
                  <th className="w-44 px-2 py-1">{t("visitors.col_name")} <SortButtons column="name" /></th>
                  <th className="w-36 px-2 py-1">{t("visitors.col_pseudo")} <SortButtons column="pseudo" /></th>
                  <th className="w-52 px-2 py-1">{t("visitors.col_email")} <SortButtons column="email" /></th>
                  <th className="w-36 px-2 py-1">{t("visitors.col_expo")} <SortButtons column="expo" /></th>
                  <th className="w-64 px-2 py-1 text-center">
                    {t("visitors.col_registration")} <SortButtons column="created_at" />
                  </th>
                  <th className="w-8 px-1 py-1" />
                </tr>
                <tr className="border-b bg-muted/20">
                  <td className="px-1 py-1" />
                  <td className="px-1 py-1" />
                  <td className="px-2 py-1">
                    <Input
                      type="text"
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      placeholder={t("visitors.filter_placeholder")}
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="text"
                      value={filterPseudo}
                      onChange={(e) => setFilterPseudo(e.target.value)}
                      placeholder={t("visitors.filter_placeholder")}
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
                      <option value="">{t("visitors.all_f")}</option>
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
                        title={t("visitors.date_from")}
                        className={DATE_FILTER_INPUT_CLASS}
                      />
                      <Input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        onClick={openDatePickerOnClick}
                        title={t("visitors.date_to")}
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
                  const photo  = visitorSelfieUrl(row);
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
                      <td className="px-1 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        {photo ? (
                          <button
                            type="button"
                            className="inline-flex rounded-md p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setPhotoPreview({ url: photo, label: name })}
                            aria-label={t("visitors.col_selfie")}
                          >
                            <img
                              src={photo}
                              alt=""
                              className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
                            />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1 truncate" title={name}>
                        <span className="inline-flex max-w-full items-center gap-1.5">
                          <span className="truncate">{name}</span>
                          {(row.duplicate_accounts ?? 1) > 1 ? (
                            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              {t("visitors.duplicate_accounts", { count: row.duplicate_accounts })}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2 py-1 truncate" title={pseudo}>{pseudo}</td>
                      <td className="px-2 py-1 truncate" title={row.email || ""}>{row.email || "—"}</td>
                      <td className="px-2 py-1 truncate" title={expo}>{expo}</td>
                      <td className="w-64 px-2 py-1 whitespace-nowrap">{formatDate(row.created_at)}</td>
                      {/* Supprimer — droite */}
                      <td className="px-1 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title={t("visitors.delete")}
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
                    <td colSpan={8} className="px-2 py-2 text-muted-foreground">
                      {t("visitors.none")}
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

      <AlertDialog
        open={Boolean(deleteConfirmRow)}
        onOpenChange={(open) => !open && setDeleteConfirmRow(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("visitors.delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <Trans
                    i18nKey="visitors.delete_intro"
                    ns="expos"
                    values={{
                      name: deleteConfirmRow
                        ? `${deleteConfirmRow.first_name || ""} ${deleteConfirmRow.last_name || ""}`.trim()
                          || deleteConfirmRow.pseudo?.trim()
                          || t("visitors.this_visitor")
                        : t("visitors.this_visitor"),
                    }}
                    components={{ name: <span className="font-medium text-foreground" /> }}
                  />
                </p>
                <p className="font-semibold text-destructive">
                  {t("visitors.delete_not_permanent")}
                </p>
                <p>
                  <Trans
                    i18nKey={canRestore ? "visitors.delete_moved_self" : "visitors.delete_moved_admin"}
                    ns="expos"
                    components={{
                      link: (
                        <Link
                          to="/visiteurs-corbeille"
                          className="font-medium text-foreground underline underline-offset-2"
                        />
                      ),
                    }}
                  />
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("visitors.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteConfirmRow) return;
                void softDelete(deleteConfirmRow);
                setDeleteConfirmRow(null);
              }}
            >
              {t("visitors.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(photoPreview)} onOpenChange={(open) => !open && setPhotoPreview(null)}>
        <DialogContent
          hideCloseButton={false}
          className="w-[calc(100vw-2rem)] max-w-lg gap-3 overflow-hidden border-border bg-background p-3 sm:p-4"
        >
          <DialogTitle className="text-sm font-medium">
            {photoPreview?.label || t("visitors.col_selfie")}
          </DialogTitle>
          <div className="flex max-h-[min(75dvh,640px)] items-center justify-center overflow-hidden rounded-lg bg-muted/40">
            {photoPreview ? (
              <img
                src={photoPreview.url}
                alt={photoPreview.label}
                className="max-h-[min(75dvh,640px)] max-w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
