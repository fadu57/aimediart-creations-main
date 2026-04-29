import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { emotions, artworks, expos } from "@/data/mockData";
import { useDataScope } from "@/hooks/useDataScope";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { supabase } from "@/lib/supabase";
import { getArtworksForDataScope } from "@/lib/userScope";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import { ChevronLeft, ChevronRight, Eye, Heart, Smile, Image, ArrowUp, ArrowDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
};

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

function toFrWeekdayShort(d: Date): string {
  const labels = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
  return labels[d.getDay()] || "";
}

function formatFrNumber(n: number, opts: Intl.NumberFormatOptions = {}) {
  return n.toLocaleString("fr-FR", opts);
}

function artworkExpoId(aw: unknown): string | null {
  const x = aw as { expoId?: string | null; artwork_expo_id?: string | null };
  return x.expoId ?? x.artwork_expo_id ?? null;
}

const Statistics = () => {
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, role_name } = useAuthUser();
  const [agencyOptions, setAgencyOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [expoOptions, setExpoOptions] = useState<ExpoOption[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("all");
  const [emotionCatalogFromDb, setEmotionCatalogFromDb] = useState<EmotionCatalogRow[]>([]);
  const [emotionCatalogError, setEmotionCatalogError] = useState<string | null>(null);
  const [feedbackCountsByEmotionId, setFeedbackCountsByEmotionId] = useState<Record<string, number>>({});
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [uniqueVisitorsTotal, setUniqueVisitorsTotal] = useState(0);
  const [averageHearts, setAverageHearts] = useState<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [temporalSeries, setTemporalSeries] = useState<Array<{ day: string; visites: number; coeurs: number }>>([]);
  const [hourlySeries, setHourlySeries] = useState<Array<{ hour: string; visites: number }>>([]);
  const [selectedTemporalDate, setSelectedTemporalDate] = useState<string | null>(null);
  const [crossRows, setCrossRows] = useState<Array<{ artworkId: string; name: string; counts: Record<string, number> }>>([]);
  const [crossError, setCrossError] = useState<string | null>(null);
  const [topArtworks, setTopArtworks] = useState<TopArtworkRow[]>([]);
  const [topArtworksError, setTopArtworksError] = useState<string | null>(null);
  const [activeArtworksCount, setActiveArtworksCount] = useState(0);
  const [topSortKey, setTopSortKey] = useState<TopSortKey>("visits");
  const [topSortDirection, setTopSortDirection] = useState<TopSortDirection>("desc");
  const [crossSortEmotionId, setCrossSortEmotionId] = useState<string | null>(null);
  const [crossSortDirection, setCrossSortDirection] = useState<TopSortDirection>("desc");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name_agency")
        .order("name_agency", { ascending: true });
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setAgencyOptions([]);
        return;
      }
      const options = (data as Array<{ id?: string | null; name_agency?: string | null }>)
        .map((row) => ({
          id: asTrimmedString(row.id),
          name: asTrimmedString(row.name_agency),
        }))
        .filter((row) => row.id.length > 0)
        .map((row) => ({ ...row, name: row.name || row.id }));
      setAgencyOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("expos").select("id, expo_name, agency_id").order("expo_name", { ascending: true });
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setExpoOptions([]);
        return;
      }
      const options = (data as Array<{ id?: unknown; expo_name?: unknown; agency_id?: unknown }>)
        .map((row) => ({
          id: asTrimmedString(row.id),
          expo_name: asTrimmedString(row.expo_name),
          agency_id: asTrimmedString(row.agency_id) || null,
        }))
        .filter((row) => row.id.length > 0)
        .map((row) => ({ ...row, expo_name: row.expo_name || row.id }));
      setExpoOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        return expoOptions.filter((ex) => ex.agency_id === scope.agencyId);
      }
      if (scope.mode === "all") {
        return expoOptions;
      }
      return [] as ExpoOption[];
    })();
    if (!effectiveAgencyFilter) return byScope;
    return byScope.filter((ex) => ex.agency_id === effectiveAgencyFilter);
  }, [scope.mode, scope.expoId, scope.agencyId, expoOptions, effectiveAgencyFilter]);

  const scopedArtworksBase = useMemo(() => {
    const base = getArtworksForDataScope(artworks, expos, scope);
    if (!effectiveAgencyFilter) return base;
    const allowedExpoIds = new Set(scopedExpos.map((e) => e.id));
    const filtered = base.filter((a) => allowedExpoIds.has(a.artwork_expo_id));
    return filtered.length > 0 ? filtered : base;
  }, [scope, effectiveAgencyFilter, scopedExpos]);

  const expoOptionsForSelect = useMemo(() => {
    // Filtrage strict demandé: ne montrer que les expos de l'organisation active.
    if (effectiveAgencyFilter) {
      return scopedExpos.filter((ex) => ex.agency_id === effectiveAgencyFilter);
    }
    return scopedExpos;
  }, [effectiveAgencyFilter, scopedExpos]);

  const canDrillExpo = (scope.mode === "all" || scope.mode === "agency") && expoOptionsForSelect.length > 1;

  const [drillExpoId, setDrillExpoId] = useState<string | "all">("all");

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
    // Reset expo uniquement quand le périmètre réel change,
    // pas à chaque rendu (évite d'annuler la sélection utilisateur).
    setDrillExpoId("all");
  }, [scope.mode, scope.agencyId, scope.expoId, selectedAgencyId]);

  useEffect(() => {
    if (drillExpoId === "all") return;
    const exists = expoOptionsForSelect.some((ex) => ex.id === drillExpoId);
    if (!exists) setDrillExpoId("all");
  }, [drillExpoId, expoOptionsForSelect]);

  useEffect(() => {
    setWeekOffset(0);
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.expoId]);

  useEffect(() => {
    setSelectedTemporalDate(null);
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.expoId, weekOffset]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      let query = supabase.from("visitor_feedback").select("emotion_id, visitor_id, heart_rating");
      if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
      if (targetExpoId) query = query.eq("expo_id", targetExpoId);
      const { data, error } = await query;
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setFeedbackCountsByEmotionId({});
        setFeedbackTotal(0);
        setUniqueVisitorsTotal(0);
        setAverageHearts(null);
        return;
      }
      const rows = data as Array<{
        emotion_id?: string | number | null;
        visitor_id?: string | number | null;
        heart_rating?: string | number | null;
      }>;
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
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId]);

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
        .select("artwork_status, artwork_agency_id, artwork_expo_id");
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setActiveArtworksCount(0);
        return;
      }

      const rows = (data as Array<{
        artwork_status?: string | null;
        artwork_agency_id?: string | null;
        artwork_expo_id?: string | null;
      }>).filter((row) => {
        const rowAgencyId = asTrimmedString(row.artwork_agency_id);
        const rowExpoId = asTrimmedString(row.artwork_expo_id);
        if (targetAgencyId && rowAgencyId !== targetAgencyId) return false;
        if (targetExpoId && rowExpoId !== targetExpoId) return false;
        return true;
      });
      const normalizedStatuses = rows.map((r) => asTrimmedString(r.artwork_status).toLowerCase()).filter(Boolean);
      const count = normalizedStatuses.filter((s) => s === "active").length;
      setActiveArtworksCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      const weekStart = startOfWeekMonday(new Date());
      weekStart.setDate(weekStart.getDate() + weekOffset * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      let query = supabase
        .from("visitor_feedback")
        .select("submitted_at, heart_rating")
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
        return { date: toYmd(dayDate), day: toFrDayMonth(dayDate), visits: 0, heartsSum: 0, heartsCount: 0 };
      });
      const byDate = new Map(init.map((x) => [x.date, x]));

      for (const row of data as Array<{ submitted_at?: string | null; heart_rating?: string | number | null }>) {
        const submittedAt = asTrimmedString(row.submitted_at);
        if (!submittedAt) continue;
        const d = new Date(submittedAt);
        if (Number.isNaN(d.getTime())) continue;
        const key = toYmd(d);
        const slot = byDate.get(key);
        if (!slot) continue;
        slot.visits += 1;
        const heartValue =
          typeof row.heart_rating === "number"
            ? row.heart_rating
            : typeof row.heart_rating === "string"
              ? Number.parseFloat(row.heart_rating)
              : NaN;
        if (Number.isFinite(heartValue) && heartValue > 0) {
          slot.heartsSum += heartValue;
          slot.heartsCount += 1;
        }
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
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, weekOffset]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId =
        effectiveAgencyFilter ??
        (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId : null);
      const targetExpoId =
        drillExpoId !== "all" ? drillExpoId : scope.mode === "expo" ? scope.expoId : null;

      let dayStartIso: string | null = null;
      let dayEndIso: string | null = null;
      if (selectedTemporalDate) {
        const dayStart = new Date(`${selectedTemporalDate}T00:00:00`);
        const dayEnd = new Date(`${selectedTemporalDate}T23:59:59.999`);
        if (!Number.isNaN(dayStart.getTime()) && !Number.isNaN(dayEnd.getTime())) {
          dayStartIso = dayStart.toISOString();
          dayEndIso = dayEnd.toISOString();
        }
      }

      let query = supabase.from("visitor_feedback").select("submitted_at");
      if (dayStartIso && dayEndIso) {
        query = query.gte("submitted_at", dayStartIso).lte("submitted_at", dayEndIso);
      }
      if (targetAgencyId) query = query.eq("agency_id", targetAgencyId);
      if (targetExpoId) query = query.eq("expo_id", targetExpoId);
      const { data, error } = await query;
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setHourlySeries([]);
        return;
      }

      const counts = Array.from({ length: 24 }, () => 0);
      for (const row of data as Array<{ submitted_at?: string | null }>) {
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
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId, selectedTemporalDate]);

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
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId]);

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
  }, [effectiveAgencyFilter, drillExpoId, scope.mode, scope.agencyId, scope.expoId]);

  const miniKpis = useMemo(() => {
    if (feedbackTotal === 0) {
      return [
        { label: "Visiteurs uniques", icon: Eye, value: formatFrNumber(uniqueVisitorsTotal), hint: "Toutes les œuvres de votre périmètre" },
        { label: "Moyenne des cœurs", icon: Heart, value: "—", hint: "Note moyenne sur 5 cœurs" },
        { label: "Émotion dominante", icon: Smile, value: "—", hint: "Ressenti le plus exprimé" },
        { label: "Œuvres actives", icon: Image, value: formatFrNumber(activeArtworksCount), hint: "Dans le catalogue de l'expo" },
      ];
    }
    const dominant = feedbackTotal > 0 && emotionSeries.length
      ? emotionSeries.reduce((best, e) => (e.percentage > best.percentage ? e : best), emotionSeries[0])
      : null;
    return [
      { label: "Visiteurs uniques", icon: Eye, value: formatFrNumber(uniqueVisitorsTotal), hint: "Toutes les œuvres de votre périmètre" },
      {
        label: "Moyenne des cœurs",
        icon: Heart,
        value:
          averageHearts == null
            ? "—"
            : formatFrNumber(averageHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        hint: "Note moyenne sur 5 cœurs",
      },
      { label: "Émotion dominante", icon: Smile, value: dominant?.name || "—", hint: "Ressenti le plus exprimé" },
      { label: "Œuvres actives", icon: Image, value: formatFrNumber(activeArtworksCount), hint: "Dans le catalogue de l'expo" },
    ];
  }, [emotionSeries, uniqueVisitorsTotal, feedbackTotal, averageHearts, activeArtworksCount]);

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
  const selectedTemporalDayLabel = useMemo(() => {
    if (!selectedTemporalDate) return null;
    const match = temporalSeries.find((row) => (row as { date?: string }).date === selectedTemporalDate) as
      | { dateLabel?: string; weekday?: string }
      | undefined;
    if (!match) return selectedTemporalDate;
    return `${match.weekday ?? ""} ${match.dateLabel ?? ""}`.trim();
  }, [selectedTemporalDate, temporalSeries]);

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

  const orgLabel =
    scope.mode === "all"
      ? selectedAgencyLabel
      : scope.mode === "agency"
        ? selectedAgencyLabel
        : scope.mode === "expo"
          ? selectedAgencyLabel
          : "—";

  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-start">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">Statistiques</h2>
          <p className="text-muted-foreground">Analyse détaillée des données de visite et feedback émotionnel</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
          >
            Imprimer les statistiques sélectionnées
          </Button>
          {!authLoading && scope.mode === "agency" && (
            <p className="text-xs text-muted-foreground mt-1">Agence {scope.agencyId} — toutes les expos (filtre expo optionnel).</p>
          )}
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground mt-1">Exposition {scope.expoId} uniquement.</p>
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm min-w-[220px]">
          {showOrganizationFilter && (
            <div>
              <label htmlFor="statistics-scope-org" className="text-xs text-muted-foreground font-medium">
                Organisation
              </label>
              <select
                id="statistics-scope-org"
                name="statistics_scope_organization"
                className="block w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                disabled={!canEditAgencyScope}
                value={selectedAgencyId === "all" ? "all" : selectedAgencyId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (scope.mode === "all" && role_id === 1 && v === "all") {
                    setSelectedAgencyId("all");
                    return;
                  }
                  setSelectedAgencyId(v);
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
              Exposition
            </label>
            <select
              id="statistics-scope-expo"
              name="statistics_scope_exposition"
              className="block w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              disabled={!canDrillExpo}
              value={expoSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                setDrillExpoId(v === "all" ? "all" : v);
              }}
            >
              {canDrillExpo && <option value="all">Toutes les expos du périmètre</option>}
              {expoOptionsForSelect.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.expo_name}
                </option>
              ))}
            </select>
          </div>
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
          <Card key={k.label} className="glass-card">
            <CardContent className="p-5 text-center">
              <k.icon className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              <p className="text-2xl font-serif font-bold mt-1">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Emotion distribution */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Distribution des émotions</CardTitle>
            <p className="text-xs text-muted-foreground">Répartition des ressentis des visiteurs</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {emotionCatalog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {emotionCatalogError || "Impossible d'afficher les émotions de la table emotions."}
              </p>
            ) : feedbackTotal === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucun feedback pour ce périmètre.</p>
            ) : (
              emotionSeries.map((emo) => (
                <div key={emo.id} className="flex items-center gap-3">
                  <span className="text-sm w-24 shrink-0">{emo.name}</span>
                  <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${emo.percentage}%`, backgroundColor: emo.color }} />
                  </div>
                  <span className="text-sm font-bold w-10 text-right">{emo.percentage}%</span>
                </div>
              ))
            )}
            <p className="pt-1 text-[11px] text-muted-foreground">Total feedbacks filtrés : {feedbackTotal}</p>
          </CardContent>
        </Card>

        {/* Timeline chart */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Évolution temporelle</CardTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Semaine précédente"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                  onClick={() => setWeekOffset((v) => v - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Semaine suivante"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                  onClick={() => setWeekOffset((v) => Math.min(0, v + 1))}
                  disabled={weekOffset >= 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Visiteurs au fil des jours</p>
          </CardHeader>
          <CardContent>
            {temporalSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Pas assez de données pour un graphique.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={temporalSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis
                    dataKey="day"
                    interval={0}
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
                  <Bar
                    dataKey="visites"
                    name="Visites"
                    fill="#3399CC"
                    radius={[4, 4, 0, 0]}
                    onClick={(payload) => {
                      const date = asTrimmedString((payload as { payload?: { date?: unknown } })?.payload?.date);
                      if (date) setSelectedTemporalDate(date);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Hourly attendance chart */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Fréquentation horaire</CardTitle>
            <p className="text-xs text-muted-foreground">
              {selectedTemporalDayLabel
                ? `Visiteurs au fil des heures (${selectedTemporalDayLabel}) (cliquer sur le graphique bleu)`
                : "Visiteurs au fil des heures (cliquer sur le graphique bleu)"}
            </p>
          </CardHeader>
          <CardContent>
            {hourlySeries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Pas assez de données pour un graphique.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                  <YAxis tick={{ fontSize: 12 }} width={30} />
                  <Tooltip />
                  <Bar dataKey="visites" name="Visites" fill="hsl(38, 70%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cross table */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Tableau croisé émotions / œuvres</CardTitle>
          <p className="text-xs text-muted-foreground">Corrélations entre les œuvres et les émotions ressenties par les visiteurs</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {crossError ? (
            <p className="text-sm text-muted-foreground text-center py-8">{crossError}</p>
          ) : crossRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée réelle dans ce périmètre.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Œuvre</th>
                  {crossEmotionColumns.map((emotion) => (
                    <th key={emotion.id} className="text-center py-3 px-2 font-medium text-muted-foreground">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 hover:text-foreground"
                        onClick={() => toggleCrossSort(emotion.id)}
                      >
                        <span aria-hidden="true">
                          {emotion.name.toLowerCase().includes("troublé") ? "😵‍💫" : (emotion.icon || "")}
                        </span>
                        <span>{emotion.name}</span>
                        {crossSortEmotionId === emotion.id && crossSortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCrossRows.map((row) => (
                  <tr key={row.artworkId} className="border-b border-border/50">
                    <td className="py-3 px-2 font-semibold">{row.name}</td>
                    {crossEmotionColumns.map((emotion) => (
                      <td key={`${row.artworkId}-${emotion.id}`} className="text-center py-3">
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
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Classement des œuvres</CardTitle>
          <p className="text-xs text-muted-foreground">Rang, visites et moyenne des cœurs (données réelles filtrées)</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {topArtworksError ? (
            <p className="text-sm text-muted-foreground text-center py-8">{topArtworksError}</p>
          ) : topArtworks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée réelle dans ce périmètre.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Rang</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Œuvre</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleTopSort("visits")}
                    >
                      <span>Visites</span>
                      {topSortKey === "visits" && topSortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleTopSort("avgHearts")}
                    >
                      <span>Moy. cœurs</span>
                      {topSortKey === "avgHearts" && topSortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTopArtworks.map((row, index) => (
                  <tr key={row.artworkId} className="border-b border-border/50">
                    <td className="py-3 px-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold">
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative overflow-hidden h-12 w-12 shrink-0 rounded-lg">
                          {row.imageUrl ? (
                            <ImageWithSkeleton
                              src={row.imageUrl}
                              alt={row.title}
                              className="h-12 w-12 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{row.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{row.artist}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right">{formatFrNumber(row.visits)} visite(s)</td>
                    <td className="py-3 px-2 text-right">
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
    </div>
  );
};

export default Statistics;
