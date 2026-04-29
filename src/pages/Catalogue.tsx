import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArtworkModal } from "@/components/ArtworkModal";
import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useDataScope } from "@/hooks/useDataScope";
import { hasFullDataAccess } from "@/lib/authUser";
import { Plus, Search, Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { buildOeuvreQrUrl } from "@/lib/oeuvrePublicUrl";
import { createAimediaHeaderLogoBlockPng } from "@/lib/pdfHeaderLogoBlock";
import { cn } from "@/lib/utils";
import { useUiLanguage } from "@/providers/UiLanguageProvider";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";

type ArtworkRow = {
  artwork_id: string;
  artwork_title: string | null;
  artwork_description?: Record<string, string | null> | string | null;
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

function parseArtworkDescription(value: ArtworkRow["artwork_description"]): Record<string, string | null> {
  if (!value) return {};
  if (typeof value === "object") {
    return value as Record<string, string | null>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, string | null>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function countGeneratedMediationTexts(value: ArtworkRow["artwork_description"]): number {
  const descriptions = parseArtworkDescription(value);
  return Object.values(descriptions).filter((entry) => typeof entry === "string" && entry.trim().length > 0).length;
}

async function getQrBaseOriginFromSettings(): Promise<string> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "settings_general_links_qr")
    .maybeSingle();
  if (error) return "";
  const rawValue = typeof data?.value === "string" ? data.value : "";
  if (!rawValue.trim()) return "";
  try {
    const parsed = JSON.parse(rawValue) as { public_site_origin?: string | null };
    return (parsed.public_site_origin ?? "").trim();
  } catch {
    return "";
  }
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

/** Tronque avec points de suspension pour tenir sur une ligne (police courante jsPDF). */
function artworkArtistFromRow(aw: Pick<ArtworkRow, "artists">): ArtistRow | undefined {
  const a = aw.artists;
  if (a == null) return undefined;
  return Array.isArray(a) ? a[0] : a;
}

function fitPdfLineWithEllipsis(pdf: jsPDF, text: string, maxWidth: number): string {
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  const ell = "\u2026";
  let s = text.replace(/\s+$/, "");
  while (s.length > 0) {
    const candidate = `${s.trimEnd()}${ell}`;
    if (pdf.getTextWidth(candidate) <= maxWidth) return candidate;
    s = s.slice(0, -1);
  }
  return ell;
}

/** Titre sur au plus 2 lignes : baisse la taille du corps si besoin, puis ellipse sur la 2e ligne. */
function computePdfTitleUpToTwoLines(
  pdf: jsPDF,
  titleText: string,
  maxTextWidth: number,
): { lines: string[]; fontSize: number; lineHeight: number } {
  const minFs = 12;
  const maxFs = 22;
  const lineHeightRatio = 6.8 / 22;

  for (let fs = maxFs; fs >= minFs; fs--) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fs);
    const lines = pdf.splitTextToSize(titleText, maxTextWidth) as string[];
    if (lines.length <= 2) {
      return { lines, fontSize: fs, lineHeight: fs * lineHeightRatio };
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(minFs);
  const lines = pdf.splitTextToSize(titleText, maxTextWidth) as string[];
  if (lines.length <= 2) {
    return { lines, fontSize: minFs, lineHeight: minFs * lineHeightRatio };
  }
  const first = lines[0];
  const rest = lines.slice(1).join(" ");
  const second = fitPdfLineWithEllipsis(pdf, rest, maxTextWidth);
  return {
    lines: [first, second],
    fontSize: minFs,
    lineHeight: minFs * lineHeightRatio,
  };
}

const Catalogue = () => {
  const { t } = useUiLanguage();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [artworks, setArtworks] = useState<ArtworkRow[]>([]);
  const [expoOptions, setExpoOptions] = useState<ExpoOption[]>([]);
  const [selectedExpoFilter, setSelectedExpoFilter] = useState<string>("all");
  const [expoFilterInput, setExpoFilterInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artworkModalOpen, setArtworkModalOpen] = useState(false);
  const [editingArtworkId, setEditingArtworkId] = useState<string | null>(null);
  const [œuvresNavigationType, setOeuvresNavigationType] = useState("single_scan_sequence");
  const [isAssigningExpo, setIsAssigningExpo] = useState(false);
  const [updatingArtworkStatusId, setUpdatingArtworkStatusId] = useState<string | null>(null);
  const [generatingQrForArtworkId, setGeneratingQrForArtworkId] = useState<string | null>(null);
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, role_name, agency_id: userAgencyId, expo_id: userExpoId } = useAuthUser();
  const navigate = useNavigate();
  const isAdminFullAccess =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) || hasFullDataAccess(role_name);

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

    let query = supabase
      .from("expos")
      .select("*")
      .order("id", { ascending: true });

    // Si l'utilisateur est limité à une expo, on n'affiche qu'elle.
    if ((role_id === 5 || role_id === 6) && userExpoId) {
      query = query.eq("id", userExpoId);
    } else if (scope.mode === "expo" && scopeExpoId) {
      query = query.eq("id", scopeExpoId);
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

    const filteredByAgency =
      role_id === 4 && userAgencyId
        ? rows.filter((expo) => {
            const linkedAgency = expo.agency_id ?? null;
            return linkedAgency === userAgencyId;
          })
        : scope.mode === "agency" && scopeAgencyId
          ? rows.filter((expo) => {
              const linkedAgency = expo.agency_id ?? null;
              return linkedAgency === scopeAgencyId;
            })
          : rows;

    let finalRows = filteredByAgency;

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

    let mapped: ExpoOption[] = finalRows.map((expo) => ({
      id: expo.id,
      expo_id: expo.expo_id?.trim() || null,
      name: expo.expo_name?.trim() || expo.expo_id?.trim() || expo.id,
      agency_id: expo.agency_id ?? null,
    }));

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
          .in("id", expoIds);
        const { data: exposByIdsByExpoId } = await supabase
          .from("expos")
          .select("*")
          .in("expo_id", expoIds);

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

  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("artworks")
      .select(
        "artwork_id, artwork_title, artwork_description, artwork_source_material, artwork_image_url, artwork_photo_url, artwork_qr_code_url, artwork_qrcode_image, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status, artists!left(*)",
      )
      .is("artwork_deleted_at", null)
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
          "artwork_id, artwork_title, artwork_description, artwork_source_material, artwork_image_url, artwork_photo_url, artwork_qr_code_url, artwork_qrcode_image, artwork_artist_id, artwork_agency_id, artwork_expo_id, artwork_status",
        )
        .is("artwork_deleted_at", null)
        .order("artwork_title", { ascending: true, nullsFirst: false });

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        setError(fallbackResult.error.message);
        setArtworks([]);
        setLoading(false);
        return;
      }
      artworkData = (fallbackResult.data as ArtworkRow[] | null) ?? null;
      setError(`Jointure artistes indisponible (${artworksError.message}). Affichage via fallback.`);
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
    setArtworks(normalizedRows);

    setLoading(false);
  }, [scope, role_id, role_name, userAgencyId, userExpoId, isAdminFullAccess]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  useEffect(() => {
    void loadExpoOptions();
  }, [loadExpoOptions]);

  useEffect(() => {
    const expoFromUrl = searchParams.get("expo")?.trim();
    if (expoFromUrl) setSelectedExpoFilter(expoFromUrl);
  }, [searchParams]);

  const openCreateArtwork = () => {
    setEditingArtworkId(null);
    setArtworkModalOpen(true);
  };

  const openEditArtwork = (id: string) => {
    setEditingArtworkId(id);
    setArtworkModalOpen(true);
  };

  const filtered = useMemo(() => {
    return artworks.filter((aw) => {
      if (selectedExpoFilter !== "all" && aw.expo_id !== selectedExpoFilter) return false;
      const artist = artworkArtistFromRow(aw);
      const q = search.toLowerCase();
      const title = (aw.artwork_title ?? "").toLowerCase();
      const artistLabel = `${artist?.artist_firstname ?? artist?.artist_prenom ?? ""} ${artist?.artist_lastname ?? artist?.artist_name ?? ""}`.trim().toLowerCase();
      return title.includes(q) || artistLabel.includes(q);
    });
  }, [artworks, search, selectedExpoFilter]);
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
  const expoFilterSuggestions = useMemo(
    () => [t("Filtrer par exposition"), ...new Set(expoOptions.map((expo) => expo.name))],
    [expoOptions, t],
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

    if (!normalized || normalized === t("Filtrer par exposition").toLowerCase()) {
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
    async (artworkId: string, targetExpoId: string | null) => {
      if (!artworkId) return;
      const normalizedExpoId = targetExpoId?.trim() ? targetExpoId : null;
      setIsAssigningExpo(true);
      setError(null);
      const { error: updateError } = await supabase
        .from("artworks")
        .update({ artwork_expo_id: normalizedExpoId } as never)
        .eq("artwork_id", artworkId);

      if (updateError) {
        setError(`Affectation expo impossible : ${updateError.message}`);
      } else {
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
          // Re-synchronise la liste selon le filtre en cours.
          void loadCatalogue();
        }
      }
      setIsAssigningExpo(false);
    },
    [loadCatalogue, selectedExpoFilter],
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
      setError(`Mise à jour du statut impossible : ${updateError.message}`);
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

  const handleGenerateQrForArtwork = useCallback(
    async (artworkId: string) => {
      if (role_id === 7) return;
      if (generatingQrForArtworkId) return;
      const originOverride = await getQrBaseOriginFromSettings();
      const targetUrl = buildOeuvreQrUrl(artworkId, originOverride);
      if (!targetUrl) {
        toast.error("Impossible de construire l'URL du QR.");
        return;
      }
      setGeneratingQrForArtworkId(artworkId);
      try {
        const dataUrl = await QRCode.toDataURL(targetUrl, {
          width: 1024,
          margin: 1,
        });
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
          .update({
            artwork_qr_code_url: publicQrUrl,
            artwork_qrcode_image: publicQrUrl,
          })
          .eq("artwork_id", artworkId);
        if (updateError) throw updateError;
        setArtworks((prev) =>
          prev.map((row) =>
            row.artwork_id === artworkId
              ? { ...row, artwork_qr_code_url: publicQrUrl, artwork_qrcode_image: publicQrUrl }
              : row,
          ),
        );
        toast.success("QR code généré et enregistré.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Génération du QR code impossible.";
        toast.error(msg);
      } finally {
        setGeneratingQrForArtworkId(null);
      }
    },
    [role_id, generatingQrForArtworkId],
  );

  const handleGeneratePDF = async (aw: ArtworkRow) => {
    const artworkId = aw.artwork_id?.trim();
    if (!artworkId) {
      alert("Identifiant de l'œuvre indisponible.");
      return;
    }

    const artist = artworkArtistFromRow(aw);
    const artistLabel =
      [artist?.artist_firstname ?? artist?.artist_prenom, artist?.artist_lastname ?? artist?.artist_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Artiste inconnu";

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [105, 148], // 105 mm x 148 mm (A6 portrait)
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const titleText = (aw.artwork_title ?? "Œuvre sans titre").trim();
      const artistText = artistLabel;
      const explorationLines = ["Explorez l'œuvre", "avec l'assistant de l'artiste"];

      const margin = 10;
      const bottomSafe = pageHeight - margin;
      const maxTextWidth = pageWidth - 2 * margin;

      // QR = une seule URL canonique : https://site/œuvre/<uuid>
      const originOverride = await getQrBaseOriginFromSettings();
      const targetUrl = buildOeuvreQrUrl(artworkId, originOverride);
      if (!targetUrl) {
        alert("Impossible de construire l’URL du QR pour cette œuvre.");
        return;
      }
      const qrDataUrl = await QRCode.toDataURL(targetUrl, {
        errorCorrectionLevel: "H",
        margin: 0,
        width: 1024,
      });

      // Bandeau identique au bloc Logo du Header (carré rouge + cœur + textes), en haut à gauche
      const headerLogo = createAimediaHeaderLogoBlockPng();
      const [logoImg, qrImg] = await Promise.all([loadImage(headerLogo.dataUrl), loadImage(qrDataUrl)]);
      const logoMarginY = -1; // 2 mm - 3 mm => logo remonté de 3 mm
      const logoMarginX = -1 + 5; // +5 mm vers la droite
      const logoMarginRight = -1;
      const logoWidth = pageWidth - logoMarginX - logoMarginRight;
      const logoHeight = (logoWidth * headerLogo.heightPx) / headerLogo.widthPx;
      pdf.addImage(logoImg, "PNG", logoMarginX, logoMarginY, logoWidth, logoHeight, undefined, "NONE");

      const artistLineHeight = 5.2;

      const { lines: titleLines, fontSize: titleFontSize, lineHeight: titleLineHeight } = computePdfTitleUpToTwoLines(
        pdf,
        titleText,
        maxTextWidth,
      );

      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(16);
      const artistLines = pdf.splitTextToSize(artistText, maxTextWidth) as string[];

      const gapQrToTitleMm = 4 + 10 - 5; // +1 cm demandé puis remontée de 5 mm
      const belowTextBlockHeight =
        gapQrToTitleMm +
        titleLines.length * titleLineHeight +
        1 +
        artistLines.length * artistLineHeight;

      const contentTop = logoMarginY + logoHeight + 4;
      const contentBottom = bottomSafe - belowTextBlockHeight - 2;
      const maxQrByWidth = pageWidth - 2 * margin;
      const availableHeight = Math.max(0, contentBottom - contentTop);
      /** Taille du QR : 70 % de la largeur utile, avec garde-fou hauteur */
      const qrSize = Math.min(maxQrByWidth * 0.7, availableHeight);
      const explorationFontSize = 14;
      const explorationLineHeight = 5.5;
      const explorationGap = 2;

      const qrX = (pageWidth - qrSize) / 2;
      const qrY = contentTop + (availableHeight - qrSize) / 2;

      // Texte d'exploration centré verticalement entre le bas du logo et le haut du QR
      const textZoneTop = contentTop;
      const textZoneBottom = qrY - explorationGap;
      const midY = textZoneTop + (textZoneBottom - textZoneTop) / 2;
      let explorationStartY = midY - ((explorationLines.length - 1) * explorationLineHeight) / 2;
      const minStart = textZoneTop + 1;
      const maxStart =
        textZoneBottom - (explorationLines.length - 1) * explorationLineHeight - 0.5;
      const safeMax = Math.max(maxStart, minStart);
      explorationStartY = Math.min(Math.max(explorationStartY, minStart), safeMax);

      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bolditalic");
      pdf.setFontSize(explorationFontSize);
      pdf.text(explorationLines, pageWidth / 2, explorationStartY, { align: "center" });

      // QR net
      pdf.addImage(qrImg, "PNG", qrX, qrY, qrSize, qrSize, undefined, "NONE");

      let textY = qrY + qrSize + gapQrToTitleMm;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(titleFontSize);
      pdf.text(titleLines, pageWidth / 2, textY, { align: "center" });
      textY += titleLines.length * titleLineHeight + 2;

      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(16);
      pdf.text(artistLines, pageWidth / 2, textY, { align: "center" });

      const blobUrl = pdf.output("bloburl");
      window.open(blobUrl, "_blank");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible de générer le cartel PDF.";
      alert(msg);
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center">
        <div className="flex w-full items-center gap-4 md:max-w-[760px]">
          <div>
            <h2 className="text-3xl font-serif font-bold text-white">{t("Œuvre")}</h2>
          </div>
          <div className="relative w-[210px] min-w-[210px] max-w-[210px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              list="catalogue-search-suggestions"
              placeholder={t("Rechercher une œuvre...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white"
            />
            {search.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Effacer la recherche"
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
              placeholder={t("Filtrer par exposition")}
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
                aria-label={t("Effacer le filtre exposition")}
                title={t("Effacer le filtre")}
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
        <div>
          {!authLoading && scope.mode === "agency" && (
            <p className="text-xs text-muted-foreground mt-1">Expos de l’agence {scope.agencyId}.</p>
          )}
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground mt-1">Exposition {scope.expoId} uniquement.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="gap-2 text-[14px] gradient-gold gradient-gold-hover-bg text-primary-foreground shrink-0"
            onClick={() => openCreateArtwork()}
          >
            <Plus className="h-4 w-4" />
            {t("Nouvelle œuvre")}
          </Button>
          <Button type="button" variant="outline" className="gap-2" asChild>
            <Link to="/catalogue/catalogue2">Tableau</Link>
          </Button>
        </div>
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>Périmètre vide</AlertTitle>
          <AlertDescription>
            Renseignez les identifiants agence / expo attendus pour votre rôle (voir configuration Supabase ou variables d’environnement de dev).
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && <p className="col-span-full text-sm text-muted-foreground text-center py-12">{t("Chargement du catalogue…")}</p>}
        {filtered.length === 0 && !showScopeHint && !error && (
          <p className="col-span-full text-sm text-muted-foreground text-center py-12">
            {t("Aucune œuvre ne correspond à votre recherche ou à votre périmètre.")}
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
              .trim() || "Artiste inconnu";
          const artworkImage = aw.artwork_image_url || aw.artwork_photo_url || "https://images.unsplash.com/photo-1635776062043-223faf322554";
          const qrImage = aw.artwork_qrcode_image || aw.artwork_qr_code_url || null;
          const currentStatusRaw = (aw.artwork_status ?? "").trim();
          const isArtworkActive = currentStatusRaw.toLowerCase() === "active";
          const statusLabel = currentStatusRaw || "vide";
          const hasImageAnalysis = (aw.artwork_source_material ?? "").trim().length > 0;
          const generatedTextsCount = countGeneratedMediationTexts(aw.artwork_description);
          const hasGeneratedMediation = generatedTextsCount > 0;

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
                <div className="flex w-[108px] shrink-0 flex-col items-center gap-1.5">
                  {role_id === 7 ? (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
                      {qrImage ? (
                        <ImageWithSkeleton
                          src={qrImage}
                          alt={`QR ${aw.artwork_title ?? ""}`}
                          wrapperClassName="h-20 w-20"
                          className="h-20 w-20 object-contain"
                        />
                      ) : (
                        <span className="text-[11px] text-muted-foreground px-1 text-center">QR indisponible</span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={cn(
                        "flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-border/70 bg-muted/40 p-0.5 text-center transition-colors",
                        "hover:border-amber-400/70 hover:bg-amber-50/40",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        generatingQrForArtworkId === aw.artwork_id && "pointer-events-none opacity-90",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleGenerateQrForArtwork(aw.artwork_id);
                      }}
                      disabled={Boolean(generatingQrForArtworkId)}
                      title={qrImage ? "Cliquer pour régénérer le QR code" : "Cliquer pour générer le QR code"}
                      aria-label={qrImage ? "Régénérer le QR code de l'œuvre" : "Générer le QR code de l'œuvre"}
                    >
                      {generatingQrForArtworkId === aw.artwork_id ? (
                        <Loader2 className="h-8 w-8 animate-spin text-amber-800" aria-hidden />
                      ) : qrImage ? (
                        <ImageWithSkeleton
                          src={qrImage}
                          alt={`QR code — ${aw.artwork_title ?? "œuvre"}`}
                          wrapperClassName="h-20 w-20"
                          className="h-20 w-20 object-contain"
                        />
                      ) : (
                        <>
                          <QrCode className="h-9 w-9 text-muted-foreground/80 shrink-0" aria-hidden />
                          <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground px-0.5">
                            Générer le QR
                          </span>
                        </>
                      )}
                    </button>
                  )}
                  <p className="max-w-[130px] text-center text-[10px] leading-tight text-[#E63946]">
                    <span className="whitespace-nowrap">en cliquant ci-dessus</span>
                    <br />
                    <span>un nouveau QR-Code est généré</span>
                  </p>
                </div>

                <div className="flex min-h-[152px] w-[116px] shrink-0 flex-col items-center gap-2">
                  <img
                    src={artworkImage}
                    alt={aw.artwork_title ?? "œuvre"}
                    className="h-24 w-24 rounded-xl object-cover shrink-0"
                  />
                  <div
                    className="w-full max-w-[112px]"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Select
                      value={selectedExpoValue}
                      onValueChange={(value) => {
                        void assignArtworkToExpo(aw.artwork_id, value === "__none__" ? null : value);
                      }}
                      disabled={isAssigningExpo}
                    >
                      <SelectTrigger
                        className="h-7 w-full max-w-[112px] px-1.5 text-[11px] rounded-none border border-input bg-background shadow-none hover:bg-background [&>span]:min-w-0 [&>span]:truncate"
                      >
                        <SelectValue placeholder="Exposition" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none shadow-none z-[60]">
                        <SelectItem value="__none__" className="text-xs">
                          <span className="italic">pas d&apos;expo affectée</span>
                        </SelectItem>
                        {availableExpoOptions.length > 0 ? (
                          availableExpoOptions.map((expo) => (
                            <SelectItem key={expo.id} value={expo.id} className="text-xs">
                              {expo.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty__" disabled className="text-xs">
                            Aucune expo de cette agence
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-auto w-full justify-center gradient-gold gradient-gold-hover-bg text-primary-foreground border border-primary/40"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/œuvre/${encodeURIComponent(aw.artwork_id)}`);
                    }}
                  >
                    Ouvrir
                  </Button>
                </div>

                <div className="flex min-w-0 flex-1 self-stretch items-start gap-4">
                  <div className="flex min-h-full flex-1 min-w-0 flex-col">
                    <h3 className="line-clamp-2 w-[200px] font-serif font-bold text-lg">{aw.artwork_title ?? "Œuvre sans titre"}</h3>
                    <p className="text-sm text-primary italic">{artistLabel}</p>
                    <div
                      className="mt-2 inline-flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#E63946]"
                          checked={isArtworkActive}
                          disabled={updatingArtworkStatusId === aw.artwork_id}
                          onChange={(e) => {
                            void updateArtworkStatus(aw.artwork_id, e.target.checked);
                          }}
                        />
                      </label>
                      <span className="text-xs font-semibold text-foreground">{statusLabel}</span>
                    </div>
                    <div className="mt-auto flex flex-col items-start gap-2 pt-3">
                      <span
                        className={cn(
                          "inline-flex w-[260px] items-center justify-start rounded-full border px-3 py-0.5 text-left text-[11px] font-medium",
                          hasImageAnalysis
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-[#E63946] bg-[#E63946] text-white",
                        )}
                      >
                        {hasImageAnalysis ? "Image analysée par l'IA : Oui" : "Image analysée par l'IA : Non"}
                      </span>
                      <span
                        className={cn(
                          "inline-flex w-[260px] items-center justify-start rounded-full border px-3 py-0.5 text-left text-[11px] font-medium",
                          hasGeneratedMediation
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-[#E63946] bg-[#E63946] text-white",
                        )}
                      >
                        {hasGeneratedMediation
                          ? `Médiations générées par l'IA : ${generatedTextsCount} généré${generatedTextsCount > 1 ? "s" : ""}`
                          : "Médiations générées par l'IA : 0 généré"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="self-stretch flex min-h-[140px] w-[180px] shrink-0 flex-col justify-between border-l border-border/60 pl-3 pt-9">
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        const q = new URLSearchParams();
                        q.set("artwork_id", aw.artwork_id);
                        const ex = (aw.expo_id ?? aw.artwork_expo_id)?.trim();
                        if (ex) q.set("expo_id", ex);
                        navigate(`/scan-work2?${q.toString()}`);
                      }}
                    >
                      Tester le QR-Code
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleGeneratePDF(aw);
                      }}
                      disabled={!aw.artwork_qrcode_image && !aw.artwork_qr_code_url}
                    >
                      Imprimer cartel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ArtworkModal
        open={artworkModalOpen}
        onOpenChange={setArtworkModalOpen}
        artworkId={editingArtworkId}
        onSuccess={() => void loadCatalogue()}
      />
    </div>
  );
};

export default Catalogue;


