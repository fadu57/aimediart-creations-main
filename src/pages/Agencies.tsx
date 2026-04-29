import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AgencyFormDialog } from "@/components/AgencyFormDialog";
import { supabase } from "@/lib/supabase";
import { hasFullDataAccess } from "@/lib/authUser";
import { sortAgencyFieldKeys } from "@/lib/agencyFormUtils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useDataScope } from "@/hooks/useDataScope";
import { useUiLanguage } from "@/providers/UiLanguageProvider";

type AgencyRow = {
  id: string;
  name_agency?: string | null;
  logo_agency?: string | null;
  agency_deleted_at?: string | null;
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
          alt=""
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

const Agencies = () => {
  const { t } = useUiLanguage();
  const [searchParams] = useSearchParams();
  const agencyPopupId = searchParams.get("agency")?.trim() || "";
  const [rows, setRows] = useState<AgencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agencyFieldKeys, setAgencyFieldKeys] = useState<string[]>(["id", "name_agency", "logo_agency"]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const popupOpenedRef = useRef(false);
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, agency_id: userAgencyId, role_name } = useAuthUser();

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
      .select("id, name_agency, logo_agency")
      .order("name_agency", { ascending: true, nullsFirst: false });
    const { data, error: qErr } = await applyScope(base);
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows(((data as AgencyRow[] | null) ?? []).filter((r) => r.id));
    }
    setLoading(false);
  }, [role_id, userAgencyId, scope.mode, scope.agencyId, scope.expoId]);

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
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">{t("Organisation")}</h2>
          {!authLoading && scope.mode === "agency" && (
            <p className="text-xs text-muted-foreground mt-1">Périmètre agence {scope.agencyId}.</p>
          )}
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground mt-1">Agence liée à l’exposition {scope.expoId}.</p>
          )}
        </div>
        <div className="relative w-[210px] min-w-[210px] max-w-[210px] md:mr-auto">
          <Input
            type="text"
            list="agencies-search-suggestions"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("Rechercher une organisation...")}
            className="h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white pr-9"
          />
          {searchTerm.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={t("Effacer la recherche")}
              title={t("Effacer")}
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
        {(canCreateAgency || canOpenAgencyTrash) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              className="gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              {t("Nouvelle organisation")}
            </Button>
            <Button type="button" variant="outline" className="gap-2" asChild>
              <Link to="/agencies/agencies2">Tableau</Link>
            </Button>
          </div>
        )}
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>{t("Périmètre vide")}</AlertTitle>
          <AlertDescription>
            {t("Renseignez les identifiants agence / exposition attendus pour votre rôle.")}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground text-center py-12">{t("Chargement des agences…")}</p>}
        {!loading && !error && filteredAgencies.length === 0 && !showScopeHint && (
          <p className="text-sm text-muted-foreground text-center py-12">{t("Aucune agence dans votre périmètre.")}</p>
        )}
        {filteredAgencies.map((ag) => {
          const editable = canEditAgency(ag.id);
          return (
            <Card key={ag.id} className="glass-card hover:shadow-lg transition-all duration-300 overflow-hidden">
              <CardContent className="relative p-0 flex flex-col md:flex-row items-stretch">
                <div
                  className={`flex flex-1 flex-col sm:flex-row items-start gap-4 p-4 min-w-0 border-b md:border-b-0 md:border-r border-border/60 transition-colors ${
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
                    <AgencyLogoThumb logoUrl={ag.logo_agency} title={agencyLabel(ag)} />
                  </div>
                  <div className="flex-1 min-w-0 pointer-events-none">
                    <h3 className="font-serif font-bold text-lg">{agencyLabel(ag)}</h3>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 p-4 w-full md:w-auto md:items-center shrink-0 md:max-w-[min(100%,22rem)] bg-muted/20 md:bg-transparent">
                  <Button type="button" variant="outline" size="sm" className="w-full sm:w-44 justify-center" asChild>
                    <Link to={`/expos?agency=${encodeURIComponent(ag.id)}`}>{t("Voir les expos")}</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="w-full sm:w-44 justify-center" asChild>
                    <Link to="/catalogue">{t("Catalogue des œuvres")}</Link>
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
        onSuccess={() => void load()}
      />
    </div>
  );
};

export default Agencies;
