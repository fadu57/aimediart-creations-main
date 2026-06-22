import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArtworkModalWorkflow } from "@/components/artwork-workflow/ArtworkModalWorkflow";
import { getArtworkIdsWithPendingAudio, getPendingAudioJobsByLang, subscribeAudioQueue } from "@/services/audioService";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { supabase } from "@/lib/supabase";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useOrganisationPlanLimits } from "@/hooks/useOrganisationPlanLimits";
import { useOrganisationStandby } from "@/providers/OrganisationStandbyProvider";
import { useDataScope } from "@/hooks/useDataScope";
import { hasFullDataAccess } from "@/lib/authUser";
import { Plus, Search, Loader2, X, RefreshCw, Undo2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { buildOeuvreQrUrl } from "@/lib/oeuvrePublicUrl";
import { QR_CODE_STORAGE_OPTIONS } from "@/lib/qrCodeScanFriendly";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import { generateCartelPdf } from "@/lib/cartelPdfRenderer";
import { cartelExplorationLines } from "@/lib/cartelExplorationText";
import { getCartelFormat, type CartelFormatId } from "@/lib/cartelPdfFormats";
import { CartelFormatDialog } from "@/components/CartelFormatDialog";
import { cn } from "@/lib/utils";
import {
  countMaxMediationStylesAcrossLangs,
  getMediationFilledUiLangs,
} from "@/lib/artworkDescriptionI18n";
import {
  buildArtworkVoiceCatalogMap,
  type ArtworkVoiceCatalogSummary,
} from "@/lib/artworkVoiceCatalog";
import { useTranslation } from "react-i18next";
type ArtworkRow = {
  artwork_id: string;
  artwork_title: string | null;
  artwork_description_i18n?: Record<string, string | null> | string | null;
  artwork_source_material?: string | null;
  artwork_image_url?: string | null;
  artwork_photo_url?: string | null;
  artwork_qr_code_url?: string | null;
  artwork_qrcode_image?: string | null;
  artwork_artist_id?: string | null;
  artwork_agency_id?: string | null;
  artwork_expo_id?: string | null;
  agency_id?: string | null;
  expo_id?: string | null;
  artwork_status?: "active" | "inactive" | string | null;
  /** Jointure PostgREST : un objet ou un tableau selon la relation. */
  artists?: ArtistRow | ArtistRow[] | null;
};

type ArtistRow = {
  artist_id: string;
  artist_name?: string | null;
  artist_prenom?: string | null;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
};

type ExpoOption = {
  id: string;
  expo_id?: string | null;
  name: string;
  agency_id?: string | null;
};

type ExpoMovePending = {
  artworkId: string;
  artworkTitle: string;
  fromExpoId: string | null;
  toExpoId: string | null;
};

function resolveExpoLabel(
  expoId: string | null | undefined,
  options: ExpoOption[],
  noneLabel: string,
): string {
  const raw = (expoId ?? "").trim();
  if (!raw) return noneLabel;
  const match =
    options.find((o) => o.id === raw) ??
    options.find((o) => (o.expo_id ?? "").trim() === raw);
  return match?.name ?? raw;
}

function artworkArtistFromRow(aw: Pick<ArtworkRow, "artists">): ArtistRow | undefined {
  const a = aw.artists;
  if (a == null) return undefined;
  return Array.isArray(a) ? a[0] : a;
}

function artworkExpoRef(aw: Pick<ArtworkRow, "artwork_expo_id" | "expo_id">): string {
  return (aw.artwork_expo_id ?? aw.expo_id ?? "").trim();
}

function artworkStatusLabel(raw: string, t: (key: string) => string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return t("status_empty");
  if (key === "active") return t("status_active");
  if (key === "inactive") return t("status_inactive");
  if (key === "draft") return t("status_draft");
  return raw;
}

/** Correspondance artwork ↔ expo (id primaire ou legacy expo_id). */
function artworkMatchesExpoFilter(
  aw: Pick<ArtworkRow, "artwork_expo_id" | "expo_id">,
  filterExpoId: string,
  options: ExpoOption[],
): boolean {
  const raw = artworkExpoRef(aw);
  if (!raw || !filterExpoId.trim()) return false;
  if (raw === filterExpoId.trim()) return true;
  const selected = options.find((o) => o.id === filterExpoId);
  if (!selected) return raw === filterExpoId.trim();
  const legacy = selected.expo_id?.trim() ?? "";
  return legacy !== "" && raw === legacy;
}

/** Largeur commune des badges IA (image, médiations, voix) en bas de carte. */
const CATALOG_IA_BADGE_WIDTH_CLASS = "w-[14.5rem]";
const catalogIaBadgeClass =
  "inline-flex w-full min-w-0 items-center rounded-full border px-3 py-0.5 text-left text-[11px] font-medium";

const Catalogue = () => {
  const { t } = useTranslation("catalogue");
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [artworks, setArtworks] = useState<ArtworkRow[]>([]);
  const [voiceSummaryByArtwork, setVoiceSummaryByArtwork] = useState<
    Record<string, ArtworkVoiceCatalogSummary>
  >({});
  const [pendingAudioArtworkIds, setPendingAudioArtworkIds] = useState<ReadonlySet<string>>(
    () => new Set(getArtworkIdsWithPendingAudio()),
  );
  const artworksRef = useRef<ArtworkRow[]>([]);
  const voiceSummaryRef = useRef(voiceSummaryByArtwork);
  voiceSummaryRef.current = voiceSummaryByArtwork;
  const [expoOptions, setExpoOptions] = useState<ExpoOption[]>([]);
  const [selectedExpoFilter, setSelectedExpoFilter] = useState(
    () => searchParams.get("expo")?.trim() || "all",
  );
  const [expoFilterInput, setExpoFilterInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artworkModalOpen, setArtworkModalOpen] = useState(false);
  const [editingArtworkId, setEditingArtworkId] = useState<string | null>(null);
  const [voicesEntryFromCatalogue, setVoicesEntryFromCatalogue] = useState(false);
  const [œuvresNavigationType, setOeuvresNavigationType] = useState("single_scan_sequence");
  const [isAssigningExpo, setIsAssigningExpo] = useState(false);
  const [updatingArtworkStatusId, setUpdatingArtworkStatusId] = useState<string | null>(null);
  const [bulkQrConfirmOpen, setBulkQrConfirmOpen] = useState(false);
  const [bulkQrProgress, setBulkQrProgress] = useState<{ done: number; total: number } | null>(null);
  const [cartelFormatDialogOpen, setCartelFormatDialogOpen] = useState(false);
  const [cartelArtwork, setCartelArtwork] = useState<ArtworkRow | null>(null);
  const [expoMovePending, setExpoMovePending] = useState<ExpoMovePending | null>(null);
  const [expoUndoByArtwork, setExpoUndoByArtwork] = useState<Record<string, string | null>>({});
  const { scope, loading: authLoading } = useDataScope();
  const { state: standbyState } = useOrganisationStandby();
  const { role_id, role_name, agency_id: userAgencyId, expo_id: userExpoId } = useEffectiveAuth();
  const catalogueAgencyId =
    userAgencyId?.trim() ||
    standbyState.agency_id?.trim() ||
    (scope.mode === "agency" || scope.mode === "expo" ? scope.agencyId?.trim() : "") ||
    null;
  const { limits: planLimits } = useOrganisationPlanLimits(catalogueAgencyId);
  const defaultExpoFilterAppliedRef = useRef(false);
  const navigate = useNavigate();
  const isAdminFullAccess =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) || hasFullDataAccess(role_name);

  useEffect(() => {
    if (authLoading || defaultExpoFilterAppliedRef.current) return;
    if (searchParams.get("expo")?.trim()) {
      defaultExpoFilterAppliedRef.current = true;
      return;
    }
    if (expoOptions.length === 0) return;

    const shouldAutoFilter =
      !isAdminFullAccess || (planLimits?.isEtincelle === true && Boolean(catalogueAgencyId));
    if (!shouldAutoFilter) {
      defaultExpoFilterAppliedRef.current = true;
      return;
    }

    void (async () => {
      let targetExpoId: string | null = null;
      const userExpo = userExpoId?.trim() || null;

      if (userExpo) {
        const matched = expoOptions.find(
          (expo) => expo.id === userExpo || (expo.expo_id ?? "").trim() === userExpo,
        );
        if (matched) targetExpoId = matched.id;
      }

      if (!targetExpoId && (role_id === 5 || role_id === 6 || scope.mode === "expo")) {
        const scopeExpo = scope.mode === "expo" ? scope.expoId?.trim() : null;
        if (scopeExpo) {
          const matched = expoOptions.find(
            (expo) => expo.id === scopeExpo || (expo.expo_id ?? "").trim() === scopeExpo,
          );
          if (matched) targetExpoId = matched.id;
        }
      }

      if (!targetExpoId && typeof role_id === "number" && role_id >= 4 && role_id <= 6) {
        const { data: authSession } = await supabase.auth.getUser();
        const uid = authSession.user?.id;
        if (uid) {
          const { data: assignments } = await supabase
            .from("expo_user_role")
            .select("expo_id")
            .eq("user_id", uid)
            .order("assigned_at", { ascending: false })
            .limit(1);
          const assignedExpoId = (assignments as Array<{ expo_id?: string | null }> | null)?.[0]?.expo_id?.trim();
          if (assignedExpoId) {
            const matched = expoOptions.find(
              (expo) => expo.id === assignedExpoId || (expo.expo_id ?? "").trim() === assignedExpoId,
            );
            if (matched) targetExpoId = matched.id;
          }
        }
      }

      if (!targetExpoId && catalogueAgencyId) {
        const agencyExpos = expoOptions.filter(
          (expo) => (expo.agency_id ?? "").trim() === catalogueAgencyId,
        );
        if (agencyExpos.length === 1) {
          targetExpoId = agencyExpos[0]?.id ?? null;
        } else if (agencyExpos.length > 1 && planLimits?.isEtincelle) {
          targetExpoId = agencyExpos[0]?.id ?? null;
        }
      }

      if (!targetExpoId && expoOptions.length === 1) {
        targetExpoId = expoOptions[0]?.id ?? null;
      }

      if (targetExpoId) {
        setSelectedExpoFilter(targetExpoId);
      }
      defaultExpoFilterAppliedRef.current = true;
    })();
  }, [
    authLoading,
    catalogueAgencyId,
    expoOptions,
    isAdminFullAccess,
    planLimits?.isEtincelle,
    role_id,
    scope.expoId,
    scope.mode,
    searchParams,
    userExpoId,
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadOeuvresNavigationType = async () => {
      const { data, error: settingError } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "œuvres_navigation_type")
        .maybeSingle();
      if (cancelled || settingError) return;

      const raw = typeof data?.value === "string" ? data.value.trim() : "";
      if (!raw) {
        setOeuvresNavigationType("single_scan_sequence");
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { mode?: string };
        const mode = typeof parsed?.mode === "string" ? parsed.mode.trim() : "";
        setOeuvresNavigationType(mode || raw);
      } catch {
        setOeuvresNavigationType(raw);
      }
    };
    void loadOeuvresNavigationType();
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

    // Si l'utilisateur est limité à une expo, on n'affiche qu'elle.
    if ((role_id === 5 || role_id === 6) && userExpoId) {
      query = query.eq("id", userExpoId);
    } else if (scope.mode === "expo" && scopeExpoId) {
      query = query.eq("id", scopeExpoId);
    } else if (agencyFilterId) {
      // Inclut les expos sans agency_id (legacy) visibles via RLS pour l'organisation.
      query = query.or(`agency_id.eq.${agencyFilterId},agency_id.is.null`);
    }

    const { data, error: exposError } = await query;
    if (exposError) {
      setExpoOptions([]);
      return;
    }

    const rows =
      ((data as Array<{
        id: string;
        expo_id?: string | null;
        expo_name?: string | null;
        agency_id?: string | null;
      }> | null) ?? []);

    let finalRows = rows;

    // Fallback: si filtrage agence vide, on dérive les expos via artworks de l'agence.
    if (finalRows.length === 0 && ((role_id === 4 && userAgencyId) || (scope.mode === "agency" && scopeAgencyId))) {
      const agencyTarget = userAgencyId ?? scopeAgencyId ?? null;
      if (agencyTarget) {
        const { data: artworkRows } = await supabase
          .from("artworks")
          .select("artwork_expo_id")
          .eq("artwork_agency_id", agencyTarget);
        const expoIds = [
          ...new Set(
            (((artworkRows as Array<{ artwork_expo_id?: string | null }> | null) ?? [])
              .map((r) => r.artwork_expo_id)
              .filter(Boolean) as string[]),
          ),
        ];
        if (expoIds.length) {
          finalRows = rows.filter((expo) => expoIds.includes(expo.id));
        }
      }
    }

    const uniqueExpoRows = Array.from(
      new Map(finalRows.map((expo) => [expo.id, expo])).values(),
    );

    let mapped: ExpoOption[] = uniqueExpoRows.map((expo) => ({
      id: expo.id,
      expo_id: expo.expo_id?.trim() || null,
      name: expo.expo_name?.trim() || expo.expo_id?.trim() || expo.id,
      agency_id: expo.agency_id ?? null,
    }));
    mapped.sort((a, b) => a.name.localeCompare(b.name, "fr"));

    // Fallback robuste : si expos est vide (RLS/cache), on dérive depuis artworks.
    if (mapped.length === 0) {
      let artworksQuery = supabase.from("artworks").select("artwork_expo_id, artwork_agency_id");
      if (role_id === 4 && userAgencyId) {
        artworksQuery = artworksQuery.eq("artwork_agency_id", userAgencyId);
      } else if ((role_id === 5 || role_id === 6) && userExpoId) {
        artworksQuery = artworksQuery.eq("artwork_expo_id", userExpoId);
      } else if (scope.mode === "expo" && scopeExpoId) {
        artworksQuery = artworksQuery.eq("artwork_expo_id", scopeExpoId);
      } else if (scope.mode === "agency" && scopeAgencyId) {
        artworksQuery = artworksQuery.eq("artwork_agency_id", scopeAgencyId);
      }
      const { data: artworksRows } = await artworksQuery;
      const expoIds = [
        ...new Set(
          (((artworksRows as Array<{ artwork_expo_id?: string | null }> | null) ?? [])
            .map((r) => r.artwork_expo_id)
            .filter(Boolean) as string[]),
        ),
      ];
      if (expoIds.length > 0) {
        const { data: exposByIdsById } = await supabase
          .from("expos")
          .select("*")
          .in("id", expoIds)
          .is("deleted_at", null);
        const { data: exposByIdsByExpoId } = await supabase
          .from("expos")
          .select("*")
          .in("expo_id", expoIds)
          .is("deleted_at", null);

        const mergedRows = [
          ...(((exposByIdsById as Array<Record<string, unknown>> | null) ?? [])),
          ...(((exposByIdsByExpoId as Array<Record<string, unknown>> | null) ?? [])),
        ];
        const uniqueById = new Map<string, Record<string, unknown>>();
        for (const row of mergedRows) {
          const rowId = typeof row.id === "string" ? row.id : "";
          if (!rowId) continue;
          uniqueById.set(rowId, row);
        }
        const mergedExpos = Array.from(uniqueById.values());

        if (mergedExpos.length) {
          mapped = mergedExpos.map((expo) => {
            const agencyId = typeof expo.agency_id === "string" ? expo.agency_id : null;
            const expoId = typeof expo.expo_id === "string" ? expo.expo_id.trim() : "";
            return {
              id: String(expo.id),
              expo_id: expoId || null,
              name:
                (typeof expo.expo_name === "string" && expo.expo_name.trim()) ||
                expoId ||
                String(expo.id),
              agency_id: agencyId,
            };
          });
        } else {
          mapped = expoIds.map((id) => ({ id, expo_id: null, name: id, agency_id: null }));
        }
      }
    }

    setExpoOptions(mapped);
  }, [role_id, userAgencyId, userExpoId, scope]);

  const fetchVoiceSummariesForRows = useCallback(
    async (rows: ArtworkRow[]): Promise<Record<string, ArtworkVoiceCatalogSummary>> => {
      const artworkIds = rows.map((r) => r.artwork_id).filter(Boolean);
      if (artworkIds.length === 0) return {};

      const { data: audioRows, error: audioError } = await supabase
        .from("audio_files")
        .select("text_id, lang, status, storage_path")
        .eq("text_type", "mediation")
        .in("text_id", artworkIds);

      if (audioError) {
        console.error("[Catalogue] audio_files:", audioError);
        return {};
      }

      return buildArtworkVoiceCatalogMap(rows, audioRows ?? []);
    },
    [],
  );

  const refreshVoiceSummaries = useCallback(async () => {
    const rows = artworksRef.current;
    if (rows.length === 0) {
      setVoiceSummaryByArtwork({});
      return;
    }
    const voiceMap = await fetchVoiceSummariesForRows(rows);
    setVoiceSummaryByArtwork(voiceMap);
  }, [fetchVoiceSummariesForRows]);

  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("artworks")
      .select(
        "artwork_id, artwork_title, artwork_description_i18n, artwork_source_material, artwork_image_url, artwork_photo_url, artwork_qr_code_url, artwork_qrcode_image, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status, artists!left(*)",
      )
      .is("deleted_at", null)
      .order("artwork_title", { ascending: true, nullsFirst: false });

    let artworkData: ArtworkRow[] | null = null;
    let artworksError: { message: string } | null = null;
    const joinedResult = await query;
    artworkData = (joinedResult.data as unknown as ArtworkRow[] | null) ?? null;
    artworksError = joinedResult.error ? { message: joinedResult.error.message } : null;

    // Fallback robuste si la jointure PostgREST pose problème.
    if (artworksError) {
      const fallbackQuery = supabase
        .from("artworks")
        .select(
          "artwork_id, artwork_title, artwork_description_i18n, artwork_source_material, artwork_image_url, artwork_photo_url, artwork_qr_code_url, artwork_qrcode_image, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status",
        )
        .is("deleted_at", null)
        .order("artwork_title", { ascending: true, nullsFirst: false });

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        setError(fallbackResult.error.message);
        setArtworks([]);
        setLoading(false);
        return;
      }
      artworkData = (fallbackResult.data as ArtworkRow[] | null) ?? null;
      setError(t("error_artist_join", { message: artworksError.message }));
    }

    if (import.meta.env.DEV) {
      console.debug("[Catalogue] œuvres chargées", { count: (artworkData as ArtworkRow[] | null)?.length ?? 0 });
    }

    let rows = ((artworkData as ArtworkRow[] | null) ?? []).map((row) => ({
      ...row,
      agency_id: row.artwork_agency_id ?? null,
      expo_id: row.artwork_expo_id ?? null,
    }));

    const artistIds = [...new Set(rows.map((r) => r.artwork_artist_id).filter(Boolean))] as string[];
    if (artistIds.length > 0 && !rows.some((r) => artworkArtistFromRow(r))) {
      const { data: artistRows, error: artistError } = await supabase
        .from("artists")
        .select("artist_id, artist_name, artist_prenom, artist_firstname, artist_lastname")
        .in("artist_id", artistIds);
      if (artistError) {
        setError(artistError.message);
      } else {
        const artistMap = new Map<string, ArtistRow>();
        for (const a of (artistRows as ArtistRow[] | null) ?? []) {
          artistMap.set(a.artist_id, a);
        }
        rows = rows.map((row) => ({
          ...row,
          artists: row.artwork_artist_id ? (artistMap.get(row.artwork_artist_id) ?? null) : null,
        }));
      }
    }

    const normalizedRows = rows.map((row) => ({
      ...row,
      agency_id: row.artwork_agency_id ?? null,
      expo_id: row.artwork_expo_id ?? null,
    }));

    const voiceMap = await fetchVoiceSummariesForRows(normalizedRows);

    setVoiceSummaryByArtwork(voiceMap);
    setArtworks(normalizedRows);
    artworksRef.current = normalizedRows;

    setLoading(false);
  }, [scope, role_id, role_name, userAgencyId, userExpoId, isAdminFullAccess, fetchVoiceSummariesForRows, t]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  /** Met à jour les badges voix pendant la génération audio (file client + polling). */
  useEffect(() => {
    const VOICE_POLL_MS = 2500;
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const hasInProgressVoices = () => {
      if (Object.values(getPendingAudioJobsByLang()).some((count) => count > 0)) return true;
      return Object.values(voiceSummaryRef.current).some((summary) => summary.isGenerating);
    };

    const stopPolling = () => {
      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const syncPolling = () => {
      if (hasInProgressVoices()) {
        if (pollId === null) {
          pollId = setInterval(() => {
            void refreshVoiceSummaries().then(() => {
              syncPolling();
            });
          }, VOICE_POLL_MS);
        }
      } else if (pollId !== null) {
        stopPolling();
        void refreshVoiceSummaries();
      }
    };

    const scheduleRefresh = () => {
      if (debounceId !== null) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = null;
        setPendingAudioArtworkIds(new Set(getArtworkIdsWithPendingAudio()));
        void refreshVoiceSummaries();
        syncPolling();
      }, 350);
    };

    scheduleRefresh();

    const unsubscribe = subscribeAudioQueue(scheduleRefresh);

    return () => {
      unsubscribe();
      if (debounceId !== null) clearTimeout(debounceId);
      stopPolling();
    };
  }, [refreshVoiceSummaries]);

  useEffect(() => {
    if (authLoading) return;
    void loadExpoOptions();
  }, [loadExpoOptions, authLoading]);

  useEffect(() => {
    const next = new URLSearchParams();
    const q = search.trim();
    if (q) next.set("q", q);
    if (selectedExpoFilter !== "all") next.set("expo", selectedExpoFilter);
    const nextStr = next.toString();
    if (nextStr !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [search, selectedExpoFilter, searchParams, setSearchParams]);

  const catalogueFiltersPath = useCallback(() => {
    const params = new URLSearchParams();
    const q = search.trim();
    if (q) params.set("q", q);
    if (selectedExpoFilter !== "all") params.set("expo", selectedExpoFilter);
    const qs = params.toString();
    return qs ? `/catalogue?${qs}` : "/catalogue";
  }, [search, selectedExpoFilter]);

  const openCreateArtwork = () => {
    if (planLimits?.isEtincelle && !planLimits.canCreateArtwork) {
      toast.error(
        `Quota atteint : ${planLimits.maxArtworks ?? 0} œuvres maximum avec l'abonnement Étincelle.`,
      );
      return;
    }
    setEditingArtworkId(null);
    setVoicesEntryFromCatalogue(false);
    setArtworkModalOpen(true);
  };

  const openEditArtwork = (id: string) => {
    setEditingArtworkId(id);
    setVoicesEntryFromCatalogue(false);
    setArtworkModalOpen(true);
  };

  const openArtworkVoicesModal = (id: string) => {
    setEditingArtworkId(id);
    setVoicesEntryFromCatalogue(true);
    setArtworkModalOpen(true);
  };

  const filtered = useMemo(() => {
    return artworks.filter((aw) => {
      if (selectedExpoFilter !== "all" && !artworkMatchesExpoFilter(aw, selectedExpoFilter, expoOptions)) {
        return false;
      }
      const artist = artworkArtistFromRow(aw);
      const q = search.toLowerCase();
      const title = (aw.artwork_title ?? "").toLowerCase();
      const artistLabel = `${artist?.artist_firstname ?? artist?.artist_prenom ?? ""} ${artist?.artist_lastname ?? artist?.artist_name ?? ""}`.trim().toLowerCase();
      return title.includes(q) || artistLabel.includes(q);
    });
  }, [artworks, search, selectedExpoFilter, expoOptions]);
  const searchSuggestions = useMemo(
    () =>
      [
        ...new Set(
          artworks.flatMap((aw) => {
            const artist = artworkArtistFromRow(aw);
            const artistLabel = `${artist?.artist_firstname ?? artist?.artist_prenom ?? ""} ${artist?.artist_lastname ?? artist?.artist_name ?? ""}`.trim();
            const title = (aw.artwork_title ?? "").trim();
            return [title, artistLabel].filter(Boolean);
          }),
        ),
      ],
    [artworks],
  );
  // Sentinel supprimée : le placeholder n'est plus injecté comme option datalist.
  // La réinitialisation du filtre se fait uniquement via le bouton X ou en vidant le champ.
  const expoFilterSuggestions = useMemo(
    () =>
      [...new Set(expoOptions.map((expo) => expo.name.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [expoOptions],
  );

  useEffect(() => {
    if (selectedExpoFilter === "all") {
      setExpoFilterInput("");
      return;
    }
    const matchedExpo = expoOptions.find((expo) => expo.id === selectedExpoFilter);
    setExpoFilterInput(matchedExpo?.name ?? selectedExpoFilter);
  }, [selectedExpoFilter, expoOptions]);

  const handleExpoFilterInputChange = (value: string) => {
    setExpoFilterInput(value);
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      setSelectedExpoFilter("all");
      return;
    }

    const exactByName = expoOptions.find((expo) => expo.name.trim().toLowerCase() === normalized);
    if (exactByName) {
      setSelectedExpoFilter(exactByName.id);
      return;
    }

    const exactById = expoOptions.find((expo) => expo.id.trim().toLowerCase() === normalized);
    if (exactById) {
      setSelectedExpoFilter(exactById.id);
    }
  };

  const assignArtworkToExpo = useCallback(
    async (artworkId: string, targetExpoId: string | null): Promise<boolean> => {
      if (!artworkId) return false;
      const normalizedExpoId = targetExpoId?.trim() ? targetExpoId : null;
      setIsAssigningExpo(true);
      setError(null);
      const { error: updateError } = await supabase
        .from("artworks")
        .update({ artwork_expo_id: normalizedExpoId } as never)
        .eq("artwork_id", artworkId);

      if (updateError) {
        setError(`Affectation expo impossible : ${updateError.message}`);
        setIsAssigningExpo(false);
        return false;
      }

      setArtworks((prev) =>
        prev.map((row) =>
          row.artwork_id === artworkId
            ? {
                ...row,
                artwork_expo_id: normalizedExpoId,
                expo_id: normalizedExpoId,
              }
            : row,
        ),
      );
      if (selectedExpoFilter !== "all") {
        void loadCatalogue();
      }
      setIsAssigningExpo(false);
      return true;
    },
    [loadCatalogue, selectedExpoFilter],
  );

  const requestExpoMove = useCallback(
    (
      artworkId: string,
      artworkTitle: string | null,
      fromExpoId: string | null,
      toExpoId: string | null,
    ) => {
      const normalizedFrom = fromExpoId?.trim() || null;
      const normalizedTo = toExpoId?.trim() || null;
      if (normalizedFrom === normalizedTo) return;
      setExpoMovePending({
        artworkId,
        artworkTitle: (artworkTitle ?? "").trim() || t("artwork_untitled"),
        fromExpoId: normalizedFrom,
        toExpoId: normalizedTo,
      });
    },
    [t],
  );

  const confirmExpoMove = useCallback(async () => {
    if (!expoMovePending) return;
    const { artworkId, fromExpoId, toExpoId } = expoMovePending;
    setExpoMovePending(null);
    const success = await assignArtworkToExpo(artworkId, toExpoId);
    if (success) {
      setExpoUndoByArtwork((prev) => ({ ...prev, [artworkId]: fromExpoId }));
    }
  }, [assignArtworkToExpo, expoMovePending]);

  const undoExpoMove = useCallback(
    async (artworkId: string) => {
      const previousExpoId = expoUndoByArtwork[artworkId];
      if (previousExpoId === undefined) return;
      const success = await assignArtworkToExpo(artworkId, previousExpoId);
      if (success) {
        setExpoUndoByArtwork((prev) => {
          const next = { ...prev };
          delete next[artworkId];
          return next;
        });
      }
    },
    [assignArtworkToExpo, expoUndoByArtwork],
  );

  const updateArtworkStatus = useCallback(async (artworkId: string, nextActive: boolean) => {
    if (!artworkId) return;
    const nextStatus = nextActive ? "active" : "inactive";
    setUpdatingArtworkStatusId(artworkId);
    setError(null);

    const { error: updateError } = await supabase
      .from("artworks")
      .update({ artwork_status: nextStatus } as never)
      .eq("artwork_id", artworkId);

    if (updateError) {
      setError(t("error_status_update", { message: updateError.message }));
    } else {
      setArtworks((prev) =>
        prev.map((row) =>
          row.artwork_id === artworkId
            ? {
                ...row,
                artwork_status: nextStatus,
              }
            : row,
        ),
      );
    }

    setUpdatingArtworkStatusId(null);
  }, []);

  const showScopeHint = !authLoading && scope.mode === "none";

  const handleRegenerateAllQrCodes = useCallback(async () => {
    if (role_id === 7) return;
    const ids = artworks.map((a) => a.artwork_id?.trim()).filter(Boolean) as string[];
    if (ids.length === 0) return;

    const originOverride = await fetchQrPublicSiteOriginFromSettings();
    setBulkQrProgress({ done: 0, total: ids.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < ids.length; i++) {
      const artworkId = ids[i];
      try {
        const row = artworks.find((a) => a.artwork_id === artworkId);
        const expoForQr = ((row?.expo_id ?? row?.artwork_expo_id) ?? "").trim() || null;
        const targetUrl = buildOeuvreQrUrl(artworkId, originOverride, expoForQr);
        if (!targetUrl) { errorCount++; continue; }

        const dataUrl = await QRCode.toDataURL(targetUrl, QR_CODE_STORAGE_OPTIONS);
        const blob = await (await fetch(dataUrl)).blob();
        const path = `qrcodes/${artworkId}.png`;

        const { error: uploadError } = await supabase.storage.from("qrcode").upload(path, blob, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: true,
        });
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from("qrcode").getPublicUrl(path);
        const publicQrUrl = pub.publicUrl;

        const { error: updateError } = await supabase
          .from("artworks")
          .update({ artwork_qr_code_url: publicQrUrl, artwork_qrcode_image: publicQrUrl })
          .eq("artwork_id", artworkId);
        if (updateError) throw updateError;

        setArtworks((prev) =>
          prev.map((row) =>
            row.artwork_id === artworkId
              ? { ...row, artwork_qr_code_url: publicQrUrl, artwork_qrcode_image: publicQrUrl }
              : row,
          ),
        );
        successCount++;
      } catch {
        errorCount++;
      }
      setBulkQrProgress({ done: i + 1, total: ids.length });
      // Throttle pour ne pas saturer Supabase Storage
      await new Promise((r) => setTimeout(r, 120));
    }

    setBulkQrProgress(null);
    if (errorCount === 0) {
      toast.success(t("qr_bulk_success", { count: successCount }));
    } else {
      toast.warning(t("qr_bulk_partial", { success: successCount, error: errorCount }));
    }
  }, [role_id, artworks]);

  const handleGeneratePDF = async (aw: ArtworkRow, formatId: CartelFormatId) => {
    const artworkId = aw.artwork_id?.trim();
    if (!artworkId) {
      toast.error(t("pdf_error_no_id"));
      return;
    }

    const artist = artworkArtistFromRow(aw);
    const artistLabel =
      [artist?.artist_firstname ?? artist?.artist_prenom, artist?.artist_lastname ?? artist?.artist_name]
        .filter(Boolean)
        .join(" ")
        .trim() || t("artist_unknown");

    try {
      const originOverride = await fetchQrPublicSiteOriginFromSettings();
      const expoForQr = ((aw.expo_id ?? aw.artwork_expo_id) ?? "").trim() || null;
      const targetUrl = buildOeuvreQrUrl(artworkId, originOverride, expoForQr);
      if (!targetUrl) {
        toast.error(t("pdf_error_no_qr_url"));
        return;
      }

      const blobUrl = await generateCartelPdf({
        formatId,
        titleText: (aw.artwork_title ?? t("artwork_untitled")).trim(),
        artistText: artistLabel,
        explorationLines: cartelExplorationLines(œuvresNavigationType, t),
        qrTargetUrl: targetUrl,
      });

      navigate(catalogueFiltersPath(), { replace: true });

      const pdfLink = document.createElement("a");
      pdfLink.href = blobUrl;
      pdfLink.target = "_blank";
      pdfLink.rel = "noopener noreferrer";
      document.body.appendChild(pdfLink);
      pdfLink.click();
      document.body.removeChild(pdfLink);
      window.focus();

      if (getCartelFormat(formatId).landscapeDuplex) {
        toast.info(t("pdf_duplex_screen_hint"), { duration: 12000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pdf_error_generate"));
    }
  };

  const openCartelFormatDialog = (aw: ArtworkRow) => {
    setCartelArtwork(aw);
    setCartelFormatDialogOpen(true);
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col gap-2 bg-[#121212]/95 py-2 backdrop-blur-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full min-w-0 flex-col gap-2 md:max-w-[576px]">
          <div className="flex flex-wrap items-center gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-white">{t("page_title")}</h2>
          </div>
          <div className="relative w-[210px] min-w-[210px] max-w-[210px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              list="catalogue-search-suggestions"
              placeholder={t("search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white"
            />
            {search.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("search_clear_aria")}
                title="Effacer"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <datalist id="catalogue-search-suggestions">
              {searchSuggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="relative w-[210px] min-w-[210px] max-w-[210px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              list="catalogue-expo-filter-suggestions"
              placeholder={t("expo_filter_placeholder")}
              value={expoFilterInput}
              onChange={(e) => handleExpoFilterInputChange(e.target.value)}
              className="pl-9 pr-9 h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white"
            />
            {(expoFilterInput.trim().length > 0 || selectedExpoFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setExpoFilterInput("");
                  setSelectedExpoFilter("all");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("expo_filter_clear_aria")}
                title={t("expo_filter_clear_title")}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <datalist id="catalogue-expo-filter-suggestions">
              {expoFilterSuggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          </div>
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground">{t("scope_expo_hint", { expoId: scope.expoId })}</p>
          )}
        </div>
        <BackofficeStickyAgencyLogoSlot />
        <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 md:w-auto md:max-w-[576px] md:justify-end">
          {isAdminFullAccess && (
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-amber-500/60 text-amber-700 hover:bg-amber-50 shrink-0"
              onClick={() => setBulkQrConfirmOpen(true)}
              disabled={Boolean(bulkQrProgress)}
              title={t("qr_bulk_regenerate_title")}
            >
              {bulkQrProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("qr_bulk_progress", { done: bulkQrProgress.done, total: bulkQrProgress.total })}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  {t("qr_bulk_regenerate_btn")}
                </>
              )}
            </Button>
          )}
          <Button
            className="gap-2 text-[14px] gradient-gold gradient-gold-hover-bg text-primary-foreground shrink-0"
            onClick={() => openCreateArtwork()}
            disabled={planLimits?.isEtincelle && !planLimits.canCreateArtwork}
          >
            <Plus className="h-4 w-4" />
            {t("btn_new_artwork")}
          </Button>
          <Button type="button" variant="outline" className="backoffice-toolbar-outline-btn gap-2" asChild>
            <Link to="/catalogue/catalogue2">{t("btn_table_view")}</Link>
          </Button>
        </div>
        </div>
        {planLimits?.isEtincelle ? (
          <p className="w-full text-sm font-medium text-destructive">
            {!planLimits.canCreateArtwork
              ? "Quota d'œuvres atteint — passez à un abonnement supérieur pour en créer davantage."
              : `${planLimits.artworksRemaining ?? 0} œuvre${(planLimits.artworksRemaining ?? 0) > 1 ? "s" : ""} restante${(planLimits.artworksRemaining ?? 0) > 1 ? "s" : ""} à créer`}
          </p>
        ) : null}
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>{t("alert_empty_scope_title")}</AlertTitle>
          <AlertDescription>{t("alert_empty_scope_desc")}</AlertDescription>
        </Alert>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && <p className="col-span-full text-sm text-muted-foreground text-center py-12">{t("loading_catalogue")}</p>}
        {filtered.length === 0 && !showScopeHint && !error && (
          <p className="col-span-full text-sm text-muted-foreground text-center py-12">
            {t("empty_search")}
          </p>
        )}
        {filtered.map((aw) => {
          const artist = artworkArtistFromRow(aw);
          const currentExpoRaw = (aw.expo_id ?? aw.artwork_expo_id ?? "").trim();
          const artworkAgencyId = aw.artwork_agency_id ?? null;
          const availableExpoOptions = expoOptions.filter((expo) => {
            if (!artworkAgencyId) return true;
            return (expo.agency_id ?? null) === artworkAgencyId;
          });
          const selectedExpoOption =
            availableExpoOptions.find((expo) => expo.id === currentExpoRaw) ??
            availableExpoOptions.find((expo) => (expo.expo_id ?? "") === currentExpoRaw) ??
            null;
          const selectedExpoValue = selectedExpoOption?.id || "__none__";
          const artistLabel =
            [artist?.artist_firstname ?? artist?.artist_prenom, artist?.artist_lastname ?? artist?.artist_name]
              .filter(Boolean)
              .join(" ")
              .trim() || t("artist_unknown");
          const artworkImage = aw.artwork_image_url || aw.artwork_photo_url || "https://images.unsplash.com/photo-1635776062043-223faf322554";
          const currentStatusRaw = (aw.artwork_status ?? "").trim();
          const isArtworkActive = currentStatusRaw.toLowerCase() === "active";
          const isArtworkDraft = currentStatusRaw.toLowerCase() === "draft";
          const statusLabel = artworkStatusLabel(currentStatusRaw, t);
          const hasImageAnalysis = (aw.artwork_source_material ?? "").trim().length > 0;
          const generatedTextsCount = countMaxMediationStylesAcrossLangs(aw.artwork_description_i18n);
          const hasGeneratedMediation = generatedTextsCount > 0;
          const mediationLangsLabel = getMediationFilledUiLangs(aw.artwork_description_i18n)
            .map((lang) => lang.toUpperCase())
            .join(" - ");
          const voiceSummary = voiceSummaryByArtwork[aw.artwork_id] ?? {
            readyCount: 0,
            expectedCount: 0,
            generatingCount: 0,
            langsLabel: "",
            isComplete: false,
            isGenerating: false,
          };
          const hasExpectedVoices = voiceSummary.expectedCount > 0;
          const voiceIsGenerating =
            voiceSummary.isGenerating || pendingAudioArtworkIds.has(aw.artwork_id);
          const voiceBadgeComplete = voiceSummary.isComplete && !voiceIsGenerating;
          const voiceBadgePartial =
            hasExpectedVoices &&
            !voiceIsGenerating &&
            voiceSummary.readyCount > 0 &&
            voiceSummary.readyCount < voiceSummary.expectedCount;

          return (
            <Card key={aw.artwork_id} className="glass-card hover:shadow-lg transition-all duration-300 overflow-hidden">
              <CardContent
                className="relative p-4 flex flex-row items-stretch gap-4 cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => openEditArtwork(aw.artwork_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEditArtwork(aw.artwork_id);
                  }
                }}
              >
                <div className="flex w-[150px] min-w-[150px] shrink-0 flex-col items-center gap-2">
                  <div className="flex shrink-0 flex-col pt-[10px] pb-[10px] items-center">
                    <img
                      src={artworkImage}
                      alt={aw.artwork_title ?? "œuvre"}
                      className="h-[150px] w-[150px] rounded-xl object-cover shrink-0"
                    />
                  </div>
                  <div
                    className="flex w-full max-w-[150px] flex-col gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] leading-tight text-muted-foreground text-center">
                      {t("expo_selector_move_label")}
                    </span>
                    <Select
                      value={selectedExpoValue}
                      onValueChange={(value) => {
                        requestExpoMove(
                          aw.artwork_id,
                          aw.artwork_title,
                          selectedExpoOption?.id ?? null,
                          value === "__none__" ? null : value,
                        );
                      }}
                      disabled={isAssigningExpo}
                    >
                      <SelectTrigger
                        className="h-7 w-full max-w-[150px] px-1.5 text-[11px] rounded-none border border-input bg-background shadow-none hover:bg-background [&>span]:min-w-0 [&>span]:truncate"
                      >
                        <SelectValue placeholder={t("expo_selector_placeholder")} />
                      </SelectTrigger>
                      <SelectContent className="rounded-none shadow-none z-[60]">
                        <SelectItem value="__none__" className="text-xs">
                          <span className="italic">{t("expo_selector_none")}</span>
                        </SelectItem>
                        {availableExpoOptions.length > 0 ? (
                          availableExpoOptions.map((expo) => (
                            <SelectItem key={expo.id} value={expo.id} className="text-xs">
                              {expo.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty__" disabled className="text-xs">
                            {t("expo_selector_empty")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {expoUndoByArtwork[aw.artwork_id] !== undefined ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 w-full gap-1 px-1.5 text-[10px]"
                        disabled={isAssigningExpo}
                        aria-label={t("expo_move_undo_aria")}
                        onClick={() => void undoExpoMove(aw.artwork_id)}
                      >
                        <Undo2 className="h-3 w-3 shrink-0" aria-hidden />
                        {t("expo_move_undo")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="relative flex min-h-[156px] min-w-0 flex-1 flex-col self-stretch">
                  {/* Titre + artiste — pleine largeur, superposés au-dessus de la colonne boutons */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex min-w-0 w-full flex-col">
                    <h3 className="min-w-0 w-full truncate font-serif font-bold text-lg">
                      {aw.artwork_title ?? t("artwork_untitled")}
                    </h3>
                    <p className="min-w-0 w-full truncate text-sm text-primary italic">{artistLabel}</p>
                    <div
                      className="pointer-events-auto mt-2 inline-flex min-w-0 max-w-full items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#E63946]"
                          checked={isArtworkActive}
                          disabled={updatingArtworkStatusId === aw.artwork_id || isArtworkDraft}
                          onChange={(e) => {
                            void updateArtworkStatus(aw.artwork_id, e.target.checked);
                          }}
                        />
                      </label>
                      <span className="min-w-0 truncate text-xs font-semibold text-foreground">{statusLabel}</span>
                    </div>
                  </div>

                  <div className="relative z-0 flex min-h-[156px] w-full min-w-0 flex-1 flex-col justify-start items-stretch gap-3 p-0">
                    <div className="ml-auto flex w-[180px] max-w-full flex-col gap-2 pt-[35px]">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCartelFormatDialog(aw);
                      }}
                      disabled={!aw.artwork_qrcode_image && !aw.artwork_qr_code_url}
                    >
                      {t("btn_print_cartel")}
                    </Button>
                    <Button
                      type="button"
                      className="w-full justify-center gap-2 text-[14px] gradient-gold gradient-gold-hover-bg text-primary-foreground !shadow-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        void (async () => {
                          const ex = (aw.expo_id ?? aw.artwork_expo_id)?.trim();
                          const origin = await fetchQrPublicSiteOriginFromSettings();
                          const pub = buildOeuvreQrUrl(aw.artwork_id, origin || undefined, ex ?? undefined);
                          if (!pub) return;
                          const u = new URL(pub);
                          navigate(`${u.pathname}${u.search}`);
                        })();
                      }}
                    >
                      {t("btn_visitor_visual")}
                    </Button>
                    </div>
                    <div
                      className={cn(
                        "ml-auto flex max-w-full shrink-0 flex-col items-stretch gap-2 pt-3 mt-auto",
                        CATALOG_IA_BADGE_WIDTH_CLASS,
                      )}
                    >
                    <span
                      className={cn(
                        catalogIaBadgeClass,
                        hasImageAnalysis
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-[#E63946] bg-[#E63946] text-white",
                      )}
                    >
                      {t(hasImageAnalysis ? "badge_ia_image_yes" : "badge_ia_image_no")}
                    </span>
                    <span
                      className={cn(
                        catalogIaBadgeClass,
                        hasGeneratedMediation
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-[#E63946] bg-[#E63946] text-white",
                      )}
                    >
                      {t("badge_ia_mediation", {
                        count: generatedTextsCount,
                        langs: mediationLangsLabel,
                      })}
                    </span>
                    <span
                      role={hasExpectedVoices ? "button" : undefined}
                      tabIndex={hasExpectedVoices ? 0 : undefined}
                      className={cn(
                        catalogIaBadgeClass,
                        !hasExpectedVoices
                          ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                          : voiceIsGenerating
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : voiceBadgeComplete
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : voiceBadgePartial
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-[#E63946] bg-[#E63946] text-white",
                        hasExpectedVoices &&
                          "cursor-pointer justify-between gap-1.5 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                      )}
                      aria-label={
                        hasExpectedVoices
                          ? voiceIsGenerating
                            ? t("badge_ia_voice_generating_aria")
                            : t("badge_ia_voice_open_aria")
                          : undefined
                      }
                      onClick={
                        hasExpectedVoices
                          ? (e) => {
                              e.stopPropagation();
                              openArtworkVoicesModal(aw.artwork_id);
                            }
                          : undefined
                      }
                      onKeyDown={
                        hasExpectedVoices
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                openArtworkVoicesModal(aw.artwork_id);
                              }
                            }
                          : undefined
                      }
                    >
                      <span className="min-w-0 truncate">
                        {!hasExpectedVoices
                          ? t("badge_ia_voice_none")
                          : voiceIsGenerating
                            ? voiceSummary.readyCount > 0
                              ? t("badge_ia_voice_generating_partial", {
                                  ready: voiceSummary.readyCount,
                                  expected: voiceSummary.expectedCount,
                                  langs: voiceSummary.langsLabel || mediationLangsLabel,
                                })
                              : t("badge_ia_voice_generating")
                            : voiceBadgePartial
                              ? t("badge_ia_voice_partial", {
                                  ready: voiceSummary.readyCount,
                                  expected: voiceSummary.expectedCount,
                                  langs: voiceSummary.langsLabel || mediationLangsLabel,
                                })
                              : t("badge_ia_voice", {
                                  count: voiceSummary.readyCount,
                                  langs: voiceSummary.langsLabel || mediationLangsLabel,
                                })}
                      </span>
                      {voiceIsGenerating || hasExpectedVoices ? (
                        <span className="ml-1 flex shrink-0 items-center gap-1">
                          {voiceIsGenerating ? (
                            <Loader2 className="h-3 w-3 animate-spin opacity-80" aria-hidden />
                          ) : null}
                          {hasExpectedVoices ? (
                            <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={expoMovePending !== null}
        onOpenChange={(open) => {
          if (!open) setExpoMovePending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("expo_move_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {expoMovePending
                ? t("expo_move_confirm_desc", {
                    title: expoMovePending.artworkTitle,
                    from: resolveExpoLabel(
                      expoMovePending.fromExpoId,
                      expoOptions,
                      t("expo_label_none"),
                    ),
                    to: resolveExpoLabel(
                      expoMovePending.toExpoId,
                      expoOptions,
                      t("expo_label_none"),
                    ),
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("expo_move_confirm_no")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-700 text-white hover:bg-amber-800"
              onClick={() => void confirmExpoMove()}
            >
              {t("expo_move_confirm_yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkQrConfirmOpen} onOpenChange={(open) => !open && setBulkQrConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("qr_bulk_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
              <span className="block font-semibold text-destructive mb-2">
                {t("qr_bulk_confirm_warning")}
              </span>
              {t("qr_bulk_confirm_description", { count: artworks.length })}
              {(() => {
                const noExpoCount = artworks.filter(
                  (a) => !((a.expo_id ?? a.artwork_expo_id) as string | null | undefined)?.trim()
                ).length;
                return noExpoCount > 0 ? (
                  <span className="mt-2 block rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {t("qr_bulk_warn_no_expo", { count: noExpoCount })}
                  </span>
                ) : null;
              })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkQrConfirmOpen(false)}>
              {t("qr_confirm_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setBulkQrConfirmOpen(false);
                void handleRegenerateAllQrCodes();
              }}
            >
              {t("qr_bulk_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CartelFormatDialog
        open={cartelFormatDialogOpen}
        onOpenChange={setCartelFormatDialogOpen}
        artworkTitle={cartelArtwork?.artwork_title}
        onConfirm={(formatId) => {
          if (cartelArtwork) void handleGeneratePDF(cartelArtwork, formatId);
        }}
      />

      <ArtworkModalWorkflow
        open={artworkModalOpen}
        onOpenChange={(next) => {
          setArtworkModalOpen(next);
          if (!next) {
            setVoicesEntryFromCatalogue(false);
            void loadCatalogue();
            navigate(catalogueFiltersPath(), { replace: true });
          }
        }}
        artworkId={editingArtworkId}
        openMediationAudioOnLoad={voicesEntryFromCatalogue}
        closeOnMediationAudioClose={voicesEntryFromCatalogue}
        onSuccess={() => {
          void loadCatalogue();
          void loadExpoOptions();
        }}
      />
    </div>
  );
};

export default Catalogue;


