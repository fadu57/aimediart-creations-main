import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
import { Plus, Search, Loader2, X, Undo2, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { buildArtworkGroupQrUrl, buildOeuvreQrUrl } from "@/lib/oeuvrePublicUrl";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import { generateCartelPdf, generateCartelPdfBatch, type GenerateCartelPdfInput } from "@/lib/cartelPdfRenderer";
import { cartelExplorationLines } from "@/lib/cartelExplorationText";
import { resolveCartelFormat, type CartelFormatSelection } from "@/lib/cartelPdfFormats";
import { CartelFormatDialog, type CartelExtraTitleLangOption } from "@/components/CartelFormatDialog";
import { cn } from "@/lib/utils";
import { CatalogueArtworkGroupDeck } from "@/components/catalogue/CatalogueArtworkGroupDeck";
import {
  CATALOGUE_CARD_HEIGHT_CLASS,
  CATALOGUE_GRID_ROW_CLASS,
} from "@/lib/catalogueCardLayout";
import { fetchArtworkGroupsForExpo, type ArtworkGroupWithMembers } from "@/lib/artworkGroupFetch";
import { EntityCostLabel } from "@/components/EntityCostLabel";
import { getCostTotalsByArtworkIds, resolveEntityCostDisplay } from "@/lib/costs";
import { getUsdToEurRate } from "@/lib/fxRates";
import {
  countMaxMediationStylesAcrossLangs,
  getMediationFilledUiLangs,
  MEDIATION_UI_LANGS,
  type MediationUiLang,
  resolveMediationUiLang,
} from "@/lib/artworkDescriptionI18n";
import {
  buildArtworkVoiceCatalogMap,
  fetchMediationAudioFilesForArtworks,
  type ArtworkVoiceCatalogSummary,
} from "@/lib/artworkVoiceCatalog";
import { useTranslation } from "react-i18next";
import {
  normalizeTitleToByLang,
  titleTextForLang,
} from "@/lib/artworkTitleI18n";

type ArtworkRow = {
  artwork_id: string;
  artwork_title: string | null;
  artwork_title_i18n?: unknown;
  artwork_title_i18n_enabled?: boolean | null;
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

function artworkArtistLabel(aw: Pick<ArtworkRow, "artists">): string {
  const artist = artworkArtistFromRow(aw);
  return `${artist?.artist_firstname ?? artist?.artist_prenom ?? ""} ${artist?.artist_lastname ?? artist?.artist_name ?? ""}`.trim();
}

function artworkDisplayTitle(
  aw: Pick<ArtworkRow, "artwork_title" | "artwork_title_i18n" | "artwork_title_i18n_enabled">,
  languageTag: string,
  untitledFallback: string,
): string {
  if (aw.artwork_title_i18n_enabled) {
    const byLang = normalizeTitleToByLang(aw.artwork_title_i18n, aw.artwork_title);
    return (
      titleTextForLang(byLang, languageTag, { legacyTitle: aw.artwork_title }) || untitledFallback
    );
  }
  return (aw.artwork_title ?? "").trim() || untitledFallback;
}

/** Langues de titre i18n disponibles en plus de la langue UI (pour le PDF cartel). */
function artworkExtraTitleLangOptions(
  aw: Pick<ArtworkRow, "artwork_title" | "artwork_title_i18n" | "artwork_title_i18n_enabled">,
  uiLanguageTag: string,
): CartelExtraTitleLangOption[] {
  if (!aw.artwork_title_i18n_enabled) return [];
  const byLang = normalizeTitleToByLang(aw.artwork_title_i18n, aw.artwork_title);
  const mainLang = resolveMediationUiLang(uiLanguageTag);
  const mainTitle = (byLang[mainLang] ?? "").trim() || (aw.artwork_title ?? "").trim();
  const options: CartelExtraTitleLangOption[] = [];
  for (const lang of MEDIATION_UI_LANGS) {
    if (lang === mainLang) continue;
    const preview = (byLang[lang] ?? "").trim();
    if (!preview || preview === mainTitle) continue;
    options.push({ lang, label: lang.toUpperCase(), preview });
  }
  return options;
}

function artworkExtraTitlesForLangs(
  aw: Pick<ArtworkRow, "artwork_title" | "artwork_title_i18n" | "artwork_title_i18n_enabled">,
  langs: readonly MediationUiLang[],
  uiLanguageTag: string,
): string[] {
  if (!aw.artwork_title_i18n_enabled || langs.length === 0) return [];
  const byLang = normalizeTitleToByLang(aw.artwork_title_i18n, aw.artwork_title);
  const mainTitle = artworkDisplayTitle(aw, uiLanguageTag, "");
  const out: string[] = [];
  for (const lang of langs) {
    const text = (byLang[lang] ?? "").trim();
    if (text && text !== mainTitle) out.push(text);
  }
  return out;
}

function artworkMatchesSearchQuery(
  aw: Pick<ArtworkRow, "artwork_title" | "artwork_title_i18n" | "artists">,
  q: string,
): boolean {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;
  const title = (aw.artwork_title ?? "").toLowerCase();
  const i18nBlob = Object.values(normalizeTitleToByLang(aw.artwork_title_i18n, aw.artwork_title))
    .join(" ")
    .toLowerCase();
  const artistLabel = artworkArtistLabel(aw).toLowerCase();
  return title.includes(normalized) || i18nBlob.includes(normalized) || artistLabel.includes(normalized);
}

function resolveExpoIdForArtwork(
  aw: Pick<ArtworkRow, "artwork_expo_id" | "expo_id">,
  options: ExpoOption[],
): string | null {
  const raw = artworkExpoRef(aw);
  if (!raw) return null;
  const match =
    options.find((o) => o.id === raw) ?? options.find((o) => (o.expo_id ?? "").trim() === raw);
  return match?.id ?? null;
}

/** Largeur commune des badges IA (image, médiations, voix) en bas de carte. */
const CATALOG_IA_BADGE_WIDTH_CLASS = "w-full sm:w-[14.5rem]";
const catalogIaBadgeClass =
  "inline-flex w-full min-w-0 items-center rounded-full border px-3 py-0.5 text-left text-[11px] font-medium";

const Catalogue = () => {
  const { t, i18n } = useTranslation("catalogue");
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
  const [artworkFilterOpen, setArtworkFilterOpen] = useState(false);
  const [expoFilterOpen, setExpoFilterOpen] = useState(false);
  const artworkSearchInputRef = useRef<HTMLInputElement>(null);
  const expoFilterInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artworkModalOpen, setArtworkModalOpen] = useState(false);
  const [editingArtworkId, setEditingArtworkId] = useState<string | null>(null);
  const [voicesEntryFromCatalogue, setVoicesEntryFromCatalogue] = useState(false);
  const [isAssigningExpo, setIsAssigningExpo] = useState(false);
  const [updatingArtworkStatusId, setUpdatingArtworkStatusId] = useState<string | null>(null);
  const [cartelFormatDialogOpen, setCartelFormatDialogOpen] = useState(false);
  const [expoArtworkGroups, setExpoArtworkGroups] = useState<ArtworkGroupWithMembers[]>([]);
  const [cartelArtwork, setCartelArtwork] = useState<ArtworkRow | null>(null);
  const [cartelGroup, setCartelGroup] = useState<ArtworkGroupWithMembers | null>(null);
  const [cartelBatchMode, setCartelBatchMode] = useState(false);
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<Set<string>>(() => new Set());
  const [batchCartelGenerating, setBatchCartelGenerating] = useState(false);
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
  const isGlobalCostViewer = typeof role_id === "number" && role_id >= 1 && role_id <= 3;
  const [costByArtworkId, setCostByArtworkId] = useState<Record<string, number>>({});
  const [costsReady, setCostsReady] = useState(false);
  const [usdToEurRate, setUsdToEurRate] = useState<number | null>(null);

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

      const audioRows = await fetchMediationAudioFilesForArtworks(artworkIds);
      return buildArtworkVoiceCatalogMap(rows, audioRows);
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
        "artwork_id, artwork_title, artwork_title_i18n, artwork_title_i18n_enabled, artwork_description_i18n, artwork_source_material, artwork_image_url, artwork_photo_url, artwork_qr_code_url, artwork_qrcode_image, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status, artists!left(*)",
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
          "artwork_id, artwork_title, artwork_title_i18n, artwork_title_i18n_enabled, artwork_description_i18n, artwork_source_material, artwork_image_url, artwork_photo_url, artwork_qr_code_url, artwork_qrcode_image, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status",
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

  useEffect(() => {
    if (!isGlobalCostViewer || artworks.length === 0) {
      setCostByArtworkId({});
      setCostsReady(false);
      setUsdToEurRate(null);
      return;
    }
    let cancelled = false;
    setCostsReady(false);
    void Promise.all([
      getCostTotalsByArtworkIds(artworks.map((aw) => aw.artwork_id)),
      getUsdToEurRate(),
    ])
      .then(([totals, rate]) => {
        if (cancelled) return;
        setCostByArtworkId(totals);
        setUsdToEurRate(rate);
        setCostsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCostByArtworkId({});
          setUsdToEurRate(null);
          setCostsReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artworks, isGlobalCostViewer]);

  /** Met à jour les badges voix pendant la génération audio (file client + polling). */
  useEffect(() => {
    const VOICE_POLL_MS = 2500;
    const CATCHUP_DELAYS_MS = [1200, 3500, 7000] as const;
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    const catchupIds: ReturnType<typeof setTimeout>[] = [];

    const hasInProgressVoices = () => {
      if (getArtworkIdsWithPendingAudio().size > 0) return true;
      if (Object.values(getPendingAudioJobsByLang()).some((count) => count > 0)) return true;
      return Object.values(voiceSummaryRef.current).some((summary) => summary.isGenerating);
    };

    const stopPolling = () => {
      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const clearCatchups = () => {
      while (catchupIds.length > 0) {
        const id = catchupIds.pop();
        if (id !== undefined) clearTimeout(id);
      }
    };

    const scheduleCatchupRefreshes = () => {
      clearCatchups();
      for (const delay of CATCHUP_DELAYS_MS) {
        catchupIds.push(
          setTimeout(() => {
            void refreshVoiceSummaries();
          }, delay),
        );
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
        // La file client peut se vider avant le commit DB « ready » → rattrapage.
        scheduleCatchupRefreshes();
      }
    };

    const scheduleRefresh = () => {
      if (debounceId !== null) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = null;
        setPendingAudioArtworkIds(new Set(getArtworkIdsWithPendingAudio()));
        void refreshVoiceSummaries().then(() => {
          syncPolling();
        });
      }, 350);
    };

    scheduleRefresh();

    const unsubscribe = subscribeAudioQueue(scheduleRefresh);

    return () => {
      unsubscribe();
      if (debounceId !== null) clearTimeout(debounceId);
      stopPolling();
      clearCatchups();
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
      return artworkMatchesSearchQuery(aw, search);
    });
  }, [artworks, search, selectedExpoFilter, expoOptions]);

  const artworksScopedByExpo = useMemo(() => {
    if (selectedExpoFilter === "all") return artworks;
    return artworks.filter((aw) => artworkMatchesExpoFilter(aw, selectedExpoFilter, expoOptions));
  }, [artworks, selectedExpoFilter, expoOptions]);

  const expoOptionsScopedBySearch = useMemo(() => {
    const q = search.trim();
    if (!q) return expoOptions;
    const matchingExpoIds = new Set<string>();
    for (const aw of artworks) {
      if (!artworkMatchesSearchQuery(aw, q)) continue;
      const expoId = resolveExpoIdForArtwork(aw, expoOptions);
      if (expoId) matchingExpoIds.add(expoId);
    }
    return expoOptions.filter((expo) => matchingExpoIds.has(expo.id));
  }, [artworks, search, expoOptions]);

  useEffect(() => {
    if (selectedExpoFilter === "all") {
      setExpoArtworkGroups([]);
      return;
    }
    let cancelled = false;
    void fetchArtworkGroupsForExpo(selectedExpoFilter)
      .then((groups) => {
        if (!cancelled) setExpoArtworkGroups(groups);
      })
      .catch((e) => {
        console.warn("[Catalogue] artwork groups:", e);
        if (!cancelled) setExpoArtworkGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedExpoFilter]);

  const artworkGroupDisplayInfo = useMemo(() => {
    const byArtwork = new Map<
      string,
      { group: ArtworkGroupWithMembers; orderedIds: string[] }
    >();
    for (const group of expoArtworkGroups) {
      const ordered = [...group.members].sort((a, b) => a.sort_order - b.sort_order);
      const orderedIds = ordered.map((m) => m.artwork_id);
      for (const m of ordered) {
        byArtwork.set(m.artwork_id, { group, orderedIds });
      }
    }
    return byArtwork;
  }, [expoArtworkGroups]);

  const filteredArtworkById = useMemo(() => {
    const map = new Map<string, ArtworkRow>();
    for (const aw of filtered) map.set(aw.artwork_id, aw);
    return map;
  }, [filtered]);

  const artworkByIdScoped = useMemo(() => {
    const map = new Map<string, ArtworkRow>();
    for (const aw of artworksScopedByExpo) map.set(aw.artwork_id, aw);
    return map;
  }, [artworksScopedByExpo]);

  type CatalogueGridEntry =
    | {
        kind: "group";
        groupInfo: {
          group: ArtworkGroupWithMembers;
          orderedIds: string[];
          focusArtworkId?: string;
        };
      }
    | { kind: "single"; artwork: ArtworkRow };

  const catalogueGridEntries = useMemo((): CatalogueGridEntry[] => {
    const units: CatalogueGridEntry[] = [];
    const seenGroupIds = new Set<string>();

    for (const aw of filtered) {
      const groupInfo = artworkGroupDisplayInfo.get(aw.artwork_id);
      if (groupInfo) {
        // Afficher le deck dès qu'un membre matche le filtre (pas seulement le 1er du groupe).
        if (seenGroupIds.has(groupInfo.group.id)) continue;
        seenGroupIds.add(groupInfo.group.id);
        units.push({
          kind: "group",
          groupInfo: {
            group: groupInfo.group,
            orderedIds: groupInfo.orderedIds,
            focusArtworkId: aw.artwork_id,
          },
        });
      } else {
        units.push({ kind: "single", artwork: aw });
      }
    }

    const output: CatalogueGridEntry[] = [];
    const pairedSingleIds = new Set<string>();
    let i = 0;

    while (i < units.length) {
      const unit = units[i];
      if (unit.kind === "group") {
        output.push(unit);
        let paired = 0;
        for (let j = i + 1; j < units.length && paired < 2; j++) {
          const next = units[j];
          if (next.kind === "single" && !pairedSingleIds.has(next.artwork.artwork_id)) {
            output.push(next);
            pairedSingleIds.add(next.artwork.artwork_id);
            paired++;
          }
        }
        i++;
        continue;
      }

      if (!pairedSingleIds.has(unit.artwork.artwork_id)) {
        output.push(unit);
        pairedSingleIds.add(unit.artwork.artwork_id);
      }
      i++;
    }

    return output;
  }, [filtered, artworkGroupDisplayInfo]);

  const searchSuggestions = useMemo(
    () =>
      [
        ...new Set(
          artworksScopedByExpo.flatMap((aw) => {
            const title = (aw.artwork_title ?? "").trim();
            const artistLabel = artworkArtistLabel(aw);
            return [title, artistLabel].filter(Boolean);
          }),
        ),
      ],
    [artworksScopedByExpo],
  );
  // Sentinel supprimée : le placeholder n'est plus injecté comme option datalist.
  // La réinitialisation du filtre se fait uniquement via le bouton X ou en vidant le champ.
  const expoFilterSuggestions = useMemo(
    () =>
      [...new Set(expoOptionsScopedBySearch.map((expo) => expo.name.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [expoOptionsScopedBySearch],
  );
  const filteredSearchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return searchSuggestions.filter((label) => !q || label.toLowerCase().includes(q));
  }, [search, searchSuggestions]);
  const filteredExpoSuggestions = useMemo(() => {
    const q = expoFilterInput.trim().toLowerCase();
    return expoFilterSuggestions.filter((label) => !q || label.toLowerCase().includes(q));
  }, [expoFilterInput, expoFilterSuggestions]);

  useEffect(() => {
    if (selectedExpoFilter === "all") {
      setExpoFilterInput("");
      return;
    }
    const matchedExpo = expoOptions.find((expo) => expo.id === selectedExpoFilter);
    setExpoFilterInput(matchedExpo?.name ?? selectedExpoFilter);
  }, [selectedExpoFilter, expoOptions]);

  const syncExpoFilterFromArtworkLabel = useCallback(
    (label: string) => {
      const matching = artworksScopedByExpo.filter((aw) => {
        const title = (aw.artwork_title ?? "").trim();
        return title === label || artworkArtistLabel(aw) === label;
      });
      const expoIds = new Set(
        matching.map((aw) => resolveExpoIdForArtwork(aw, expoOptions)).filter((id): id is string => Boolean(id)),
      );
      if (expoIds.size === 1) {
        setSelectedExpoFilter([...expoIds][0]!);
      }
    },
    [artworksScopedByExpo, expoOptions],
  );

  const handleExpoFilterInputChange = (value: string) => {
    setExpoFilterInput(value);
    const normalized = value.trim().toLowerCase();
    const scopedExpoOptions = expoOptionsScopedBySearch;

    if (!normalized) {
      setSelectedExpoFilter("all");
      return;
    }

    const exactByName = scopedExpoOptions.find((expo) => expo.name.trim().toLowerCase() === normalized);
    if (exactByName) {
      setSelectedExpoFilter(exactByName.id);
      return;
    }

    const exactById = scopedExpoOptions.find((expo) => expo.id.trim().toLowerCase() === normalized);
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

  const handleGeneratePDF = async (
    aw: ArtworkRow,
    selection: CartelFormatSelection,
    extraLangs: MediationUiLang[] = [],
  ) => {
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

      const hasAudio = (voiceSummaryByArtwork[artworkId]?.readyCount ?? 0) > 0;
      const blobUrl = await generateCartelPdf({
        formatId: selection.formatId,
        customSizeMm: selection.customSizeMm,
        titleText: artworkDisplayTitle(aw, i18n.language, t("artwork_untitled")),
        extraTitles: artworkExtraTitlesForLangs(aw, extraLangs, i18n.language),
        artistText: artistLabel,
        explorationLines: cartelExplorationLines(hasAudio, t),
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

      if (resolveCartelFormat(selection).landscapeDuplex) {
        toast.info(t("pdf_duplex_screen_hint"), { duration: 12000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pdf_error_generate"));
    }
  };

  const handleGenerateGroupPDF = async (
    group: ArtworkGroupWithMembers,
    selection: CartelFormatSelection,
  ) => {
    const groupId = group.id?.trim();
    if (!groupId) {
      toast.error(t("pdf_error_no_id"));
      return;
    }

    try {
      const originOverride = await fetchQrPublicSiteOriginFromSettings();
      const targetUrl = buildArtworkGroupQrUrl(groupId, originOverride, group.expo_id);
      if (!targetUrl) {
        toast.error(t("pdf_error_no_qr_url"));
        return;
      }

      const label = (group.group_label ?? "").trim() || t("group_deck_badge");
      const number = (group.group_display_number ?? "").trim();
      const artistText = number ? `${label} · ${t("group_deck_number", { number })}` : label;
      const groupHasAudio = group.members.some(
        (m) => (voiceSummaryByArtwork[m.artwork_id]?.readyCount ?? 0) > 0,
      );

      const blobUrl = await generateCartelPdf({
        formatId: selection.formatId,
        customSizeMm: selection.customSizeMm,
        titleText: "",
        artistText,
        explorationLines: cartelExplorationLines(groupHasAudio, t),
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

      if (resolveCartelFormat(selection).landscapeDuplex) {
        toast.info(t("pdf_duplex_screen_hint"), { duration: 12000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pdf_error_generate"));
    }
  };

  const openCartelFormatDialog = (aw: ArtworkRow) => {
    setCartelGroup(null);
    setCartelBatchMode(false);
    setCartelArtwork(aw);
    setCartelFormatDialogOpen(true);
  };

  const openGroupCartelFormatDialog = (group: ArtworkGroupWithMembers) => {
    setCartelArtwork(null);
    setCartelBatchMode(false);
    setCartelGroup(group);
    setCartelFormatDialogOpen(true);
  };

  const toggleArtworkCartelSelection = useCallback((artworkId: string) => {
    setSelectedArtworkIds((prev) => {
      const next = new Set(prev);
      if (next.has(artworkId)) next.delete(artworkId);
      else next.add(artworkId);
      return next;
    });
  }, []);

  const clearCartelSelection = useCallback(() => {
    setSelectedArtworkIds(new Set());
  }, []);

  const selectAllFilteredArtworks = useCallback(() => {
    setSelectedArtworkIds(new Set(filtered.map((aw) => aw.artwork_id)));
  }, [filtered]);

  const openBatchCartelFormatDialog = () => {
    if (selectedArtworkIds.size === 0) return;
    setCartelArtwork(null);
    setCartelGroup(null);
    setCartelBatchMode(true);
    setCartelFormatDialogOpen(true);
  };

  const handleGenerateBatchPDF = async (
    selection: CartelFormatSelection,
    extraLangs: MediationUiLang[] = [],
  ) => {
    if (selectedArtworkIds.size === 0) return;

    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const entry of catalogueGridEntries) {
      if (entry.kind === "single") {
        const id = entry.artwork.artwork_id;
        if (selectedArtworkIds.has(id) && !seen.has(id)) {
          orderedIds.push(id);
          seen.add(id);
        }
      } else {
        for (const id of entry.groupInfo.orderedIds) {
          if (selectedArtworkIds.has(id) && !seen.has(id)) {
            orderedIds.push(id);
            seen.add(id);
          }
        }
      }
    }
    for (const id of selectedArtworkIds) {
      if (!seen.has(id)) {
        orderedIds.push(id);
        seen.add(id);
      }
    }

    const rows = orderedIds
      .map((id) => filteredArtworkById.get(id) ?? artworkByIdScoped.get(id))
      .filter((row): row is ArtworkRow => Boolean(row));

    if (rows.length === 0) {
      toast.error(t("pdf_batch_error"));
      return;
    }

    setBatchCartelGenerating(true);
    try {
      const originOverride = await fetchQrPublicSiteOriginFromSettings();
      const items: GenerateCartelPdfInput[] = [];

      for (const aw of rows) {
        const artworkId = aw.artwork_id?.trim();
        if (!artworkId) continue;

        const artist = artworkArtistFromRow(aw);
        const artistLabel =
          [artist?.artist_firstname ?? artist?.artist_prenom, artist?.artist_lastname ?? artist?.artist_name]
            .filter(Boolean)
            .join(" ")
            .trim() || t("artist_unknown");

        const expoForQr = ((aw.expo_id ?? aw.artwork_expo_id) ?? "").trim() || null;
        const targetUrl = buildOeuvreQrUrl(artworkId, originOverride, expoForQr);
        if (!targetUrl) continue;

        const hasAudio = (voiceSummaryByArtwork[artworkId]?.readyCount ?? 0) > 0;
        items.push({
          formatId: selection.formatId,
          customSizeMm: selection.customSizeMm,
          titleText: artworkDisplayTitle(aw, i18n.language, t("artwork_untitled")),
          extraTitles: artworkExtraTitlesForLangs(aw, extraLangs, i18n.language),
          artistText: artistLabel,
          explorationLines: cartelExplorationLines(hasAudio, t),
          qrTargetUrl: targetUrl,
        });
      }

      if (items.length === 0) {
        toast.error(t("pdf_error_no_qr_url"));
        return;
      }

      const blobUrl = await generateCartelPdfBatch(items);

      navigate(catalogueFiltersPath(), { replace: true });

      const pdfLink = document.createElement("a");
      pdfLink.href = blobUrl;
      pdfLink.target = "_blank";
      pdfLink.rel = "noopener noreferrer";
      document.body.appendChild(pdfLink);
      pdfLink.click();
      document.body.removeChild(pdfLink);
      window.focus();

      toast.success(t("pdf_batch_success", { count: items.length }));
      if (resolveCartelFormat(selection).landscapeDuplex) {
        toast.info(t("pdf_duplex_screen_hint"), { duration: 12000 });
      }
      clearCartelSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pdf_batch_error"));
    } finally {
      setBatchCartelGenerating(false);
    }
  };

  const cartelExtraTitleLangOptions = useMemo((): CartelExtraTitleLangOption[] => {
    if (cartelGroup) return [];
    if (cartelBatchMode) {
      const byLang = new Map<MediationUiLang, string>();
      for (const id of selectedArtworkIds) {
        const aw = filteredArtworkById.get(id) ?? artworkByIdScoped.get(id);
        if (!aw) continue;
        for (const opt of artworkExtraTitleLangOptions(aw, i18n.language)) {
          if (!byLang.has(opt.lang)) byLang.set(opt.lang, opt.preview);
        }
      }
      return MEDIATION_UI_LANGS.filter((lang) => byLang.has(lang)).map((lang) => ({
        lang,
        label: lang.toUpperCase(),
        preview: byLang.get(lang) ?? "",
      }));
    }
    if (cartelArtwork) return artworkExtraTitleLangOptions(cartelArtwork, i18n.language);
    return [];
  }, [
    cartelGroup,
    cartelBatchMode,
    cartelArtwork,
    selectedArtworkIds,
    filteredArtworkById,
    artworkByIdScoped,
    i18n.language,
  ]);

  return (
    <div className="container min-w-0 max-w-full pt-[38px] pb-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col gap-2 bg-[#121212]/95 backdrop-blur-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full min-w-0 flex-col gap-2 md:max-w-[576px]">
          <div className="flex w-full items-baseline justify-between gap-4">
            <h2 className="text-3xl font-serif font-bold text-white">{t("page_title")}</h2>
            {!loading && (
              <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                {t("filtered_count", { count: filtered.length })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Popover
              open={artworkFilterOpen}
              onOpenChange={(open) => {
                setArtworkFilterOpen(open);
                if (open) setExpoFilterOpen(false);
              }}
            >
              <PopoverAnchor asChild>
                <div
                  role="combobox"
                  aria-expanded={artworkFilterOpen}
                  aria-controls="catalogue-artwork-suggestions"
                  className="relative flex h-9 w-[210px] min-w-[210px] max-w-[210px] cursor-text items-center gap-1.5 rounded-md border border-input bg-white px-2.5"
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    e.preventDefault();
                    artworkSearchInputRef.current?.focus();
                    setArtworkFilterOpen(true);
                    setExpoFilterOpen(false);
                  }}
                >
                  <Search className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                  <input
                    ref={artworkSearchInputRef}
                    id="catalogue-artwork-search"
                    type="text"
                    value={search}
                    placeholder={t("filter_label_artworks")}
                    autoComplete="off"
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setArtworkFilterOpen(true);
                      setExpoFilterOpen(false);
                    }}
                    onFocus={() => {
                      setArtworkFilterOpen(true);
                      setExpoFilterOpen(false);
                    }}
                    aria-label={t("search_placeholder")}
                    aria-autocomplete="list"
                    aria-controls="catalogue-artwork-suggestions"
                    className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 caret-neutral-900 outline-none placeholder:text-neutral-900 placeholder:font-medium"
                  />
                  {search.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearch("");
                        artworkSearchInputRef.current?.focus();
                      }}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 hover:text-neutral-900"
                      aria-label={t("search_clear_aria")}
                      title="Effacer"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-neutral-700"
                    aria-label={t("search_placeholder")}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = !artworkFilterOpen;
                      setArtworkFilterOpen(next);
                      setExpoFilterOpen(false);
                      if (next) artworkSearchInputRef.current?.focus();
                    }}
                  >
                    <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                id="catalogue-artwork-suggestions"
                align="start"
                side="bottom"
                sideOffset={4}
                className="w-[210px] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
                  {filteredSearchSuggestions.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">{t("empty_search")}</li>
                  ) : (
                    filteredSearchSuggestions.map((label) => (
                      <li key={label} role="option" aria-selected={search === label}>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSearch(label);
                            syncExpoFilterFromArtworkLabel(label);
                            setArtworkFilterOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </PopoverContent>
            </Popover>
            <Popover
              open={expoFilterOpen}
              onOpenChange={(open) => {
                setExpoFilterOpen(open);
                if (open) setArtworkFilterOpen(false);
              }}
            >
              <PopoverAnchor asChild>
                <div
                  role="combobox"
                  aria-expanded={expoFilterOpen}
                  aria-controls="catalogue-expo-suggestions"
                  className="relative flex h-9 w-[210px] min-w-[210px] max-w-[210px] cursor-text items-center gap-1.5 rounded-md border border-input bg-white px-2.5"
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    e.preventDefault();
                    expoFilterInputRef.current?.focus();
                    setExpoFilterOpen(true);
                    setArtworkFilterOpen(false);
                  }}
                >
                  <Search className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
                  <input
                    ref={expoFilterInputRef}
                    id="catalogue-expo-filter"
                    type="text"
                    value={expoFilterInput}
                    placeholder={t("filter_label_expo")}
                    autoComplete="off"
                    onChange={(e) => {
                      handleExpoFilterInputChange(e.target.value);
                      setExpoFilterOpen(true);
                      setArtworkFilterOpen(false);
                    }}
                    onFocus={() => {
                      setExpoFilterOpen(true);
                      setArtworkFilterOpen(false);
                    }}
                    aria-label={t("expo_filter_placeholder")}
                    aria-autocomplete="list"
                    aria-controls="catalogue-expo-suggestions"
                    className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 caret-neutral-900 outline-none placeholder:text-neutral-900 placeholder:font-medium"
                  />
                  {(expoFilterInput.trim().length > 0 || selectedExpoFilter !== "all") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpoFilterInput("");
                        setSelectedExpoFilter("all");
                        expoFilterInputRef.current?.focus();
                      }}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 hover:text-neutral-900"
                      aria-label={t("expo_filter_clear_aria")}
                      title={t("expo_filter_clear_title")}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-neutral-700"
                    aria-label={t("expo_filter_placeholder")}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = !expoFilterOpen;
                      setExpoFilterOpen(next);
                      setArtworkFilterOpen(false);
                      if (next) expoFilterInputRef.current?.focus();
                    }}
                  >
                    <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                id="catalogue-expo-suggestions"
                align="start"
                side="bottom"
                sideOffset={4}
                className="w-[210px] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
                  {filteredExpoSuggestions.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">{t("expo_selector_empty")}</li>
                  ) : (
                    filteredExpoSuggestions.map((label) => (
                      <li key={label} role="option" aria-selected={expoFilterInput === label}>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            handleExpoFilterInputChange(label);
                            setExpoFilterOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </PopoverContent>
            </Popover>
          </div>
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground">{t("scope_expo_hint", { expoId: scope.expoId })}</p>
          )}
        </div>
        <BackofficeStickyAgencyLogoSlot />
        <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 md:w-auto md:max-w-[576px] md:justify-end">
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
        {!loading && filtered.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/40 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="backoffice-toolbar-outline-btn"
              onClick={selectAllFilteredArtworks}
            >
              {t("cartel_select_all")}
            </Button>
            {selectedArtworkIds.size > 0 ? (
              <>
                <span className="text-sm font-medium tabular-nums text-white">
                  {t("cartel_selected_count", { count: selectedArtworkIds.size })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="backoffice-toolbar-outline-btn"
                  onClick={clearCartelSelection}
                >
                  {t("cartel_clear_selection")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  onClick={openBatchCartelFormatDialog}
                  disabled={batchCartelGenerating}
                >
                  {batchCartelGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {t("btn_print_cartels_batch")}
                </Button>
              </>
            ) : null}
          </div>
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

      <div className={cn("grid grid-cols-1 items-stretch gap-4 md:grid-cols-2", CATALOGUE_GRID_ROW_CLASS)}>
        {loading && <p className="col-span-full text-sm text-muted-foreground text-center py-12">{t("loading_catalogue")}</p>}
        {filtered.length === 0 && !showScopeHint && !error && (
          <p className="col-span-full text-sm text-muted-foreground text-center py-12">
            {t("empty_search")}
          </p>
        )}
        {catalogueGridEntries.map((entry) => {
          const buildCard = (row: ArtworkRow, deck?: { index: number; total: number }) => {
            const rowArtist = artworkArtistFromRow(row);
            const rowExpoRaw = (row.expo_id ?? row.artwork_expo_id ?? "").trim();
            const rowAgencyId = row.artwork_agency_id ?? null;
            const rowExpoOptions = expoOptions.filter((expo) => {
              if (!rowAgencyId) return true;
              return (expo.agency_id ?? null) === rowAgencyId;
            });
            const rowSelectedExpo =
              rowExpoOptions.find((expo) => expo.id === rowExpoRaw) ??
              rowExpoOptions.find((expo) => (expo.expo_id ?? "") === rowExpoRaw) ??
              null;
            const rowSelectedExpoValue = rowSelectedExpo?.id || "__none__";
            const rowArtistLabel =
              [rowArtist?.artist_firstname ?? rowArtist?.artist_prenom, rowArtist?.artist_lastname ?? rowArtist?.artist_name]
                .filter(Boolean)
                .join(" ")
                .trim() || t("artist_unknown");
            const rowImage =
              row.artwork_image_url || row.artwork_photo_url || "https://images.unsplash.com/photo-1635776062043-223faf322554";
            const rowStatusRaw = (row.artwork_status ?? "").trim();
            const rowIsActive = rowStatusRaw.toLowerCase() === "active";
            const rowIsDraft = rowStatusRaw.toLowerCase() === "draft";
            const rowStatusLabel = artworkStatusLabel(rowStatusRaw, t);
            const rowHasImageAnalysis = (row.artwork_source_material ?? "").trim().length > 0;
            const rowTextsCount = countMaxMediationStylesAcrossLangs(row.artwork_description_i18n);
            const rowHasMediation = rowTextsCount > 0;
            const rowMediationLangs = getMediationFilledUiLangs(row.artwork_description_i18n)
              .map((lang) => lang.toUpperCase())
              .join(" - ");
            const rowVoice = voiceSummaryByArtwork[row.artwork_id] ?? {
              readyCount: 0,
              expectedCount: 0,
              generatingCount: 0,
              langsLabel: "",
              isComplete: false,
              isGenerating: false,
            };
            const rowHasVoices = rowVoice.expectedCount > 0;
            const rowVoiceGenerating = rowVoice.isGenerating || pendingAudioArtworkIds.has(row.artwork_id);
            const rowVoiceComplete = rowVoice.isComplete && !rowVoiceGenerating;
            const rowVoicePartial =
              rowHasVoices &&
              !rowVoiceGenerating &&
              !rowVoiceComplete &&
              rowVoice.readyCount > 0;
            const rowVoiceLangsLabel = rowVoice.langsLabel || rowMediationLangs;
            const rowVoiceBadgeLabel = !rowHasVoices
              ? t("badge_ia_voice_none")
              : rowVoiceGenerating
                ? rowVoice.readyCount > 0
                  ? t("badge_ia_voice_generating_partial", {
                      ready: rowVoice.readyCount,
                      expected: rowVoice.expectedCount,
                      langs: rowVoiceLangsLabel,
                    })
                  : t("badge_ia_voice_generating")
                : rowVoiceComplete
                  ? t("badge_ia_voice", {
                      count: rowVoice.readyCount,
                      langs: rowVoiceLangsLabel,
                    })
                  : t("badge_ia_voice_partial", {
                      ready: rowVoice.readyCount,
                      expected: rowVoice.expectedCount,
                      langs: rowVoiceLangsLabel,
                    });

            return (
              <Card
                key={row.artwork_id}
                className={cn(
                  "relative flex flex-col overflow-hidden border-border bg-card/80 shadow-none backdrop-blur-xl hover:shadow-none",
                  CATALOGUE_CARD_HEIGHT_CLASS,
                  selectedArtworkIds.has(row.artwork_id) && "ring-2 ring-[#E63946]/70",
                )}
              >
                <div
                  className="absolute left-2 top-2 z-30"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <label className="inline-flex items-center rounded-md bg-background/90 p-1 shadow-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#E63946]"
                      checked={selectedArtworkIds.has(row.artwork_id)}
                      onChange={() => toggleArtworkCartelSelection(row.artwork_id)}
                      aria-label={t("cartel_select_aria")}
                    />
                  </label>
                </div>
                <CardContent
                  className="relative flex h-full flex-1 cursor-pointer flex-col items-stretch gap-4 overflow-hidden p-4 sm:flex-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditArtwork(row.artwork_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditArtwork(row.artwork_id);
                    }
                  }}
                >
                  <div className="mx-auto flex w-full max-w-[150px] shrink-0 flex-col items-center gap-2 sm:mx-0 sm:w-[150px] sm:min-w-[150px]">
                    <div className="flex shrink-0 flex-col pt-[10px] pb-[10px] items-center">
                      <img
                        src={rowImage}
                        alt={artworkDisplayTitle(row, i18n.language, t("artwork_untitled"))}
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
                        value={rowSelectedExpoValue}
                        onValueChange={(value) => {
                          requestExpoMove(
                            row.artwork_id,
                            row.artwork_title,
                            rowSelectedExpo?.id ?? null,
                            value === "__none__" ? null : value,
                          );
                        }}
                        disabled={isAssigningExpo}
                      >
                        <SelectTrigger className="h-7 w-full max-w-[150px] px-1.5 text-[11px] rounded-none border border-input bg-background shadow-none hover:bg-background [&>span]:min-w-0 [&>span]:truncate">
                          <SelectValue placeholder={t("expo_selector_placeholder")} />
                        </SelectTrigger>
                        <SelectContent className="rounded-none shadow-none z-[60]">
                          <SelectItem value="__none__" className="text-xs">
                            <span className="italic">{t("expo_selector_none")}</span>
                          </SelectItem>
                          {rowExpoOptions.length > 0 ? (
                            rowExpoOptions.map((expo) => (
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
                      {expoUndoByArtwork[row.artwork_id] !== undefined ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-full gap-1 px-1.5 text-[10px]"
                          disabled={isAssigningExpo}
                          aria-label={t("expo_move_undo_aria")}
                          onClick={() => void undoExpoMove(row.artwork_id)}
                        >
                          <Undo2 className="h-3 w-3 shrink-0" aria-hidden />
                          {t("expo_move_undo")}
                        </Button>
                      ) : (
                        <span className="block h-6 shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>

                  <div className="relative flex min-w-0 flex-1 flex-col gap-3 sm:min-h-[156px] sm:gap-0">
                    <div className="flex min-w-0 w-full flex-col sm:pointer-events-none sm:absolute sm:inset-x-0 sm:top-0 sm:z-20">
                      <h3 className="min-w-0 w-full truncate font-serif text-lg font-bold">
                        {artworkDisplayTitle(row, i18n.language, t("artwork_untitled"))}
                      </h3>
                      <p className="min-w-0 w-full truncate text-sm italic text-primary">{rowArtistLabel}</p>
                      <div
                        className="pointer-events-auto mt-2 inline-flex min-w-0 max-w-full items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <label className="inline-flex items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#E63946]"
                            checked={rowIsActive}
                            disabled={updatingArtworkStatusId === row.artwork_id || rowIsDraft}
                            onChange={(e) => {
                              void updateArtworkStatus(row.artwork_id, e.target.checked);
                            }}
                          />
                        </label>
                        <span className="min-w-0 truncate text-xs font-semibold text-foreground">{rowStatusLabel}</span>
                      </div>
                    </div>

                    <div className="relative z-0 flex w-full min-w-0 flex-col gap-3 sm:min-h-[156px] sm:flex-1 sm:gap-0">
                      <div
                        className="flex w-full flex-col gap-2 sm:ml-auto sm:w-[120px] sm:max-w-full sm:pt-[35px]"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {deck && deck.total > 1 ? (
                          <span
                            className="text-center text-sm font-semibold tabular-nums text-amber-300"
                            aria-label={t("group_deck_position", {
                              current: deck.index + 1,
                              total: deck.total,
                            })}
                          >
                            {t("group_deck_position", {
                              current: deck.index + 1,
                              total: deck.total,
                            })}
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCartelFormatDialog(row);
                          }}
                        >
                          {t("btn_print_cartel")}
                        </Button>
                        <Button
                          type="button"
                          className="w-full justify-center gap-2 px-4 text-[14px] gradient-gold gradient-gold-hover-bg text-primary-foreground !shadow-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            void (async () => {
                              const ex = (row.expo_id ?? row.artwork_expo_id)?.trim();
                              const origin = await fetchQrPublicSiteOriginFromSettings();
                              const pub = buildOeuvreQrUrl(row.artwork_id, origin || undefined, ex ?? undefined);
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
                          "flex w-full shrink-0 flex-col items-stretch gap-2 sm:ml-auto sm:mt-auto sm:pt-3",
                          CATALOG_IA_BADGE_WIDTH_CLASS,
                        )}
                      >
                        <span className={cn(catalogIaBadgeClass, rowHasImageAnalysis ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#E63946] bg-[#E63946] text-white")}>
                          {t(rowHasImageAnalysis ? "badge_ia_image_yes" : "badge_ia_image_no")}
                        </span>
                        <span className={cn(catalogIaBadgeClass, rowHasMediation ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#E63946] bg-[#E63946] text-white")}>
                          {t("badge_ia_mediation", { count: rowTextsCount, langs: rowMediationLangs })}
                        </span>
                        <span
                          role={rowHasVoices ? "button" : undefined}
                          tabIndex={rowHasVoices ? 0 : undefined}
                          className={cn(
                            catalogIaBadgeClass,
                            !rowHasVoices
                              ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                              : rowVoiceGenerating
                                ? "border-amber-400 bg-amber-50 text-amber-900"
                                : rowVoiceComplete
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : rowVoicePartial
                                    ? "border-amber-300 bg-amber-50 text-amber-800"
                                    : "border-[#E63946] bg-[#E63946] text-white",
                            rowHasVoices && "cursor-pointer justify-between gap-1.5 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                          )}
                          onClick={
                            rowHasVoices
                              ? (e) => {
                                  e.stopPropagation();
                                  openArtworkVoicesModal(row.artwork_id);
                                }
                              : undefined
                          }
                        >
                          <span className="min-w-0 truncate">
                            {rowVoiceBadgeLabel}
                          </span>
                        </span>
                        {isGlobalCostViewer ? (
                          <span className={cn(catalogIaBadgeClass, "border-destructive/30 bg-destructive/5 tabular-nums")}>
                            <EntityCostLabel
                              display={resolveEntityCostDisplay(
                                costsReady ? costByArtworkId[row.artwork_id] : undefined,
                                costsReady,
                                usdToEurRate,
                              )}
                              unavailableLabel={t("badge_artwork_cost_unavailable")}
                              prefixLabel={t("badge_artwork_cost_prefix")}
                            />
                          </span>
                        ) : (
                          <span className="block h-8 shrink-0" aria-hidden />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          };

          if (entry.kind === "group") {
            return (
              <CatalogueArtworkGroupDeck
                key={entry.groupInfo.group.id}
                group={entry.groupInfo.group}
                artworks={entry.groupInfo.orderedIds
                  .map((id) => artworkByIdScoped.get(id) ?? filteredArtworkById.get(id))
                  .filter((row): row is ArtworkRow => Boolean(row))}
                focusArtworkId={entry.groupInfo.focusArtworkId}
                renderCard={buildCard}
                onPrintCartel={() => openGroupCartelFormatDialog(entry.groupInfo.group)}
                onOrderChange={() => {
                  if (selectedExpoFilter === "all") return;
                  void fetchArtworkGroupsForExpo(selectedExpoFilter).then(setExpoArtworkGroups);
                }}
              />
            );
          }

          return buildCard(entry.artwork);
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

      <CartelFormatDialog
        open={cartelFormatDialogOpen}
        onOpenChange={(open) => {
          setCartelFormatDialogOpen(open);
          if (!open) {
            setCartelArtwork(null);
            setCartelGroup(null);
            setCartelBatchMode(false);
          }
        }}
        artworkTitle={
          cartelGroup?.group_label ??
          (cartelArtwork
            ? artworkDisplayTitle(cartelArtwork, i18n.language, t("artwork_untitled"))
            : null)
        }
        batchCount={cartelBatchMode ? selectedArtworkIds.size : undefined}
        extraTitleLangOptions={cartelExtraTitleLangOptions}
        onConfirm={(selection, extraLangs) => {
          if (cartelBatchMode) void handleGenerateBatchPDF(selection, extraLangs);
          else if (cartelGroup) void handleGenerateGroupPDF(cartelGroup, selection);
          else if (cartelArtwork) void handleGeneratePDF(cartelArtwork, selection, extraLangs);
        }}
      />

      <ArtworkModalWorkflow
        open={artworkModalOpen}
        onOpenChange={(next) => {
          setArtworkModalOpen(next);
          if (!next) {
            setEditingArtworkId(null);
            setVoicesEntryFromCatalogue(false);
            void loadCatalogue().then(() => {
              // Rattrapage si des audio_files passent à « ready » juste après la fermeture.
              window.setTimeout(() => void refreshVoiceSummaries(), 1500);
              window.setTimeout(() => void refreshVoiceSummaries(), 4000);
            });
            navigate(catalogueFiltersPath(), { replace: true });
          }
        }}
        artworkId={editingArtworkId}
        openMediationAudioOnLoad={voicesEntryFromCatalogue}
        closeOnMediationAudioClose={voicesEntryFromCatalogue}
        onSuccess={(savedId) => {
          if (savedId?.trim()) setEditingArtworkId(savedId.trim());
          void loadCatalogue().then(() => {
            window.setTimeout(() => void refreshVoiceSummaries(), 1500);
          });
          void loadExpoOptions();
        }}
      />
    </div>
  );
};

export default Catalogue;


