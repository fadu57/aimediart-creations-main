import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { emotions, artworks, expos } from "@/data/mockData";
import { useDataScope } from "@/hooks/useDataScope";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { supabase } from "@/lib/supabase";
import { PDF_FORMAT_OPTIONS, type PdfPaperFormat } from "@/lib/statisticsPrintExport";
import {
  buildStatisticsPdfFilename,
  generateStatisticsBrowserPdf,
  printStatisticsInBrowser,
  type StatisticsPdfExportProgress,
  type StatisticsPdfExportTables,
} from "@/lib/statisticsBrowserPdf";
import { normalizeEmotionKey, emotionEmojiForPreview } from "@/lib/statisticsEmotions";
import { formatBarVisitLabel, sumChartVisits } from "@/lib/statisticsCharts";
import { StatisticsReportView, type StatisticsArtistCoverLetter, type StatisticsReportViewProps } from "@/components/statistics/StatisticsReportView";
import { VisitorGeographySection } from "@/components/statistics/VisitorGeographySection";
import { fetchVisitorGeographyForStatistics, geocodeVisitorGeoRows, hydrateProfilePlaceData, prepareGeocodingPass, type VisitorGeoTableRow } from "@/lib/statisticsVisitorGeography";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { expoLogoRawFromRow, resolveExpoLogoImgSrc } from "@/lib/expoLogo";
import { getArtworksForDataScope } from "@/lib/userScope";
import { cn } from "@/lib/utils";
import { BACKOFFICE_FORM_CONTROL_CLASS } from "@/lib/costLabels";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Image,
  Loader2,
  Smile,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";

type EmotionCatalogRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

type ExpoOption = {
  id: string;
  expo_name: string;
  agency_id: string | null;
  /** Valeur brute logo (colonnes variables selon le schéma `expos`). */
  logoRaw: string | null;
  date_expo_du: string | null;
  date_expo_au: string | null;
  curatorFirstName: string | null;
  curatorLastName: string | null;
};

function expoMatchesAgencyFilter(ex: ExpoOption, agencyId: string | null | undefined): boolean {
  if (!agencyId) return true;
  return ex.agency_id === agencyId || ex.agency_id == null;
}

type ArtistFilterOption = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
};

function curatorNamesFromExpoRow(row: Record<string, unknown>): { firstName: string; lastName: string } {
  const firstName =
    asTrimmedString(row.curator_firstname) ||
    asTrimmedString(row.curator_fistname) ||
    asTrimmedString(row.curator_prenom) ||
    asTrimmedString(row.curator_first_name) ||
    "";
  const lastName =
    asTrimmedString(row.curator_name) ||
    asTrimmedString(row.curator_lastname) ||
    asTrimmedString(row.curator_nom) ||
    asTrimmedString(row.curator_last_name) ||
    "";
  return { firstName, lastName };
}

type TopArtworkRow = {
  artworkId: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  visits: number;
  avgHearts: number | null;
};

type TopSortKey = "visits" | "avgHearts";
type TopSortDirection = "asc" | "desc";

function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return "";
}

type FeedbackArtworkRow = { artwork_id?: string | number | null };

function filterFeedbackRowsByArtworkIds<T extends FeedbackArtworkRow>(
  rows: T[],
  artworkIds: Set<string> | null,
): T[] {
  if (!artworkIds) return rows;
  if (artworkIds.size === 0) return [];
  return rows.filter((row) => {
    const id = asTrimmedString(row.artwork_id);
    return id.length > 0 && artworkIds.has(id);
  });
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + mondayDelta);
  return x;
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toFrDayMonth(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function toFrDateLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toFrWeekdayShort(d: Date): string {
  const labels = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
  return labels[d.getDay()] || "";
}

/** Parse une date ISO `YYYY-MM-DD` (champs expos date_expo_du / date_expo_au). */
function parseExpoYmdDate(value: unknown): Date | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDailyTemporalSeries(
  rows: Array<{ submitted_at?: string | null }>,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ day: string; date: string; weekday: string; dateLabel: string; visites: number }> {
  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(0, 0, 0, 0);

  const byDate = new Map<string, number>();
  for (let cur = new Date(start); cur.getTime() <= end.getTime(); cur.setDate(cur.getDate() + 1)) {
    byDate.set(toYmd(cur), 0);
  }

  for (const row of rows) {
    const submittedAt = asTrimmedString(row.submitted_at);
    if (!submittedAt) continue;
    const d = new Date(submittedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = toYmd(d);
    if (byDate.has(key)) byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  const series: Array<{ day: string; date: string; weekday: string; dateLabel: string; visites: number }> = [];
  for (let cur = new Date(start); cur.getTime() <= end.getTime(); cur.setDate(cur.getDate() + 1)) {
    const key = toYmd(cur);
    const weekday = toFrWeekdayShort(cur);
    const dateLabel = toFrDayMonth(cur);
    series.push({
      day: `${weekday}|${dateLabel}`,
      date: key,
      weekday,
      dateLabel,
      visites: byDate.get(key) ?? 0,
    });
  }
  return series;
}

function formatFrNumber(n: number, opts: Intl.NumberFormatOptions = {}) {
  return n.toLocaleString("fr-FR", opts);
}

function artworkExpoId(aw: unknown): string | null {
  const x = aw as { expoId?: string | null; artwork_expo_id?: string | null };
  return x.expoId ?? x.artwork_expo_id ?? null;
}

const Statistics = () => {
  const { t, i18n } = useTranslation("statistiques");
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, role_name, agency_id: userAgencyId, expo_id: userExpoId } = useAuthUser();
  const [agencyOptions, setAgencyOptions] = useState<Array<{ id: string; name: string; logoUrl: string | null }>>([]);
  const [expoOptions, setExpoOptions] = useState<ExpoOption[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("all");
  const [emotionCatalogFromDb, setEmotionCatalogFromDb] = useState<EmotionCatalogRow[]>([]);
  const [emotionCatalogError, setEmotionCatalogError] = useState<string | null>(null);
  const [feedbackCountsByEmotionId, setFeedbackCountsByEmotionId] = useState<Record<string, number>>({});
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [uniqueVisitorsTotal, setUniqueVisitorsTotal] = useState(0);
  const [averageHearts, setAverageHearts] = useState<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [temporalSeries, setTemporalSeries] = useState<
    Array<{ day: string; date: string; weekday: string; dateLabel: string; visites: number }>
  >([]);
  const [temporalSeriesForPdf, setTemporalSeriesForPdf] = useState<
    Array<{ day: string; date: string; weekday: string; dateLabel: string; visites: number }>
  >([]);
  const [hourlySeries, setHourlySeries] = useState<Array<{ hour: string; visites: number }>>([]);
  const [crossRows, setCrossRows] = useState<Array<{ artworkId: string; name: string; counts: Record<string, number> }>>([]);
  const [crossError, setCrossError] = useState<string | null>(null);
  const [topArtworks, setTopArtworks] = useState<TopArtworkRow[]>([]);
  const [topArtworksError, setTopArtworksError] = useState<string | null>(null);
  const [visitorGeoRows, setVisitorGeoRows] = useState<VisitorGeoTableRow[]>([]);
  const [visitorGeoLoading, setVisitorGeoLoading] = useState(false);
  const [visitorGeoGeocoding, setVisitorGeoGeocoding] = useState(false);
  const [visitorGeoProgress, setVisitorGeoProgress] = useState<{ done: number; total: number } | null>(null);
  const [visitorGeoError, setVisitorGeoError] = useState<string | null>(null);
  const visitorGeoBaseRowsRef = useRef<VisitorGeoTableRow[]>([]);
  const visitorGeoScopeRef = useRef<{
    targetAgencyId: string | null;
    targetExpoId: string | null;
    expoDateRange: { start: Date; end: Date } | null;
  }>({ targetAgencyId: null, targetExpoId: null, expoDateRange: null });
  const geoRunRef = useRef(0);
  const [activeArtworksCount, setActiveArtworksCount] = useState(0);
  const [topSortKey, setTopSortKey] = useState<TopSortKey>("visits");
  const [topSortDirection, setTopSortDirection] = useState<TopSortDirection>("desc");
  const [crossSortEmotionId, setCrossSortEmotionId] = useState<string | null>(null);
  const [crossSortDirection, setCrossSortDirection] = useState<TopSortDirection>("desc");
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [paperFormatDialogOpen, setPaperFormatDialogOpen] = useState(false);
  const [previewDateDialogOpen, setPreviewDateDialogOpen] = useState(false);
  const [manualPreviewDateFrom, setManualPreviewDateFrom] = useState("");
  const [manualPreviewDateTo, setManualPreviewDateTo] = useState("");
  const [dialogDateFrom, setDialogDateFrom] = useState("");
  const [dialogDateTo, setDialogDateTo] = useState("");
  const [selectedPdfPaper, setSelectedPdfPaper] = useState<PdfPaperFormat>("a4");
  const [printExportBusy, setPrintExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<StatisticsPdfExportProgress | null>(null);
  const [reportExportSnapshot, setReportExportSnapshot] = useState<StatisticsReportViewProps | null>(null);
  const statisticsPrintAreaRef = useRef<HTMLDivElement>(null);
  const exportProgressThrottleRef = useRef(0);
  const exportProgressLatestRef = useRef<StatisticsPdfExportProgress | null>(null);
  const previewFiltersSnapshotRef = useRef<{ agencyId: string; expoId: string | "all"; artistId: string } | null>(null);
  const shouldRestorePreviewFiltersRef = useRef(false);
  const userScopeKeyRef = useRef("");

  /** Marqueur : rapport monté + temps pour Recharts / polices avant export PDF navigateur. */
  useEffect(() => {
    if (!printPreviewOpen || printExportBusy) return;
    let cancelled = false;
    let pollId: number | undefined;
    let readyId: number | undefined;

    const armReadyTimer = () => {
      const root = statisticsPrintAreaRef.current;
      if (!root || cancelled) return;
      root.removeAttribute("data-statistics-export-ready");
      readyId = window.setTimeout(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) statisticsPrintAreaRef.current?.setAttribute("data-statistics-export-ready", "true");
          });
        });
      }, 1100);
    };

    const pollForRoot = () => {
      const root = statisticsPrintAreaRef.current;
      if (!root) {
        pollId = window.setTimeout(pollForRoot, 50);
        return;
      }
      armReadyTimer();
    };
    pollForRoot();

    return () => {
      cancelled = true;
      if (pollId !== undefined) window.clearTimeout(pollId);
      if (readyId !== undefined) window.clearTimeout(readyId);
      statisticsPrintAreaRef.current?.removeAttribute("data-statistics-export-ready");
    };
  }, [printPreviewOpen, temporalSeriesForPdf, hourlySeries, printExportBusy]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name_agency, logo_agency")
        .order("name_agency", { ascending: true });
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setAgencyOptions([]);
        return;
      }
      const options = (data as Array<{ id?: string | null; name_agency?: string | null; logo_agency?: string | null }>)
        .map((row) => ({
          id: asTrimmedString(row.id),
          name: asTrimmedString(row.name_agency),
          logoUrl: (() => {
            const u = asTrimmedString(row.logo_agency);
            return u.length > 0 ? u : null;
          })(),
        }))
        .filter((row) => row.id.length > 0)
        .map((row) => ({ ...row, name: row.name || row.id }));
      setAgencyOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadExpoOptions = useCallback(async () => {
    const scopeAgencyId = scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : undefined;
    const scopeExpoId = scope.mode === "expo" ? scope.expoId : undefined;

    const agencyFilterId =
      role_id === 4 && userAgencyId
        ? userAgencyId
        : scope.mode === "agency" && scopeAgencyId
          ? scopeAgencyId
          : null;

    let query = supabase
      .from("expos")
      .select("*")
      .is("deleted_at", null)
      .order("expo_name", { ascending: true, nullsFirst: false });

    if ((role_id === 5 || role_id === 6) && userExpoId) {
      query = query.eq("id", userExpoId);
    } else if (scope.mode === "expo" && scopeExpoId) {
      query = query.eq("id", scopeExpoId);
    } else if (agencyFilterId) {
      query = query.or(`agency_id.eq.${agencyFilterId},agency_id.is.null`);
    }

    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
      setExpoOptions([]);
      return;
    }

    const options = (data as Record<string, unknown>[])
      .map((row) => {
        const curator = curatorNamesFromExpoRow(row);
        return {
          id: asTrimmedString(row.id),
          expo_name: asTrimmedString(row.expo_name),
          agency_id: asTrimmedString(row.agency_id) || null,
          logoRaw: expoLogoRawFromRow(row),
          date_expo_du: asTrimmedString(row.date_expo_du) || null,
          date_expo_au: asTrimmedString(row.date_expo_au) || null,
          curatorFirstName: curator.firstName || null,
          curatorLastName: curator.lastName || null,
        };
      })
      .filter((row) => row.id.length > 0)
      .map((row) => ({ ...row, expo_name: row.expo_name || row.id }));

    const unique = Array.from(new Map(options.map((ex) => [ex.id, ex])).values());
    unique.sort((a, b) => a.expo_name.localeCompare(b.expo_name, "fr"));
    setExpoOptions(unique);
  }, [role_id, userAgencyId, userExpoId, scope]);

  useEffect(() => {
    if (authLoading) return;
    void loadExpoOptions();
  }, [loadExpoOptions, authLoading]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setEmotionCatalogError(null);
      let data: unknown[] | null = null;
      let error: { message?: string } | null = null;

      // Schéma principal attendu (évite les 400 sur colonne absente ordonnancement).
      let primary = await supabase
        .from("emotions")
        .select("id, name_emotion, icone_emotion")
        .order("id", { ascending: true });
      if (primary.error) {
        // Fallback si la colonne icone_emotion n'existe pas dans un schéma legacy.
        primary = await supabase
          .from("emotions")
          .select("id, name_emotion")
          .order("id", { ascending: true });
      }

      data = primary.data as unknown[] | null;
      error = primary.error ? { message: primary.error.message } : null;

      // Fallback projet legacy: table emotion (singulier).
      if (error) {
        const fallback = await supabase.from("emotion").select("*").order("id", { ascending: true });
        data = fallback.data as unknown[] | null;
        error = fallback.error ? { message: fallback.error.message } : null;
      }

      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setEmotionCatalogFromDb([]);
        setEmotionCatalogError(error?.message || "Impossible de charger la table emotions.");
        return;
      }
      const palette = emotions.map((e) => e.color);
      const rows = (data as Array<{ id?: string | null; name_emotion?: string | null; icone_emotion?: string | null }>)
        .map((row, index) => ({
          id: asTrimmedString(row.id),
          name: asTrimmedString(row.name_emotion),
          color: palette[index % palette.length],
          icon: asTrimmedString(row.icone_emotion),
        }))
        .filter((row) => row.id && row.name);
      if (!rows.length) {
        setEmotionCatalogFromDb([]);
        setEmotionCatalogError("Aucune émotion valide (name_emotion) trouvée en base.");
        return;
      }
      setEmotionCatalogFromDb(rows);
      setEmotionCatalogError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canEditAgencyScope = scope.mode === "all" || scope.mode === "agency";
  const showOrganizationFilter = (role_id ?? 99) <= 3;

  const effectiveAgencyFilter = useMemo(() => {
    // Règle demandée:
    // - si filtre Organisation visible: filtre principal = select Organisation
    // - sinon: on ignore ce select et on se base sur le scope utilisateur
    if (showOrganizationFilter) {
      return selectedAgencyId === "all" ? null : selectedAgencyId;
    }
    if (scope.mode === "agency" || scope.mode === "expo") return scope.agencyId;
    return null;
  }, [showOrganizationFilter, selectedAgencyId, scope.mode, scope.agencyId]);

  const scopedExpos = useMemo(() => {
    const byScope = (() => {
      if (scope.mode === "expo") {
        return expoOptions.filter((ex) => ex.id === scope.expoId);
      }
      if (scope.mode === "agency") {
        return expoOptions.filter((ex) => expoMatchesAgencyFilter(ex, scope.agencyId));
      }
      if (scope.mode === "all") {
        return expoOptions;
      }
      return [] as ExpoOption[];
    })();
    if (!effectiveAgencyFilter) return byScope;
    return byScope.filter((ex) => expoMatchesAgencyFilter(ex, effectiveAgencyFilter));
  }, [scope.mode, scope.expoId, scope.agencyId, expoOptions, effectiveAgencyFilter]);

  const scopedArtworksBase = useMemo(() => {
    const base = getArtworksForDataScope(artworks, expos, scope);
    if (!effectiveAgencyFilter) return base;
    const allowedExpoIds = new Set(scopedExpos.map((e) => e.id));
    const filtered = base.filter((a) => allowedExpoIds.has(a.artwork_expo_id));
    return filtered.length > 0 ? filtered : base;
  }, [scope, effectiveAgencyFilter, scopedExpos]);

  const expoOptionsForSelect = useMemo(() => {
    if (effectiveAgencyFilter) {
      return scopedExpos.filter((ex) => expoMatchesAgencyFilter(ex, effectiveAgencyFilter));
    }
    return scopedExpos;
  }, [effectiveAgencyFilter, scopedExpos]);

  const canDrillExpo = (scope.mode === "all" || scope.mode === "agency") && expoOptionsForSelect.length > 1;

  const [drillExpoId, setDrillExpoId] = useState<string | "all">("all");
  const [selectedArtistId, setSelectedArtistId] = useState<string>("all");
  const [artistOptions, setArtistOptions] = useState<ArtistFilterOption[]>([]);
  const [artworkIdsByArtistId, setArtworkIdsByArtistId] = useState<Map<string, Set<string>>>(() => new Map());
  const [artistCoverLetter, setArtistCoverLetter] = useState<StatisticsArtistCoverLetter | null>(null);

  useEffect(() => {
    if (!showOrganizationFilter) {
      if (scope.mode === "agency" || scope.mode === "expo") {
        setSelectedAgencyId(scope.agencyId);
      } else {
        setSelectedAgencyId("all");
      }
      return;
    }
    if (scope.mode === "agency" || scope.mode === "expo") {
      setSelectedAgencyId(scope.agencyId);
      return;
    }
    // En mode global, conserver la sélection utilisateur et éviter le reset à "all".
    setSelectedAgencyId((prev) => {
      if (prev === "all") return prev;
      return agencyOptions.some((a) => a.id === prev) ? prev : "all";
    });
  }, [scope.mode, scope.agencyId, showOrganizationFilter, agencyOptions]);

  useEffect(() => {
    const key = `${scope.mode}|${scope.agencyId ?? ""}|${scope.expoId ?? ""}`;
    if (userScopeKeyRef.current && userScopeKeyRef.current !== key) {
      setDrillExpoId("all");
    }
    userScopeKeyRef.current = key;
  }, [scope.mode, scope.agencyId, scope.expoId]);

  useEffect(() => {
    if (drillExpoId === "all") return;
    if (expoOptionsForSelect.length === 0) return;
    const exists = expoOptionsForSelect.some((ex) => ex.id === drillExpoId);
    if (!exists) setDrillExpoId("all");
  }, [drillExpoId, expoOptionsForSelect]);

  /** Restaure org/expo après fermeture de l’aperçu (évite les resets intempestifs). */
  useEffect(() => {
    if (printPreviewOpen || !shouldRestorePreviewFiltersRef.current) return;
    shouldRestorePreviewFiltersRef.current = false;
    const snap = previewFiltersSnapshotRef.current;
    if (!snap) return;
    setSelectedAgencyId(snap.agencyId);
    setDrillExpoId(snap.expoId);
    setSelectedArtistId(snap.artistId);
    previewFiltersSnapshotRef.current = null;
  }, [printPreviewOpen]);

  /** Expo précisément filtrée (pas « toutes les expos »). */
  const selectedFilteredExpoId = useMemo((): string | null => {
    if (!canDrillExpo) {
      const only = expoOptionsForSelect[0];
      return only?.id ?? (scope.mode === "expo" ? scope.expoId : null);
    }
    if (drillExpoId === "all") return null;
    return drillExpoId;
  }, [canDrillExpo, drillExpoId, expoOptionsForSelect, scope.mode, scope.expoId]);

  const selectedFilteredExpo = useMemo(() => {
    if (!selectedFilteredExpoId) return null;
    return expoOptions.find((e) => e.id === selectedFilteredExpoId) ?? null;
  }, [selectedFilteredExpoId, expoOptions]);

  const showArtistFilter = selectedFilteredExpoId !== null;

  const artistArtworkIds = useMemo((): Set<string> | null => {
    if (selectedArtistId === "all") return null;
    return artworkIdsByArtistId.get(selectedArtistId) ?? new Set();
  }, [selectedArtistId, artworkIdsByArtistId]);

  useEffect(() => {
    setSelectedArtistId("all");
  }, [selectedFilteredExpoId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!selectedFilteredExpoId) {
        setArtistOptions([]);
        setArtworkIdsByArtistId(new Map());
        return;
      }

      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);

      let query = supabase
        .from("artworks")
        .select("artwork_id, artwork_artist_id, artists!left(artist_firstname, artist_lastname)")
        .eq("artwork_expo_id", selectedFilteredExpoId);
      if (targetAgencyId) query = query.eq("artwork_agency_id", targetAgencyId);

      const { data, error } = await query;
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setArtistOptions([]);
        setArtworkIdsByArtistId(new Map());
        return;
      }

      const byArtist = new Map<string, { name: string; firstName: string; lastName: string; artworkIds: Set<string> }>();
      for (const row of data as Array<{
        artwork_id?: string | null;
        artwork_artist_id?: string | null;
        artists?:
          | { artist_firstname?: string | null; artist_lastname?: string | null }
          | Array<{ artist_firstname?: string | null; artist_lastname?: string | null }>;
      }>) {
        const artistId = asTrimmedString(row.artwork_artist_id);
        const artworkId = asTrimmedString(row.artwork_id);
        if (!artistId || !artworkId) continue;
        const artistJoin = Array.isArray(row.artists) ? row.artists[0] : row.artists;
        const firstName = asTrimmedString(artistJoin?.artist_firstname);
        const lastName = asTrimmedString(artistJoin?.artist_lastname);
        const label = `${firstName} ${lastName}`.trim() || artistId;
        const slot = byArtist.get(artistId) ?? {
          name: label,
          firstName,
          lastName,
          artworkIds: new Set<string>(),
        };
        slot.name = label;
        slot.firstName = firstName || slot.firstName;
        slot.lastName = lastName || slot.lastName;
        slot.artworkIds.add(artworkId);
        byArtist.set(artistId, slot);
      }

      const options = Array.from(byArtist.entries())
        .map(([id, { name, firstName, lastName }]) => ({ id, name, firstName, lastName }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      setArtistOptions(options);
      setArtworkIdsByArtistId(new Map(Array.from(byArtist.entries()).map(([id, { artworkIds }]) => [id, artworkIds])));
      setSelectedArtistId((prev) => (prev === "all" || byArtist.has(prev) ? prev : "all"));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFilteredExpoId, effectiveAgencyFilter, scope.mode, scope.agencyId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (selectedArtistId === "all" || !selectedFilteredExpoId) {
        setArtistCoverLetter(null);
        return;
      }

      const artist = artistOptions.find((option) => option.id === selectedArtistId);
      if (!artist) {
        setArtistCoverLetter(null);
        return;
      }

      const expo = selectedFilteredExpo;
      if (!expo) {
        setArtistCoverLetter(null);
        return;
      }

      const agencyId =
        expo.agency_id ??
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const agencyName =
        (agencyId ? agencyOptions.find((option) => option.id === agencyId)?.name : null) ||
        (selectedAgencyId !== "all" ? agencyOptions.find((option) => option.id === selectedAgencyId)?.name : null) ||
        "—";

      let signatoryFirstName = asTrimmedString(expo.curatorFirstName);
      let signatoryLastName = asTrimmedString(expo.curatorLastName);

      if (!signatoryFirstName && !signatoryLastName && agencyId) {
        const { data: managerLink, error: linkError } = await supabase
          .from("agency_users")
          .select("user_id")
          .eq("agency_id", agencyId)
          .eq("role_id", 4)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const managerUserId = asTrimmedString(
          (managerLink as { user_id?: string | null } | null)?.user_id,
        );
        if (!linkError && managerUserId) {
          const { data: profileRow, error: profileError } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", managerUserId)
            .maybeSingle();
          if (!profileError && profileRow) {
            signatoryFirstName = asTrimmedString(
              (profileRow as { first_name?: string | null }).first_name,
            );
            signatoryLastName = asTrimmedString(
              (profileRow as { last_name?: string | null }).last_name,
            );
          }
        }
      }

      if (cancelled) return;
      setArtistCoverLetter({
        artistFirstName: artist.firstName,
        artistLastName: artist.lastName,
        agencyName,
        expoName: expo.expo_name,
        signatoryFirstName,
        signatoryLastName,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedArtistId,
    selectedFilteredExpoId,
    selectedFilteredExpo,
    artistOptions,
    agencyOptions,
    effectiveAgencyFilter,
    selectedAgencyId,
    scope.mode,
    scope.agencyId,
  ]);

  const expoDateRange = useMemo(() => {
    if (selectedFilteredExpo) {
      const start = parseExpoYmdDate(selectedFilteredExpo.date_expo_du);
      const end = parseExpoYmdDate(selectedFilteredExpo.date_expo_au);
      if (start && end && start.getTime() <= end.getTime()) return { start, end };
    }
    if (manualPreviewDateFrom && manualPreviewDateTo) {
      const start = parseExpoYmdDate(manualPreviewDateFrom);
      const end = parseExpoYmdDate(manualPreviewDateTo);
      if (start && end && start.getTime() <= end.getTime()) return { start, end };
    }
    return null;
  }, [selectedFilteredExpo, manualPreviewDateFrom, manualPreviewDateTo]);

  const stickyExpoLogoMeta = useMemo(() => {
    if (!selectedFilteredExpo) return { logoUrl: null as string | null, name: null as string | null };
    const raw = selectedFilteredExpo.logoRaw?.trim();
    if (!raw) return { logoUrl: null, name: selectedFilteredExpo.expo_name };
    return {
      logoUrl: resolveExpoLogoImgSrc(raw),
      name: selectedFilteredExpo.expo_name,
    };
  }, [selectedFilteredExpo]);

  const previewExpoDateRange = useMemo(() => {
    if (!expoDateRange) return null;
    return {
      from: toFrDateLabel(expoDateRange.start),
      to: toFrDateLabel(expoDateRange.end),
    };
  }, [expoDateRange]);

  const visitorGeoMapScopeKey = useMemo(() => {
    const targetAgencyId =
      effectiveAgencyFilter ??
      (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
    const targetExpoId =
      drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;
    const rangeKey = expoDateRange
      ? `${expoDateRange.start.toISOString()}_${expoDateRange.end.toISOString()}`
      : "all";
    return [targetAgencyId ?? "all", targetExpoId ?? "all", rangeKey].join("|");
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, expoDateRange]);

  useEffect(() => {
    setManualPreviewDateFrom("");
    setManualPreviewDateTo("");
  }, [drillExpoId]);

  useEffect(() => {
    setWeekOffset(0);
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.expoId, selectedArtistId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      if (artistArtworkIds && artistArtworkIds.size === 0) {
        setFeedbackCountsByEmotionId({});
        setFeedbackTotal(0);
        setUniqueVisitorsTotal(0);
        setAverageHearts(null);
        return;
      }

      let query = supabase.from("visitor_feedback").select("emotion_id, visitor_id, heart_rating, artwork_id");
      if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
      if (targetExpoId) query = query.eq("expo_id", targetExpoId);
      if (expoDateRange) {
        const rangeStart = new Date(expoDateRange.start); rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(expoDateRange.end); rangeEnd.setHours(23, 59, 59, 999);
        query = query.gte("submitted_at", rangeStart.toISOString()).lte("submitted_at", rangeEnd.toISOString());
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setFeedbackCountsByEmotionId({});
        setFeedbackTotal(0);
        setUniqueVisitorsTotal(0);
        setAverageHearts(null);
        return;
      }
      const rows = filterFeedbackRowsByArtworkIds(
        data as Array<{
          emotion_id?: string | number | null;
          visitor_id?: string | number | null;
          heart_rating?: string | number | null;
          artwork_id?: string | number | null;
        }>,
        artistArtworkIds,
      );
      const counts: Record<string, number> = {};
      const uniqueVisitorIds = new Set<string>();
      let heartsSum = 0;
      let heartsCount = 0;
      for (const row of rows) {
        const emotionId = asTrimmedString(row.emotion_id);
        if (!emotionId) continue;
        counts[emotionId] = (counts[emotionId] ?? 0) + 1;
        const visitorId = asTrimmedString(row.visitor_id);
        if (visitorId) uniqueVisitorIds.add(visitorId);
        const heartRaw = row.heart_rating;
        const heartValue =
          typeof heartRaw === "number"
            ? heartRaw
            : typeof heartRaw === "string"
              ? Number.parseFloat(heartRaw)
              : NaN;
        if (Number.isFinite(heartValue) && heartValue > 0) {
          heartsSum += heartValue;
          heartsCount += 1;
        }
      }
      setFeedbackCountsByEmotionId(counts);
      setFeedbackTotal(rows.length);
      setUniqueVisitorsTotal(uniqueVisitorIds.size);
      setAverageHearts(heartsCount > 0 ? heartsSum / heartsCount : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, artistArtworkIds, expoDateRange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      const { data, error } = await supabase
        .from("artworks")
        .select("artwork_status, artwork_agency_id, artwork_expo_id, artwork_artist_id");
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setActiveArtworksCount(0);
        return;
      }

      const rows = (data as Array<{
        artwork_status?: string | null;
        artwork_agency_id?: string | null;
        artwork_expo_id?: string | null;
        artwork_artist_id?: string | null;
      }>).filter((row) => {
        const rowAgencyId = asTrimmedString(row.artwork_agency_id);
        const rowExpoId = asTrimmedString(row.artwork_expo_id);
        if (targetAgencyId && rowAgencyId !== targetAgencyId) return false;
        if (targetExpoId && rowExpoId !== targetExpoId) return false;
        if (selectedArtistId !== "all" && asTrimmedString(row.artwork_artist_id) !== selectedArtistId) return false;
        return true;
      });
      const normalizedStatuses = rows.map((r) => asTrimmedString(r.artwork_status).toLowerCase()).filter(Boolean);
      const count = normalizedStatuses.filter((s) => s === "active").length;
      setActiveArtworksCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, selectedArtistId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      if (artistArtworkIds && artistArtworkIds.size === 0) {
        setTemporalSeries([]);
        return;
      }

      if (expoDateRange) {
        const rangeStart = new Date(expoDateRange.start);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(expoDateRange.end);
        rangeEnd.setHours(23, 59, 59, 999);

        let query = supabase
          .from("visitor_feedback")
          .select("submitted_at, artwork_id")
          .gte("submitted_at", rangeStart.toISOString())
          .lte("submitted_at", rangeEnd.toISOString());
        if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
        if (targetExpoId) query = query.eq("expo_id", targetExpoId);

        const { data, error } = await query;
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setTemporalSeries([]);
          return;
        }
        const rows = filterFeedbackRowsByArtworkIds(
          data as Array<{ submitted_at?: string | null; artwork_id?: string | number | null }>,
          artistArtworkIds,
        );
        setTemporalSeries(buildDailyTemporalSeries(rows, expoDateRange.start, expoDateRange.end));
        return;
      }

      const weekStart = startOfWeekMonday(new Date());
      weekStart.setDate(weekStart.getDate() + weekOffset * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      let query = supabase
        .from("visitor_feedback")
        .select("submitted_at, artwork_id")
        .gte("submitted_at", weekStart.toISOString())
        .lte("submitted_at", weekEnd.toISOString());
      if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
      if (targetExpoId) query = query.eq("expo_id", targetExpoId);

      const { data, error } = await query;
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setTemporalSeries([]);
        return;
      }

      const init = Array.from({ length: 7 }).map((_, i) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        return { date: toYmd(dayDate), day: toFrDayMonth(dayDate), visits: 0 };
      });
      const byDate = new Map(init.map((x) => [x.date, x]));

      for (const row of filterFeedbackRowsByArtworkIds(
        data as Array<{ submitted_at?: string | null; artwork_id?: string | number | null }>,
        artistArtworkIds,
      )) {
        const submittedAt = asTrimmedString(row.submitted_at);
        if (!submittedAt) continue;
        const d = new Date(submittedAt);
        if (Number.isNaN(d.getTime())) continue;
        const key = toYmd(d);
        const slot = byDate.get(key);
        if (!slot) continue;
        slot.visits += 1;
      }

      const series = init.map((x, i) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const weekday = toFrWeekdayShort(dayDate);
        const dateLabel = x.day;
        return {
          day: `${weekday}|${dateLabel}`,
          date: x.date,
          weekday,
          dateLabel,
          visites: x.visits,
        };
      });
      setTemporalSeries(series);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, weekOffset, expoDateRange, artistArtworkIds]);

  const loadTemporalSeriesForPdf = useCallback(async () => {
    const targetAgencyId =
      effectiveAgencyFilter ??
      (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
    const targetExpoId =
      drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

    if (artistArtworkIds && artistArtworkIds.size === 0) {
      setTemporalSeriesForPdf([]);
      return;
    }

    if (expoDateRange) {
      const rangeStart = new Date(expoDateRange.start);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(expoDateRange.end);
      rangeEnd.setHours(23, 59, 59, 999);

      let query = supabase
        .from("visitor_feedback")
        .select("submitted_at, artwork_id")
        .gte("submitted_at", rangeStart.toISOString())
        .lte("submitted_at", rangeEnd.toISOString());
      if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
      if (targetExpoId) query = query.eq("expo_id", targetExpoId);

      const { data, error } = await query;
      if (error || !Array.isArray(data)) {
        setTemporalSeriesForPdf([]);
        return;
      }
      const rows = filterFeedbackRowsByArtworkIds(
        data as Array<{ submitted_at?: string | null; artwork_id?: string | number | null }>,
        artistArtworkIds,
      );
      setTemporalSeriesForPdf(buildDailyTemporalSeries(rows, expoDateRange.start, expoDateRange.end));
      return;
    }

    let query = supabase.from("visitor_feedback").select("submitted_at, artwork_id");
    if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
    if (targetExpoId) query = query.eq("expo_id", targetExpoId);

    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length === 0) {
      setTemporalSeriesForPdf([]);
      return;
    }

    let minMs = Infinity;
    let maxMs = -Infinity;
    const filteredRows = filterFeedbackRowsByArtworkIds(
      data as Array<{ submitted_at?: string | null; artwork_id?: string | number | null }>,
      artistArtworkIds,
    );
    if (filteredRows.length === 0) {
      setTemporalSeriesForPdf([]);
      return;
    }
    for (const row of filteredRows) {
      const submittedAt = asTrimmedString(row.submitted_at);
      if (!submittedAt) continue;
      const d = new Date(submittedAt);
      if (Number.isNaN(d.getTime())) continue;
      const t = d.getTime();
      minMs = Math.min(minMs, t);
      maxMs = Math.max(maxMs, t);
    }
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
      setTemporalSeriesForPdf([]);
      return;
    }

    const d0 = new Date(minMs);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(maxMs);
    d1.setHours(0, 0, 0, 0);

    const byDate = new Map<string, number>();
    for (let cur = new Date(d0); cur.getTime() <= d1.getTime(); cur.setDate(cur.getDate() + 1)) {
      byDate.set(toYmd(cur), 0);
    }
    for (const row of filteredRows) {
      const submittedAt = asTrimmedString(row.submitted_at);
      if (!submittedAt) continue;
      const d = new Date(submittedAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = toYmd(d);
      if (byDate.has(key)) byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }

    const series: Array<{
      day: string;
      date: string;
      weekday: string;
      dateLabel: string;
      visites: number;
    }> = [];
    for (let cur = new Date(d0); cur.getTime() <= d1.getTime(); cur.setDate(cur.getDate() + 1)) {
      const key = toYmd(cur);
      const weekday = toFrWeekdayShort(cur);
      const dateLabel = toFrDayMonth(cur);
      series.push({
        day: `${weekday}|${dateLabel}`,
        date: key,
        weekday,
        dateLabel,
        visites: byDate.get(key) ?? 0,
      });
    }
    setTemporalSeriesForPdf(series);
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, expoDateRange, artistArtworkIds]);

  useEffect(() => {
    if (!printPreviewOpen) return;
    void loadTemporalSeriesForPdf();
  }, [printPreviewOpen, loadTemporalSeriesForPdf]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      if (artistArtworkIds && artistArtworkIds.size === 0) {
        setHourlySeries([]);
        return;
      }

      let query = supabase.from("visitor_feedback").select("submitted_at, artwork_id");
      if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
      if (targetExpoId) query = query.eq("expo_id", targetExpoId);
      if (expoDateRange) {
        const rangeStart = new Date(expoDateRange.start); rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(expoDateRange.end); rangeEnd.setHours(23, 59, 59, 999);
        query = query.gte("submitted_at", rangeStart.toISOString()).lte("submitted_at", rangeEnd.toISOString());
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setHourlySeries([]);
        return;
      }

      const counts = Array.from({ length: 24 }, () => 0);
      for (const row of filterFeedbackRowsByArtworkIds(
        data as Array<{ submitted_at?: string | null; artwork_id?: string | number | null }>,
        artistArtworkIds,
      )) {
        const raw = asTrimmedString(row.submitted_at);
        if (!raw) continue;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        const h = d.getHours();
        if (h >= 0 && h <= 23) counts[h] += 1;
      }
      const series = counts.map((v, h) => ({
        hour: `${String(h).padStart(2, "0")}h`,
        visites: v,
      }));
      setHourlySeries(series);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, artistArtworkIds, expoDateRange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setTopArtworksError(null);
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      let artworksQuery = supabase
        .from("artworks")
        .select("artwork_id, artwork_title, artwork_artist_id, artwork_image_url, artwork_photo_url, artists!left(artist_firstname, artist_lastname)");
      if (targetAgencyId) artworksQuery = artworksQuery.eq("artwork_agency_id", targetAgencyId);
      if (targetExpoId) artworksQuery = artworksQuery.eq("artwork_expo_id", targetExpoId);
      if (selectedArtistId !== "all") artworksQuery = artworksQuery.eq("artwork_artist_id", selectedArtistId);
      const { data: artworkRows, error: artworksError } = await artworksQuery;
      if (cancelled) return;
      if (artworksError || !Array.isArray(artworkRows)) {
        setTopArtworks([]);
        setTopArtworksError(artworksError?.message || "Impossible de charger le classement des œuvres.");
        return;
      }
      const scopedArtworkIds = (artworkRows as Array<{ artwork_id?: string | null }>)
        .map((row) => asTrimmedString(row.artwork_id))
        .filter(Boolean);
      if (!scopedArtworkIds.length) {
        setTopArtworks([]);
        setTopArtworksError(null);
        return;
      }

      const aggregates = new Map<string, { visits: number; heartsSum: number; heartsCount: number }>();
      let feedbackQuery = supabase.from("visitor_feedback").select("artwork_id, heart_rating");
      if (targetAgencyId) feedbackQuery = feedbackQuery.eq("agency_id", targetAgencyId);
      if (targetExpoId) feedbackQuery = feedbackQuery.eq("expo_id", targetExpoId);
      if (expoDateRange) {
        const rangeStart = new Date(expoDateRange.start); rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(expoDateRange.end); rangeEnd.setHours(23, 59, 59, 999);
        feedbackQuery = feedbackQuery.gte("submitted_at", rangeStart.toISOString()).lte("submitted_at", rangeEnd.toISOString());
      }
      const { data: feedbackData, error: feedbackError } = await feedbackQuery;
      if (cancelled) return;
      if (feedbackError || !Array.isArray(feedbackData)) {
        setTopArtworks([]);
        setTopArtworksError(feedbackError?.message || "Impossible de charger les feedbacks du classement.");
        return;
      }

      const scopedArtworkSet = new Set(scopedArtworkIds);
      for (const row of feedbackData as Array<{ artwork_id?: string | number | null; heart_rating?: string | number | null }>) {
        const artworkId = asTrimmedString(row.artwork_id);
        if (!artworkId || !scopedArtworkSet.has(artworkId)) continue;
        const agg = aggregates.get(artworkId) ?? { visits: 0, heartsSum: 0, heartsCount: 0 };
        agg.visits += 1;
        const heartValue =
          typeof row.heart_rating === "number"
            ? row.heart_rating
            : typeof row.heart_rating === "string"
              ? Number.parseFloat(row.heart_rating)
              : NaN;
        if (Number.isFinite(heartValue) && heartValue > 0) {
          agg.heartsSum += heartValue;
          agg.heartsCount += 1;
        }
        aggregates.set(artworkId, agg);
      }

      const titleByArtworkId = new Map<string, string>();
      const artistIdByArtworkId = new Map<string, string>();
      const imageByArtworkId = new Map<string, string | null>();
      const artistLabelByArtworkId = new Map<string, string>();
      for (const row of artworkRows as Array<{
        artwork_id?: string | null;
        artwork_title?: string | null;
        artwork_artist_id?: string | null;
        artwork_image_url?: string | null;
        artwork_photo_url?: string | null;
        artists?:
          | {
              artist_firstname?: string | null;
              artist_lastname?: string | null;
            }
          | Array<{
              artist_firstname?: string | null;
              artist_lastname?: string | null;
            }>
          | null;
      }>) {
        const artworkId = asTrimmedString(row.artwork_id);
        if (!artworkId) continue;
        titleByArtworkId.set(artworkId, asTrimmedString(row.artwork_title) || artworkId);
        const artistId = asTrimmedString(row.artwork_artist_id);
        if (artistId) artistIdByArtworkId.set(artworkId, artistId);
        const imageUrl = asTrimmedString(row.artwork_image_url) || asTrimmedString(row.artwork_photo_url) || null;
        imageByArtworkId.set(artworkId, imageUrl);
        const artistJoin = Array.isArray(row.artists) ? row.artists[0] : row.artists;
        const joinedArtistLabel = `${asTrimmedString(artistJoin?.artist_firstname)} ${asTrimmedString(artistJoin?.artist_lastname)}`.trim();
        if (joinedArtistLabel) {
          artistLabelByArtworkId.set(artworkId, joinedArtistLabel);
        }
      }

      const uniqueArtistIds = Array.from(new Set(Array.from(artistIdByArtworkId.values())));
      const artistNameById = new Map<string, string>();
      if (uniqueArtistIds.length > 0) {
        const { data: artistRows } = await supabase
          .from("artists")
          .select("artist_id, artist_firstname, artist_lastname")
          .in("artist_id", uniqueArtistIds);
        if (!cancelled && Array.isArray(artistRows)) {
          for (const row of artistRows as Array<{
            artist_id?: string | null;
            artist_firstname?: string | null;
            artist_lastname?: string | null;
          }>) {
            const artistId = asTrimmedString(row.artist_id);
            if (!artistId) continue;
            const label = `${asTrimmedString(row.artist_firstname)} ${asTrimmedString(row.artist_lastname)}`.trim();
            artistNameById.set(artistId, label || artistId);
          }
        }
      }

      const rows: TopArtworkRow[] = scopedArtworkIds
        .map((artworkId) => {
          const agg = aggregates.get(artworkId) ?? { visits: 0, heartsSum: 0, heartsCount: 0 };
          const artistId = artistIdByArtworkId.get(artworkId);
          return {
            artworkId,
            title: titleByArtworkId.get(artworkId) || artworkId,
            artist: artistLabelByArtworkId.get(artworkId) || (artistId ? artistNameById.get(artistId) || "—" : "—"),
            imageUrl: imageByArtworkId.get(artworkId) || null,
            visits: agg.visits,
            avgHearts: agg.heartsCount > 0 ? agg.heartsSum / agg.heartsCount : null,
          };
        })
        .sort((a, b) => b.visits - a.visits || a.title.localeCompare(b.title, "fr-FR"));

      setTopArtworks(rows);
      setTopArtworksError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, selectedArtistId, expoDateRange]);

  const runVisitorGeocoding = useCallback(async (
    baseRows: VisitorGeoTableRow[],
    opts: { force?: boolean } = {},
    externalRunId?: number,
  ) => {
    const runId = externalRunId ?? ++geoRunRef.current;
    const hydratedRows = await hydrateProfilePlaceData(baseRows);
    const { rows: toProcess, runGeocoder, bypassQueryCache, force } = prepareGeocodingPass(hydratedRows, opts);

    if (runId !== geoRunRef.current) return;

    if (runGeocoder) {
      setVisitorGeoRows(toProcess);
      setVisitorGeoGeocoding(true);
      setVisitorGeoProgress(null);
    } else {
      setVisitorGeoRows(toProcess);
      setVisitorGeoGeocoding(false);
      setVisitorGeoProgress(null);
      return;
    }

    try {
      const enriched = await geocodeVisitorGeoRows(
        toProcess,
        (done, total) => {
          if (runId === geoRunRef.current) setVisitorGeoProgress({ done, total });
        },
        (updatedRows) => {
          if (runId === geoRunRef.current) setVisitorGeoRows(updatedRows);
        },
        { bypassQueryCache, force },
      );
      if (runId === geoRunRef.current) setVisitorGeoRows(enriched);
    } finally {
      if (runId === geoRunRef.current) {
        setVisitorGeoGeocoding(false);
        setVisitorGeoProgress(null);
      }
    }
  }, []);

  const handleRefreshVisitorGeocoding = useCallback(async () => {
    if (visitorGeoGeocoding || visitorGeoLoading) return;

    setVisitorGeoError(null);

    try {
      const { rows, error } = await fetchVisitorGeographyForStatistics(visitorGeoScopeRef.current);
      if (error) {
        setVisitorGeoError(error);
        return;
      }

      visitorGeoBaseRowsRef.current = rows;
      if (rows.length === 0) {
        setVisitorGeoRows([]);
        return;
      }

      await runVisitorGeocoding(rows, { force: true });
    } catch (err) {
      setVisitorGeoError(
        err instanceof Error ? err.message : "Impossible de recalculer la géolocalisation.",
      );
    }
  }, [runVisitorGeocoding, visitorGeoGeocoding, visitorGeoLoading]);

  useEffect(() => {
    let cancelled = false;
    const runId = ++geoRunRef.current;

    void (async () => {
      setVisitorGeoLoading(true);
      setVisitorGeoError(null);
      setVisitorGeoProgress(null);

      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      visitorGeoScopeRef.current = { targetAgencyId, targetExpoId, expoDateRange };

      try {
        const { rows, error } = await fetchVisitorGeographyForStatistics({
          targetAgencyId,
          targetExpoId,
          expoDateRange,
        });

        if (cancelled || runId !== geoRunRef.current) return;
        if (error) {
          visitorGeoBaseRowsRef.current = [];
          setVisitorGeoRows([]);
          setVisitorGeoError(error);
          return;
        }

        visitorGeoBaseRowsRef.current = rows;

        if (rows.length === 0) {
          setVisitorGeoRows([]);
          return;
        }

        await runVisitorGeocoding(rows, {}, runId);
      } catch (err) {
        if (cancelled || runId !== geoRunRef.current) return;
        visitorGeoBaseRowsRef.current = [];
        setVisitorGeoRows([]);
        setVisitorGeoError(err instanceof Error ? err.message : "Impossible de charger la géographie des visiteurs.");
      } finally {
        if (!cancelled && runId === geoRunRef.current) setVisitorGeoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveAgencyFilter,
    drillExpoId,
    scope.mode,
    scope.agencyId,
    scope.expoId,
    expoDateRange,
    runVisitorGeocoding,
  ]);

  const emotionCatalog = useMemo(() => emotionCatalogFromDb, [emotionCatalogFromDb]);

  const emotionSeries = useMemo(() => {
    return emotionCatalog.map((emo) => {
      const count = feedbackCountsByEmotionId[emo.id] ?? 0;
      const percentage = feedbackTotal > 0 ? Math.round((count / feedbackTotal) * 100) : 0;
      return {
        ...emo,
        percentage,
        count,
      };
    });
  }, [emotionCatalog, feedbackCountsByEmotionId, feedbackTotal]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCrossError(null);
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      let artworksQuery = supabase.from("artworks").select("artwork_id, artwork_title");
      if (targetAgencyId) artworksQuery = artworksQuery.eq("artwork_agency_id", targetAgencyId);
      if (targetExpoId) artworksQuery = artworksQuery.eq("artwork_expo_id", targetExpoId);
      if (selectedArtistId !== "all") artworksQuery = artworksQuery.eq("artwork_artist_id", selectedArtistId);
      const { data: artworksData, error: artworksError } = await artworksQuery;
      if (cancelled) return;
      if (artworksError || !Array.isArray(artworksData)) {
        setCrossRows([]);
        setCrossError(artworksError?.message || "Impossible de charger les données du tableau croisé.");
        return;
      }

      const scopedArtworks = (artworksData as Array<{ artwork_id?: string | null; artwork_title?: string | null }>)
        .map((row) => ({
          artworkId: asTrimmedString(row.artwork_id),
          name: asTrimmedString(row.artwork_title),
        }))
        .filter((row) => row.artworkId);
      if (!scopedArtworks.length) {
        setCrossRows([]);
        setCrossError(null);
        return;
      }

      const byArtwork = new Map<string, Record<string, number>>();
      for (const aw of scopedArtworks) {
        byArtwork.set(aw.artworkId, {});
      }
      const scopedArtworkSet = new Set(scopedArtworks.map((x) => x.artworkId));

      let feedbackQuery = supabase.from("visitor_feedback").select("artwork_id, emotion_id");
      if (targetAgencyId) feedbackQuery = feedbackQuery.eq("agency_id", targetAgencyId);
      if (targetExpoId) feedbackQuery = feedbackQuery.eq("expo_id", targetExpoId);
      if (expoDateRange) {
        const rangeStart = new Date(expoDateRange.start); rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(expoDateRange.end); rangeEnd.setHours(23, 59, 59, 999);
        feedbackQuery = feedbackQuery.gte("submitted_at", rangeStart.toISOString()).lte("submitted_at", rangeEnd.toISOString());
      }
      const { data: feedbackData, error: feedbackError } = await feedbackQuery;
      if (cancelled) return;
      if (feedbackError || !Array.isArray(feedbackData)) {
        setCrossRows([]);
        setCrossError(feedbackError?.message || "Impossible de charger les données du tableau croisé.");
        return;
      }
      for (const row of feedbackData as Array<{ artwork_id?: string | number | null; emotion_id?: string | number | null }>) {
        const artworkId = asTrimmedString(row.artwork_id);
        const emotionId = asTrimmedString(row.emotion_id);
        if (!artworkId || !emotionId || !scopedArtworkSet.has(artworkId)) continue;
        const bucket = byArtwork.get(artworkId) ?? {};
        bucket[emotionId] = (bucket[emotionId] ?? 0) + 1;
        byArtwork.set(artworkId, bucket);
      }

      const rows = scopedArtworks
        .map((row) => {
          const counts = byArtwork.get(row.artworkId) ?? {};
          const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
          return {
            artworkId: row.artworkId,
            name: row.name || row.artworkId,
            counts,
            total,
          };
        })
        .sort((a, b) => b.total - a.total)
        .map(({ artworkId, name, counts }) => ({ artworkId, name, counts }));

      setCrossRows(rows);
      setCrossError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, selectedArtistId, expoDateRange]);

  const miniKpis = useMemo(() => {
    const kpi = (
      id: "uniqueVisitors" | "avgHearts" | "dominantEmotion" | "activeArtworks",
      icon: typeof Eye,
      value: string,
    ) => ({
      id,
      icon,
      value,
      label: t(`kpis.${id}.label`),
      hint: t(`kpis.${id}.hint`),
    });

    if (feedbackTotal === 0) {
      return [
        kpi("uniqueVisitors", Eye, formatFrNumber(uniqueVisitorsTotal)),
        kpi("avgHearts", Heart, "—"),
        kpi("dominantEmotion", Smile, "—"),
        kpi("activeArtworks", Image, formatFrNumber(activeArtworksCount)),
      ];
    }
    const dominant = feedbackTotal > 0 && emotionSeries.length
      ? emotionSeries.reduce((best, e) => (e.percentage > best.percentage ? e : best), emotionSeries[0])
      : null;
    return [
      kpi("uniqueVisitors", Eye, formatFrNumber(uniqueVisitorsTotal)),
      kpi(
        "avgHearts",
        Heart,
        averageHearts == null
          ? "—"
          : formatFrNumber(averageHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      ),
      kpi("dominantEmotion", Smile, dominant?.name || "—"),
      kpi("activeArtworks", Image, formatFrNumber(activeArtworksCount)),
    ];
  }, [emotionSeries, uniqueVisitorsTotal, feedbackTotal, averageHearts, activeArtworksCount, t]);

  const showScopeHint =
    !authLoading &&
    scope.mode === "none" &&
    !(typeof role_id === "number" && role_id >= 1 && role_id <= 3) &&
    !hasFullDataAccess(role_name);
  const crossEmotionColumns = useMemo(() => {
    if (emotionCatalog.length > 0) {
      return emotionCatalog.map((e) => ({ id: e.id, name: e.name, icon: e.icon }));
    }
    const ids = new Set<string>();
    for (const row of crossRows) {
      Object.keys(row.counts).forEach((id) => ids.add(id));
    }
    return Array.from(ids).map((id) => ({ id, name: id, icon: "" }));
  }, [emotionCatalog, crossRows]);
  const sortedTopArtworks = useMemo(() => {
    const data = [...topArtworks];
    data.sort((a, b) => {
      if (topSortKey === "visits") {
        return topSortDirection === "asc" ? a.visits - b.visits : b.visits - a.visits;
      }
      const aVal = a.avgHearts ?? -1;
      const bVal = b.avgHearts ?? -1;
      return topSortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [topArtworks, topSortKey, topSortDirection]);

  const toggleTopSort = (key: TopSortKey) => {
    if (topSortKey === key) {
      setTopSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setTopSortKey(key);
    setTopSortDirection("desc");
  };
  const sortedCrossRows = useMemo(() => {
    if (!crossSortEmotionId) return crossRows;
    const rows = [...crossRows];
    rows.sort((a, b) => {
      const aVal = a.counts[crossSortEmotionId] ?? 0;
      const bVal = b.counts[crossSortEmotionId] ?? 0;
      return crossSortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [crossRows, crossSortEmotionId, crossSortDirection]);

  const toggleCrossSort = (emotionId: string) => {
    if (crossSortEmotionId === emotionId) {
      setCrossSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setCrossSortEmotionId(emotionId);
    setCrossSortDirection("desc");
  };

  const timelineTickIntervalPdf =
    temporalSeriesForPdf.length > 18 ? Math.max(1, Math.floor(temporalSeriesForPdf.length / 14)) : 0;

  const timelineTickInterval =
    temporalSeries.length > 18 ? Math.max(1, Math.floor(temporalSeries.length / 14)) : 0;

  const filteredVisitsTotal = useMemo(() => sumChartVisits(hourlySeries), [hourlySeries]);

  const expectedChartSurfaces = useMemo(() => {
    let n = 0;
    if (temporalSeriesForPdf.length > 0) n++;
    if (hourlySeries.length > 0) n++;
    return n;
  }, [temporalSeriesForPdf, hourlySeries]);

  const selectedAgencyLabel = useMemo(() => {
    if (selectedAgencyId === "all") return "— (vue globale)";
    const option = agencyOptions.find((a) => a.id === selectedAgencyId);
    return option?.name || selectedAgencyId;
  }, [agencyOptions, selectedAgencyId]);

  const expoSelectValue = canDrillExpo
    ? drillExpoId
    : scope.mode === "expo"
      ? scope.expoId
      : expoOptionsForSelect[0]?.id || "";

  const previewExpoLabel = useMemo(() => {
    if (!canDrillExpo) {
      const only = expoOptionsForSelect[0];
      return only?.expo_name || "—";
    }
    if (drillExpoId === "all") return t("filter.allExpos");
    return expoOptionsForSelect.find((e) => e.id === drillExpoId)?.expo_name ?? drillExpoId;
  }, [canDrillExpo, drillExpoId, expoOptionsForSelect, t]);

  const previewArtistLabel = useMemo(() => {
    if (!showArtistFilter || selectedArtistId === "all") return t("filter.allArtists");
    return artistOptions.find((artist) => artist.id === selectedArtistId)?.name ?? selectedArtistId;
  }, [showArtistFilter, selectedArtistId, artistOptions, t]);

  /** Expo pour le logo du bloc « filtres » : expo choisie, ou 1ʳᵉ expo du périmètre si « toutes les expos ». */
  const previewExpoIdForLogo = useMemo(() => {
    if (selectedFilteredExpoId) return selectedFilteredExpoId;
    if (!canDrillExpo) {
      const only = expoOptionsForSelect[0];
      return only?.id ?? null;
    }
    if (drillExpoId === "all") {
      const first = expoOptionsForSelect[0];
      return first?.id ?? null;
    }
    return drillExpoId;
  }, [selectedFilteredExpoId, canDrillExpo, drillExpoId, expoOptionsForSelect]);

  const previewExpoLogoMeta = useMemo(() => {
    if (!previewExpoIdForLogo) return { logoUrl: null as string | null, name: null as string | null };
    const row = expoOptions.find((e) => e.id === previewExpoIdForLogo);
    if (!row) return { logoUrl: null, name: null };
    const raw = row.logoRaw?.trim();
    if (!raw) return { logoUrl: null, name: row.expo_name };
    return {
      logoUrl: resolveExpoLogoImgSrc(raw),
      name: row.expo_name,
    };
  }, [previewExpoIdForLogo, expoOptions]);

  /** Organisation dont on affiche le logo dans l'aperçu / PDF. */
  const previewAgencyIdForLogo = useMemo(() => {
    if (selectedAgencyId !== "all") return selectedAgencyId;
    if (scope.mode === "agency" || scope.mode === "expo") return scope.agencyId ?? null;
    if (selectedFilteredExpo?.agency_id) return selectedFilteredExpo.agency_id;
    if (effectiveAgencyFilter) return effectiveAgencyFilter;
    return null;
  }, [selectedAgencyId, scope.mode, scope.agencyId, selectedFilteredExpo, effectiveAgencyFilter]);

  const previewAgencyLogoMeta = useMemo(() => {
    if (!previewAgencyIdForLogo) return { logoUrl: null as string | null, name: null as string | null };
    const opt = agencyOptions.find((a) => a.id === previewAgencyIdForLogo);
    const raw = opt?.logoUrl?.trim();
    return {
      logoUrl: raw && raw.length > 0 ? raw : null,
      name: opt?.name ?? null,
    };
  }, [previewAgencyIdForLogo, agencyOptions]);

  const orgLabel =
    scope.mode === "all"
      ? selectedAgencyLabel
      : scope.mode === "agency"
        ? selectedAgencyLabel
        : scope.mode === "expo"
          ? selectedAgencyLabel
          : "—";

  const exportProgressLabel = useMemo(() => {
    if (!exportProgress) return "";
    const { phase, current, total, percent } = exportProgress;
    return t(`preview.exportProgress.${phase}`, {
      percent: Math.round(percent),
      current: current ?? 0,
      total: total ?? 0,
    });
  }, [exportProgress, t]);

  const prepareStatisticsExportData = async (): Promise<void> => {
    setExportProgress({ percent: 4, phase: "prepare" });
    try {
      await Promise.race([
        loadTemporalSeriesForPdf(),
        new Promise<void>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25_000)),
      ]);
    } catch {
      /* données déjà présentes ou délai */
    }
    setExportProgress({ percent: 10, phase: "prepare" });
    await new Promise((r) => setTimeout(r, 400));
  };

  const buildReportExportSnapshot = useCallback((): StatisticsReportViewProps => {
    return {
      orgLabel,
      previewExpoLabel,
      previewArtistLabel,
      previewArtistCoverLetter: artistCoverLetter,
      previewAgencyLogoMeta,
      previewExpoLogoMeta,
      previewExpoDateRange,
      miniKpis,
      emotionSeries,
      feedbackTotal,
      temporalSeriesForPdf,
      hourlySeries,
      timelineTickIntervalPdf,
      crossEmotionColumns,
      sortedCrossRows,
      crossError,
      sortedTopArtworks,
      topArtworksError,
      formatFrNumber,
    };
  }, [
    orgLabel,
    previewExpoLabel,
    previewArtistLabel,
    artistCoverLetter,
    previewAgencyLogoMeta,
    previewExpoLogoMeta,
    previewExpoDateRange,
    miniKpis,
    emotionSeries,
    feedbackTotal,
    temporalSeriesForPdf,
    hourlySeries,
    timelineTickIntervalPdf,
    crossEmotionColumns,
    sortedCrossRows,
    crossError,
    sortedTopArtworks,
    topArtworksError,
  ]);

  const buildPdfExportTables = useCallback((): StatisticsPdfExportTables => {
    return {
      cross: {
        title: t("cross.title"),
        subtitle: t("cross.subtitle"),
        errorText: crossError,
        emptyText: t("cross.empty"),
        artworkHeader: t("cross.colArtwork"),
        columns: crossEmotionColumns.map((emotion) => ({
          id: emotion.id,
          emoji: emotionEmojiForPreview(emotion.name, emotion.icon),
          label: t(`emotions.names.${normalizeEmotionKey(emotion.name)}`, {
            defaultValue: emotion.name,
          }),
        })),
        rows: sortedCrossRows.map((row) => ({
          name: row.name,
          counts: row.counts,
        })),
      },
      top: {
        title: t("top.title"),
        subtitle: t("top.subtitle"),
        errorText: topArtworksError,
        emptyText: t("top.empty"),
        rankHeader: t("top.colRank"),
        artworkHeader: t("top.colArtwork"),
        visitsHeader: t("top.colVisits"),
        avgHeartsHeader: t("top.colAvgHearts"),
        rows: sortedTopArtworks.slice(0, 40).map((row, index) => ({
          rank: index + 1,
          title: row.title,
          artist: row.artist,
          imageUrl: row.imageUrl,
          visits: `${formatFrNumber(row.visits)} visite(s)`,
          avgHearts:
            row.avgHearts == null
              ? "—"
              : formatFrNumber(row.avgHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        })),
      },
    };
  }, [
    t,
    crossError,
    crossEmotionColumns,
    sortedCrossRows,
    topArtworksError,
    sortedTopArtworks,
  ]);

  const handleExportProgress = useCallback((progress: StatisticsPdfExportProgress) => {
    exportProgressLatestRef.current = progress;
    const now = Date.now();
    if (
      progress.percent >= 100 ||
      progress.phase === "finish" ||
      now - exportProgressThrottleRef.current >= 80
    ) {
      exportProgressThrottleRef.current = now;
      setExportProgress(progress);
    }
  }, []);

  useEffect(() => {
    if (!printExportBusy) return;
    const id = window.setInterval(() => {
      const latest = exportProgressLatestRef.current;
      if (latest) setExportProgress(latest);
    }, 200);
    return () => window.clearInterval(id);
  }, [printExportBusy]);

  const handlePrintPreviewOpenChange = useCallback(
    (open: boolean, skipDateCheck = false) => {
      if (!open && printExportBusy) return;
      if (open) {
        if (uniqueVisitorsTotal === 0) return;
        const hasExpoDates = (() => {
          if (!selectedFilteredExpo) return false;
          const s = parseExpoYmdDate(selectedFilteredExpo.date_expo_du);
          const e = parseExpoYmdDate(selectedFilteredExpo.date_expo_au);
          return !!(s && e && s.getTime() <= e.getTime());
        })();
        if (!hasExpoDates && !skipDateCheck && !manualPreviewDateFrom) {
          setDialogDateFrom("");
          setDialogDateTo("");
          setPreviewDateDialogOpen(true);
          return;
        }
        previewFiltersSnapshotRef.current = {
          agencyId: selectedAgencyId,
          expoId: drillExpoId,
          artistId: selectedArtistId,
        };
        setPrintPreviewOpen(true);
        return;
      }
      shouldRestorePreviewFiltersRef.current = true;
      setPrintPreviewOpen(false);
    },
    [selectedAgencyId, drillExpoId, selectedArtistId, printExportBusy, selectedFilteredExpo, manualPreviewDateFrom, uniqueVisitorsTotal],
  );

  const liveReportViewProps = buildReportExportSnapshot();
  const reportViewProps = reportExportSnapshot ?? liveReportViewProps;

  const todayYmd = toYmd(new Date());

  /** PDF navigateur (jsPDF + capture DOM) — même logique que le panneau expo. */
  const handleBrowserPdfStatistics = async (paperFormat: PdfPaperFormat) => {
    if (printExportBusy) return;
    setPrintExportBusy(true);
    setExportProgress({ percent: 0, phase: "waiting" });
    setPaperFormatDialogOpen(false);

    try {
      await prepareStatisticsExportData();
      const exportSnapshot = buildReportExportSnapshot();
      setReportExportSnapshot(exportSnapshot);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await new Promise((r) => window.setTimeout(r, 350));

      const root = statisticsPrintAreaRef.current;
      if (!root) throw new Error("missing-print-area");
      root.setAttribute("data-statistics-export-ready", "true");

      const artistFiltered = selectedArtistId !== "all";
      const filteredArtist = artistFiltered
        ? artistOptions.find((option) => option.id === selectedArtistId)
        : null;
      const suggestedFilename = buildStatisticsPdfFilename({
        language: i18n.language,
        expoName: selectedFilteredExpo?.expo_name ?? exportSnapshot.previewExpoLabel,
        artistFirstName: artistFiltered
          ? filteredArtist?.firstName ?? exportSnapshot.previewArtistCoverLetter?.artistFirstName
          : undefined,
        artistLastName: artistFiltered
          ? filteredArtist?.lastName ?? exportSnapshot.previewArtistCoverLetter?.artistLastName
          : undefined,
      });

      await generateStatisticsBrowserPdf(
        root,
        paperFormat,
        suggestedFilename,
        handleExportProgress,
        buildPdfExportTables(),
      );
    } catch (err) {
      console.error("[statistics-pdf]", err);
      const code = err instanceof Error ? err.message : String(err);
      if (code === "save-aborted") {
        return;
      } else if (code === "timeout-ready") {
        window.alert(t("preview.browserPdfNotReady"));
      } else {
        window.alert(t("preview.browserPdfError"));
      }
    } finally {
      setPrintExportBusy(false);
      setExportProgress(null);
      exportProgressLatestRef.current = null;
      setReportExportSnapshot(null);
    }
  };

  /** Impression système (Ctrl+P → Enregistrer en PDF). */
  const handleBrowserPrintStatistics = async (paperFormat: PdfPaperFormat) => {
    if (printExportBusy) return;
    setPrintExportBusy(true);
    setExportProgress({ percent: 0, phase: "prepare" });
    setPaperFormatDialogOpen(false);
    try {
      await prepareStatisticsExportData();
      setReportExportSnapshot(buildReportExportSnapshot());
      setExportProgress({ percent: 85, phase: "finish" });
      printStatisticsInBrowser(paperFormat);
      setExportProgress({ percent: 100, phase: "finish" });
    } finally {
      setPrintExportBusy(false);
      setExportProgress(null);
      exportProgressLatestRef.current = null;
      setReportExportSnapshot(null);
    }
  };

  const exportProgressOverlay =
    printExportBusy && exportProgress
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={exportProgressLabel || t("preview.printPreparing")}
          >
            <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl">
              <p className="mb-1 text-center font-serif text-lg font-bold text-neutral-900">
                {t("preview.pdfTabLoading")}
              </p>
              <p className="mb-4 text-center text-sm text-neutral-600">{exportProgressLabel}</p>
              <Progress
                value={exportProgress.percent}
                aria-label={exportProgressLabel}
                className="h-3 bg-neutral-200 [&>div]:bg-[#E63946]"
              />
              <p className="mt-2 text-center text-xs font-medium tabular-nums text-neutral-500">
                {Math.round(exportProgress.percent)} %
              </p>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="container min-w-0 max-w-full py-8 space-y-8">
      {exportProgressOverlay}
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 max-w-full md:max-w-md shrink-0">
          <h2 className="text-3xl font-serif font-bold text-white">{t("page.title")}</h2>
          <p className="text-muted-foreground">{t("page.subtitle")}</p>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "backoffice-toolbar-outline-btn mt-3",
              uniqueVisitorsTotal === 0 &&
                "cursor-not-allowed border-neutral-600 bg-neutral-700/50 text-neutral-500 opacity-100 hover:bg-neutral-700/50 hover:text-neutral-500",
            )}
            disabled={uniqueVisitorsTotal === 0}
            title={uniqueVisitorsTotal === 0 ? t("page.previewDisabledNoVisitors") : undefined}
            onClick={() => handlePrintPreviewOpenChange(true)}
          >
            {t("page.preview")}
          </Button>
        </div>
        <div className="flex min-h-[60px] flex-1 flex-col items-center justify-center px-2 md:min-w-0">
          {selectedFilteredExpoId && stickyExpoLogoMeta.logoUrl ? (
            <img
              src={stickyExpoLogoMeta.logoUrl}
              alt={
                stickyExpoLogoMeta.name
                  ? `${t("filter.exposition")} — ${stickyExpoLogoMeta.name}`
                  : t("filter.exposition")
              }
              className="max-h-16 max-w-[200px] object-contain object-center"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <BackofficeStickyAgencyLogoSlot />
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm min-w-[220px] shrink-0 md:ml-auto">
          {showOrganizationFilter && (
            <div>
              <label htmlFor="statistics-scope-org" className="text-xs text-muted-foreground font-medium">
                {t("filter.organisation")}
              </label>
              <select
                id="statistics-scope-org"
                name="statistics_scope_organization"
                className={cn(BACKOFFICE_FORM_CONTROL_CLASS, "mt-1")}
                disabled={!canEditAgencyScope}
                value={selectedAgencyId === "all" ? "all" : selectedAgencyId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (scope.mode === "all" && role_id === 1 && v === "all") {
                    setSelectedAgencyId("all");
                    setDrillExpoId("all");
                    setSelectedArtistId("all");
                    return;
                  }
                  setSelectedAgencyId(v);
                  setDrillExpoId("all");
                  setSelectedArtistId("all");
                  setManualPreviewDateFrom("");
                  setManualPreviewDateTo("");
                }}
              >
                {scope.mode === "all" && role_id === 1 && <option value="all">— (vue globale)</option>}
                {agencyOptions.length > 0 ? (
                  agencyOptions.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))
                ) : (
                  <option value={orgLabel}>{orgLabel}</option>
                )}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="statistics-scope-expo" className="text-xs text-muted-foreground font-medium">
              {t("filter.exposition")}
            </label>
            <select
              id="statistics-scope-expo"
              name="statistics_scope_exposition"
              className={cn(BACKOFFICE_FORM_CONTROL_CLASS, "mt-1")}
              disabled={!canDrillExpo}
              value={expoSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                setDrillExpoId(v === "all" ? "all" : v);
                setSelectedArtistId("all");
                setManualPreviewDateFrom("");
                setManualPreviewDateTo("");
              }}
            >
              {canDrillExpo && <option value="all">{t("filter.allExpos")}</option>}
              {expoOptionsForSelect.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.expo_name}
                </option>
              ))}
            </select>
          </div>
          {showOrganizationFilter && selectedAgencyId === "all" && drillExpoId === "all" && (
            <div>
              <label className="text-xs text-muted-foreground font-medium">
                {t("filter.expoPeriod")}
              </label>
              <div className="flex flex-row gap-2 mt-1">
                <input
                  type="date"
                  value={manualPreviewDateFrom}
                  max={manualPreviewDateTo || todayYmd}
                  onChange={(e) => {
                    const v = e.target.value;
                    setManualPreviewDateFrom(v);
                    if (manualPreviewDateTo && v > manualPreviewDateTo) setManualPreviewDateTo("");
                  }}
                  className={BACKOFFICE_FORM_CONTROL_CLASS}
                  title={t("preview.dateFrom")}
                />
                <input
                  type="date"
                  value={manualPreviewDateTo}
                  min={manualPreviewDateFrom || undefined}
                  max={todayYmd}
                  onChange={(e) => setManualPreviewDateTo(e.target.value)}
                  className={BACKOFFICE_FORM_CONTROL_CLASS}
                  title={t("preview.dateTo")}
                />
              </div>
            </div>
          )}
          {showArtistFilter ? (
            <div>
              <label htmlFor="statistics-scope-artist" className="text-xs text-muted-foreground font-medium">
                {t("filter.artist")}
              </label>
              <select
                id="statistics-scope-artist"
                name="statistics_scope_artist"
                className={cn(BACKOFFICE_FORM_CONTROL_CLASS, "mt-1")}
                disabled={artistOptions.length === 0}
                value={selectedArtistId}
                onChange={(e) => setSelectedArtistId(e.target.value)}
              >
                <option value="all">{t("filter.allArtists")}</option>
                {artistOptions.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>Périmètre vide</AlertTitle>
          <AlertDescription>
            Vérifiez le rôle et les champs <code className="rounded bg-muted px-1">agency_id</code> /{" "}
            <code className="rounded bg-muted px-1">expo_id</code> attendus pour un admin agence ou un curateur.
          </AlertDescription>
        </Alert>
      )}

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {miniKpis.map((k) => (
          <Card key={k.id} className="glass-card">
            <CardContent className="p-5 text-center">
              <k.icon className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              <p className="text-2xl font-serif font-bold mt-1">
                {k.id === "dominantEmotion" && k.value !== "—"
                  ? t(`emotions.names.${normalizeEmotionKey(String(k.value))}`, { defaultValue: String(k.value) })
                  : k.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Emotion distribution */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">{t("emotions.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("emotions.subtitle")}</p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {emotionCatalog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {emotionCatalogError || "Impossible d'afficher les émotions de la table emotions."}
              </p>
            ) : feedbackTotal === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("emotions.empty")}</p>
            ) : (
              emotionSeries.map((emo) => (
                <div key={emo.id} className="flex items-center gap-2 py-0.5">
                  <span className="text-sm w-24 shrink-0 leading-tight">{t(`emotions.names.${normalizeEmotionKey(emo.name)}`, { defaultValue: emo.name })}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${emo.percentage}%`, backgroundColor: emo.color }} />
                  </div>
                  <span className="text-sm font-bold w-10 text-right leading-tight">{emo.percentage}%</span>
                </div>
              ))
            )}
            <p className="pt-0.5 text-[11px] text-muted-foreground leading-tight">Total feedbacks filtrés : {feedbackTotal}</p>
          </CardContent>
        </Card>

        {/* Timeline chart */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">{t("timeline.title")}</CardTitle>
              {!expoDateRange ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("timeline.prevWeek")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                    onClick={() => setWeekOffset((v) => v - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("timeline.nextWeek")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                    onClick={() => setWeekOffset((v) => Math.min(0, v + 1))}
                    disabled={weekOffset >= 0}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {expoDateRange
                ? t("timeline.subtitleExpoRange", {
                    from: toFrDayMonth(expoDateRange.start),
                    to: toFrDayMonth(expoDateRange.end),
                  })
                : t("timeline.subtitle")}
            </p>
          </CardHeader>
          <CardContent>
            {temporalSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">{t("common.chartNoData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={temporalSeries} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis
                    dataKey="day"
                    interval={timelineTickInterval}
                    tick={({ x, y, payload }) => {
                      const raw = String(payload?.value ?? "");
                      const [weekday, dayMonth] = raw.split("|");
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} textAnchor="middle" fill="currentColor" fontSize={10}>
                            <tspan x={0} dy="0.71em">{weekday || ""}</tspan>
                            <tspan x={0} dy="1.1em">{dayMonth || ""}</tspan>
                          </text>
                        </g>
                      );
                    }}
                    height={46}
                  />
                  <YAxis tick={{ fontSize: 12 }} width={30} />
                  <Tooltip />
                  <Bar dataKey="visites" name="Visites" fill="#3399CC" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="visites"
                      position="top"
                      formatter={formatBarVisitLabel}
                      className="fill-foreground"
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {temporalSeries.length > 0 ? (
              <p className="mt-2 text-center text-sm font-medium text-muted-foreground">
                {expoDateRange
                  ? t("timeline.totalVisitsExpo", { count: formatFrNumber(filteredVisitsTotal) })
                  : t("timeline.totalVisitsFiltered", { count: formatFrNumber(filteredVisitsTotal) })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Hourly attendance chart */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">{t("hourly.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("hourly.subtitle")}</p>
          </CardHeader>
          <CardContent>
            {hourlySeries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">{t("common.chartNoData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourlySeries} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                  <YAxis tick={{ fontSize: 12 }} width={30} />
                  <Tooltip />
                  <Bar dataKey="visites" name="Visites" fill="hsl(38, 70%, 50%)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="visites"
                      position="top"
                      formatter={formatBarVisitLabel}
                      className="fill-foreground"
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cross table */}
      <Card className="glass-card min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">{t("cross.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("cross.subtitle")}</p>
        </CardHeader>
        <CardContent className="min-w-0 overflow-x-auto">
          {crossError ? (
            <p className="text-sm text-muted-foreground text-center py-8">{crossError}</p>
          ) : crossRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("cross.empty")}</p>
          ) : (
            <table className="w-full min-w-[40rem] text-xs leading-tight">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1 px-1.5 font-medium text-muted-foreground">{t("cross.colArtwork")}</th>
                  {crossEmotionColumns.map((emotion) => (
                    <th key={emotion.id} className="text-center py-1 px-1 font-medium text-muted-foreground">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-0.5 hover:text-foreground"
                        onClick={() => toggleCrossSort(emotion.id)}
                      >
                        <span className="text-sm leading-none" aria-hidden="true">
                          {emotion.name.toLowerCase().includes("troublé") ? "😵‍💫" : (emotion.icon || "")}
                        </span>
                        <span className="max-w-[4.5rem] truncate">{t(`emotions.names.${normalizeEmotionKey(emotion.name)}`, { defaultValue: emotion.name })}</span>
                        {crossSortEmotionId === emotion.id && crossSortDirection === "asc" ? (
                          <ArrowUp className="h-3 w-3 shrink-0" />
                        ) : (
                          <ArrowDown className="h-3 w-3 shrink-0" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCrossRows.map((row) => (
                  <tr key={row.artworkId} className="border-b border-border/50">
                    <td className="py-1 px-1.5 font-medium">{row.name}</td>
                    {crossEmotionColumns.map((emotion) => (
                      <td key={`${row.artworkId}-${emotion.id}`} className="px-1 py-1 text-center tabular-nums">
                        {(row.counts[emotion.id] ?? 0) > 0 ? (row.counts[emotion.id] ?? 0) : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Top artworks table */}
      <Card className="glass-card min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">{t("top.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("top.subtitle")}</p>
        </CardHeader>
        <CardContent className="min-w-0 overflow-x-auto">
          {topArtworksError ? (
            <p className="text-sm text-muted-foreground text-center py-8">{topArtworksError}</p>
          ) : topArtworks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("top.empty")}</p>
          ) : (
            <table className="w-full min-w-[32rem] text-xs leading-tight">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1 px-1.5 font-medium text-muted-foreground">{t("top.colRank")}</th>
                  <th className="text-left py-1 px-1.5 font-medium text-muted-foreground">{t("top.colArtwork")}</th>
                  <th className="text-right py-1 px-1.5 font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 hover:text-foreground"
                      onClick={() => toggleTopSort("visits")}
                    >
                      <span>{t("top.colVisits")}</span>
                      {topSortKey === "visits" && topSortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                  <th className="text-right py-1 px-1.5 font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 hover:text-foreground"
                      onClick={() => toggleTopSort("avgHearts")}
                    >
                      <span>{t("top.colAvgHearts")}</span>
                      {topSortKey === "avgHearts" && topSortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTopArtworks.map((row, index) => (
                  <tr key={row.artworkId} className="border-b border-border/50">
                    <td className="py-1 px-1.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-1 px-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-md">
                          {row.imageUrl ? (
                            <ImageWithSkeleton
                              src={row.imageUrl}
                              alt={row.title}
                              className="h-[50px] w-[50px] shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-[50px] w-[50px] rounded-md bg-muted" />
                          )}
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="font-medium">{row.title}</span>
                          <span className="text-muted-foreground"> · {row.artist}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-1 text-right tabular-nums">{formatFrNumber(row.visits)} visite(s)</td>
                    <td className="px-1.5 py-1 text-right tabular-nums">
                      {row.avgHearts == null
                        ? "—"
                        : formatFrNumber(row.avgHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <VisitorGeographySection
        rows={visitorGeoRows}
        loading={visitorGeoLoading}
        geocoding={visitorGeoGeocoding}
        progress={visitorGeoProgress}
        error={visitorGeoError}
        mapScopeKey={visitorGeoMapScopeKey}
        onRefreshGeocoding={handleRefreshVisitorGeocoding}
      />

      <Dialog open={printPreviewOpen} onOpenChange={handlePrintPreviewOpenChange}>
        <DialogContent
          aria-describedby={undefined}
          className="max-w-5xl gap-0 border-border bg-white p-0 text-neutral-900 sm:max-w-5xl max-h-[92vh] overflow-hidden print:!left-0 print:!top-0 print:!max-h-none print:!h-auto print:!w-full print:!max-w-none print:!translate-x-0 print:!translate-y-0 print:!overflow-visible print:border-0 print:!shadow-none"
          onInteractOutside={(event) => {
            if (printExportBusy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (printExportBusy) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b border-neutral-200 bg-white px-6 py-4 text-left print:hidden">
            <DialogTitle className="font-serif text-xl font-bold text-neutral-900">{t("preview.title")}</DialogTitle>
          </DialogHeader>
          <div
            id="statistics-print-area"
            ref={statisticsPrintAreaRef}
            data-expected-chart-surfaces={expectedChartSurfaces}
            data-statistics-artist-report={reportViewProps.previewArtistCoverLetter ? "true" : undefined}
            className="bg-white px-5 py-6 text-neutral-900 max-h-[min(68vh,720px)] overflow-y-auto print:max-h-none print:!overflow-visible print:px-6 print:py-4 data-[statistics-artist-report=true]:rounded-xl data-[statistics-artist-report=true]:border-2 data-[statistics-artist-report=true]:border-neutral-200 data-[statistics-artist-report=true]:shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          >
            <StatisticsReportView {...reportViewProps} />
          </div>
          <DialogFooter className="flex-row items-center gap-3 border-t border-neutral-200 bg-neutral-50/80 px-6 py-4 print:hidden sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={printExportBusy}
              onClick={() => handlePrintPreviewOpenChange(false)}
            >
              {t("preview.close")}
            </Button>
            <div className="flex min-w-0 flex-1 flex-col gap-1 px-1">
              {printExportBusy && exportProgress ? (
                <>
                  <Progress
                    value={exportProgress.percent}
                    aria-label={exportProgressLabel}
                    className="h-2 bg-neutral-200 [&>div]:bg-[#E63946]"
                  />
                  <p className="truncate text-center text-xs text-neutral-600">{exportProgressLabel}</p>
                </>
              ) : null}
            </div>
            <Button
              type="button"
              className="inline-flex shrink-0 items-center justify-center bg-[#E63946] hover:bg-[#c62f3a] disabled:opacity-70"
              disabled={printExportBusy}
              onClick={() => setPaperFormatDialogOpen(true)}
            >
              {printExportBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("preview.printPreparing")}
                </>
              ) : (
                t("page.print")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paperFormatDialogOpen} onOpenChange={setPaperFormatDialogOpen}>
        <DialogContent className="max-w-md border-border bg-white text-neutral-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{t("preview.paperFormatTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-neutral-600">
              {t("preview.paperFormatHintBrowser")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <label htmlFor="stats-pdf-paper" className="text-sm font-medium text-neutral-800">
              {t("preview.paperFormatLabel")}
            </label>
            <select
              id="stats-pdf-paper"
              name="statistics_pdf_paper_format"
              className={BACKOFFICE_FORM_CONTROL_CLASS}
              value={selectedPdfPaper}
              onChange={(e) => setSelectedPdfPaper(e.target.value as PdfPaperFormat)}
            >
              {PDF_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`preview.paperFormats.${opt.value}`)}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setPaperFormatDialogOpen(false)}>
              {t("preview.close")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={printExportBusy}
              onClick={() => void handleBrowserPrintStatistics(selectedPdfPaper)}
            >
              {t("preview.browserPrint")}
            </Button>
            <Button
              type="button"
              className="bg-[#E63946] hover:bg-[#c62f3a]"
              disabled={printExportBusy}
              onClick={() => void handleBrowserPdfStatistics(selectedPdfPaper)}
            >
              {printExportBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("preview.printPreparing")}
                </>
              ) : (
                t("preview.browserPdf")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDateDialogOpen} onOpenChange={setPreviewDateDialogOpen}>
        <DialogContent className="max-w-sm border-border bg-white text-neutral-900">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{t("preview.dateRangeTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("preview.dateRangeDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-row gap-4 py-2">
            <div className="flex flex-col gap-1.5 w-[152px]">
              <label htmlFor="preview-date-from" className="text-xs font-medium text-neutral-700">
                {t("preview.dateFrom")}
              </label>
              <input
                id="preview-date-from"
                type="date"
                value={dialogDateFrom}
                max={dialogDateTo || todayYmd}
                onChange={(e) => {
                  const v = e.target.value;
                  setDialogDateFrom(v);
                  if (dialogDateTo && v > dialogDateTo) setDialogDateTo("");
                }}
                className="rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-[150px]"
              />
            </div>
            <div className="flex flex-col gap-1.5 w-[152px]">
              <label htmlFor="preview-date-to" className="text-xs font-medium text-neutral-700">
                {t("preview.dateTo")}
              </label>
              <input
                id="preview-date-to"
                type="date"
                value={dialogDateTo}
                min={dialogDateFrom || undefined}
                max={todayYmd}
                onChange={(e) => setDialogDateTo(e.target.value)}
                className="rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-[150px]"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setPreviewDateDialogOpen(false)}>
              {t("preview.close")}
            </Button>
            <Button
              type="button"
              className="bg-[#E63946] hover:bg-[#c62f3a]"
              disabled={!dialogDateFrom || !dialogDateTo || dialogDateFrom > dialogDateTo}
              onClick={() => {
                setManualPreviewDateFrom(dialogDateFrom);
                setManualPreviewDateTo(dialogDateTo);
                setPreviewDateDialogOpen(false);
                previewFiltersSnapshotRef.current = {
                  agencyId: selectedAgencyId,
                  expoId: drillExpoId,
                  artistId: selectedArtistId,
                };
                setPrintPreviewOpen(true);
              }}
            >
              {t("preview.dateRangeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Statistics;
