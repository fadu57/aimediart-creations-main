import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Upload } from "lucide-react";
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
import { inferJsonKeyFromDisplayName, isImageAnalysisPromptStyleName } from "@/lib/inferPromptStyleKey";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";

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

type DescriptionKey = "enfant" | "expert" | "ado" | "conteur" | "rap" | "poetique" | "simple" | "neutre";
type PromptStyleRow = {
  id: string | number;
  name?: string | null;
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

const EMPTY_DESCRIPTIONS: Record<DescriptionKey, string> = {
  enfant: "",
  expert: "",
  ado: "",
  conteur: "",
  rap: "",
  poetique: "",
  simple: "",
  neutre: "",
};

type DraftSnapshot = {
  title: string;
  artistId: string;
  artworkExpoId: string;
  artworkAgencyId: string;
  imageUrl: string;
  sourceMaterial: string;
  descriptions: Record<string, string>;
};

function normalizeDraftDescriptions(
  descriptions: Record<DescriptionKey, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(descriptions).sort()) {
    normalized[key] = (descriptions[key as DescriptionKey] ?? "").trim();
  }
  return normalized;
}

function buildDraftSnapshot(input: {
  title: string;
  artistId: string;
  artworkExpoId: string;
  artworkAgencyId: string;
  imageUrl: string;
  sourceMaterial: string;
  descriptions: Record<DescriptionKey, string>;
}): DraftSnapshot {
  return {
    title: input.title.trim(),
    artistId: input.artistId.trim(),
    artworkExpoId: input.artworkExpoId.trim(),
    artworkAgencyId: input.artworkAgencyId.trim(),
    imageUrl: input.imageUrl.trim(),
    sourceMaterial: input.sourceMaterial.trim(),
    descriptions: normalizeDraftDescriptions(input.descriptions),
  };
}

function serializeDraftSnapshot(snapshot: DraftSnapshot): string {
  return JSON.stringify(snapshot);
}

export function ArtworkModal({ open, onOpenChange, onSuccess, artworkId }: ArtworkModalProps) {
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
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [descriptions, setDescriptions] = useState(EMPTY_DESCRIPTIONS);
  const [styleTabs, setStyleTabs] = useState<StyleTabEntry[]>(DEFAULT_STYLE_TABS);
  const [activeTab, setActiveTab] = useState<DescriptionKey>("enfant");
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [generatingMediation, setGeneratingMediation] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
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
        .select("id, name, icon, ordonnancement, max_tokens")
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
        if (isImageAnalysisPromptStyleName(row.name ?? row.nom)) continue;
        const labelSource = row.name ?? row.nom ?? "";
        const nameNorm = normalize(labelSource);

        let key: DescriptionKey | null = null;
        const inferred = inferJsonKeyFromDisplayName(labelSource);
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
        const labelFromDb = (row.name ?? "").trim();
        const label = labelFromDb || key;
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
          "artwork_id, artwork_title, artwork_artist_id, artwork_expo_id, artwork_agency_id, artwork_source_material, artwork_description, artwork_image_url",
        )
        .eq("artwork_id", id)
        .is("deleted_at", null)
        .single();
      if (cancelled) return;
      if (error || !data) {
        toast.error(error?.message ?? "Œuvre introuvable.");
        onOpenChange(false);
        return;
      }
      const desc = (data.artwork_description ?? {}) as Record<string, string | null>;
      setEditingArtworkId(data.artwork_id as string);
      setTitle((data.artwork_title as string | null) ?? "");
      setArtistId((data.artwork_artist_id as string | null) ?? "");
      setArtworkExpoId((data.artwork_expo_id as string | null) ?? "");
      setArtworkAgencyId((data.artwork_agency_id as string | null) ?? "");
      setImageUrl((data.artwork_image_url as string | null) ?? "");
      setSourceMaterial((data.artwork_source_material as string | null) ?? "");
      const nextDescriptions = {
        enfant: desc.enfant ?? "",
        expert: desc.expert ?? "",
        ado: desc.ado ?? "",
        conteur: desc.conteur ?? "",
        rap: desc.rap ?? "",
        poetique: desc.poetique ?? "",
        simple: desc.simple ?? "",
        neutre: desc.neutre ?? "",
      };
      setDescriptions(nextDescriptions);
      const initialSnapshot = buildDraftSnapshot({
        title: (data.artwork_title as string | null) ?? "",
        artistId: (data.artwork_artist_id as string | null) ?? "",
        artworkExpoId: (data.artwork_expo_id as string | null) ?? "",
        artworkAgencyId: (data.artwork_agency_id as string | null) ?? "",
        imageUrl: (data.artwork_image_url as string | null) ?? "",
        sourceMaterial: (data.artwork_source_material as string | null) ?? "",
        descriptions: nextDescriptions,
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
      setSourceMaterial("");
      setDescriptions(EMPTY_DESCRIPTIONS);
      setDuplicateArtwork(null);
      const initialSnapshot = buildDraftSnapshot({
        title: "",
        artistId: "",
        artworkExpoId: expo_id ?? "",
        artworkAgencyId: agency_id ?? "",
        imageUrl: "",
        sourceMaterial: "",
        descriptions: EMPTY_DESCRIPTIONS,
      });
      setInitialDraftSignature(serializeDraftSnapshot(initialSnapshot));
    }

    return () => {
      cancelled = true;
    };
  }, [open, artworkId, agency_id, expo_id, onOpenChange]);

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
      toast.error("Le titre est obligatoire.");
      return;
    }
    if (!artistId) {
      toast.error("Sélectionnez un artiste.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        artwork_title: title.trim(),
        artwork_artist_id: artistId,
        artwork_expo_id: artworkExpoId.trim() || null,
        artwork_agency_id: artworkAgencyId.trim() || null,
        artwork_image_url: imageUrl.trim() || null,
        artwork_source_material: sourceMaterial.trim() || null,
        artwork_description: descriptions,
        artwork_fingerprint: fingerprint || null,
      };

      if (editingArtworkId) {
        const { error } = await supabase.from("artworks").update(payload).eq("artwork_id", editingArtworkId);
        if (error) throw error;
        toast.success("Œuvre mise à jour.");
      } else {
        const { error } = await supabase.from("artworks").insert(payload);
        if (error) throw error;
        toast.success("Œuvre créée.");
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enregistrement impossible.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedArtistLabel = useMemo(
    () => [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname].filter(Boolean).join(" ").trim(),
    [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname],
  );
  const selectedArtistDisplay = useMemo(
    () =>
      [selectedArtist?.artist_firstname, selectedArtist?.artist_lastname].filter(Boolean).join(" ").trim() ||
      selectedArtist?.artist_nickname ||
      "Choisir un artiste",
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
      descriptions,
    });
    return serializeDraftSnapshot(snapshot);
  }, [title, artistId, artworkExpoId, artworkAgencyId, imageUrl, sourceMaterial, descriptions]);
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
    if (!analyzingImage) {
      return "Analyse approfondie en cours ... Nos modèles d'Intelligence Artificielle scrutent les détails de l'œuvre (cela peut prendre jusqu'à 45 secondes)";
    }
    if (analyzeElapsedSec < 10) return "Analyse de la composition et des couleurs...";
    if (analyzeElapsedSec < 20) return "Interprétation de la symbolique...";
    if (analyzeElapsedSec < 30) return "Finalisation du rapport détaillé...";
    return "Analyse approfondie en cours... Nos modèles Gemini 2.5 scrutent les détails de l'œuvre (cela peut prendre jusqu'à 45 secondes).";
  }, [analyzingImage, analyzeElapsedSec]);

  useEffect(() => {
    if (!analyzingImage) return;
    const interval = window.setInterval(() => setAnalyzeTick((t) => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [analyzingImage]);

  const handleAnalyzeImage = async () => {
    if (!imageUrl) return;
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error("Sélectionnez un artiste avant l'analyse.");
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
      const msg = e instanceof Error ? e.message : "Analyse image impossible.";
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
      toast.success("Image envoyee.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload image impossible.";
      toast.error(msg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateMediations = async () => {
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error("Sélectionnez un artiste avant la génération.");
      return;
    }
    if (!sourceMaterial.trim()) {
      toast.error("Renseignez la matière brute avant la génération.");
      return;
    }
    setGeneratingMediation(true);
    try {
      const generated = await generateMediation({
        sourceText: [
          title.trim() ? `Titre: ${title.trim()}` : "",
          selectedArtistLabel ? `Artiste: ${selectedArtistLabel}` : "",
          sourceMaterial.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
        styles: styleTabs.map((style) => ({
          id: style.key,
          label: style.label,
          max_tokens: style.maxTokens,
        })),
      });

      const next = { ...EMPTY_DESCRIPTIONS };
      for (const tab of styleTabs) {
        const raw = (generated[tab.key] ?? "").trim();
        next[tab.key] = raw;
      }
      setDescriptions(next);
      setActiveTab(styleTabs[0].key);
      toast.success("Les 8 médiations ont été générées.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Génération IA impossible.";
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
          if (isAiBusy) return;
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
          if (isAiBusy || hasUnsavedChanges) {
            e.preventDefault();
            if (hasUnsavedChanges && !isAiBusy) {
              setShowCloseConfirm(true);
            }
          }
        }}
        onPointerDownOutside={(e) => {
          if (isAiBusy || hasUnsavedChanges) {
            e.preventDefault();
            if (hasUnsavedChanges && !isAiBusy) {
              setShowCloseConfirm(true);
            }
          }
        }}
        onInteractOutside={(e) => {
          if (isAiBusy || hasUnsavedChanges) {
            e.preventDefault();
            if (hasUnsavedChanges && !isAiBusy) {
              setShowCloseConfirm(true);
            }
          }
        }}
        className={cn(
          "max-w-3xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl",
          "bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb]",
        )}
      >
        <DialogTitle className="sr-only">{editingArtworkId ? "Fiche de l'œuvre" : "Nouvelle œuvre"}</DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              {editingArtworkId ? "Fiche de l'œuvre" : "Nouvelle œuvre"}
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
                disabled={isVisitorLocked || isSubmitting || isLoading || isAiBusy}
                onClick={() => void handleSave()}
              >
                {isSubmitting ? (
                  "Enregistrement…"
                ) : editingArtworkId ? (
                  "Enregistrer"
                ) : (
                  "Enregistrer"
                )}
              </Button>
            </div>
          </div>
        </div>
        <DialogDescription className="sr-only">
          {editingArtworkId
            ? "Modifier les informations et les textes de médiation de l’œuvre."
            : "Créer une nouvelle fiche œuvre avec textes de médiation et image."}
        </DialogDescription>
        <div className="px-4 sm:px-5 pt-3 pb-4 space-y-4">
        {isVisitorLocked && (
          <Alert variant="destructive" className="border-destructive/60">
            <AlertTitle>Accès restreint</AlertTitle>
            <AlertDescription>Le rôle visiteur (niveau 7) ne peut pas créer ou modifier une œuvre.</AlertDescription>
          </Alert>
        )}

        {duplicateArtwork && !editingArtworkId && (
          <Alert variant="destructive" className="border-destructive/60">
            <AlertTitle>Doublon détecté</AlertTitle>
            <AlertDescription>Une œuvre avec ce titre existe déjà pour cet artiste.</AlertDescription>
          </Alert>
        )}

        <input type="hidden" value={artworkExpoId} readOnly />
        <input type="hidden" value={artworkAgencyId} readOnly />
        <input type="hidden" value={fingerprint} readOnly />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="group relative h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Photo de l'œuvre"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground/70" />
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-black/40" />

            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                type="button"
                variant="secondary"
                className="pointer-events-auto bg-white/10 text-white hover:bg-white/15 border border-white/20"
                onClick={() => photoInputRef.current?.click()}
                disabled={isVisitorLocked || isLoading || uploadingImage}
              >
                {uploadingImage ? "Envoi..." : "Changer la photo"}
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

          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-1.5">
              <Label>Titre de l'œuvre</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isVisitorLocked || isLoading}
              />
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              {imageUrl && (
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2 border border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100 shrink-0 lg:w-auto"
                  disabled={!canAnalyzeImage}
                  onClick={() => void handleAnalyzeImage()}
                >
                  {analyzingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyse en cours…
                    </>
                  ) : (
                    "✨ Analyser l'image avec l'IA"
                  )}
                </Button>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label>Artiste</Label>
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
                  />
                  {showArtistSuggestions && artistSearch.trim().length > 0 && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                      {filteredArtists.length === 0 ? (
                        <div className="space-y-2 px-3 py-2">
                          <p className="text-sm text-muted-foreground">Aucun artiste trouvé.</p>
                          {!isVisitorLocked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-full justify-center"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                setShowArtistSuggestions(false);
                                setArtistDialogOpen(true);
                              }}
                            >
                              Créer un nouvel artiste
                            </Button>
                          )}
                        </div>
                      ) : (
                        filteredArtists.map((artist) => {
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
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {analyzingImage && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <p className="inline-flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse approfondie en cours ... Nos modèles d'Intelligence Artificielle scrutent les détails de l'œuvre (cela peut
                  prendre jusqu'à 45 secondes)
                </p>
                <p className="mt-1 text-xs">{analyzeProgressMessage}</p>
              </div>
            )}
            {!analyzingImage && analyzeImageError && (
              <Alert variant="destructive">
                <AlertTitle>Analyse interrompue</AlertTitle>
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
                    Réessayer
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
        {checkingDuplicate && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Vérification d’unicité en cours…
          </p>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="space-y-2">
            <Label>Notes sur l'œuvre / Intentions de l'artiste</Label>
            <Textarea
              value={sourceMaterial}
              onChange={(e) => setSourceMaterial(e.target.value)}
              disabled={isVisitorLocked || isLoading}
              className={cn(
                "w-full min-h-[170px] text-sm transition-colors",
                notesFlash ? "border-amber-400 ring-2 ring-amber-300" : "",
              )}
              placeholder="Texte source brut (notes curatoriales, intentions artistiques, etc.)"
            />
            <p className="text-xs text-muted-foreground">
              Collez ici vos notes ou la description catalogue, l'IA s'en servira pour générer les médiations.
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
                  Génération des médiations AI…
                </>
              ) : sourceMaterial.trim().length === 0 ? (
                "En attente de notes..."
              ) : (
                "🚀 Générer les médiations IA"
              )}
            </Button>
          </div>
        </div>
        <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la fermeture</AlertDialogTitle>
              <AlertDialogDescription>
                Voulez-vous fermer sans avoir enregistré les modifications ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Non</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onOpenChange(false);
                }}
              >
                Oui
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="space-y-2">
          <Label>Textes de médiation</Label>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DescriptionKey)}>
            <TabsList className="grid w-full grid-cols-4 gap-2 bg-muted p-2 [grid-auto-rows:minmax(0,auto)]">
              {styleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="flex flex-col gap-0.5 text-xs [&>span]:leading-tight"
                >
                  {tab.icon ? (
                    <span className="text-sm leading-none" aria-hidden>
                      {tab.icon}
                    </span>
                  ) : null}
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {styleTabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key}>
                <Textarea
                  value={descriptions[tab.key]}
                  onChange={(e) =>
                    setDescriptions((prev) => ({
                      ...prev,
                      [tab.key]: e.target.value,
                    }))
                  }
                  disabled={isVisitorLocked || isLoading}
                  className="min-h-[140px] text-sm"
                  placeholder={`Version "${tab.label}"`}
                />
              </TabsContent>
            ))}
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

