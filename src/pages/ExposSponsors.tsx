import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Building2, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { SponsorDialog, type Sponsor } from "@/components/SponsorDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";

type SponsorRow = {
  id: string;
  id_expo: string;
  nom_expo: string | null;
  nom_sponsor: string;
  contact_sponsor: string | null;
  mail_sponsor: string | null;
  tel_sponsor: string | null;
  city_sponsor: string | null;
  url_logo_sponsor: string | null;
  amount: number | null;
  currency: string;
};

type ExpoOption = {
  id: string;
  expo_name: string | null;
  agency_id: string | null;
};

type AgencyOption = {
  id: string;
  name_agency: string | null;
};

function sponsorToRow(s: Sponsor): SponsorRow {
  return {
    id: s.id,
    id_expo: s.id_expo,
    nom_expo: s.nom_expo,
    nom_sponsor: s.nom_sponsor,
    contact_sponsor: s.contact_sponsor,
    mail_sponsor: s.mail_sponsor,
    tel_sponsor: s.tel_sponsor,
    city_sponsor: s.city_sponsor,
    url_logo_sponsor: s.url_logo_sponsor,
    amount: s.amount,
    currency: s.currency,
  };
}

function sortSponsorRows(rows: SponsorRow[]): SponsorRow[] {
  return [...rows].sort((a, b) => a.nom_sponsor.localeCompare(b.nom_sponsor, "fr"));
}

export default function ExposSponsors() {
  const { t } = useTranslation("sponsors");
  const { loading: authLoading, role_id, agency_id: userAgencyId, expo_id: userExpoId } = useAuthUser();
  const canAccess = typeof role_id === "number" && role_id >= 1 && role_id <= 6;
  const canPickAgency = typeof role_id === "number" && role_id < 4;

  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [expos, setExpos] = useState<ExpoOption[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgSearchTerm, setOrgSearchTerm] = useState("");
  const [expoSearchTerm, setExpoSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogOpenInForm, setDialogOpenInForm] = useState(false);
  const [dialogExpo, setDialogExpo] = useState<{ id: string; name: string } | null>(null);
  const [dialogSponsorId, setDialogSponsorId] = useState<string | null>(null);

  const agencyNameById = useMemo(
    () => new Map(agencies.map((a) => [a.id, a.name_agency?.trim() || a.id])),
    [agencies],
  );

  const loadAgencies = useCallback(async () => {
    if (!canPickAgency) return;
    const { data, error } = await supabase
      .from("agencies")
      .select("id, name_agency")
      .is("deleted_at", null)
      .order("name_agency", { ascending: true });
    if (error) {
      toast.error(error.message);
      setAgencies([]);
      return;
    }
    setAgencies((data as AgencyOption[] | null) ?? []);
  }, [canPickAgency]);

  const loadExpos = useCallback(async () => {
    let query = supabase
      .from("expos")
      .select("id, expo_name, agency_id")
      .is("deleted_at", null)
      .order("expo_name", { ascending: true });

    if ((role_id === 5 || role_id === 6) && userExpoId?.trim()) {
      query = query.eq("id", userExpoId.trim());
    } else if (role_id === 4 && userAgencyId?.trim()) {
      query = query.eq("agency_id", userAgencyId.trim());
    }

    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      setExpos([]);
      return;
    }
    setExpos((data as ExpoOption[] | null) ?? []);
  }, [role_id, userAgencyId, userExpoId]);

  const scopedExpos = useMemo(() => {
    const orgQ = orgSearchTerm.trim().toLowerCase();
    let list = expos;
    if (canPickAgency && orgQ) {
      list = list.filter((ex) => {
        const agencyLabel = ex.agency_id ? (agencyNameById.get(ex.agency_id) ?? ex.agency_id) : "";
        return agencyLabel.toLowerCase().includes(orgQ);
      });
    }
    const expoQ = expoSearchTerm.trim().toLowerCase();
    if (expoQ) {
      list = list.filter((ex) => (ex.expo_name ?? ex.id).toLowerCase().includes(expoQ));
    }
    return list;
  }, [expos, orgSearchTerm, expoSearchTerm, canPickAgency, agencyNameById]);

  const mergeSponsorsFromDialog = useCallback(
    (scopeExpoId: string | null, dialogSponsors: Sponsor[]) => {
      const expoIds = new Set(scopedExpos.map((e) => e.id));
      setSponsors((prev) => {
        if (scopeExpoId) {
          const others = prev.filter((s) => s.id_expo !== scopeExpoId);
          const incoming = dialogSponsors
            .filter((s) => expoIds.has(s.id_expo))
            .map(sponsorToRow);
          return sortSponsorRows([...others, ...incoming]);
        }
        const scoped = dialogSponsors.filter((s) => expoIds.has(s.id_expo)).map(sponsorToRow);
        return sortSponsorRows(scoped);
      });
      setLoading(false);
    },
    [scopedExpos],
  );

  const loadSponsors = useCallback(async () => {
    const expoIds = scopedExpos.map((e) => e.id).filter(Boolean);
    if (expoIds.length === 0) {
      setSponsors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("sponsors")
      .select("id, id_expo, nom_expo, nom_sponsor, contact_sponsor, mail_sponsor, tel_sponsor, city_sponsor, url_logo_sponsor, amount, currency")
      .in("id_expo", expoIds)
      .order("nom_sponsor", { ascending: true });
    if (error) {
      toast.error(error.message);
      setSponsors([]);
    } else {
      setSponsors((data as SponsorRow[] | null) ?? []);
    }
    setLoading(false);
  }, [scopedExpos]);

  useEffect(() => {
    if (!canAccess) return;
    void loadAgencies();
    void loadExpos();
  }, [canAccess, loadAgencies, loadExpos]);

  useEffect(() => {
    if (!canAccess) return;
    void loadSponsors();
  }, [canAccess, loadSponsors]);

  const orgSuggestions = useMemo(
    () => [...new Set(agencies.map((a) => a.name_agency?.trim()).filter(Boolean) as string[])],
    [agencies],
  );

  const expoSuggestions = useMemo(() => {
    const orgQ = orgSearchTerm.trim().toLowerCase();
    const base = canPickAgency && orgQ
      ? expos.filter((ex) => {
          const agencyLabel = ex.agency_id ? (agencyNameById.get(ex.agency_id) ?? ex.agency_id) : "";
          return agencyLabel.toLowerCase().includes(orgQ);
        })
      : expos;
    return [...new Set(base.map((ex) => (ex.expo_name ?? ex.id).trim()).filter(Boolean))];
  }, [expos, orgSearchTerm, canPickAgency, agencyNameById]);

  const selectedExpo = useMemo(() => {
    const q = expoSearchTerm.trim().toLowerCase();
    if (!q) return null;
    const exact = scopedExpos.find((ex) => (ex.expo_name ?? ex.id).toLowerCase() === q);
    if (exact) return exact;
    return scopedExpos.length === 1 ? scopedExpos[0] : null;
  }, [expoSearchTerm, scopedExpos]);

  const openSponsor = (sponsor: SponsorRow) => {
    const expo = expos.find((e) => e.id === sponsor.id_expo);
    setDialogExpo({
      id: sponsor.id_expo,
      name: sponsor.nom_expo?.trim() || expo?.expo_name?.trim() || sponsor.id_expo,
    });
    setDialogSponsorId(sponsor.id);
    setDialogOpenInForm(false);
    setDialogOpen(true);
  };

  const resolveExpoForAdd = () => {
    if (selectedExpo) return selectedExpo;
    if (scopedExpos.length === 1) return scopedExpos[0];
    return null;
  };

  const openAddSponsor = () => {
    const expo = resolveExpoForAdd();
    if (!expo) {
      toast.error(t("page.pickExpoFirst"));
      return;
    }
    setDialogExpo({
      id: expo.id,
      name: expo.expo_name?.trim() || expo.id,
    });
    setDialogSponsorId(null);
    setDialogOpenInForm(true);
    setDialogOpen(true);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <div className="container py-8 space-y-6">
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">{t("page.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" asChild>
          <Link to="/expos">
            <ArrowLeft className="h-4 w-4" />
            {t("page.back")}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
        {canPickAgency && (
          <div className="relative w-[240px] min-w-[240px] max-w-[240px]">
            <Input
              type="text"
              list="sponsors-org-suggestions"
              value={orgSearchTerm}
              onChange={(e) => setOrgSearchTerm(e.target.value)}
              placeholder={t("page.searchOrg")}
              className="h-9 bg-white pr-9"
            />
            {orgSearchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setOrgSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("page.clearSearchOrg")}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <datalist id="sponsors-org-suggestions">
              {orgSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        )}
        <div className="relative w-[240px] min-w-[240px] max-w-[240px]">
          <Input
            type="text"
            list="sponsors-expo-suggestions"
            value={expoSearchTerm}
            onChange={(e) => setExpoSearchTerm(e.target.value)}
            placeholder={t("page.searchExpo")}
            className="h-9 bg-white pr-9"
          />
          {expoSearchTerm.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setExpoSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={t("page.clearSearchExpo")}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <datalist id="sponsors-expo-suggestions">
            {expoSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
        </div>
        <Button
          type="button"
          className="gap-2 shrink-0 gradient-gold gradient-gold-hover-bg text-primary-foreground"
          onClick={openAddSponsor}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("page.addSponsor")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {t("page.count", { count: sponsors.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sponsors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("page.empty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sponsors.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  {s.url_logo_sponsor ? (
                    <img
                      key={`${s.id}-${s.url_logo_sponsor}`}
                      src={s.url_logo_sponsor}
                      alt={s.nom_sponsor}
                      className="h-10 w-16 shrink-0 object-contain"
                    />
                  ) : (
                    <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.nom_sponsor}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        s.nom_expo,
                        s.city_sponsor,
                        s.amount != null
                          ? `${Number(s.amount).toLocaleString("fr-FR")} ${s.currency}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title={t("list.editTitle")}
                    onClick={() => openSponsor(s)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SponsorDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setDialogSponsorId(null);
            setDialogOpenInForm(false);
          }
        }}
        expoId={dialogExpo?.id ?? null}
        expoName={dialogExpo?.name ?? ""}
        initialSponsorId={dialogSponsorId}
        openInForm={dialogOpenInForm}
        onSponsorsChange={(_logos, scopeExpoId, dialogSponsors) => {
          mergeSponsorsFromDialog(scopeExpoId, dialogSponsors);
        }}
      />
    </div>
  );
}
