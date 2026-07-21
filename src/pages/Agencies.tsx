import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, GalleryVerticalEnd, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AgencyFormDialog } from "@/components/AgencyFormDialog";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { supabase } from "@/lib/supabase";
import { hasFullDataAccess } from "@/lib/authUser";
import { sortAgencyFieldKeys } from "@/lib/agencyFormUtils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useDataScope } from "@/hooks/useDataScope";
import { useTranslation } from "react-i18next";
import { formatExpoDatesLabel } from "@/lib/expoDates";
import { cn } from "@/lib/utils";
import {
  EXPO_TIMING_CATEGORY_ORDER,
  groupExposByTimingCategory,
  type ExpoTimingCategory,
} from "@/lib/expoTimingStatus";

type AgencyRow = {
  id: string;
  name_agency?: string | null;
  logo_agency?: string | null;
  commercial_notes?: string | null;
  deleted_at?: string | null;
};

type ExpoBrief = {
  id: string;
  expo_name?: string | null;
  agency_id?: string | null;
  date_expo_du?: string | null;
  date_expo_au?: string | null;
};

function agencyLabel(row: AgencyRow): string {
  return row.name_agency?.trim() || "Sans nom";
}

/** Logo agence (`logo_agency` dans la table `agencies`) avec repli si URL absente ou image invalide. */
function AgencyLogoThumb({ logoUrl, title }: { logoUrl: string | null | undefined; title: string }) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl?.trim() || "";
  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40"
      title={title}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={title}
          className="h-full w-full object-contain p-1.5"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Building2 className="h-12 w-12 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

function AgencyExpoList({ expos }: { expos: ExpoBrief[] }) {
  const { t, i18n } = useTranslation("agencies");
  const grouped = useMemo(() => groupExposByTimingCategory(expos), [expos]);
  const hasAny = EXPO_TIMING_CATEGORY_ORDER.some((cat) => grouped[cat].length > 0);
  if (!hasAny) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("expos.none")}</p>;
  }

  const labelKey: Record<ExpoTimingCategory, string> = {
    upcoming: "expos.upcoming",
    ongoing: "expos.ongoing",
    finished: "expos.finished",
    permanent: "expos.permanent",
  };

  const badgeClass: Record<ExpoTimingCategory, string> = {
    upcoming: "border-sky-300 bg-sky-50 text-sky-700",
    ongoing: "border-emerald-300 bg-emerald-50 text-emerald-700",
    finished: "border-gray-300 bg-gray-100 text-gray-600",
    permanent: "border-violet-300 bg-violet-50 text-violet-700",
  };

  return (
    <ul className="mt-2 flex w-full min-w-0 flex-col gap-2 text-sm pointer-events-auto md:grid md:grid-cols-[max-content_minmax(0,1fr)_2rem_max-content] md:items-center md:gap-x-3 md:gap-y-1">
      {EXPO_TIMING_CATEGORY_ORDER.flatMap((cat) =>
        grouped[cat].map((ex) => {
          const expoTitle = ex.expo_name?.trim() || ex.id;
          return (
          <li
            key={ex.id}
            className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/40 p-2 md:contents md:rounded-none md:border-0 md:p-0"
          >
            <span
              className={cn(
                "inline-flex w-fit max-w-full items-center justify-start rounded-full border px-3 py-0.5 text-left text-[11px] font-medium",
                badgeClass[cat],
              )}
            >
              {t(labelKey[cat])}
            </span>
            <Link
              to={`/expos?expo=${encodeURIComponent(ex.id)}`}
              className="block min-w-0 w-full truncate text-primary underline-offset-2 hover:underline md:w-auto md:max-w-none"
              title={expoTitle}
              onClick={(e) => e.stopPropagation()}
            >
              {expoTitle}
            </Link>
            <div className="flex min-w-0 items-center justify-between gap-2 md:contents">
            <Link
              to={`/catalogue?expo=${encodeURIComponent(ex.id)}`}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10 md:justify-self-center"
              title={t("page.viewCatalogue")}
              aria-label={t("page.viewCatalogue")}
              onClick={(e) => e.stopPropagation()}
            >
              <GalleryVerticalEnd className="h-4 w-4" aria-hidden />
            </Link>
            <span className="text-xs text-muted-foreground md:text-right">
              {formatExpoDatesLabel(ex.date_expo_du, ex.date_expo_au, i18n.language, t, {
                range: "expos.dateRange",
                permanent: "expos.permanentExpo",
              })}
            </span>
            </div>
          </li>
          );
        }),
      )}
    </ul>
  );
}

const Agencies = () => {
  const { t } = useTranslation("agencies");
  const [searchParams] = useSearchParams();
  const agencyPopupId = searchParams.get("agency")?.trim() || "";
  const [rows, setRows] = useState<AgencyRow[]>([]);
  const [exposByAgencyId, setExposByAgencyId] = useState<Record<string, ExpoBrief[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agencyFieldKeys, setAgencyFieldKeys] = useState<string[]>(["id", "name_agency", "logo_agency"]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const popupOpenedRef = useRef(false);
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, agency_id: userAgencyId, expo_id: userExpoId, role_name } = useAuthUser();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase.from("agencies").select("*").limit(1);
      if (cancelled) return;
      if (qErr || !data?.length) {
        setAgencyFieldKeys(sortAgencyFieldKeys(["id", "name_agency", "logo_agency"]));
        return;
      }
      const row = data[0] as Record<string, unknown>;
      setAgencyFieldKeys(sortAgencyFieldKeys(Object.keys(row)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const applyScope = async (query: any) => {
      let scoped = query as any;
      if (role_id === 4 && userAgencyId) {
        scoped = scoped.eq("id", userAgencyId);
      } else if (scope.mode === "agency" && scope.agencyId) {
        scoped = scoped.eq("id", scope.agencyId);
      } else if ((role_id === 5 || role_id === 6) && userAgencyId) {
        scoped = scoped.eq("id", userAgencyId);
      } else if (scope.mode === "expo" && scope.expoId) {
        const { data: expoRow } = await supabase
          .from("expos")
          .select("agency_id")
          .eq("id", scope.expoId)
          .maybeSingle();
        const aid = (expoRow as { agency_id?: string | null } | null)?.agency_id?.trim() || "";
        if (aid) scoped = scoped.eq("id", aid);
      }
      return scoped;
    };
    const base = supabase
      .from("agencies")
      .select("id, name_agency, logo_agency, commercial_notes")
      .is("deleted_at", null)
      .order("name_agency", { ascending: true, nullsFirst: false });
    const { data, error: qErr } = await applyScope(base);
    if (qErr) {
      setError(qErr.message);
      setRows([]);
      setExposByAgencyId({});
    } else {
      const agencyList = ((data as AgencyRow[] | null) ?? []).filter((r) => r.id);
      setRows(agencyList);

      const applyExpoScope = (query: ReturnType<typeof supabase.from>) => {
        let scoped = query as ReturnType<typeof supabase.from>;
        if ((role_id === 5 || role_id === 6) && userExpoId) {
          scoped = scoped.eq("id", userExpoId);
        } else if (scope.mode === "expo" && scope.expoId) {
          scoped = scoped.eq("id", scope.expoId);
        } else if (role_id === 4 && userAgencyId) {
          scoped = scoped.eq("agency_id", userAgencyId);
        } else if (scope.mode === "agency" && scope.agencyId) {
          scoped = scoped.eq("agency_id", scope.agencyId);
        }
        return scoped;
      };

      const expoBase = applyExpoScope(
        supabase
          .from("expos")
          .select("id, expo_name, agency_id, date_expo_du, date_expo_au")
          .is("deleted_at", null)
          .order("expo_name", { ascending: true, nullsFirst: false }),
      );
      const { data: expoData, error: expoErr } = await expoBase;
      if (expoErr) {
        setExposByAgencyId({});
      } else {
        const byAgency: Record<string, ExpoBrief[]> = {};
        for (const ex of ((expoData as ExpoBrief[] | null) ?? []).filter((r) => r.id)) {
          const aid = ex.agency_id?.trim();
          if (!aid) continue;
          if (!byAgency[aid]) byAgency[aid] = [];
          byAgency[aid].push(ex);
        }
        setExposByAgencyId(byAgency);
      }
    }
    setLoading(false);
  }, [role_id, userAgencyId, userExpoId, scope.mode, scope.agencyId, scope.expoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showScopeHint = !authLoading && scope.mode === "none";
  const sorted = useMemo(() => [...rows].sort((a, b) => agencyLabel(a).localeCompare(agencyLabel(b), "fr")), [rows]);
  const searchSuggestions = useMemo(
    () => [...new Set(sorted.map((ag) => agencyLabel(ag).trim()).filter(Boolean))],
    [sorted],
  );
  const filteredAgencies = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((ag) => agencyLabel(ag).toLowerCase().includes(q));
  }, [sorted, searchTerm]);

  const canCreateAgency =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) || hasFullDataAccess(role_name);
  const canOpenAgencyTrash =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 4) || hasFullDataAccess(role_name);

  const canEditCommercialTerms =
    typeof role_id === "number" && role_id >= 1 && role_id <= 3;

  const canEditAgency = (agId: string) => {
    if ((typeof role_id === "number" && role_id >= 1 && role_id <= 3) || hasFullDataAccess(role_name)) return true;
    if (userAgencyId && userAgencyId === agId && (role_id === 4 || role_id === 5 || role_id === 6)) return true;
    return false;
  };

  const openCreate = () => {
    setFormMode("create");
    setEditingAgencyId(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    setFormMode("edit");
    setEditingAgencyId(id);
    setFormOpen(true);
  };

  useEffect(() => {
    if (!agencyPopupId || popupOpenedRef.current) return;
    if (loading) return;
    const existsInList = rows.some((r) => r.id === agencyPopupId);
    if (!existsInList) return;
    if (!canEditAgency(agencyPopupId)) return;
    popupOpenedRef.current = true;
    openEdit(agencyPopupId);
  }, [agencyPopupId, rows, loading]);

  return (
    <div className="container min-w-0 max-w-full py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4 md:max-w-[min(100%,42rem)] shrink-0">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">{t("page.title")}</h2>
          {!authLoading && scope.mode === "agency" && (
            <p className="text-xs text-muted-foreground mt-1">{t("page.scopeAgency", { agencyId: scope.agencyId })}</p>
          )}
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground mt-1">{t("page.scopeExpo", { expoId: scope.expoId })}</p>
          )}
        </div>
        <div className="relative w-full max-w-[210px]">
          <Input
            type="text"
            list="agencies-search-suggestions"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("page.search")}
            className="h-9 w-full bg-white pr-9"
          />
          {searchTerm.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={t("page.clearSearch")}
              title={t("page.clear")}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <datalist id="agencies-search-suggestions">
            {searchSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
        </div>
        <BackofficeStickyAgencyLogoSlot />
        {(canCreateAgency || canOpenAgencyTrash) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              className="gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              {t("page.create")}
            </Button>
            <Button type="button" variant="outline" className="backoffice-toolbar-outline-btn gap-2" asChild>
              <Link to="/agencies/agencies2">{t("page.tableau")}</Link>
            </Button>
          </div>
        )}
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>{t("page.scopeTitle")}</AlertTitle>
          <AlertDescription>{t("page.scopeDesc")}</AlertDescription>
        </Alert>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground text-center py-12">{t("page.loading")}</p>}
        {!loading && !error && filteredAgencies.length === 0 && !showScopeHint && (
          <p className="text-sm text-muted-foreground text-center py-12">{t("page.empty")}</p>
        )}
        {filteredAgencies.map((ag) => {
          const editable = canEditAgency(ag.id);
          return (
            <Card key={ag.id} className="glass-card hover:shadow-lg transition-all duration-300 overflow-hidden">
              <CardContent className="relative p-0 flex flex-col md:flex-row items-stretch">
                <div
                  className={`flex flex-1 min-w-0 flex-row items-start gap-3 p-4 border-b md:border-b-0 md:border-r border-border/60 transition-colors ${
                    editable ? "cursor-pointer hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : ""
                  }`}
                  role={editable ? "button" : undefined}
                  tabIndex={editable ? 0 : undefined}
                  onClick={() => editable && openEdit(ag.id)}
                  onKeyDown={(e) => {
                    if (!editable) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEdit(ag.id);
                    }
                  }}
                >
                  <div className="pointer-events-none">
                    <AgencyLogoThumb logoUrl={ag.logo_agency} title={ag.name_agency?.trim() || t("page.noName")} />
                  </div>
                  <div className="flex-1 min-w-0 pointer-events-none">
                    <h3 className="font-serif font-bold text-lg">{ag.name_agency?.trim() || t("page.noName")}</h3>
                    {ag.commercial_notes?.trim() ? (
                      <p className="mt-1 text-sm italic text-[#E63946]">{ag.commercial_notes.trim()}</p>
                    ) : null}
                    <AgencyExpoList expos={exposByAgencyId[ag.id] ?? []} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-4 w-full md:w-auto shrink-0 md:max-w-[min(100%,22rem)] bg-muted/20 md:bg-transparent">
                  <Button type="button" variant="outline" size="sm" className="w-full justify-center" asChild>
                    <Link to={`/expos?agency=${encodeURIComponent(ag.id)}`}>{t("page.viewExpos")}</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-center" asChild>
                    <Link to="/catalogue">{t("page.viewCatalogue")}</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-center" asChild>
                    <Link
                      to={`/user/utilisateurs?scope=equipe&agency_id=${encodeURIComponent(ag.id)}`}
                    >
                      {t("page.viewMembers")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AgencyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        agencyId={formMode === "edit" ? editingAgencyId : null}
        fieldKeys={agencyFieldKeys}
        canEditCommercialTerms={canEditCommercialTerms}
        onSuccess={() => void load()}
      />
    </div>
  );
};

export default Agencies;
