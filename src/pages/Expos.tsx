import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Images, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SponsorDialog } from "@/components/SponsorDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { supabase } from "@/lib/supabase";
import { hasFullDataAccess } from "@/lib/authUser";
import { sortExpoFieldKeys } from "@/lib/expoFormUtils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useDataScope } from "@/hooks/useDataScope";
import { createAimediaHeaderLogoBlockPng } from "@/lib/pdfHeaderLogoBlock";
import { expoLogoRawFromRow, resolveExpoLogoImgSrc } from "@/lib/expoLogo";
import { useTranslation } from "react-i18next";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import { QR_CODE_STORAGE_OPTIONS, qrCodePrintOptions } from "@/lib/qrCodeScanFriendly";

const EXPO_QR_CACHE_KEY = "aimediart-expo-qr-cache-v1";

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
      className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40"
      title={title}
    >
      {showImg ? (
        <ImageWithSkeleton
          src={displaySrc}
          alt=""
          wrapperClassName="h-full w-full"
          className="h-full w-full object-contain p-1.5"
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

function formatExpoDate(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("fr-FR");
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
  const [sponsorLogosByExpoId, setSponsorLogosByExpoId] = useState<Record<string, string[]>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [descriptionPopup, setDescriptionPopup] = useState<string | null>(null);
  const popupOpenedRef = useRef(false);
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, agency_id: userAgencyId, expo_id: userExpoId, role_name } = useAuthUser();

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

  useEffect(() => {
    if (!rows.length) return;
    let cancelled = false;
    void (async () => {
      const expoIds = rows.map((r) => r.id).filter(Boolean);
      const { data } = await supabase
        .from("sponsors")
        .select("id_expo, url_logo_sponsor")
        .in("id_expo", expoIds)
        .not("url_logo_sponsor", "is", null);
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      for (const row of ((data as Array<{ id_expo: string; url_logo_sponsor: string | null }> | null) ?? [])) {
        if (!row.id_expo || !row.url_logo_sponsor) continue;
        if (!map[row.id_expo]) map[row.id_expo] = [];
        map[row.id_expo].push(row.url_logo_sponsor);
      }
      console.debug("[Expos] sponsorLogosByExpoId →", map);
      setSponsorLogosByExpoId(map);
    })();
    return () => { cancelled = true; };
  }, [rows]);

  const showScopeHint = !authLoading && scope.mode === "none";

  const sorted = useMemo(() => [...rows].sort((a, b) => expoTitle(a).localeCompare(expoTitle(b), "fr")), [rows]);
  const searchSuggestions = useMemo(
    () => [...new Set(sorted.map((ex) => expoTitle(ex).trim()).filter(Boolean))],
    [sorted],
  );
  const filteredExpos = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((ex) => {
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
  }, [sorted, searchTerm, agencyNameById]);
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

  const canCreateExpo =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) || hasFullDataAccess(role_name);

  const canEditExpo = (ex: ExpoRow) => {
    if ((typeof role_id === "number" && role_id >= 1 && role_id <= 3) || hasFullDataAccess(role_name)) return true;
    const linked = ex.agency_id ?? null;
    if (userAgencyId && linked === userAgencyId && role_id === 4) return true;
    if (userExpoId && userExpoId === ex.id && (role_id === 5 || role_id === 6)) return true;
    return false;
  };


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

  const handleDownloadVisitorQr = useCallback(async (expoId: string, expoName: string) => {
    if (!expoId) return;
    try {
      const origin =
        (await fetchQrPublicSiteOriginFromSettings()) ||
        (typeof window !== "undefined" && window.location?.origin?.trim()) ||
        "https://www.aimediart.com";
      const targetUrl = `${origin}/visitor?expo_id=${encodeURIComponent(expoId)}`;
      const dataUrl = await QRCode.toDataURL(targetUrl, { width: 1024, margin: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      const safeName = expoName.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40) || expoId.slice(0, 8);
      a.download = `qr-visiteur-${safeName}.png`;
      a.click();
    } catch (e) {
      console.warn("[Expos] QR visiteur download :", e);
    }
  }, []);

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
    const subtitle = "Scannez le QR-Code pour découvrir l'exposition";
    const logoRaw = expoLogoRawFromRow(expo as Record<string, unknown>);
    const logoSrc = logoRaw ? resolveExpoLogoImgSrc(logoRaw) : "";
    const expoRecord = expo as Record<string, unknown>;
    const dateDuRaw =
      (typeof expo.date_expo_du === "string" ? expo.date_expo_du : "") ||
      (typeof expoRecord.date_expo_du === "string" ? expoRecord.date_expo_du : "") ||
      (typeof expoRecord.date_expo_debut === "string" ? expoRecord.date_expo_debut : "") ||
      (typeof expoRecord.date_du === "string" ? expoRecord.date_du : "");
    const dateAuRaw =
      (typeof expo.date_expo_au === "string" ? expo.date_expo_au : "") ||
      (typeof expoRecord.date_expo_au === "string" ? expoRecord.date_expo_au : "") ||
      (typeof expoRecord.date_expo_fin === "string" ? expoRecord.date_expo_fin : "") ||
      (typeof expoRecord.date_au === "string" ? expoRecord.date_au : "");
    const dateDu = formatExpoDate(dateDuRaw);
    const dateAu = formatExpoDate(dateAuRaw);
    const dateLine =
      dateDu && dateAu
        ? `Exposition du ${dateDu} au ${dateAu}`
        : dateDu
          ? `Exposition du ${dateDu}`
          : dateAu
            ? `Exposition jusqu'au ${dateAu}`
            : "";
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    // Base A3: on applique les mêmes proportions pour A4 (réduction simple).
    const scale = format === "a3" ? 1 : 0.707; // ~210/297
    const margin = 14 * scale;
    const contentWidth = pageWidth - margin * 2;
    const headerLogo = await createAimediaHeaderLogoBlockPng();
    const aimediaImg = await loadImage(headerLogo.dataUrl);
    const aimediaW = Math.min(pageWidth * 0.505, contentWidth); // même proportion qu'en A3
    const aimediaH = (aimediaW * headerLogo.heightPx) / headerLogo.widthPx;
    pdf.addImage(aimediaImg, "PNG", margin, 10 * scale, aimediaW, aimediaH, undefined, "NONE");

    let y = 10 * scale + aimediaH + 14 * scale;

    pdf.setTextColor(70, 70, 70);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(30 * scale);
    pdf.text("Bienvenue à l'exposition", pageWidth / 2, y, { align: "center" });
    y += 12 * scale;

    if (logoSrc) {
      try {
        const expoLogoImg = await loadImage(logoSrc);
        const maxLogoW = pageWidth * (2 / 3); // logo expo = 2/3 de la largeur de page
        const maxLogoH = 65 * scale;
        const ratio = Math.min(maxLogoW / expoLogoImg.width, maxLogoH / expoLogoImg.height);
        const logoW = expoLogoImg.width * ratio;
        const logoH = expoLogoImg.height * ratio;
        pdf.addImage(expoLogoImg, "PNG", (pageWidth - logoW) / 2, y, logoW, logoH, undefined, "NONE");
        y += logoH + 14 * scale;
      } catch {
        // ignore expo logo loading error
      }
    }

    pdf.setTextColor(25, 25, 25);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(24 * scale);
    pdf.text(subtitle, pageWidth / 2, y, { align: "center" });
    y += 12 * scale;

    const qrImg = await loadImage(qrDataUrl);
    // QR = 3/4 de la largeur page, mais on garde de la place pour la ligne de dates.
    const qrSize = Math.min(pageWidth * 0.75, pageHeight - y - 26 * scale);
    const qrX = (pageWidth - qrSize) / 2; // centré horizontalement
    const qrY = y;
    pdf.addImage(qrImg, "PNG", qrX, qrY, qrSize, qrSize, undefined, "NONE");
    y = qrY + qrSize + 12 * scale;

    if (dateLine) {
      pdf.setTextColor(60, 60, 60);
      pdf.setFont("helvetica", "bold");
      const targetWidth = pageWidth * 0.9;
      const minDateFontSize = 16 * scale;
      const maxDateFontSize = 38 * scale;
      pdf.setFontSize(minDateFontSize);
      const rawWidth = Math.max(pdf.getTextWidth(dateLine), 1);
      const adjustedDateFontSize = Math.min(
        maxDateFontSize,
        Math.max(minDateFontSize, minDateFontSize * (targetWidth / rawWidth)),
      );
      pdf.setFontSize(adjustedDateFontSize);
      const dateY = Math.min(y, pageHeight - 14 * scale);
      pdf.text(dateLine, pageWidth / 2, dateY, { align: "center", maxWidth: targetWidth });
    }

    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  }, []);

  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4 md:max-w-[min(100%,450px)] shrink-0">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">{t("page.title")}</h2>
          {agencyFilter && (
            <p className="text-xs text-muted-foreground mt-1">{t("page.filteredAgency", { agencyFilter })}</p>
          )}
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground mt-1">{t("page.scopedExpoOnly", { label: scopedExpoLabel })}</p>
          )}
        </div>
        <div className="relative w-[210px] min-w-[210px] max-w-[210px]">
          <Input
            type="text"
            list="expo-search-suggestions"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("page.search")}
            className="h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white pr-9"
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
        <BackofficeStickyAgencyLogoSlot />
        {canCreateExpo && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              className="gap-2 text-[14px] gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              {t("page.create")}
            </Button>
            <Button type="button" variant="outline" className="gap-2" asChild>
              <Link to="/expos/expos2">{t("page.tableau")}</Link>
            </Button>
            <Button type="button" variant="outline" className="gap-2" asChild>
              <Link to="/expos/visitors">{t("page.listVisitors")}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setSponsorExpo({ id: "", name: "" })}
            >
              <Building2 className="h-4 w-4" aria-hidden />
              {t("page.sponsors", "Sponsors")}
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
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <ExpoLogoThumb
                    key={`${ex.id}-${logoRaw ?? "no-logo"}`}
                    logoUrl={logoRaw}
                    title={expoTitle(ex)}
                    fallbackIcon={<Images className="h-12 w-12 text-muted-foreground" aria-hidden />}
                  />
                  {(sponsorLogosByExpoId[ex.id]?.length ?? 0) > 0 && (
                    <>
                      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Sponsors / Mécènes
                      </span>
                      <SponsorCarousel logos={sponsorLogosByExpoId[ex.id]} />
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif font-bold text-lg">{expoTitle(ex)}</h3>
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
                    return (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground line-clamp-5 h-[120px]">
                          {text}
                        </p>
                        <button
                          type="button"
                          className="mt-1 text-xs text-primary hover:underline underline-offset-2"
                          onClick={(e) => { e.stopPropagation(); setDescriptionPopup(text); }}
                        >
                          Lire la suite…
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex w-full flex-col gap-2 md:w-[190px] shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/scan?expo_id=${encodeURIComponent(ex.id)}`, "_blank");
                    }}
                  >
                    {t("card.testQr")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full justify-center gradient-gold gradient-gold-hover-bg text-primary-foreground"
                    asChild
                  >
                    <Link
                      to={`/expos/visitors?expo_id=${encodeURIComponent(ex.id)}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("card.cardVisitors")}
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDownloadVisitorQr(ex.id, expoTitle(ex));
                    }}
                  >
                    {t("card.downloadQrVisitor")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPanelFormatExpo(ex);
                    }}
                  >
                    {t("card.printPanel")}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full justify-center gradient-gold gradient-gold-hover-bg text-primary-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSponsorExpo({ id: ex.id, name: expoTitle(ex) });
                    }}
                  >
                    {t("card.sponsors", "Sponsors / Mécènes")}
                  </Button>
                  <Button type="button" variant="default" size="sm" className="w-full justify-center gradient-gold gradient-gold-hover-bg text-primary-foreground" asChild>
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

      {sponsorExpo !== null && (
        <SponsorDialog
          open
          onOpenChange={(o) => { if (!o) setSponsorExpo(null); }}
          expoId={sponsorExpo.id || null}
          expoName={sponsorExpo.name}
        />
      )}
      <ExpoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        expoId={formMode === "edit" ? editingExpoId : null}
        fieldKeys={expoFieldKeys}
        onSuccess={() => void load()}
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
          <DialogTitle className="font-serif text-lg">Description</DialogTitle>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {descriptionPopup}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expos;
