import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Loader2, Upload } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { AddArtistDialog } from "@/components/AddArtistDialog";
import { useAuthUser } from "@/hooks/useAuthUser";
import { generateMediation } from "@/services/mediationService";
import { analyzeArtworkImage } from "@/services/imageAnalysisService";
import { supabase } from "@/lib/supabase";
import { checkArtworkExists, generateArtworkFingerprint } from "@/utils/artworkHelpers";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { prepareArtworkImageForAnalysis } from "@/utils/imageAnalysisPrep";
import { inferJsonKeyFromDisplayName, isImageAnalysisPromptStyleRow } from "@/lib/inferPromptStyleKey";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { buildOeuvreQrUrl } from "@/lib/oeuvrePublicUrl";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import {
  type MediationDescriptionKey,
  type MediationUiLang,
  MEDIATION_DESCRIPTION_KEYS,
  MEDIATION_UI_LANGS,
  createEmptyDescriptionsByLang,
  normalizeArtworkDescriptionToByLang,
  resolveMediationUiLang,
  serializeMediationDescriptionsByLang,
  serializeMediationDraftFingerprint,
} from "@/lib/artworkDescriptionI18n";

async function generateAndSaveQrCode(artworkId: string, expoId?: string | null): Promise<string | null> {
  const originOverride = await fetchQrPublicSiteOriginFromSettings();
  const targetUrl = buildOeuvreQrUrl(artworkId, originOverride, expoId);
  if (!targetUrl) return null;

  const dataUrl = await QRCode.toDataURL(targetUrl, { width: 1024, margin: 1 });
  const blob = await (await fetch(dataUrl)).blob();
  const path = `qrcodes/${artworkId}.png`;

  const { error: uploadError } = await supabase.storage.from("qrcode").upload(path, blob, {
    contentType: "image/png",
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from("qrcode").getPublicUrl(path);
  const publicUrl = pub.publicUrl;
  const { error: updateError } = await supabase
    .from("artworks")
    .update({ artwork_qr_code_url: publicUrl, artwork_qrcode_image: publicUrl })
    .eq("artwork_id", artworkId);
  if (updateError) throw updateError;
  return publicUrl;
}

type ArtworkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  artworkId?: string | null;
};

type ArtistOption = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_nickname?: string | null;
};

type DescriptionKey = MediationDescriptionKey;
type PromptStyleRow = PromptStyleLabelFields & {
  id: string | number;
  nom?: string | null;
  icon?: string | null;
  max_tokens?: number | null;
};

type StyleTabEntry = { key: DescriptionKey; label: string; maxTokens: number; icon?: string | null };

const DEFAULT_STYLE_TABS: StyleTabEntry[] = [
  { key: "enfant", label: "Enfant", maxTokens: 700 },
  { key: "expert", label: "Expert", maxTokens: 900 },
  { key: "ado", label: "Ado", maxTokens: 700 },
  { key: "conteur", label: "Conteur", maxTokens: 900 },
  { key: "rap", label: "Rap", maxTokens: 700 },
  { key: "poetique", label: "Poétique", maxTokens: 900 },
  { key: "simple", label: "Simple", maxTokens: 700 },
  { key: "neutre", label: "Neutre", maxTokens: 700 },
];

type DraftSnapshot = {
  title: string;
  artistId: string;
  artworkExpoId: string;
  artworkAgencyId: string;
  imageUrl: string;
  sourceMaterial: string;
  mediationFingerprint: string;
};

function buildDraftSnapshot(input: {
  title: string;
  artistId: string;
  artworkExpoId: string;
  artworkAgencyId: string;
  imageUrl: string;
  sourceMaterial: string;
  descriptionsByLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>;
}): DraftSnapshot {
  return {
    title: input.title.trim(),
    artistId: input.artistId.trim(),
    artworkExpoId: input.artworkExpoId.trim(),
    artworkAgencyId: input.artworkAgencyId.trim(),
    imageUrl: input.imageUrl.trim(),
    sourceMaterial: input.sourceMaterial.trim(),
    mediationFingerprint: serializeMediationDraftFingerprint(input.descriptionsByLang),
  };
}

function serializeDraftSnapshot(snapshot: DraftSnapshot): string {
  return JSON.stringify(snapshot);
}

export function ArtworkModal({ open, onOpenChange, onSuccess, artworkId }: ArtworkModalProps) {
  const { t, i18n } = useTranslation("artwork_modal");
  const { role_id, agency_id, expo_id } = useAuthUser();
  const isVisitorLocked = role_id === 7;

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingArtworkId, setEditingArtworkId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState("");
  const [artworkExpoId, setArtworkExpoId] = useState("");
  const [artworkAgencyId, setArtworkAgencyId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [artworkQrImageUrl, setArtworkQrImageUrl] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [descriptionsByLang, setDescriptionsByLang] = useState(createEmptyDescriptionsByLang);
  const [mediationEditLang, setMediationEditLang] = useState<MediationUiLang>("fr");
  const [styleTabs, setStyleTabs] = useState<StyleTabEntry[]>(DEFAULT_STYLE_TABS);
  const [activeTab, setActiveTab] = useState<DescriptionKey>("enfant");
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [generatingMediation, setGeneratingMediation] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [regeneratingQr, setRegeneratingQr] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [analyzeImageError, setAnalyzeImageError] = useState<string | null>(null);
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<number | null>(null);
  const [analyzeTick, setAnalyzeTick] = useState(0);
  const [artistSearch, setArtistSearch] = useState("");
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [duplicateArtwork, setDuplicateArtwork] = useState<{ artwork_id: string; artwork_title: string | null } | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [initialDraftSignature, setInitialDraftSignature] = useState("");
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [notesFlash, setNotesFlash] = useState(false);

  const selectedArtist = useMemo(
    () => artists.find((a) => a.artist_id === artistId) ?? null,
    [artists, artistId],
  );
  const fingerprint = useMemo(
    () =>
      generateArtworkFingerprint(
        {
          firstname: selectedArtist?.artist_firstname,
          lastname: selectedArtist?.artist_lastname,
          nickname: selectedArtist?.artist_nickname,
        },
        title,
      ),
    [selectedArtist, title],
  );

  useEffect(() => {
    if (!open) {
      setShowCloseConfirm(false);
      setRegeneratingQr(false);
      return;
    }
    let cancelled = false;

    const loadArtists = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("artists")
        .select("artist_id, artist_firstname, artist_lastname, artist_nickname")
        .order("artist_lastname", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setArtists([]);
      } else {
        setArtists((data as ArtistOption[] | null) ?? []);
      }
      setIsLoading(false);
    };
    const loadPromptStyles = async () => {
      let res = await supabase
        .from("prompt_style")
        .select("id, code, name_fr, name_en, name_de, name_es, name_it, icon, ordonnancement, max_tokens")
        .order("ordonnancement", { ascending: true });
      if (res.error) {
        res = await supabase.from("prompt_style").select("*").order("id", { ascending: true });
      }
      if (cancelled) return;
      const { data, error } = res;
      if (error || !data?.length) {
        console.warn("prompt_style: utilisation des libellés par défaut (erreur ou table vide)", error);
        setStyleTabs(DEFAULT_STYLE_TABS);
        return;
      }

      const rows = data as PromptStyleRow[];
      const allowedKeys: DescriptionKey[] = ["enfant", "expert", "ado", "conteur", "rap", "poetique", "simple", "neutre"];
      const normalize = (value: string | null | undefined): string =>
        (value ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();

      // Une ligne DB = un bouton (max 8). Si l’inférence échoue ou double une clé, on prend la prochaine clé JSON libre.
      const used = new Set<DescriptionKey>();
      const tabs: StyleTabEntry[] = [];

      for (const row of rows) {
        if (tabs.length >= 8) break;
        if (isImageAnalysisPromptStyleRow(row)) continue;
        const keySource = [
          row.name_fr,
          row.name,
          row.nom,
          row.name_en,
          row.name_de,
          row.name_es,
          row.name_it,
        ]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find((v) => v.length > 0) ?? "";
        const nameNorm = normalize(keySource);

        let key: DescriptionKey | null = null;
        const inferred = inferJsonKeyFromDisplayName(keySource);
        if (inferred && allowedKeys.includes(inferred as DescriptionKey)) {
          key = inferred as DescriptionKey;
        }
        if (!key) {
          const explicitKey = nameNorm as DescriptionKey;
          key = allowedKeys.includes(explicitKey) ? explicitKey : null;
          if (!key) {
            key =
              (allowedKeys.find((k) => normalize(k) === nameNorm) as DescriptionKey | undefined) ??
              (allowedKeys.find((k) => nameNorm.includes(normalize(k))) as DescriptionKey | undefined) ??
              null;
          }
        }
        if (key && used.has(key)) {
          key = null;
        }
        if (!key) {
          key = allowedKeys.find((k) => !used.has(k)) ?? null;
        }
        if (!key) break;

        used.add(key);
        const label = getStyleLabelFromDb(row, i18n.language);
        const maxTokens =
          typeof row.max_tokens === "number" && row.max_tokens > 0
            ? Math.round(row.max_tokens)
            : DEFAULT_STYLE_TABS.find((t) => t.key === key)?.maxTokens ?? 700;
        const iconTrim = (row.icon ?? "").trim() || null;

        tabs.push({
          key,
          label,
          maxTokens,
          icon: iconTrim,
        });
      }

      setStyleTabs(tabs.length ? tabs : DEFAULT_STYLE_TABS);
    };

    const loadArtwork = async (id: string) => {
      const { data, error } = await supabase
        .from("artworks")
        .select(
          "artwork_id, artwork_title, artwork_artist_id, artwork_expo_id, artwork_agency_id, artwork_source_material, artwork_description, artwork_image_url, artwork_qrcode_image, artwork_qr_code_url",
        )
        .eq("artwork_id", id)
        .is("deleted_at", null)
        .single();
      if (cancelled) return;
      if (error || !data) {
        toast.error(error?.message ?? t("toast_error_artwork_load"));
        onOpenChange(false);
        return;
      }
      const nextByLang = normalizeArtworkDescriptionToByLang(data.artwork_description);
      setEditingArtworkId(data.artwork_id as string);
      setTitle((data.artwork_title as string | null) ?? "");
      setArtistId((data.artwork_artist_id as string | null) ?? "");
      setArtworkExpoId((data.artwork_expo_id as string | null) ?? "");
      setArtworkAgencyId((data.artwork_agency_id as string | null) ?? "");
      setImageUrl((data.artwork_image_url as string | null) ?? "");
      const qrImg =
        ((data as { artwork_qrcode_image?: string | null }).artwork_qrcode_image ?? "").trim() ||
        ((data as { artwork_qr_code_url?: string | null }).artwork_qr_code_url ?? "").trim();
      setArtworkQrImageUrl(qrImg);
      setSourceMaterial((data.artwork_source_material as string | null) ?? "");
      setDescriptionsByLang(nextByLang);
      setMediationEditLang(resolveMediationUiLang(i18n.language));
      const initialSnapshot = buildDraftSnapshot({
        title: (data.artwork_title as string | null) ?? "",
        artistId: (data.artwork_artist_id as string | null) ?? "",
        artworkExpoId: (data.artwork_expo_id as string | null) ?? "",
        artworkAgencyId: (data.artwork_agency_id as string | null) ?? "",
        imageUrl: (data.artwork_image_url as string | null) ?? "",
        sourceMaterial: (data.artwork_source_material as string | null) ?? "",
        descriptionsByLang: nextByLang,
      });
      setInitialDraftSignature(serializeDraftSnapshot(initialSnapshot));
    };

    void loadArtists();
    void loadPromptStyles();
    if (artworkId) {
      void loadArtwork(artworkId);
    } else {
      setEditingArtworkId(null);
      setTitle("");
      setArtistId("");
      setArtistSearch("");
      setShowArtistSuggestions(false);
      setArtworkExpoId(expo_id ?? "");
      setArtworkAgencyId(agency_id ?? "");
      setImageUrl("");
      setArtworkQrImageUrl("");
      setSourceMaterial("");
      const emptyMed = createEmptyDescriptionsByLang();
      setDescriptionsByLang(emptyMed);
      setMediationEditLang(resolveMediationUiLang(i18n.language));
      setDuplicateArtwork(null);
      const initialSnapshot = buildDraftSnapshot({
        title: "",
        artistId: "",
        artworkExpoId: expo_id ?? "",
        artworkAgencyId: agency_id ?? "",
        imageUrl: "",
        sourceMaterial: "",
        descriptionsByLang: emptyMed,
      });
      setInitialDraftSignature(serializeDraftSnapshot(initialSnapshot));
    }

    return () => {
      cancelled = true;
    };
  }, [open, artworkId, agency_id, expo_id, onOpenChange, i18n.language]);

  useEffect(() => {
    if (!open || !fingerprint || !artistId || !title.trim()) {
      setDuplicateArtwork(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setCheckingDuplicate(true);
        const existsResult = await checkArtworkExists(fingerprint);
        if (cancelled) return;
        setCheckingDuplicate(false);
        if (existsResult.error) {
          setDuplicateArtwork(null);
          return;
        }
        if (!existsResult.exists || !existsResult.artworkId) {
          setDuplicateArtwork(null);
          return;
        }

        if (editingArtworkId && existsResult.artworkId === editingArtworkId) {
          setDuplicateArtwork(null);
          return;
        }

        const { data, error } = await supabase
          .from("artworks")
          .select("artwork_id, artwork_title")
          .eq("artwork_id", existsResult.artworkId)
          .maybeSingle();
        if (error) {
          setDuplicateArtwork(null);
          return;
        }
        setDuplicateArtwork((data as { artwork_id: string; artwork_title: string | null } | null) ?? null);
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, fingerprint, artistId, title, editingArtworkId]);

  const handleSave = async () => {
    if (isVisitorLocked) return;
    if (!title.trim()) {
      toast.error(t("toast_error_title_required"));
      return;
    }
    if (!artistId) {
      toast.error(t("toast_error_artist_required"));
      return;
    }
    setIsSubmitting(true);
    let newArtworkId: string | null = null;
    try {
      const payload = {
        artwork_title: title.trim(),
        artwork_artist_id: artistId,
        artwork_expo_id: artworkExpoId.trim() || null,
        artwork_agency_id: artworkAgencyId.trim() || null,
        artwork_image_url: imageUrl.trim() || null,
        artwork_source_material: sourceMaterial.trim() || null,
        artwork_description: serializeMediationDescriptionsByLang(descriptionsByLang),
        artwork_fingerprint: fingerprint || null,
      };

      if (editingArtworkId) {
        const { error } = await supabase.from("artworks").update(payload).eq("artwork_id", editingArtworkId);
        if (error) throw error;
        toast.success(t("toast_artwork_updated"));
        void generateAndSaveQrCode(editingArtworkId, artworkExpoId.trim() || null).catch((e) => {
          console.warn("[ArtworkModal] QR régénération échouée :", e);
        });
      } else {
        const { data: inserted, error } = await supabase
          .from("artworks")
          .insert(payload)
          .select("artwork_id")
          .single();
        if (error) throw error;
        newArtworkId = (inserted as { artwork_id: string } | null)?.artwork_id ?? null;
        toast.success(t("toast_artwork_created"));
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast_error_save");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }

    if (newArtworkId) {
      void generateAndSaveQrCode(newArtworkId, artworkExpoId.trim() || null).catch((e) => {
        console.warn("[ArtworkModal] QR auto-génération échouée :", e);
      });
    }
  };

  const handleRegenerateQr = useCallback(async () => {
    if (!editingArtworkId || isVisitorLocked) return;
    setRegeneratingQr(true);
    try {
      const url = await generateAndSaveQrCode(editingArtworkId, artworkExpoId.trim() || null);
      if (!url) {
        toast.error(t("toast_qr_regenerate_failed"));
        return;
      }
      const withBust = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
      setArtworkQrImageUrl(withBust);
      toast.success(t("toast_qr_regenerated"));
    } catch (e) {
      console.warn("[ArtworkModal] QR régénération :", e);
      toast.error(e instanceof Error ? e.message : t("toast_qr_regenerate_failed"));
    } finally {
      setRegeneratingQr(false);
    }
  }, [editingArtworkId, isVisitorLocked, artworkExpoId, t]);

  const selectedArtistLabel = useMemo(
    () => [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname].filter(Boolean).join(" ").trim(),
    [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname],
  );
  const selectedArtistDisplay = useMemo(
    () =>
      [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname].filter(Boolean).join(" ").trim() ||
      selectedArtist?.artist_nickname ||
      t("artist_placeholder"),
    [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname, selectedArtist?.artist_nickname],
  );
  const filteredArtists = useMemo(() => {
    const query = artistSearch.trim().toLowerCase();
    if (!query) return [];
    return artists
      .filter((artist) => {
        const firstname = (artist.artist_firstname ?? "").toLowerCase();
        const lastname = (artist.artist_lastname ?? "").toLowerCase();
        const nickname = (artist.artist_nickname ?? "").toLowerCase();
        return firstname.includes(query) || lastname.includes(query) || nickname.includes(query);
      })
      .slice(0, 50);
  }, [artists, artistSearch]);

  const handleArtistCreated = async (createdArtistId: string) => {
    const { data, error } = await supabase
      .from("artists")
      .select("artist_id, artist_firstname, artist_lastname, artist_nickname")
      .order("artist_lastname", { ascending: true, nullsFirst: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    const artistRows = (data as ArtistOption[] | null) ?? [];
    setArtists(artistRows);
    const createdArtist = artistRows.find((artist) => artist.artist_id === createdArtistId) ?? null;
    if (!createdArtist) return;
    const label =
      [createdArtist.artist_firstname, createdArtist.artist_lastname].filter(Boolean).join(" ").trim() ||
      createdArtist.artist_nickname ||
      createdArtist.artist_id;
    setArtistId(createdArtistId);
    setArtistSearch(label);
    setShowArtistSuggestions(false);
  };

  useEffect(() => {
    if (!selectedArtist) return;
    const label =
      [selectedArtist.artist_firstname, selectedArtist.artist_lastname]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      selectedArtist.artist_nickname ||
      "";
    setArtistSearch(label);
  }, [selectedArtist?.artist_id]);

  const canGenerateMediations = !isVisitorLocked && sourceMaterial.trim().length > 0 && !generatingMediation;
  const canAnalyzeImage = !isVisitorLocked && Boolean(imageUrl) && !analyzingImage;
  const isAiBusy = generatingMediation || analyzingImage;
  const currentDraftSignature = useMemo(() => {
    const snapshot = buildDraftSnapshot({
      title,
      artistId,
      artworkExpoId,
      artworkAgencyId,
      imageUrl,
      sourceMaterial,
      descriptionsByLang,
    });
    return serializeDraftSnapshot(snapshot);
  }, [title, artistId, artworkExpoId, artworkAgencyId, imageUrl, sourceMaterial, descriptionsByLang]);
  const hasUnsavedChanges = Boolean(initialDraftSignature) && currentDraftSignature !== initialDraftSignature;

  const requestCloseModal = () => {
    if (isAiBusy) return;
    if (hasUnsavedChanges) {
      setShowCloseConfirm(true);
      return;
    }
    onOpenChange(false);
  };
  const analyzeElapsedSec = useMemo(() => {
    if (!analyzingImage || !analyzeStartedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - analyzeStartedAt) / 1000));
  }, [analyzingImage, analyzeStartedAt, analyzeTick]);
  const analyzeProgressMessage = useMemo(() => {
    if (!analyzingImage) return t("analyze_init_msg");
    if (analyzeElapsedSec < 10) return t("analyze_step_1");
    if (analyzeElapsedSec < 20) return t("analyze_step_2");
    if (analyzeElapsedSec < 30) return t("analyze_step_3");
    return t("analyze_step_4");
  }, [analyzingImage, analyzeElapsedSec, t]);

  useEffect(() => {
    if (!analyzingImage) return;
    const interval = window.setInterval(() => setAnalyzeTick((t) => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [analyzingImage]);

  const handleAnalyzeImage = async () => {
    if (!imageUrl) return;
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error(t("toast_error_artist_analyze"));
      return;
    }
    setAnalyzeImageError(null);
    setAnalyzingImage(true);
    setAnalyzeStartedAt(Date.now());
    setAnalyzeTick(0);
    try {
      const prepared = await prepareArtworkImageForAnalysis({
        imageUrl,
        maxWidthPx: 1200,
        maxBytes: 2_000_000,
      });
      const { notes } = await analyzeArtworkImage(
        prepared.kind === "inline"
          ? {
              inlineImage: { mimeType: prepared.mimeType, base64Data: prepared.base64Data },
              artistName: selectedArtistLabel || selectedArtistDisplay,
            }
          : {
              imageUrl: prepared.imageUrl,
              artistName: selectedArtistLabel || selectedArtistDisplay,
            },
      );
      // Injection automatique : l'utilisateur peut ensuite éditer.
      setSourceMaterial(notes);
      setNotesFlash(true);
      window.setTimeout(() => setNotesFlash(false), 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_analyze");
      setAnalyzeImageError(msg);
    } finally {
      setAnalyzingImage(false);
      setAnalyzeStartedAt(null);
    }
  };

  const uploadArtworkImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const prepared = await prepareImageForSupabaseUpload(file);
      const extension = prepared.name.split(".").pop()?.toLowerCase() || "webp";
      const path = `artworks/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("artwork-images").upload(path, prepared, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("artwork-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success(t("toast_image_uploaded"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_upload");
      toast.error(msg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateMediations = async () => {
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error(t("toast_error_artist_generate"));
      return;
    }
    if (!sourceMaterial.trim()) {
      toast.error(t("toast_error_source_required"));
      return;
    }
    setGeneratingMediation(true);
    try {
      const sourceText = [
        title.trim() ? `Titre: ${title.trim()}` : "",
        selectedArtistLabel ? `Artiste: ${selectedArtistLabel}` : "",
        sourceMaterial.trim(),
      ]
        .filter(Boolean)
        .join("\n");
      const stylesPayload = styleTabs.map((style) => ({
        id: style.key,
        label: style.label,
        max_tokens: style.maxTokens,
      }));

      const base = createEmptyDescriptionsByLang();
      for (const L of MEDIATION_UI_LANGS) {
        for (const k of MEDIATION_DESCRIPTION_KEYS) {
          base[L][k] = descriptionsByLang[L][k];
        }
      }

      for (const lang of MEDIATION_UI_LANGS) {
        const generated = await generateMediation({
          sourceText,
          styles: stylesPayload,
          lang,
        });
        for (const tab of styleTabs) {
          base[lang][tab.key] = (generated[tab.key] ?? "").trim();
        }
      }

      setDescriptionsByLang(base);
      setActiveTab(styleTabs[0].key);
      toast.success(t("toast_mediation_generated"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_generate");
      toast.error(msg);
    } finally {
      setGeneratingMediation(false);
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (isAiBusy || artistDialogOpen) return;
          if (hasUnsavedChanges) {
            setShowCloseConfirm(true);
            return;
          }
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (isAiBusy || artistDialogOpen || hasUnsavedChanges) {
            e.preventDefault();
            if (hasUnsavedChanges && !isAiBusy && !artistDialogOpen) {
              setShowCloseConfirm(true);
            }
          }
        }}
        onPointerDownOutside={(e) => {
          if (isAiBusy || artistDialogOpen || hasUnsavedChanges) {
            e.preventDefault();
            if (hasUnsavedChanges && !isAiBusy && !artistDialogOpen) {
              setShowCloseConfirm(true);
            }
          }
        }}
        onInteractOutside={(e) => {
          if (isAiBusy || artistDialogOpen || hasUnsavedChanges) {
            e.preventDefault();
            if (hasUnsavedChanges && !isAiBusy && !artistDialogOpen) {
              setShowCloseConfirm(true);
            }
          }
        }}
        className={cn(
          "max-w-3xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl",
          "bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb]",
        )}
      >
        <DialogTitle className="sr-only">{editingArtworkId ? t("title_edit") : t("title_new")}</DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              {editingArtworkId ? t("title_edit") : t("title_new")}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className={
                  editingArtworkId
                    ? `h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] ${
                        !hasUnsavedChanges ? "invisible pointer-events-none" : ""
                      }`
                    : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
                }
                disabled={isVisitorLocked || isSubmitting || isLoading || isAiBusy || regeneratingQr}
                onClick={() => void handleSave()}
              >
                {isSubmitting ? t("btn_saving") : t("btn_save")}
              </Button>
            </div>
          </div>
        </div>
        <DialogDescription className="sr-only">
          {editingArtworkId ? t("dialog_edit_desc") : t("dialog_new_desc")}
        </DialogDescription>


        <div className="px-4 sm:px-5 pt-3 pb-4 space-y-4">
        {isVisitorLocked && (
          <Alert variant="destructive" className="border-destructive/60">
            <AlertTitle>{t("alert_visitor_title")}</AlertTitle>
            <AlertDescription>{t("alert_visitor_desc")}</AlertDescription>
          </Alert>
        )}

        {duplicateArtwork && !editingArtworkId && (
          <Alert variant="destructive" className="border-destructive/60">
            <AlertTitle>{t("alert_duplicate_title")}</AlertTitle>
            <AlertDescription>{t("alert_duplicate_desc")}</AlertDescription>
          </Alert>
        )}

        <input type="hidden" value={artworkExpoId} readOnly />
        <input type="hidden" value={artworkAgencyId} readOnly />
        <input type="hidden" value={fingerprint} readOnly />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="w-40 shrink-0">
            <div className="group relative h-40 w-full shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={t("img_alt")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground/70" />
                </div>
              )}

              {imageUrl && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 pb-2 pt-6 px-1.5 bg-gradient-to-t from-black/55 via-black/25 to-transparent">
                  <Button
                    type="button"
                    variant="secondary"
                    className="pointer-events-auto h-auto min-h-10 w-full gap-2 whitespace-normal border border-amber-300/60 bg-amber-50 px-[5px] py-[5px] text-center text-xs leading-tight text-amber-900 shadow-sm hover:bg-amber-100 sm:text-sm"
                    disabled={!canAnalyzeImage}
                    onClick={() => void handleAnalyzeImage()}
                  >
                    {analyzingImage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("btn_analyzing")}
                      </>
                    ) : (
                      t("btn_analyze")
                    )}
                  </Button>
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity group-hover:opacity-100 bg-black/40" />

              <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center px-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="secondary"
                  className="pointer-events-auto justify-center bg-neutral-800/60 text-white hover:bg-neutral-800/72 border border-neutral-500/45 shadow-sm backdrop-blur-[1px]"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isVisitorLocked || isLoading || uploadingImage}
                >
                  {uploadingImage ? t("btn_uploading") : t("btn_change_photo")}
                </Button>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadArtworkImage(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label>{t("label_title")}</Label>
                <Textarea
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isVisitorLocked || isLoading}
                  rows={2}
                  className="min-h-[60px] resize-none p-[5px] text-base md:text-sm"
                />
              </div>
              <div
                className={cn(
                  "group relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30",
                  artworkQrImageUrl && "bg-white",
                )}
              >
                {artworkQrImageUrl ? (
                  <img
                    src={artworkQrImageUrl}
                    alt={t("qr_alt")}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <p className="px-2 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs">
                    {t("qr_empty")}
                  </p>
                )}

                {editingArtworkId && !isVisitorLocked && (
                  <>
                    <div className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity group-hover:opacity-100 bg-black/40" />
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center px-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="secondary"
                        className="pointer-events-auto justify-center bg-neutral-800/60 text-white hover:bg-neutral-800/72 border border-neutral-500/45 shadow-sm backdrop-blur-[1px]"
                        onClick={() => void handleRegenerateQr()}
                        disabled={regeneratingQr || isLoading}
                      >
                        {regeneratingQr ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            {t("btn_regenerating_qr")}
                          </>
                        ) : (
                          t("btn_regenerate_qr")
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="absolute top-[167px] w-[359px] space-y-1.5">
              <Label>{t("label_artist")}</Label>
              <div className="relative">
                  <Input
                    value={artistSearch}
                    onChange={(e) => {
                      setArtistSearch(e.target.value);
                      setShowArtistSuggestions(true);
                    }}
                    onFocus={() => setShowArtistSuggestions(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowArtistSuggestions(false), 120);
                    }}
                    placeholder={selectedArtistDisplay}
                    disabled={isVisitorLocked || isLoading}
                    className="p-[5px]"
                  />
                  {showArtistSuggestions && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                      {artistSearch.trim().length > 0 && filteredArtists.length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">{t("artist_not_found")}</p>
                      )}
                      {filteredArtists.map((artist) => {
                        const label =
                          [artist.artist_firstname, artist.artist_lastname].filter(Boolean).join(" ").trim() ||
                          artist.artist_nickname ||
                          artist.artist_id;
                        return (
                          <button
                            key={artist.artist_id}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setArtistId(artist.artist_id);
                              setArtistSearch(label);
                              setShowArtistSuggestions(false);
                            }}
                          >
                            <span className="truncate">{label}</span>
                            <Check
                              className={cn(
                                "ml-2 h-4 w-4 shrink-0",
                                artistId === artist.artist_id ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </button>
                        );
                      })}
                      {!isVisitorLocked && (
                        <>
                          {filteredArtists.length > 0 && (
                            <div className="mx-2 my-1 border-t border-border/60" />
                          )}
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setShowArtistSuggestions(false);
                              setArtistDialogOpen(true);
                            }}
                          >
                            <span className="text-base leading-none">+</span>
                            {t("btn_create_artist")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            {analyzingImage && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <p className="inline-flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("analyze_init_msg")}
                </p>
                <p className="mt-1 text-xs">{analyzeProgressMessage}</p>
              </div>
            )}
            {!analyzingImage && analyzeImageError && (
              <Alert variant="destructive">
                <AlertTitle>{t("analyze_error_title")}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p className="text-xs break-words">{analyzeImageError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void handleAnalyzeImage()}
                    disabled={!imageUrl || isVisitorLocked}
                  >
                    {t("btn_retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
        {checkingDuplicate && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("checking_duplicate")}
          </p>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="space-y-2">
            <Label>{t("label_source_material")}</Label>
            <Textarea
              value={sourceMaterial}
              onChange={(e) => setSourceMaterial(e.target.value)}
              disabled={isVisitorLocked || isLoading}
              className={cn(
                "w-full min-h-[170px] text-sm transition-colors",
                notesFlash ? "border-amber-400 ring-2 ring-amber-300" : "",
              )}
              placeholder={t("source_material_placeholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("source_material_help")}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="gap-2 border border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100"
              disabled={!canGenerateMediations || isLoading || generatingMediation}
              onClick={() => void handleGenerateMediations()}
            >
              {generatingMediation ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("btn_generating")}
                </>
              ) : sourceMaterial.trim().length === 0 ? (
                t("btn_waiting_notes")
              ) : (
                t("btn_generate")
              )}
            </Button>
          </div>
        </div>
        <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dialog_close_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("dialog_close_desc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("btn_no")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onOpenChange(false);
                }}
              >
                {t("btn_yes")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="space-y-2">
          <Label>{t("label_mediations")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {MEDIATION_UI_LANGS.map((lng) => (
              <Button
                key={lng}
                type="button"
                size="sm"
                variant={mediationEditLang === lng ? "default" : "outline"}
                className={cn(
                  "h-8 min-w-[2.75rem] px-2 text-xs font-semibold",
                  mediationEditLang === lng ? "bg-amber-700 text-white hover:bg-amber-800" : "border-amber-300/60",
                )}
                onClick={() => setMediationEditLang(lng)}
              >
                {lng.toUpperCase()}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("mediation_lang_help")}</p>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DescriptionKey)}>
            <TabsList className="grid w-full grid-cols-4 gap-2 rounded-none border-0 bg-transparent p-2 text-amber-900 shadow-none [grid-auto-rows:minmax(0,auto)]">
              {styleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className={cn(
                    "flex min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-md border border-amber-300/60 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-900 shadow-sm ring-offset-background transition-colors",
                    "[&>span:last-child]:max-w-full [&>span:last-child]:break-words [&>span:last-child]:text-center [&>span:last-child]:leading-tight",
                    "hover:bg-amber-100 data-[state=active]:border-amber-400/80 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-950 data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-amber-300/50",
                  )}
                >
                  {tab.icon ? (
                    <span className="text-base leading-none" aria-hidden>
                      {tab.icon}
                    </span>
                  ) : null}
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {styleTabs.map((tab) => {
              const placeholderLabel = [tab.icon?.trim(), tab.label.trim()].filter(Boolean).join(" ").trim();
              return (
              <TabsContent key={tab.key} value={tab.key}>
                <Textarea
                  value={descriptionsByLang[mediationEditLang][tab.key]}
                  onChange={(e) =>
                    setDescriptionsByLang((prev) => ({
                      ...prev,
                      [mediationEditLang]: {
                        ...prev[mediationEditLang],
                        [tab.key]: e.target.value,
                      },
                    }))
                  }
                  disabled={isVisitorLocked || isLoading}
                  className="min-h-[140px] w-full text-sm"
                  placeholder={t("tab_version_placeholder", { label: placeholderLabel })}
                />
              </TabsContent>
              );
            })}
          </Tabs>
        </div>
        </div>

      </DialogContent>
    </Dialog>
    <AddArtistDialog
      open={artistDialogOpen}
      onOpenChange={setArtistDialogOpen}
      onSuccess={(createdArtistId) => {
        void handleArtistCreated(createdArtistId);
      }}
    />
    </>
  );
}

