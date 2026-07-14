import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, BookOpen, Images, Plus, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ExpoFormDialog } from "@/components/ExpoFormDialog";
import { ExpoTravelDiaryPickerDialog } from "@/components/backoffice/ExpoTravelDiaryPickerDialog";
import { SponsorDialog, type SponsorLogoEntry } from "@/components/SponsorDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { hasFullDataAccess } from "@/lib/authUser";
import { sortExpoFieldKeys } from "@/lib/expoFormUtils";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useOrganisationPlanLimits } from "@/hooks/useOrganisationPlanLimits";
import { useDataScope } from "@/hooks/useDataScope";
import { ETINCELLE_UI } from "@/lib/organisation/planLimits";
import { createAimediaHeaderLogoBlockPng } from "@/lib/pdfHeaderLogoBlock";
import { expoLogoRawFromRow, resolveExpoLogoImgSrc } from "@/lib/expoLogo";
import { sanitizeTranslationOutput } from "@/lib/sanitizeTranslationOutput";
import { useTranslation } from "react-i18next";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import { QR_CODE_STORAGE_OPTIONS, qrCodePrintOptions } from "@/lib/qrCodeScanFriendly";
import { formatExpoDatesLabel } from "@/lib/expoDates";
import { EntityCostLabel } from "@/components/EntityCostLabel";
import { getCostTotalsByExpoIds, resolveEntityCostDisplay } from "@/lib/costs";
import { getUsdToEurRate } from "@/lib/fxRates";

const EXPO_QR_CACHE_KEY = "aimediart-expo-qr-cache-v1";

/** Boutons barre d'outils /expos : libellés sur 2 lignes si besoin (responsive). */
const EXPO_TOOLBAR_BTN =
  "backoffice-toolbar-outline-btn h-auto min-h-10 w-full min-w-0 flex-wrap items-center justify-center whitespace-normal px-2 py-2 text-center text-[13px] leading-snug";
const EXPO_TOOLBAR_BTN_GOLD =
  "h-auto min-h-10 w-full min-w-0 flex-wrap items-center justify-center whitespace-normal gap-1.5 px-2 py-2 text-center text-[13px] leading-snug gradient-gold gradient-gold-hover-bg text-primary-foreground";
/** Boutons d'action sur chaque carte expo. */
const EXPO_CARD_BTN =
  "h-auto min-h-9 w-full min-w-0 flex-wrap items-center justify-center whitespace-normal px-2 py-2 text-center text-xs leading-snug sm:text-sm";

type ExpoRow = {
  id: string;
  expo_id?: string | null;
  expo_name?: string | null;
  agency_id?: string | null;
  curator_firstname?: string | null;
  curator_name?: string | null;
  date_expo_du?: string | null;
  date_expo_au?: string | null;
  /** URL publique du logo (schéma courant). */
  logo_expo?: string | null;
  /** Alias historique éventuel. */
  expo_logo?: string | null;
  deleted_at?: string | null;
  /** Description multilingue : texte brut ou JSON {"fr":"…","en":"…"}. */
  expo_descript_i18n?: string | Record<string, string> | null;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

import { openVisitorExpoPresentation } from "@/lib/visitorExpoPresentationUrl";
/** Extrait bucket + chemin objet depuis une URL publique Supabase Storage. */
function parseSupabasePublicStorageUrl(
  fullUrl: string,
): { bucket: string; path: string } | null {
  try {
    const u = new URL(fullUrl);
    const m = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/** Logo exposition : affichage avec repli URL signée si le bucket est privé. */
function ExpoLogoThumb({ logoUrl, title, fallbackIcon }: { logoUrl: string | null; title: string; fallbackIcon: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const [displaySrc, setDisplaySrc] = useState("");
  const triedSignedRef = useRef(false);

  useEffect(() => {
    triedSignedRef.current = false;
    setFailed(false);
    const raw = logoUrl?.trim() || "";
    setDisplaySrc(raw ? resolveExpoLogoImgSrc(raw) : "");
  }, [logoUrl]);

  const handleImgError = useCallback(() => {
    if (!displaySrc || triedSignedRef.current) {
      setFailed(true);
      return;
    }
    triedSignedRef.current = true;
    const parsed = parseSupabasePublicStorageUrl(displaySrc);
    if (!parsed) {
      setFailed(true);
      return;
    }
    void (async () => {
      const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600);
      if (error || !data?.signedUrl) {
        setFailed(true);
        return;
      }
      setDisplaySrc(data.signedUrl);
    })();
  }, [displaySrc]);

  const showImg = Boolean(displaySrc) && !failed;

  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-4 border-[rgba(212,146,39,0.7)] bg-[rgba(255,255,255,0.4)] shadow-none backdrop-blur-[12px]"
      title={title}
    >
      {showImg ? (
        <ImageWithSkeleton
          src={displaySrc}
          alt=""
          wrapperClassName="h-full w-full"
          className="h-full w-full object-contain border border-black p-1.5 shadow-[0_4px_12px_0_rgba(0,0,0,0.15)]"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleImgError}
        />
      ) : (
        fallbackIcon
      )}
    </div>
  );
}

/** Carousel compact de logos sponsors (auto-rotation si plusieurs). */
function SponsorCarousel({ logos }: { logos: string[] }) {
  const [idx, setIdx] = useState(0);
  // Reset idx when the logos array changes (new fetch, different expo)
  useEffect(() => { setIdx(0); }, [logos]);
  useEffect(() => {
    if (logos.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % logos.length), 2500);
    return () => clearInterval(t);
  }, [logos]);
  const src = logos[idx];
  if (!src) return null;
  return (
    <div className="pointer-events-none flex h-14 w-28 items-center justify-center overflow-hidden rounded border border-border/40 bg-white/5">
      <img
        key={src}
        src={src}
        alt=""
        className="max-h-12 max-w-[104px] object-contain"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function expoTitle(row: ExpoRow): string {
  return row.expo_name?.trim() || row.id;
}

function expoQrKeys(row: ExpoRow): string[] {
  const keys = [row.id, row.expo_id ?? ""].map((v) => (v ?? "").trim()).filter(Boolean);
  return [...new Set(keys)];
}

/**
 * Cherche une URL de QR code déjà sauvegardée dans les colonnes de la row expo
 * (générée et uploadée lors d'une session précédente dans Supabase Storage).
 */
function expoQrRawFromRow(row: Record<string, unknown>): string | null {
  const priority = ["qr_image_url", "qr_code_url", "qrcode_url", "qr_url", "expo_qr_url", "qr_code"];
  for (const k of priority) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const [key, val] of Object.entries(row)) {
    if (!/\bqr\b/i.test(key)) continue;
    if (typeof val !== "string" || !val.trim()) continue;
    const s = val.trim();
    if (s.startsWith("https://") || s.startsWith("data:image")) return s;
  }
  return null;
}

const Expos = () => {
  const { t, i18n } = useTranslation("expos");
  const [searchParams] = useSearchParams();
  const agencyFilter = searchParams.get("agency")?.trim() || "";
  const expoPopupId = searchParams.get("expo")?.trim() || "";

  const [rows, setRows] = useState<ExpoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expoFieldKeys, setExpoFieldKeys] = useState<string[]>(["id", "expo_name", "logo_expo"]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingExpoId, setEditingExpoId] = useState<string | null>(null);
  const [agencyNameById, setAgencyNameById] = useState<Record<string, string>>({});
  const [expoQrImages, setExpoQrImages] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(EXPO_QR_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  });
  const [generatingQrForExpoId, setGeneratingQrForExpoId] = useState<string | null>(null);
  const [qrConfirmExpoKey, setQrConfirmExpoKey] = useState<string | null>(null);
  const [panelFormatExpo, setPanelFormatExpo] = useState<ExpoRow | null>(null);
  const [sponsorExpo, setSponsorExpo] = useState<{ id: string; name: string } | null>(null);
  const [diaryPickerExpo, setDiaryPickerExpo] = useState<{ id: string; name: string } | null>(null);
  const [sponsorLogosByExpoId, setSponsorLogosByExpoId] = useState<Record<string, string[]>>({});
  const [visitorCountByExpoId, setVisitorCountByExpoId] = useState<Record<string, number>>({});
  const [artworkCountByExpoId, setArtworkCountByExpoId] = useState<Record<string, number>>({});
  const [costByExpoId, setCostByExpoId] = useState<Record<string, number>>({});
  const [costsReady, setCostsReady] = useState(false);
  const [usdToEurRate, setUsdToEurRate] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [orgSearchTerm, setOrgSearchTerm] = useState("");
  const [filteredArtworkCount, setFilteredArtworkCount] = useState<number | null>(null);
  const [descriptionPopup, setDescriptionPopup] = useState<{
    text: string;
    name: string;
    logo: string | null;
  } | null>(null);
  const popupOpenedRef = useRef(false);
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, agency_id: userAgencyId, expo_id: userExpoId, role_name, hasGlobalStaffRole } =
    useEffectiveAuth();
  const isGlobalCostViewer = typeof role_id === "number" && role_id >= 1 && role_id <= 3;
  const orgAgencyId =
    userAgencyId?.trim() ||
    (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId?.trim() : "") ||
    null;
  const { limits: orgPlanLimits } = useOrganisationPlanLimits(orgAgencyId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase.from("expos").select("*").limit(1);
      if (cancelled) return;
      if (qErr || !data?.length) {
        setExpoFieldKeys(sortExpoFieldKeys(["id", "expo_name", "logo_expo", "description"]));
        return;
      }
      const row = data[0] as Record<string, unknown>;
      setExpoFieldKeys(sortExpoFieldKeys(Object.keys(row)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const applyScope = (query: any) => {
      let scoped = query;
      if ((role_id === 5 || role_id === 6) && userExpoId) {
        scoped = scoped.eq("id", userExpoId);
      } else if (scope.mode === "expo" && scope.expoId) {
        scoped = scoped.eq("id", scope.expoId);
      }
      return scoped;
    };

    const query = applyScope(supabase.from("expos").select("*").is("deleted_at", null).order("id", { ascending: true }));
    const { data, error: qErr } = await query;
    if (qErr) {
      setError(qErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    let list = ((data as ExpoRow[] | null) ?? []).filter((r) => r.id);

    const filterAgency = agencyFilter || (role_id === 4 && userAgencyId ? userAgencyId : null);
    if (filterAgency) {
      list = list.filter((ex) => {
        const linked = ex.agency_id ?? null;
        return linked === filterAgency;
      });
    } else if (!agencyFilter && scope.mode === "agency" && scope.agencyId) {
      list = list.filter((ex) => {
        const linked = ex.agency_id ?? null;
        return linked === scope.agencyId;
      });
    }

    if (list.length === 0 && (filterAgency || (scope.mode === "agency" && scope.agencyId))) {
      const aid = filterAgency || scope.agencyId || "";
      if (aid) {
        const { data: awRows } = await supabase
          .from("artworks")
          .select("artwork_expo_id")
          .eq("artwork_agency_id", aid);
        const expoIds = [
          ...new Set(
            (((awRows as Array<{ artwork_expo_id?: string | null }> | null) ?? [])
              .map((r) => r.artwork_expo_id)
              .filter(Boolean) as string[]),
          ),
        ];
        if (expoIds.length) {
          const { data: exposByIds } = await supabase.from("expos").select("*").in("id", expoIds);
          list = ((exposByIds as ExpoRow[] | null) ?? []).filter((r) => r.id);
        }
      }
    }

    setRows(list);
    setLoading(false);
  }, [role_id, userAgencyId, userExpoId, scope.mode, scope.expoId, scope.agencyId, agencyFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isGlobalCostViewer || rows.length === 0) {
      setCostByExpoId({});
      setCostsReady(false);
      setUsdToEurRate(null);
      return;
    }
    let cancelled = false;
    setCostsReady(false);
    void Promise.all([getCostTotalsByExpoIds(rows.map((row) => row.id)), getUsdToEurRate()])
      .then(([totals, rate]) => {
        if (!cancelled) {
          setCostByExpoId(totals);
          setUsdToEurRate(rate);
          setCostsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCostByExpoId({});
          setUsdToEurRate(null);
          setCostsReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rows, isGlobalCostViewer]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPO_QR_CACHE_KEY, JSON.stringify(expoQrImages));
    } catch {
      // ignore localStorage write failures
    }
  }, [expoQrImages]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const agencyIds = [...new Set(rows.map((r) => r.agency_id?.trim()).filter(Boolean) as string[])];
      if (!agencyIds.length) {
        setAgencyNameById({});
        return;
      }
      const { data } = await supabase
        .from("agencies")
        .select("id, name_agency")
        .in("id", agencyIds);
      if (cancelled) return;
      const mapping: Record<string, string> = {};
      for (const row of ((data as Array<{ id?: string; name_agency?: string | null }> | null) ?? [])) {
        const id = (row.id ?? "").trim();
        if (!id) continue;
        mapping[id] = row.name_agency?.trim() || id;
      }
      setAgencyNameById(mapping);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const applySponsorLogosForExpo = useCallback((expoId: string, logos: SponsorLogoEntry[]) => {
    setSponsorLogosByExpoId((prev) => ({
      ...prev,
      [expoId]: logos.map((l) => l.url),
    }));
  }, []);

  const loadSponsorLogos = useCallback(async () => {
    const expoIds = rows.map((r) => r.id).filter(Boolean);
    if (!expoIds.length) {
      setSponsorLogosByExpoId({});
      return;
    }
    const { data } = await supabase
      .from("sponsors")
      .select("id_expo, url_logo_sponsor")
      .in("id_expo", expoIds)
      .not("url_logo_sponsor", "is", null);
    const map: Record<string, string[]> = {};
    for (const row of ((data as Array<{ id_expo: string; url_logo_sponsor: string | null }> | null) ?? [])) {
      if (!row.id_expo || !row.url_logo_sponsor) continue;
      if (!map[row.id_expo]) map[row.id_expo] = [];
      map[row.id_expo].push(row.url_logo_sponsor);
    }
    setSponsorLogosByExpoId(map);
  }, [rows]);

  useEffect(() => {
    void loadSponsorLogos();
  }, [loadSponsorLogos]);

  const loadVisitorCounts = useCallback(async () => {
    const expoIds = rows.map((r) => r.id).filter(Boolean);
    if (!expoIds.length) {
      setVisitorCountByExpoId({});
      return;
    }
    const { data, error: countErr } = await supabase
      .from("visitor_expo_visits")
      .select("expo_id, visitor_id")
      .in("expo_id", expoIds);
    if (countErr) {
      if (import.meta.env.DEV) {
        console.warn("[Expos] visitor_expo_visits:", countErr.message);
      }
      setVisitorCountByExpoId({});
      return;
    }
    const uniqueByExpo: Record<string, Set<string>> = {};
    for (const row of (data as Array<{ expo_id?: string | null; visitor_id?: string | null }> | null) ?? []) {
      const expoId = row.expo_id?.trim();
      const visitorId = row.visitor_id?.trim();
      if (!expoId || !visitorId) continue;
      if (!uniqueByExpo[expoId]) uniqueByExpo[expoId] = new Set();
      uniqueByExpo[expoId].add(visitorId);
    }
    const counts: Record<string, number> = {};
    for (const expoId of expoIds) {
      counts[expoId] = uniqueByExpo[expoId]?.size ?? 0;
    }
    setVisitorCountByExpoId(counts);
  }, [rows]);

  const loadArtworkCounts = useCallback(async () => {
    if (!rows.length) {
      setArtworkCountByExpoId({});
      return;
    }
    const refs = new Set<string>();
    for (const ex of rows) {
      if (ex.id?.trim()) refs.add(ex.id.trim());
      if (ex.expo_id?.trim()) refs.add(ex.expo_id.trim());
    }
    if (refs.size === 0) {
      setArtworkCountByExpoId({});
      return;
    }
    const { data, error: countErr } = await supabase
      .from("artworks")
      .select("artwork_expo_id")
      .in("artwork_expo_id", [...refs])
      .is("artwork_deleted_at", null);
    if (countErr) {
      if (import.meta.env.DEV) {
        console.warn("[Expos] artworks count:", countErr.message);
      }
      setArtworkCountByExpoId({});
      return;
    }
    const countsByRef: Record<string, number> = {};
    for (const row of (data as Array<{ artwork_expo_id?: string | null }> | null) ?? []) {
      const expoRef = row.artwork_expo_id?.trim();
      if (!expoRef) continue;
      countsByRef[expoRef] = (countsByRef[expoRef] ?? 0) + 1;
    }
    const counts: Record<string, number> = {};
    for (const ex of rows) {
      const keys = new Set<string>();
      if (ex.id?.trim()) keys.add(ex.id.trim());
      if (ex.expo_id?.trim()) keys.add(ex.expo_id.trim());
      let total = 0;
      for (const key of keys) total += countsByRef[key] ?? 0;
      if (ex.id) counts[ex.id] = total;
    }
    setArtworkCountByExpoId(counts);
  }, [rows]);

  useEffect(() => {
    void loadVisitorCounts();
  }, [loadVisitorCounts]);

  useEffect(() => {
    void loadArtworkCounts();
  }, [loadArtworkCounts]);

  const showScopeHint = !authLoading && scope.mode === "none";

  const sorted = useMemo(() => [...rows].sort((a, b) => expoTitle(a).localeCompare(expoTitle(b), "fr")), [rows]);
  const searchSuggestions = useMemo(() => {
    const orgQ = orgSearchTerm.trim().toLowerCase();
    const base = orgQ
      ? sorted.filter((ex) => {
          const agencyLinked = ex.agency_id ?? null;
          const agencyLabel = agencyLinked ? (agencyNameById[agencyLinked] ?? agencyLinked) : "";
          return agencyLabel.toLowerCase().includes(orgQ);
        })
      : sorted;
    return [...new Set(base.map((ex) => expoTitle(ex).trim()).filter(Boolean))];
  }, [sorted, orgSearchTerm, agencyNameById]);
  const filteredExpos = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const orgQ = orgSearchTerm.trim().toLowerCase();
    let result = sorted;
    if (q) {
      result = result.filter((ex) => {
        const title = expoTitle(ex).toLowerCase();
        const agencyLinked = ex.agency_id ?? null;
        const agencyLabel = agencyLinked ? (agencyNameById[agencyLinked] ?? agencyLinked) : "";
        const curatorFirst = (ex.curator_firstname ?? "").toLowerCase();
        const curatorLast = (ex.curator_name ?? "").toLowerCase();
        return (
          title.includes(q) ||
          agencyLabel.toLowerCase().includes(q) ||
          `${curatorFirst} ${curatorLast}`.trim().includes(q)
        );
      });
    }
    if (orgQ) {
      result = result.filter((ex) => {
        const agencyLinked = ex.agency_id ?? null;
        const agencyLabel = agencyLinked ? (agencyNameById[agencyLinked] ?? agencyLinked) : "";
        return agencyLabel.toLowerCase().includes(orgQ);
      });
    }
    return result;
  }, [sorted, searchTerm, orgSearchTerm, agencyNameById]);

  const filteredExpoRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const ex of filteredExpos) {
      const id = ex.id?.trim();
      if (id) refs.add(id);
      const legacy = ex.expo_id?.trim();
      if (legacy) refs.add(legacy);
    }
    return [...refs];
  }, [filteredExpos]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (filteredExpoRefs.length === 0) {
        setFilteredArtworkCount(0);
        return;
      }
      const { count, error: countErr } = await supabase
        .from("artworks")
        .select("artwork_id", { count: "exact", head: true })
        .in("artwork_expo_id", filteredExpoRefs)
        .is("artwork_deleted_at", null);
      if (cancelled) return;
      setFilteredArtworkCount(countErr ? 0 : count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [filteredExpoRefs]);

  const scopedExpoLabel = useMemo(() => {
    const scopedId = scope.expoId?.trim() || "";
    if (!scopedId) return "";
    const matched =
      rows.find((r) => r.id === scopedId) ??
      rows.find((r) => (r.expo_id ?? "").trim() === scopedId) ??
      null;
    if (!matched) return scopedId;
    return matched.expo_name?.trim() || matched.expo_id?.trim() || matched.id;
  }, [rows, scope.expoId]);

  const canCreateExpoByRole =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 4) || hasFullDataAccess(role_name);
  const canCreateExpo = canCreateExpoByRole && !orgPlanLimits?.isEtincelle;

  const canEditExpo = (ex: ExpoRow) => {
    if (hasGlobalStaffRole || hasFullDataAccess(role_name)) return true;
    if (typeof role_id === "number" && role_id >= 1 && role_id <= 3) return true;
    const linked = ex.agency_id ?? null;
    if (userAgencyId && linked === userAgencyId && role_id === 4) return true;
    if (userExpoId && userExpoId === ex.id && (role_id === 5 || role_id === 6)) return true;
    return false;
  };

  /** Carnet visiteur : visible pour tout utilisateur backoffice sur /expos (accès contrôlé au picker). */

  const openCreate = () => {
    setFormMode("create");
    setEditingExpoId(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    setFormMode("edit");
    setEditingExpoId(id);
    setFormOpen(true);
  };

  useEffect(() => {
    if (!expoPopupId || popupOpenedRef.current) return;
    if (loading) return;
    const row = rows.find((r) => r.id === expoPopupId);
    if (!row) return;
    if (!canEditExpo(row)) return;
    popupOpenedRef.current = true;
    openEdit(expoPopupId);
  }, [expoPopupId, loading, rows, role_id, userAgencyId, userExpoId]);

  const handleGenerateQrForExpo = useCallback(async (expoId: string) => {
    if (!expoId || generatingQrForExpoId) return;
    setGeneratingQrForExpoId(expoId);
    try {
      const origin =
        (await fetchQrPublicSiteOriginFromSettings()) ||
        (typeof window !== "undefined" && window.location?.origin?.trim()) ||
        "https://www.aimediart.com";
      const targetUrl = `${origin}/scan?expo_id=${encodeURIComponent(expoId)}`;
      const dataUrl = await QRCode.toDataURL(targetUrl, { width: 1024, margin: 1 });
      setExpoQrImages((prev) => ({ ...prev, [expoId]: dataUrl }));
    } finally {
      setGeneratingQrForExpoId(null);
    }
  }, [generatingQrForExpoId]);

  const handleGenerateExpoPanel = useCallback(async (expo: ExpoRow, format: "a4" | "a3") => {
    const origin =
      (await fetchQrPublicSiteOriginFromSettings()) ||
      (typeof window !== "undefined" && window.location?.origin?.trim()) ||
      "https://www.aimediart.com";
    const targetUrl = `${origin}/scan?expo_id=${encodeURIComponent(expo.id)}`;
    const qrDataUrl = await QRCode.toDataURL(
      targetUrl,
      qrCodePrintOptions(format === "a3" ? 1400 : 1000),
    );
    // Synchronise la vignette QR de la carte expo avec le QR du panneau généré.
    const keys = expoQrKeys(expo);
    setExpoQrImages((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = qrDataUrl;
      return next;
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const title = expoTitle(expo);
    const logoRaw = expoLogoRawFromRow(expo as Record<string, unknown>);
    const logoSrc = logoRaw ? resolveExpoLogoImgSrc(logoRaw) : "";
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    // Base A3 ; A4 = mêmes proportions réduites (~210/297).
    const scale = format === "a3" ? 1 : 0.707;
    const margin = 14 * scale;
    const contentWidth = pageWidth - margin * 2;

    // Bloc AIMEDIArt en bas à droite.
    const headerLogo = await createAimediaHeaderLogoBlockPng();
    const aimediaImg = await loadImage(headerLogo.dataUrl);
    const aimediaW = pageWidth * 0.29;
    const aimediaH = (aimediaW * headerLogo.heightPx) / headerLogo.widthPx;
    const aimediaY = pageHeight - aimediaH - 8 * scale;
    const aimediaX = pageWidth - margin - aimediaW;

    let y = 12 * scale;

    let logoLoaded = false;
    if (logoSrc) {
      try {
        const expoLogoImg = await loadImage(logoSrc);
        const maxLogoW = pageWidth * 0.55;
        const maxLogoH = 95 * scale;
        const ratio = Math.min(maxLogoW / expoLogoImg.width, maxLogoH / expoLogoImg.height);
        const logoW = expoLogoImg.width * ratio;
        const logoH = expoLogoImg.height * ratio;
        pdf.addImage(expoLogoImg, "PNG", (pageWidth - logoW) / 2, y, logoW, logoH, undefined, "NONE");
        y += logoH + 9 * scale;
        logoLoaded = true;
      } catch {
        // ignore expo logo loading error
      }
    }

    // « vous souhaite la bienvenue. » — le logo porte le nom de l'expo ; sans logo on préfixe le titre.
    pdf.setTextColor(60, 60, 60);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22 * scale);
    const welcomeLine = logoLoaded ? t("panel.welcome") : t("panel.welcomeWithTitle", { title });
    const welcomeLines = pdf.splitTextToSize(welcomeLine, contentWidth) as string[];
    pdf.text(welcomeLines, pageWidth / 2, y, { align: "center" });
    y += welcomeLines.length * 9 * scale + 8 * scale;

    // Hauteurs réservées sous le QR : 3 lignes rouges + 2 lignes guide + logo bas.
    const redFontSize = 28 * scale;
    const redLineSpacing = 13 * scale;
    const guideFontSize = 12.5 * scale;
    const guideLineSpacing = 6.5 * scale;
    const gapQrToRed = 16 * scale;
    const gapRedToGuide = 9 * scale;
    const redBlockMm = 3 * redLineSpacing;
    const guideBlockMm = 2 * guideLineSpacing;
    const reservedBottomMm =
      gapQrToRed + redBlockMm + gapRedToGuide + guideBlockMm + (pageHeight - aimediaY) + 6 * scale;

    const qrImg = await loadImage(qrDataUrl);
    const qrSize = Math.min(pageWidth * 0.49, Math.max(50 * scale, pageHeight - y - reservedBottomMm));
    const qrX = (pageWidth - qrSize) / 2;
    pdf.addImage(qrImg, "PNG", qrX, y, qrSize, qrSize, undefined, "NONE");
    y += qrSize + gapQrToRed;

    // Slogan rouge sur 3 lignes ; « carnet de voyage émotionnel. » en gras.
    pdf.setTextColor(230, 57, 70);
    pdf.setFontSize(redFontSize);
    pdf.setFont("helvetica", "italic");
    pdf.text(t("panel.taglineLine1"), pageWidth / 2, y, { align: "center" });
    y += redLineSpacing;
    pdf.text(t("panel.taglineLine2"), pageWidth / 2, y, { align: "center" });
    y += redLineSpacing;

    const line3Prefix = t("panel.taglineLine3Prefix");
    const line3Bold = t("panel.taglineLine3Bold");
    pdf.setFont("helvetica", "italic");
    const prefixW = line3Prefix ? pdf.getTextWidth(line3Prefix) : 0;
    pdf.setFont("helvetica", "bolditalic");
    const boldW = pdf.getTextWidth(line3Bold);
    const line3X = (pageWidth - (prefixW + boldW)) / 2;
    if (line3Prefix) {
      pdf.setFont("helvetica", "italic");
      pdf.text(line3Prefix, line3X, y);
    }
    pdf.setFont("helvetica", "bolditalic");
    pdf.text(line3Bold, line3X + prefixW, y);
    y += gapRedToGuide;

    // Texte guide en noir, gras italique, plus petit.
    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bolditalic");
    pdf.setFontSize(guideFontSize);
    pdf.text(t("panel.guideLine1"), pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += guideLineSpacing;
    pdf.text(t("panel.guideLine2"), pageWidth / 2, y, { align: "center", maxWidth: contentWidth });

    pdf.addImage(aimediaImg, "PNG", aimediaX, aimediaY, aimediaW, aimediaH, undefined, "NONE");

    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  }, [t]);

  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col gap-3 bg-[#121212]/95 py-2 backdrop-blur-sm">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="flex w-full min-w-0 flex-col gap-3 md:max-w-[min(100%,450px)]">
            <div>
              <div className="flex min-w-0 items-start gap-3">
                <BackofficeStickyAgencyLogoSlot align="start" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-3xl font-serif font-bold text-white">{t("page.title")}</h2>
                    {!loading && filteredArtworkCount != null && (
                      <span className="text-sm font-normal text-muted-foreground tabular-nums">
                        {t("page.filteredArtworkCount", { count: filteredArtworkCount })}
                      </span>
                    )}
                  </div>
                  {agencyFilter && (
                    <p className="text-xs text-muted-foreground mt-1">{t("page.filteredAgency", { agencyFilter })}</p>
                  )}
                  {!authLoading && scope.mode === "expo" && (
                    <p className="text-xs text-muted-foreground mt-1">{t("page.scopedExpoOnly", { label: scopedExpoLabel })}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {typeof role_id === "number" && role_id < 4 && (
                <div className="relative flex h-9 w-full min-w-0 cursor-text items-center gap-1.5 rounded-md border border-input bg-white px-2.5 sm:w-[210px] sm:min-w-[210px] sm:max-w-[210px]">
                  <Search className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                  {!orgSearchTerm.trim() ? (
                    <span className="shrink-0 text-sm font-medium text-neutral-900">{t("page.searchOrg_label")}</span>
                  ) : null}
                  <input
                    type="text"
                    autoComplete="off"
                    list="org-search-suggestions"
                    value={orgSearchTerm}
                    onChange={(e) => setOrgSearchTerm(e.target.value)}
                    aria-label={t("page.searchOrg")}
                    className="min-w-0 flex-1 bg-transparent pr-6 text-sm text-neutral-900 caret-neutral-900 outline-none placeholder:text-transparent"
                  />
                  {orgSearchTerm.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOrgSearchTerm("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                      aria-label={t("page.clearSearchOrg")}
                      title={t("page.clear")}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <datalist id="org-search-suggestions">
                    {Object.values(agencyNameById).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              )}
              <div className="relative flex h-9 w-full min-w-0 cursor-text items-center gap-1.5 rounded-md border border-input bg-white px-2.5 sm:w-[210px] sm:min-w-[210px] sm:max-w-[210px]">
                <Search className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                {!searchTerm.trim() ? (
                  <span className="shrink-0 text-sm font-medium text-neutral-900">{t("page.search_label")}</span>
                ) : null}
                <input
                  type="text"
                  autoComplete="off"
                  list="expo-search-suggestions"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label={t("page.search")}
                  className="min-w-0 flex-1 bg-transparent pr-6 text-sm text-neutral-900 caret-neutral-900 outline-none placeholder:text-transparent"
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
                <datalist id="expo-search-suggestions">
                  {searchSuggestions.map((label) => (
                    <option key={label} value={label} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:ml-auto lg:max-w-[540px]">
            {canCreateExpo && (
              <Button type="button" className={EXPO_TOOLBAR_BTN_GOLD} onClick={openCreate}>
                <Plus className="h-4 w-4 shrink-0" />
                <span>{t("page.create")}</span>
              </Button>
            )}
            <Button type="button" variant="outline" className={EXPO_TOOLBAR_BTN} asChild>
              <Link to="/expos/expos2">{t("page.tableau")}</Link>
            </Button>
            <Button type="button" variant="outline" className={EXPO_TOOLBAR_BTN} asChild>
              <Link to="/expos/visitors">{t("page.listVisitors")}</Link>
            </Button>
            <Button type="button" variant="outline" className={EXPO_TOOLBAR_BTN} asChild>
              <Link to="/expos/visitor-audio">{t("audio_monitor.title")}</Link>
            </Button>
            <Button type="button" variant="outline" className={cn(EXPO_TOOLBAR_BTN, "col-span-2 sm:col-span-1")} asChild>
              <Link to="/expos/sponsors" className="inline-flex flex-wrap items-center justify-center gap-1.5">
                <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t("page.sponsorsList", "Liste des sponsors")}</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {orgPlanLimits?.isEtincelle && typeof role_id === "number" && role_id >= 4 ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {ETINCELLE_UI.expoLimitBlocked}
        </p>
      ) : null}

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
        {!loading && !error && filteredExpos.length === 0 && !showScopeHint && (
          <p className="text-sm text-muted-foreground text-center py-12">{t("page.empty")}</p>
        )}
        {filteredExpos.map((ex) => {
          const agencyLinked = ex.agency_id ?? null;
          const agencyLabel = agencyLinked ? (agencyNameById[agencyLinked] ?? agencyLinked) : "";
          const logoRaw = expoLogoRawFromRow(ex as Record<string, unknown>);
          const qrInMemory = expoQrKeys(ex).map((k) => expoQrImages[k]).find((v) => typeof v === "string" && v.trim()) ?? null;
          const qrImage = qrInMemory ?? expoQrRawFromRow(ex as Record<string, unknown>);
          const exRecord = ex as Record<string, unknown>;
          const curatorFirstName =
            (typeof ex.curator_firstname === "string" ? ex.curator_firstname : "") ||
            (typeof exRecord.curator_fistname === "string" ? exRecord.curator_fistname : "") ||
            (typeof exRecord.curator_prenom === "string" ? exRecord.curator_prenom : "") ||
            (typeof exRecord.curator_first_name === "string" ? exRecord.curator_first_name : "");
          const curatorLastName =
            (typeof ex.curator_name === "string" ? ex.curator_name : "") ||
            (typeof exRecord.curator_lastname === "string" ? exRecord.curator_lastname : "") ||
            (typeof exRecord.curator_nom === "string" ? exRecord.curator_nom : "") ||
            (typeof exRecord.curator_last_name === "string" ? exRecord.curator_last_name : "");
          const curatorLabel =
            `${curatorFirstName} ${curatorLastName}`.trim() ||
            (typeof exRecord.curator === "string" ? exRecord.curator.trim() : "");
          const editable = canEditExpo(ex);
          return (
            <Card key={ex.id} className="glass-card hover:shadow-lg transition-all duration-300">
              <CardContent
                className={`relative p-4 flex flex-col md:flex-row items-start gap-4 ${editable ? "cursor-pointer" : ""}`}
                role={editable ? "button" : undefined}
                tabIndex={editable ? 0 : undefined}
                onClick={editable ? () => openEdit(ex.id) : undefined}
                onKeyDown={
                  editable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEdit(ex.id);
                        }
                      }
                    : undefined
                }
              >
                <div className="flex w-full shrink-0 flex-row items-center gap-3 md:w-auto md:flex-col md:items-center md:gap-1">
                  <ExpoLogoThumb
                    key={`${ex.id}-${logoRaw ?? "no-logo"}`}
                    logoUrl={logoRaw}
                    title={expoTitle(ex)}
                    fallbackIcon={<Images className="h-12 w-12 text-muted-foreground" aria-hidden />}
                  />
                  {(sponsorLogosByExpoId[ex.id]?.length ?? 0) > 0 && (
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 md:flex-none">
                      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Sponsors / Mécènes
                      </span>
                      <SponsorCarousel
                        key={(sponsorLogosByExpoId[ex.id] ?? []).join("|")}
                        logos={sponsorLogosByExpoId[ex.id]}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <h3 className="font-serif font-bold text-lg min-w-0">{expoTitle(ex)}</h3>
                    <p className="shrink-0 text-sm text-muted-foreground sm:text-right">
                      {formatExpoDatesLabel(ex.date_expo_du, ex.date_expo_au, i18n.language, t, {
                        range: "card.dateRange",
                        permanent: "card.permanentExpo",
                      })}
                    </p>
                  </div>
                  {curatorLabel && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("card.curatorLabel", { name: curatorLabel })}
                    </p>
                  )}
                  {agencyLinked && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("card.agencyPrefix")}{" "}
                      <Link
                        className="text-primary underline-offset-2 hover:underline"
                        to={`/agencies?agency=${encodeURIComponent(agencyLinked)}`}
                        title={t("card.viewAgencyTitle")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {agencyLabel}
                      </Link>
                    </p>
                  )}
                  <p className="mt-2 text-sm font-black text-muted-foreground">
                    {t("card.visitorTotal", { count: visitorCountByExpoId[ex.id] ?? 0 })}
                  </p>
                  <p className="mt-1 text-sm font-black text-muted-foreground">
                    {t("card.artworkTotal", { count: artworkCountByExpoId[ex.id] ?? 0 })}
                  </p>
                  {isGlobalCostViewer ? (
                    <p className="mt-1 text-sm tabular-nums">
                      <EntityCostLabel
                        display={resolveEntityCostDisplay(
                          costsReady ? costByExpoId[ex.id] : undefined,
                          costsReady,
                          usdToEurRate,
                        )}
                        unavailableLabel={t("card.costUnavailable")}
                        prefixLabel={t("card.costPrefix")}
                      />
                    </p>
                  ) : null}
                  {(() => {
                    const raw = ex.expo_descript_i18n;
                    if (!raw) return null;
                    // Même logique que VisitorWelcome.extractExpoDescription (lignes 55-74)
                    const lang = i18n.language?.slice(0, 2) || "fr";
                    let text: string | null = null;
                    if (typeof raw === "object" && raw !== null) {
                      const obj = raw as Record<string, string>;
                      text = obj[lang] ?? obj["fr"] ?? Object.values(obj)[0] ?? null;
                    } else if (typeof raw === "string") {
                      try {
                        const obj = JSON.parse(raw) as Record<string, string>;
                        text = obj[lang] ?? obj["fr"] ?? Object.values(obj)[0] ?? raw;
                      } catch { text = raw; }
                    }
                    if (!text?.trim()) return null;
                    const cleanText = sanitizeTranslationOutput(text);
                    if (!cleanText) return null;
                    return (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground line-clamp-4 h-[80px]">
                          {cleanText}
                        </p>
                        <button
                          type="button"
                          className="mt-1 text-xs text-primary hover:underline underline-offset-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDescriptionPopup({ text: cleanText, name: expoTitle(ex), logo: logoRaw });
                          }}
                        >
                          Lire la suite…
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 md:w-[190px] md:shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(EXPO_CARD_BTN, "gap-1 border-primary/40 text-xs")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDiaryPickerExpo({ id: ex.id, name: expoTitle(ex) });
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t("card.travelDiary")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(EXPO_CARD_BTN, "gradient-gold gradient-gold-hover-bg text-primary-foreground")}
                    asChild
                  >
                    <Link
                      to={`/expos/visitors?expo_id=${encodeURIComponent(ex.id)}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("card.cardVisitors", { count: visitorCountByExpoId[ex.id] ?? 0 })}
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={EXPO_CARD_BTN}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPanelFormatExpo(ex);
                    }}
                  >
                    {t("card.printPanel")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={EXPO_CARD_BTN}
                    onClick={(e) => {
                      e.stopPropagation();
                      openVisitorExpoPresentation(ex.id);
                    }}
                  >
                    {t("card.previewPresentation")}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className={cn(EXPO_CARD_BTN, "gradient-gold gradient-gold-hover-bg text-primary-foreground")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSponsorExpo({ id: ex.id, name: expoTitle(ex) });
                    }}
                  >
                    {t("card.sponsors", "Sponsors / Mécènes")}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className={cn(EXPO_CARD_BTN, "gradient-gold gradient-gold-hover-bg text-primary-foreground")}
                    asChild
                  >
                    <Link to={`/catalogue?expo=${encodeURIComponent(ex.id)}`} onClick={(e) => e.stopPropagation()}>
                      {t("card.viewCatalogue")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {diaryPickerExpo !== null && (
        <ExpoTravelDiaryPickerDialog
          open
          onOpenChange={(o) => {
            if (!o) setDiaryPickerExpo(null);
          }}
          expoId={diaryPickerExpo.id}
          expoName={diaryPickerExpo.name}
        />
      )}

      {sponsorExpo !== null && (
        <SponsorDialog
          open
          onOpenChange={(o) => {
            if (!o) setSponsorExpo(null);
          }}
          expoId={sponsorExpo.id || null}
          expoName={sponsorExpo.name}
          onSponsorsChange={(logos, scopeExpoId) => {
            if (scopeExpoId) applySponsorLogosForExpo(scopeExpoId, logos);
            else void loadSponsorLogos();
          }}
        />
      )}
      <ExpoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        expoId={formMode === "edit" ? editingExpoId : null}
        fieldKeys={expoFieldKeys}
        onSuccess={() => void load()}
        onSponsorsChange={(logos, scopeExpoId) => {
          if (scopeExpoId) applySponsorLogosForExpo(scopeExpoId, logos);
        }}
        canPickAgency={typeof role_id === "number" && role_id < 4}
      />
      {panelFormatExpo && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setPanelFormatExpo(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-[340px] rounded-lg bg-white p-4 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choix du format du panneau expo"
          >
            <p className="text-sm font-semibold text-gray-900">
              {t("panel.chooseFormat")}
            </p>
            <Button
              type="button"
              variant="default"
              className="mt-4 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => {
                openVisitorExpoPresentation(panelFormatExpo.id);
                setPanelFormatExpo(null);
              }}
            >
              {t("panel.previewPresentation")}
            </Button>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => {
                  void handleGenerateExpoPanel(panelFormatExpo, "a4");
                  setPanelFormatExpo(null);
                }}
              >
                A4
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void handleGenerateExpoPanel(panelFormatExpo, "a3");
                  setPanelFormatExpo(null);
                }}
              >
                A3
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => setPanelFormatExpo(null)}
            >
              {t("panel.cancel")}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={Boolean(qrConfirmExpoKey)}
        onOpenChange={(open) => !open && setQrConfirmExpoKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("card.qrConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="font-semibold text-destructive mb-2">
                  {t("card.qrConfirmWarning")}
                </p>
                <p>{t("card.qrConfirmDescription")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setQrConfirmExpoKey(null)}>
              {t("card.qrConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                const key = qrConfirmExpoKey;
                setQrConfirmExpoKey(null);
                if (key) void handleGenerateQrForExpo(key);
              }}
            >
              {t("card.qrConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Popup description complète */}
      <Dialog open={!!descriptionPopup} onOpenChange={(o) => { if (!o) setDescriptionPopup(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogTitle className="flex items-center gap-3 font-serif text-lg pr-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/40">
              {descriptionPopup?.logo?.trim() ? (
                <img
                  src={resolveExpoLogoImgSrc(descriptionPopup.logo)}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <Images className="h-7 w-7 text-muted-foreground" aria-hidden />
              )}
            </div>
            <span className="min-w-0 leading-tight">{descriptionPopup?.name}</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {descriptionPopup?.text}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expos;
