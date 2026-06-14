import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Loader2, RefreshCw, Upload, X } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { AddArtistDialog } from "@/components/AddArtistDialog";
import { useAuthUser } from "@/hooks/useAuthUser";
import { generateMediation, type MediationStyleRequest } from "@/services/mediationService";
import {
  buildMediationStylePromptStyleMap,
  cancelAudioGenerationForCell,
  triggerMediationAudioBatchForChanges,
  triggerMediationAudioForPersonaLang,
  triggerMissingMediationVoices,
  audioVoiceCellKey,
  mediationLangNeedsAudioGeneration,
  triggerMediationAudioForLang,
} from "@/services/audioService";
import { AudioPlayer } from "@/components/AudioPlayer";
import { MediationPersonaAudioDialog } from "@/components/MediationPersonaAudioDialog";
import { generatePersonasBatchWithRetry } from "@/lib/mediationBatchGenerate";
import { analyzeArtworkImage, type ImageAnalysisPersonaItem } from "@/services/imageAnalysisService";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { prepareArtworkImageForAnalysis } from "@/utils/imageAnalysisPrep";
import { inferJsonKeyFromDisplayName, isImageAnalysisPromptStyleRow } from "@/lib/inferPromptStyleKey";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { buildOeuvreQrUrl } from "@/lib/oeuvrePublicUrl";
import { QR_CODE_STORAGE_OPTIONS } from "@/lib/qrCodeScanFriendly";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import {
  type MediationDescriptionKey,
  type MediationUiLang,
  MEDIATION_DESCRIPTION_KEYS,
  MEDIATION_UI_LANGS,
  createEmptyDescriptionsByLang,
  isMediationUiLang,
  normalizeArtworkDescriptionToByLang,
  resolveMediationUiLang,
  serializeMediationDescriptionsByLang,
  serializeMediationDraftFingerprint,
} from "@/lib/artworkDescriptionI18n";
import {
  createEmptySourceMaterialByLang,
  hasAnySourceMaterial,
  normalizeSourceMaterialToByLang,
  serializeSourceMaterialByLang,
  sourceMaterialDraftFingerprint,
  sourceMaterialTextForLang,
} from "@/lib/artworkSourceMaterialI18n";
import { FR_MEDIATION_STYLE_LABELS } from "@/lib/mediationVisitorStyles";
import { CANONICAL_MEDIATION_STYLE_SET } from "@/lib/mediationStyleCodes";
import {
  MEDIATION_GENERATION_PROGRESS,
  langCodeForProgress,
  mediationPercentByStep,
  runWithMediationSubProgress,
} from "@/lib/mediationGenerationProgress";
import { useMediationGenerationConfig } from "@/hooks/useMediationGenerationConfig";
import { Progress } from "@/components/ui/progress";

async function generateAndSaveQrCode(artworkId: string, expoId?: string | null): Promise<string | null> {
  const originOverride = await fetchQrPublicSiteOriginFromSettings();
  const targetUrl = buildOeuvreQrUrl(artworkId, originOverride, expoId);
  if (!targetUrl) return null;

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
  /** Ouvre le modal voix dès que l'œuvre est chargée (ex. depuis le catalogue). */
  openMediationAudioOnLoad?: boolean;
  /** Ferme la fiche œuvre quand le modal voix se ferme (retour catalogue). */
  closeOnMediationAudioClose?: boolean;
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
  code?: string | null;
  nom?: string | null;
  icon?: string | null;
  max_tokens?: number | null;
  style_rules?: string | null;
  system_instruction?: string | null;
};

type StyleTabEntry = {
  key: DescriptionKey;
  label: string;
  maxTokens: number;
  icon?: string | null;
  styleRules?: string | null;
  systemInstruction?: string | null;
  /** UUID `prompt_style.id` pour génération audio. */
  promptStyleId?: string | null;
};

const DEFAULT_STYLE_TABS: StyleTabEntry[] = MEDIATION_DESCRIPTION_KEYS.map((key) => ({
  key,
  label: FR_MEDIATION_STYLE_LABELS[key],
  maxTokens: key === "expert" || key === "conteur" || key === "poetique" ? 900 : 700,
}));

function styleTabsToMediationPayload(tabs: StyleTabEntry[]): MediationStyleRequest[] {
  return tabs.map((style) => ({
    id: style.key,
    label: style.label,
    max_tokens: style.maxTokens,
    style_rules: style.styleRules ?? undefined,
    system_instruction: style.systemInstruction ?? undefined,
  }));
}

type DraftSnapshot = {
  title: string;
  artistId: string;
  artworkExpoId: string;
  artworkAgencyId: string;
  imageUrl: string;
  sourceMaterialFingerprint: string;
  mediationFingerprint: string;
};

function buildDraftSnapshot(input: {
  title: string;
  artistId: string;
  artworkExpoId: string;
  artworkAgencyId: string;
  imageUrl: string;
  sourceMaterialByLang: Record<MediationUiLang, string>;
  descriptionsByLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>;
}): DraftSnapshot {
  return {
    title: input.title,
    artistId: input.artistId.trim(),
    artworkExpoId: input.artworkExpoId.trim(),
    artworkAgencyId: input.artworkAgencyId.trim(),
    imageUrl: input.imageUrl.trim(),
    sourceMaterialFingerprint: sourceMaterialDraftFingerprint(input.sourceMaterialByLang),
    mediationFingerprint: serializeMediationDraftFingerprint(input.descriptionsByLang),
  };
}

function serializeDraftSnapshot(snapshot: DraftSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Contraste net entre langue active, disponible et indisponible (matériau source + médiations). */
function mediationLangButtonClassName(isSelected: boolean, langEnabled: boolean): string {
  if (!langEnabled) {
    return "border border-dashed border-muted-foreground/40 bg-muted/60 text-muted-foreground/50 shadow-none hover:bg-muted/60";
  }
  if (isSelected) {
    return "border-amber-700 bg-amber-700 text-white shadow-md hover:bg-amber-800 hover:border-amber-800";
  }
  return "border-amber-500 bg-amber-50 text-amber-950 shadow-sm hover:bg-amber-100 hover:border-amber-600";
}

type MediationProgressState = {
  percent: number;
  detail: string;
};

function GenerationProgressBar({
  percent,
  detail,
  ariaLabel,
}: {
  percent: number;
  detail: string;
  ariaLabel: string;
}) {
  const { t } = useTranslation("artwork_modal");
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="space-y-1.5"
      role="status"
      aria-live="polite"
      aria-busy={clamped < 100}
      aria-label={ariaLabel}
    >
      <Progress
        value={clamped}
        className="h-2.5 bg-amber-200/50 [&>div]:rounded-full [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:via-amber-600 [&>div]:to-amber-500 [&>div]:transition-all"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-amber-800/90">
        <span className="min-w-0 truncate">{detail}</span>
        <span className="shrink-0 tabular-nums">
          {t("mediation_progress_percent", { percent: clamped })}
        </span>
      </div>
    </div>
  );
}

function MediationGenerationProgressBar({
  percent,
  detail,
}: {
  percent: number;
  detail: string;
}) {
  const { t } = useTranslation("artwork_modal");
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <GenerationProgressBar
      percent={percent}
      detail={detail}
      ariaLabel={t("mediation_progress_aria", { percent: clamped })}
    />
  );
}

/** Pastille numérotée du parcours médiation (étapes 1–4). */
function WorkflowStepBadge({ step, inline = false }: { step: number; inline?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold leading-none text-white shadow-sm",
        inline ? "relative shrink-0" : "pointer-events-none absolute -top-2 -right-2 z-10",
      )}
      aria-hidden
    >
      {step}
    </span>
  );
}

function mediationLangsWithContent(
  byLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>,
): MediationUiLang[] {
  return MEDIATION_UI_LANGS.filter((L) =>
    Object.values(byLang[L] ?? {}).some((s) => s.trim().length > 0),
  );
}

function sourceMaterialLangsWithContent(
  byLang: Record<MediationUiLang, string>,
): MediationUiLang[] {
  return MEDIATION_UI_LANGS.filter((L) => (byLang[L] ?? "").trim().length > 0);
}

const ANALYZE_PROGRESS_ESTIMATE_MS = 45_000;

function analyzeProgressDetailFromElapsed(elapsedSec: number, t: (key: string) => string): string {
  if (elapsedSec < 8) return t("analyze_step_1");
  if (elapsedSec < 18) return t("analyze_step_2");
  if (elapsedSec < 28) return t("analyze_step_3");
  return t("analyze_step_4");
}

type ArtworkModalIdentityRowProps = {
  t: ReturnType<typeof useTranslation<"artwork_modal">>["t"];
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  imageUrl: string;
  isVisitorLocked: boolean;
  isLoading: boolean;
  uploadingImage: boolean;
  onUploadImage: (file: File) => void;
  title: string;
  onTitleChange: (value: string) => void;
  artistSearch: string;
  onArtistSearchChange: (value: string) => void;
  showArtistSuggestions: boolean;
  onArtistSuggestionsOpen: (open: boolean) => void;
  selectedArtistDisplay: string;
  filteredArtists: ArtistOption[];
  artistId: string;
  onSelectArtist: (id: string, label: string) => void;
  onOpenCreateArtist: () => void;
  artworkQrImageUrl: string;
  artworkExpoId: string;
  isEditingExisting: boolean;
  regeneratingQr: boolean;
  onRegenerateQr: () => void;
};

function ArtworkModalIdentityRow({
  t,
  photoInputRef,
  imageUrl,
  isVisitorLocked,
  isLoading,
  uploadingImage,
  onUploadImage,
  title,
  onTitleChange,
  artistSearch,
  onArtistSearchChange,
  showArtistSuggestions,
  onArtistSuggestionsOpen,
  selectedArtistDisplay,
  filteredArtists,
  artistId,
  onSelectArtist,
  onOpenCreateArtist,
  artworkQrImageUrl,
  artworkExpoId,
  isEditingExisting,
  regeneratingQr,
  onRegenerateQr,
}: ArtworkModalIdentityRowProps) {
  return (
    <div className="flex min-w-0 flex-1 gap-4 items-start">
      <div className="w-40 shrink-0">
        <div className="group relative h-40 w-full shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
          {imageUrl ? (
            <img src={imageUrl} alt={t("img_alt")} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Upload className="h-6 w-6 text-muted-foreground/70" />
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
              if (file) onUploadImage(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Label>{t("label_title")}</Label>
            <Textarea
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={isVisitorLocked || isLoading}
              rows={2}
              className="min-h-[60px] resize-none p-[5px] text-base md:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("label_artist")}</Label>
            <div className="relative">
              <Input
                value={artistSearch}
                onChange={(e) => {
                  onArtistSearchChange(e.target.value);
                  onArtistSuggestionsOpen(true);
                }}
                onFocus={() => onArtistSuggestionsOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => onArtistSuggestionsOpen(false), 120);
                }}
                placeholder={selectedArtistDisplay}
                disabled={isVisitorLocked || isLoading}
                className="p-[5px]"
              />
              {showArtistSuggestions ? (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {artistSearch.trim().length > 0 && filteredArtists.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t("artist_not_found")}</p>
                  ) : null}
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
                        onClick={() => onSelectArtist(artist.artist_id, label)}
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
                  {!isVisitorLocked ? (
                    <>
                      {filteredArtists.length > 0 ? (
                        <div className="mx-2 my-1 border-t border-border/60" />
                      ) : null}
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={onOpenCreateArtist}
                      >
                        <span className="text-base leading-none">+</span>
                        {t("btn_create_artist")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "group relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30",
              artworkQrImageUrl && "bg-white",
              !artworkExpoId.trim() && "border-amber-400/70",
            )}
          >
            {artworkQrImageUrl ? (
              <img src={artworkQrImageUrl} alt={t("qr_alt")} className="h-full w-full object-contain p-1" />
            ) : (
              <p className="px-2 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs">
                {t("qr_empty")}
              </p>
            )}
            {isEditingExisting && !isVisitorLocked ? (
              <>
                <div className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity group-hover:opacity-100 bg-black/40" />
                <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center px-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="secondary"
                    className="pointer-events-auto justify-center bg-neutral-800/60 text-white hover:bg-neutral-800/72 border border-neutral-500/45 shadow-sm backdrop-blur-[1px]"
                    onClick={onRegenerateQr}
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
            ) : null}
          </div>
          {!artworkExpoId.trim() ? (
            <p className="max-w-[160px] text-center text-[10px] leading-tight text-amber-600">
              {t("qr_warn_no_expo")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ArtworkModal({
  open,
  onOpenChange,
  onSuccess,
  artworkId,
  openMediationAudioOnLoad = false,
  closeOnMediationAudioClose = false,
}: ArtworkModalProps) {
  const { t, i18n } = useTranslation("artwork_modal");
  const { role_id, agency_id, expo_id } = useAuthUser();
  const isVisitorLocked = role_id === 7;
  const {
    primaryLang: mediationPrimaryLang,
    optionalLang: mediationOptionalLang,
    setOptionalLang: setMediationOptionalLang,
    generationLangs,
    allowsOptionalLang,
    isAllLanguagesMode,
  } = useMediationGenerationConfig();

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingArtworkId, setEditingArtworkId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState("");
  const [artworkExpoId, setArtworkExpoId] = useState("");
  const [artworkAgencyId, setArtworkAgencyId] = useState("");
  const canPickAgency = typeof role_id === "number" && role_id < 4;
  const canPickExpo = typeof role_id === "number" && (role_id === 4 || role_id === 5);
  const expoAgencyId = artworkAgencyId.trim() || agency_id?.trim() || "";
  const [agencyOptions, setAgencyOptions] = useState<{ id: string; name: string }[]>([]);
  const [expoOptions, setExpoOptions] = useState<{ id: string; name: string }[]>([]);
  const [artworkAgencyOpen, setArtworkAgencyOpen] = useState(false);
  const [artworkExpoOpen, setArtworkExpoOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [artworkQrImageUrl, setArtworkQrImageUrl] = useState("");
  const [sourceMaterialByLang, setSourceMaterialByLang] = useState(createEmptySourceMaterialByLang);
  /** Langue affichée / éditée dans le matériau source (boutons verticaux). */
  const [sourceMaterialEditLang, setSourceMaterialEditLang] = useState<MediationUiLang>("fr");
  const [descriptionsByLang, setDescriptionsByLang] = useState(createEmptyDescriptionsByLang);
  const [mediationEditLang, setMediationEditLang] = useState<MediationUiLang>("fr");
  const [audioStatusRefreshKey, setAudioStatusRefreshKey] = useState(0);
  const [audioOptimisticCells, setAudioOptimisticCells] = useState<string[]>([]);
  const [mediationAudioDialogOpen, setMediationAudioDialogOpen] = useState(false);
  const [styleTabs, setStyleTabs] = useState<StyleTabEntry[]>(DEFAULT_STYLE_TABS);
  const [activeTab, setActiveTab] = useState<DescriptionKey>("enfant");
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [generatingMediation, setGeneratingMediation] = useState(false);
  /** Régénération IA d’un seul persona (clé JSON) ; null si aucune requête en cours. */
  const [regeneratingMediationStyleKey, setRegeneratingMediationStyleKey] = useState<DescriptionKey | null>(null);
  /** Barre de progression 0–100 % pendant génération / régénération des médiations. */
  const [mediationProgress, setMediationProgress] = useState<MediationProgressState | null>(null);
  const [lastMediationAnalyseFr, setLastMediationAnalyseFr] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [regeneratingQr, setRegeneratingQr] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [analyzeImageError, setAnalyzeImageError] = useState<string | null>(null);
  const [analyzeTruncatedWarning, setAnalyzeTruncatedWarning] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<MediationProgressState | null>(null);
  /** Proposition de génération IA pour une langue dont le persona affiché est vide. */
  const [langGeneratePrompt, setLangGeneratePrompt] = useState<{
    lang: MediationUiLang;
    emptyPersonaCount: number;
  } | null>(null);
  const [langAudioGeneratePrompt, setLangAudioGeneratePrompt] = useState<{
    lang: MediationUiLang;
  } | null>(null);
  const savedMediationBaselineRef = useRef<Record<string, Record<string, string>>>({});
  const [artistSearch, setArtistSearch] = useState("");
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [duplicateArtwork, setDuplicateArtwork] = useState<{ artwork_id: string; artwork_title: string | null } | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [initialDraftSignature, setInitialDraftSignature] = useState("");
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [notesFlash, setNotesFlash] = useState(false);
  /** Édition : true tant que loadArtwork n’a pas fixé la baseline du brouillon */
  const [artworkDraftLoading, setArtworkDraftLoading] = useState(false);
  /** Points structurés renvoyés par l’analyse d’image (affichage tolérant, optionnel). */
  const [imagePersonasFromAnalysis, setImagePersonasFromAnalysis] = useState<ImageAnalysisPersonaItem[]>([]);
  /** Étape 1 : analyse d’image effectuée (matériau source disponible). */
  const [imageAnalysisDone, setImageAnalysisDone] = useState(false);

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

  /** UUID fiable pour UPDATE : la prop parent est fixée dès l’ouverture ; `editingArtworkId` ne l’est qu’après loadArtwork (fenêtre où la persistance IA était ignorée). */
  const persistedArtworkId = useMemo(() => {
    const a = artworkId?.trim() ?? "";
    const b = editingArtworkId?.trim() ?? "";
    return a || b || "";
  }, [artworkId, editingArtworkId]);

  const isEditingExisting = Boolean(persistedArtworkId);

  const sourceMaterialForGeneration = useMemo(
    () => sourceMaterialTextForLang(sourceMaterialByLang, i18n.language),
    [sourceMaterialByLang, i18n.language],
  );

  const activeSourceMaterialLangSet = useMemo(() => {
    const filled = sourceMaterialLangsWithContent(sourceMaterialByLang);
    const langs = filled.length > 0 ? filled : generationLangs;
    return new Set(langs);
  }, [sourceMaterialByLang, generationLangs]);

  const persistArtworkSourceMaterial = useCallback(
    async (byLang: Record<MediationUiLang, string>): Promise<void> => {
      if (!persistedArtworkId) return;
      const serialized = serializeSourceMaterialByLang(byLang);
      const legacyPrimary =
        sourceMaterialTextForLang(byLang, i18n.language) ||
        sourceMaterialTextForLang(byLang, "fr") ||
        null;
      const { data: updatedRows, error } = await supabase
        .from("artworks")
        .update({
          artwork_source_material: legacyPrimary,
          artwork_source_material_i18n: serialized,
        } as never)
        .eq("artwork_id", persistedArtworkId)
        .select("artwork_id");
      if (error) throw error;
      if (!updatedRows?.length) {
        throw new Error(
          "Aucune ligne mise à jour pour artwork_source_material (droits RLS ou œuvre introuvable).",
        );
      }
    },
    [persistedArtworkId, i18n.language],
  );

  useEffect(() => {
    if (!open) {
      setRegeneratingMediationStyleKey(null);
      setMediationProgress(null);
      setMediationOptionalLang(null);
      setAnalyzeProgress(null);
      setMediationAudioDialogOpen(false);
      return;
    }
    setMediationEditLang(mediationPrimaryLang);
    setSourceMaterialEditLang(mediationPrimaryLang);
  }, [open, mediationPrimaryLang, setMediationOptionalLang]);

  useEffect(() => {
    if (!generationLangs.includes(sourceMaterialEditLang)) {
      setSourceMaterialEditLang(mediationPrimaryLang);
    }
  }, [generationLangs, sourceMaterialEditLang, mediationPrimaryLang]);

  // Charger les agences (super-admins uniquement)
  useEffect(() => {
    if (!canPickAgency || !open) return;
    supabase
      .from("agencies")
      .select("id, name_agency")
      .order("name_agency", { ascending: true })
      .then(({ data }) => {
        setAgencyOptions((data ?? []).map((r) => ({ id: r.id as string, name: (r.name_agency as string) ?? "" })));
      });
  }, [canPickAgency, open]);

  // Rôles 4–5 : agence implicite (profil utilisateur)
  useEffect(() => {
    if (!open || canPickAgency || !canPickExpo || !agency_id?.trim()) return;
    setArtworkAgencyId((prev) => prev.trim() || agency_id.trim());
  }, [open, canPickAgency, canPickExpo, agency_id]);

  const canManageExpoLink = canPickAgency || canPickExpo;

  // Charger les expos filtrées par agence (sélectionnée ou profil)
  useEffect(() => {
    if (!open || !canManageExpoLink) { setExpoOptions([]); return; }
    if (!expoAgencyId) { setExpoOptions([]); return; }
    let query = supabase
      .from("expos")
      .select("id, expo_name")
      .eq("agency_id", expoAgencyId)
      .is("deleted_at", null)
      .order("expo_name", { ascending: true });
    if (role_id === 5 && expo_id?.trim()) {
      query = query.eq("id", expo_id.trim());
    }
    void query.then(({ data }) => {
      setExpoOptions((data ?? []).map((r) => ({ id: r.id as string, name: (r.expo_name as string) ?? "" })));
    });
  }, [open, canManageExpoLink, expoAgencyId, role_id, expo_id]);

  useEffect(() => {
    if (!open) {
      setShowCloseConfirm(false);
      setRegeneratingQr(false);
      setEditingArtworkId(null);
      setArtworkDraftLoading(false);
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
        .select(
          "id, code, name_fr, name_en, name_de, name_es, name_it, icon, ordonnancement, max_tokens, style_rules, system_instruction",
        )
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
      const allowedKeys: DescriptionKey[] = [...MEDIATION_DESCRIPTION_KEYS];
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
        const codeNorm = normalize(typeof row.code === "string" ? row.code : "");
        if (codeNorm && allowedKeys.includes(codeNorm as DescriptionKey)) {
          key = codeNorm as DescriptionKey;
        }
        const inferred = inferJsonKeyFromDisplayName(keySource);
        if (!key && inferred && allowedKeys.includes(inferred as DescriptionKey)) {
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

        const styleRules =
          typeof row.style_rules === "string" && row.style_rules.trim() ? row.style_rules.trim() : null;
        const systemInstruction =
          typeof row.system_instruction === "string" && row.system_instruction.trim()
            ? row.system_instruction.trim()
            : null;
        tabs.push({
          key,
          label,
          maxTokens,
          icon: iconTrim,
          styleRules,
          systemInstruction,
          promptStyleId: row.id != null ? String(row.id) : null,
        });
      }

      setStyleTabs(tabs.length ? tabs : DEFAULT_STYLE_TABS);
    };

    const loadArtwork = async (id: string) => {
      try {
        const { data, error } = await supabase
          .from("artworks")
          .select(
            "artwork_id, artwork_title, artwork_artist_id, artwork_expo_id, artwork_agency_id, artwork_source_material, artwork_source_material_i18n, artwork_description_i18n, artwork_image_url, artwork_qrcode_image, artwork_qr_code_url",
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
        const nextByLang = normalizeArtworkDescriptionToByLang(
          (data as { artwork_description_i18n?: unknown }).artwork_description_i18n,
        );
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
        const nextSourceByLang = normalizeSourceMaterialToByLang(
          (data as { artwork_source_material_i18n?: unknown }).artwork_source_material_i18n,
          (data.artwork_source_material as string | null) ?? "",
        );
        setSourceMaterialByLang(nextSourceByLang);
        setImageAnalysisDone(hasAnySourceMaterial(nextSourceByLang));
        setImagePersonasFromAnalysis([]);
        setDescriptionsByLang(nextByLang);
        savedMediationBaselineRef.current = serializeMediationDescriptionsByLang(nextByLang);
        setMediationEditLang(resolveMediationUiLang(i18n.language));
        const initialSnapshot = buildDraftSnapshot({
          title: (data.artwork_title as string | null) ?? "",
          artistId: (data.artwork_artist_id as string | null) ?? "",
          artworkExpoId: (data.artwork_expo_id as string | null) ?? "",
          artworkAgencyId: (data.artwork_agency_id as string | null) ?? "",
          imageUrl: (data.artwork_image_url as string | null) ?? "",
          sourceMaterialByLang: nextSourceByLang,
          descriptionsByLang: nextByLang,
        });
        setInitialDraftSignature(serializeDraftSnapshot(initialSnapshot));
      } finally {
        if (!cancelled) setArtworkDraftLoading(false);
      }
    };

    void loadArtists();
    void loadPromptStyles();
    if (artworkId) {
      setArtworkDraftLoading(true);
      void loadArtwork(artworkId);
    } else {
      setArtworkDraftLoading(false);
      setEditingArtworkId(null);
      setTitle("");
      setArtistId("");
      setArtistSearch("");
      setShowArtistSuggestions(false);
      setArtworkExpoId(expo_id ?? "");
      setArtworkAgencyId(agency_id ?? "");
      setImageUrl("");
      setArtworkQrImageUrl("");
      setSourceMaterialByLang(createEmptySourceMaterialByLang());
      setImageAnalysisDone(false);
      setImagePersonasFromAnalysis([]);
      const emptyMed = createEmptyDescriptionsByLang();
      setDescriptionsByLang(emptyMed);
      savedMediationBaselineRef.current = {};
      setMediationEditLang(resolveMediationUiLang(i18n.language));
      setDuplicateArtwork(null);
      const initialSnapshot = buildDraftSnapshot({
        title: "",
        artistId: "",
        artworkExpoId: expo_id ?? "",
        artworkAgencyId: agency_id ?? "",
        imageUrl: "",
        sourceMaterialByLang: createEmptySourceMaterialByLang(),
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

        if (persistedArtworkId && existsResult.artworkId === persistedArtworkId) {
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
  }, [open, fingerprint, artistId, title, persistedArtworkId]);

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
      const serializedMediation = serializeMediationDescriptionsByLang(descriptionsByLang);
      const serializedSource = serializeSourceMaterialByLang(sourceMaterialByLang);
      const legacySource =
        sourceMaterialTextForLang(sourceMaterialByLang, i18n.language) ||
        sourceMaterialTextForLang(sourceMaterialByLang, "fr") ||
        null;
      const payload = {
        artwork_title: title.trim(),
        artwork_artist_id: artistId,
        artwork_expo_id: artworkExpoId.trim() || null,
        artwork_agency_id: artworkAgencyId.trim() || null,
        artwork_image_url: imageUrl.trim() || null,
        artwork_source_material: legacySource,
        artwork_source_material_i18n: serializedSource,
        artwork_description_i18n: serializedMediation,
        artwork_fingerprint: fingerprint || null,
      };

      if (persistedArtworkId) {
        const { data: updatedRows, error } = await supabase
          .from("artworks")
          .update(payload)
          .eq("artwork_id", persistedArtworkId)
          .select("artwork_id");
        if (error) throw error;
        if (!updatedRows?.length) {
          throw new Error(
            "Aucune ligne mise à jour pour cette œuvre (droits RLS, œuvre supprimée ou id. invalide).",
          );
        }
        toast.success(t("toast_artwork_updated"));
        triggerMediationAudioOnChanges(persistedArtworkId, descriptionsByLang);
        updateMediationBaseline(descriptionsByLang);
        setInitialDraftSignature(
          serializeDraftSnapshot(
            buildDraftSnapshot({
              title,
              artistId,
              artworkExpoId,
              artworkAgencyId,
              imageUrl,
              sourceMaterialByLang,
              descriptionsByLang,
            }),
          ),
        );
        void generateAndSaveQrCode(persistedArtworkId, artworkExpoId.trim() || null).catch((e) => {
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
        if (newArtworkId) {
          triggerMediationAudioOnChanges(newArtworkId, descriptionsByLang);
          updateMediationBaseline(descriptionsByLang);
        }
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
    if (!persistedArtworkId || isVisitorLocked) return;
    setRegeneratingQr(true);
    try {
      const url = await generateAndSaveQrCode(persistedArtworkId, artworkExpoId.trim() || null);
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
  }, [persistedArtworkId, isVisitorLocked, artworkExpoId, t]);

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

  const canGenerateMediations =
    !isVisitorLocked &&
    imageAnalysisDone &&
    sourceMaterialForGeneration.trim().length > 0 &&
    !generatingMediation &&
    regeneratingMediationStyleKey === null &&
    !analyzingImage;

  const canAnalyzeImage = !isVisitorLocked && Boolean(imageUrl) && !analyzingImage;

  /** Langues accessibles : toutes celles avec texte sauvegardé, sinon la config étape 2. */
  const activeMediationLangs = useMemo(() => {
    const filled = mediationLangsWithContent(descriptionsByLang);
    if (filled.length > 0) return filled;
    return imageAnalysisDone ? generationLangs : [];
  }, [generationLangs, descriptionsByLang, imageAnalysisDone]);

  const activeMediationLangSet = useMemo(
    () => new Set(activeMediationLangs),
    [activeMediationLangs],
  );

  useEffect(() => {
    if (activeMediationLangs.length > 0 && !activeMediationLangSet.has(mediationEditLang)) {
      setMediationEditLang(activeMediationLangs[0]);
    }
  }, [activeMediationLangs, activeMediationLangSet, mediationEditLang]);

  useEffect(() => {
    if (!open || !openMediationAudioOnLoad || artworkDraftLoading || !persistedArtworkId) return;
    setMediationAudioDialogOpen(true);
  }, [open, openMediationAudioOnLoad, artworkDraftLoading, persistedArtworkId]);

  /** À l’édition : resynchroniser la langue optionnelle si plusieurs langues ont du contenu. */
  useEffect(() => {
    if (!open || artworkDraftLoading || !isEditingExisting) return;
    if (!allowsOptionalLang || isAllLanguagesMode) return;

    const filled = mediationLangsWithContent(descriptionsByLang);
    const secondary = filled.find((L) => L !== mediationPrimaryLang);
    if (!secondary) return;
    if (mediationOptionalLang !== secondary) {
      setMediationOptionalLang(secondary);
    }
  }, [
    open,
    artworkDraftLoading,
    isEditingExisting,
    allowsOptionalLang,
    isAllLanguagesMode,
    descriptionsByLang,
    mediationPrimaryLang,
    mediationOptionalLang,
    setMediationOptionalLang,
  ]);

  const mediationLangHelp = useMemo(() => {
    if (isAllLanguagesMode) {
      return t("mediation_lang_help_all");
    }
    if (mediationOptionalLang) {
      return t("mediation_lang_help_single_optional", {
        primary: mediationPrimaryLang.toUpperCase(),
        optional: mediationOptionalLang.toUpperCase(),
      });
    }
    return t("mediation_lang_help_single", { lang: mediationPrimaryLang.toUpperCase() });
  }, [isAllLanguagesMode, mediationOptionalLang, mediationPrimaryLang, t]);

  const handlePersonaAudioRetryCell = useCallback(
    (lang: string, styleKey: string, promptStyleId: string) => {
      if (!persistedArtworkId || !promptStyleId) return;
      const lng = lang.trim().toLowerCase().slice(0, 2) as MediationUiLang;
      triggerMediationAudioForPersonaLang({
        artworkId: persistedArtworkId,
        lang: lng,
        styleKey,
        prompt_style_id: promptStyleId,
      });
      const cellKey = audioVoiceCellKey(lng, promptStyleId);
      setAudioOptimisticCells((prev) => (prev.includes(cellKey) ? prev : [...prev, cellKey]));
      setAudioStatusRefreshKey((k) => k + 1);
    },
    [persistedArtworkId],
  );

  const handlePersonaAudioCancelCell = useCallback(
    async (lang: string, promptStyleId: string) => {
      if (!persistedArtworkId || !promptStyleId.trim()) return;
      const lng = lang.trim().toLowerCase().slice(0, 2) as MediationUiLang;
      const cellKey = audioVoiceCellKey(lng, promptStyleId);
      await cancelAudioGenerationForCell({
        text_id: persistedArtworkId,
        text_type: "mediation",
        lang: lng,
        prompt_style_id: promptStyleId,
      });
      setAudioOptimisticCells((prev) => prev.filter((key) => key !== cellKey));
      setAudioStatusRefreshKey((k) => k + 1);
    },
    [persistedArtworkId],
  );

  const openPersonaAudioDialog = useCallback(
    (
      tab: { key: string; promptStyleId: string; label: string },
      options?: { triggerGeneration?: boolean },
    ) => {
      if (!persistedArtworkId || !tab.promptStyleId?.trim()) return;
      setMediationAudioDialogOpen(true);

      if (options?.triggerGeneration) {
        void triggerMissingMediationVoices({
          artworkId: persistedArtworkId,
          personas: [{ key: tab.key, promptStyleId: tab.promptStyleId }],
          languages: activeMediationLangs,
          descriptionsByLang,
        }).then(({ jobCount, cellKeys }) => {
          if (jobCount <= 0 || cellKeys.length === 0) return;
          setAudioOptimisticCells((prev) => {
            const next = new Set(prev);
            for (const cell of cellKeys) next.add(cell);
            return [...next];
          });
          setAudioStatusRefreshKey((k) => k + 1);
        });
      }
    },
    [persistedArtworkId, descriptionsByLang, activeMediationLangs],
  );

  const handleFillMissingMediationVoices = useCallback(async () => {
    if (!persistedArtworkId) return;
    const personas = (styleTabs ?? []).map((tab) => ({
      key: tab.key,
      promptStyleId: tab.promptStyleId,
    }));
    const { jobCount, cellKeys } = await triggerMissingMediationVoices({
      artworkId: persistedArtworkId,
      personas,
      languages: activeMediationLangs,
      descriptionsByLang,
    });
    if (jobCount > 0 && cellKeys.length > 0) {
      setAudioOptimisticCells((prev) => {
        const next = new Set(prev);
        for (const cell of cellKeys) next.add(cell);
        return [...next];
      });
      setAudioStatusRefreshKey((k) => k + 1);
    }
  }, [persistedArtworkId, styleTabs, activeMediationLangs, descriptionsByLang]);

  const mediationStyleMap = useMemo(
    () => buildMediationStylePromptStyleMap(styleTabs ?? []),
    [styleTabs],
  );

  const updateMediationBaseline = useCallback(
    (byLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>) => {
      savedMediationBaselineRef.current = serializeMediationDescriptionsByLang(byLang);
    },
    [],
  );

  const triggerMediationAudioOnChanges = useCallback(
    (artworkId: string, byLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>) => {
      triggerMediationAudioBatchForChanges({
        artworkId,
        descriptionsByLang: serializeMediationDescriptionsByLang(byLang),
        baselineByLang: savedMediationBaselineRef.current,
        stylePromptStyleIds: mediationStyleMap,
      });
      setAudioStatusRefreshKey((k) => k + 1);
    },
    [mediationStyleMap],
  );

  const isAiBusy =
    generatingMediation || regeneratingMediationStyleKey !== null || analyzingImage;

  const checkMediationAudioForLang = useCallback(
    async (lng: MediationUiLang) => {
      if (!persistedArtworkId || isVisitorLocked || isAiBusy) return;
      const hasText = Object.values(descriptionsByLang[lng] ?? {}).some((raw) => (raw ?? "").trim());
      if (!hasText) return;
      const needsAudio = await mediationLangNeedsAudioGeneration(
        persistedArtworkId,
        lng,
        serializeMediationDescriptionsByLang(descriptionsByLang),
        mediationStyleMap,
      );
      if (needsAudio) setLangAudioGeneratePrompt({ lang: lng });
    },
    [persistedArtworkId, isVisitorLocked, isAiBusy, descriptionsByLang, mediationStyleMap],
  );

  const currentDraftSignature = useMemo(() => {
    const snapshot = buildDraftSnapshot({
      title,
      artistId,
      artworkExpoId,
      artworkAgencyId,
      imageUrl,
      sourceMaterialByLang,
      descriptionsByLang,
    });
    return serializeDraftSnapshot(snapshot);
  }, [title, artistId, artworkExpoId, artworkAgencyId, imageUrl, sourceMaterialByLang, descriptionsByLang]);
  const hasUnsavedChanges =
    !artworkDraftLoading && currentDraftSignature !== initialDraftSignature;

  const requestCloseModal = () => {
    if (isAiBusy) return;
    if (hasUnsavedChanges) {
      setShowCloseConfirm(true);
      return;
    }
    onOpenChange(false);
  };
  const handleAnalyzeImage = async (targetLang?: MediationUiLang) => {
    if (!imageUrl) return;
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error(t("toast_error_artist_analyze"));
      return;
    }
    const outputLang = targetLang ?? mediationPrimaryLang;
    setSourceMaterialEditLang(outputLang);
    setAnalyzeImageError(null);
    setAnalyzeTruncatedWarning(null);
    setAnalyzingImage(true);
    let apiProgressTimer: number | null = null;
    try {
      setAnalyzeProgress({ percent: 5, detail: t("analyze_progress_prepare") });
      const prepared = await prepareArtworkImageForAnalysis({
        imageUrl,
        maxWidthPx: 1200,
        maxBytes: 2_000_000,
      });
      setAnalyzeProgress({ percent: 14, detail: t("analyze_progress_send") });
      const apiStart = Date.now();
      apiProgressTimer = window.setInterval(() => {
        const elapsedMs = Date.now() - apiStart;
        const elapsedSec = Math.floor(elapsedMs / 1000);
        const percent = Math.min(
          90,
          14 + Math.round((elapsedMs / ANALYZE_PROGRESS_ESTIMATE_MS) * 76),
        );
        setAnalyzeProgress({
          percent,
          detail: analyzeProgressDetailFromElapsed(elapsedSec, t),
        });
      }, 400);

      const analyzeResult = await analyzeArtworkImage(
        prepared.kind === "inline"
          ? {
              inlineImage: { mimeType: prepared.mimeType, base64Data: prepared.base64Data },
              artistName: selectedArtistLabel || selectedArtistDisplay,
              artworkName: title.trim(),
              outputLang,
            }
          : {
              imageUrl: prepared.imageUrl,
              artistName: selectedArtistLabel || selectedArtistDisplay,
              artworkName: title.trim(),
              outputLang,
            },
      );
      if (apiProgressTimer) {
        window.clearInterval(apiProgressTimer);
        apiProgressTimer = null;
      }
      if (import.meta.env.DEV) {
        console.log("Données reçues par le Front-End (analyze-artwork-image, normalisé) :", analyzeResult);
      }
      setAnalyzeProgress({ percent: 92, detail: t("analyze_progress_finalize") });
      if (analyzeResult.truncated) {
        const maxTok = analyzeResult.max_output_tokens ?? 2000;
        const warnMsg = t("toast_analyze_truncated", { max: maxTok });
        toast.warning(warnMsg, { duration: 15_000 });
        setAnalyzeTruncatedWarning(warnMsg);
      }
      const notes = analyzeResult.notes;
      const nextSourceByLang = { ...sourceMaterialByLang, [outputLang]: notes };
      setSourceMaterialByLang(nextSourceByLang);
      setSourceMaterialEditLang(outputLang);
      setImageAnalysisDone(true);
      setImagePersonasFromAnalysis(Array.isArray(analyzeResult.personas) ? analyzeResult.personas : []);
      if (persistedArtworkId) {
        try {
          await persistArtworkSourceMaterial(nextSourceByLang);
        } catch (persistErr) {
          const persistMsg =
            persistErr instanceof Error ? persistErr.message : t("toast_error_source_persist");
          toast.error(persistMsg);
        }
      }
      setNotesFlash(true);
      window.setTimeout(() => setNotesFlash(false), 1200);
      setAnalyzeProgress({ percent: 100, detail: t("analyze_progress_done") });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_analyze");
      setAnalyzeImageError(msg);
    } finally {
      if (apiProgressTimer) window.clearInterval(apiProgressTimer);
      setAnalyzingImage(false);
      setAnalyzeProgress(null);
    }
  };

  const handleSourceMaterialLangSelect = (lng: MediationUiLang) => {
    if (!activeSourceMaterialLangSet.has(lng)) return;
    if (isVisitorLocked || isLoading || analyzingImage) return;
    if (lng === sourceMaterialEditLang) return;

    const hasExistingText = (sourceMaterialByLang[lng] ?? "").trim().length > 0;
    if (hasExistingText) {
      setSourceMaterialEditLang(lng);
      return;
    }

    if (!imageUrl) {
      setSourceMaterialEditLang(lng);
      return;
    }
    if (!artistId) {
      toast.error(t("toast_error_artist_analyze"));
      setSourceMaterialEditLang(lng);
      return;
    }
    void handleAnalyzeImage(lng);
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

  const persistMediationToArtwork = async (
    base: ReturnType<typeof createEmptyDescriptionsByLang>,
    successToastKey: string,
    toastParams?: Record<string, string | number>,
  ) => {
    if (persistedArtworkId) {
      const serializedMediation = serializeMediationDescriptionsByLang(base);
      const { data: updatedRows, error: persistErr } = await supabase
        .from("artworks")
        .update({ artwork_description_i18n: serializedMediation })
        .eq("artwork_id", persistedArtworkId)
        .select("artwork_id");
      if (persistErr) {
        toast.error(persistErr.message || t("toast_error_save"));
        return false;
      }
      if (!updatedRows?.length) {
        toast.error(
          t("toast_error_save") +
            " — aucune ligne mise à jour (vérifiez RLS ou que l’œuvre existe).",
        );
        return false;
      }
    }
    toast.success(t(successToastKey, toastParams));

    if (persistedArtworkId) {
      triggerMediationAudioOnChanges(persistedArtworkId, base);
      updateMediationBaseline(base);
    }

    return true;
  };

  const handleGenerateAllPersonasForLang = async (
    lang: MediationUiLang,
    options?: { onlyFillEmpty?: boolean },
  ) => {
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error(t("toast_error_artist_generate"));
      return;
    }
    if (!sourceMaterialForGeneration.trim()) {
      toast.error(t("toast_error_source_required"));
      return;
    }
    const onlyFillEmpty = options?.onlyFillEmpty ?? true;
    setGeneratingMediation(true);
    setMediationProgress({ percent: 0, detail: t("mediation_progress_start") });
    try {
      const materialForMediation =
        (sourceMaterialByLang[mediationPrimaryLang] ?? "").trim() ||
        sourceMaterialForGeneration.trim();
      if (persistedArtworkId) {
        setMediationProgress({ percent: 2, detail: t("mediation_progress_persist") });
        await persistArtworkSourceMaterial(sourceMaterialByLang);
        setMediationProgress({
          percent: MEDIATION_GENERATION_PROGRESS.persist.end,
          detail: t("mediation_progress_persist"),
        });
      }
      const sourceText = [
        title.trim() ? `Titre: ${title.trim()}` : "",
        selectedArtistLabel ? `Artiste: ${selectedArtistLabel}` : "",
        materialForMediation,
      ]
        .filter(Boolean)
        .join("\n");
      const stylesPayload = styleTabsToMediationPayload(styleTabs ?? []);

      const base = createEmptyDescriptionsByLang();
      for (const L of MEDIATION_UI_LANGS) {
        for (const k of MEDIATION_DESCRIPTION_KEYS) {
          base[L][k] = descriptionsByLang[L][k];
        }
      }

      const stylesToRun = onlyFillEmpty
        ? stylesPayload.filter((s) => !(base[lang][s.id as DescriptionKey] ?? "").trim())
        : stylesPayload;

      if (stylesToRun.length === 0) {
        setMediationEditLang(lang);
        return;
      }

      const missingSlots: string[] = [];
      const stepDetail = t("mediation_progress_lang_all_personas", {
        lang: langCodeForProgress(lang),
        personas: stylesToRun.length,
        current: 1,
        total: 1,
      });
      const updateStepProgress = (sub: number) => {
        setMediationProgress({
          percent: mediationPercentByStep(0, 1, sub),
          detail: stepDetail,
        });
      };

      const { stylesById, analyseGlobale } = await runWithMediationSubProgress(
        () => generatePersonasBatchWithRetry(sourceText, stylesToRun, lang),
        updateStepProgress,
      );
      if (lang === mediationPrimaryLang && analyseGlobale) {
        setLastMediationAnalyseFr(analyseGlobale);
      }

      for (const style of stylesToRun) {
        const styleKey = style.id as DescriptionKey;
        const personaLabel = style.label?.trim() || style.id;
        const text = stylesById[style.id] ?? "";
        if (CANONICAL_MEDIATION_STYLE_SET.has(styleKey)) {
          base[lang][styleKey] = text;
        }
        if (!text) {
          missingSlots.push(`${personaLabel} (${langCodeForProgress(lang)})`);
        }
      }

      setDescriptionsByLang(base);
      setMediationEditLang(lang);

      if (missingSlots.length > 0) {
        toast.warning(
          t("toast_mediation_partial", {
            count: missingSlots.length,
            examples: missingSlots.slice(0, 4).join(", "),
          }),
        );
      }

      setMediationProgress({
        percent: MEDIATION_GENERATION_PROGRESS.save.start,
        detail: t("mediation_progress_save"),
      });
      await persistMediationToArtwork(base, "toast_mediation_lang_generated", {
        lang: langCodeForProgress(lang),
        count: stylesToRun.length,
      });
      setMediationProgress({ percent: 100, detail: t("mediation_progress_done") });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_generate");
      toast.error(msg);
    } finally {
      setGeneratingMediation(false);
      setMediationProgress(null);
    }
  };

  const handleMediationLangSelect = (lng: MediationUiLang) => {
    if (lng === mediationEditLang) return;
    if (isVisitorLocked || isAiBusy) {
      setMediationEditLang(lng);
      return;
    }
    const currentPersonaEmpty = !(descriptionsByLang[lng]?.[activeTab] ?? "").trim();
    if (!currentPersonaEmpty) {
      setMediationEditLang(lng);
      void checkMediationAudioForLang(lng);
      return;
    }
    if (!sourceMaterialForGeneration.trim()) {
      toast.error(t("toast_error_source_required"));
      setMediationEditLang(lng);
      return;
    }
    const emptyPersonaCount = (styleTabs ?? []).filter(
      (tab) => !(descriptionsByLang[lng]?.[tab.key] ?? "").trim(),
    ).length;
    setMediationEditLang(lng);
    setLangGeneratePrompt({ lang: lng, emptyPersonaCount });
  };

  const handleGenerateMediations = async () => {
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error(t("toast_error_artist_generate"));
      return;
    }
    if (!sourceMaterialForGeneration.trim()) {
      toast.error(t("toast_error_source_required"));
      return;
    }
    setGeneratingMediation(true);
    setLastMediationAnalyseFr(null);
    setMediationProgress({ percent: 0, detail: t("mediation_progress_start") });
    try {
      const materialForMediation =
        (sourceMaterialByLang[mediationPrimaryLang] ?? "").trim() ||
        sourceMaterialForGeneration.trim();
      if (persistedArtworkId) {
        setMediationProgress({ percent: 2, detail: t("mediation_progress_persist") });
        await persistArtworkSourceMaterial(sourceMaterialByLang);
        setMediationProgress({
          percent: MEDIATION_GENERATION_PROGRESS.persist.end,
          detail: t("mediation_progress_persist"),
        });
      }
      const sourceText = [
        title.trim() ? `Titre: ${title.trim()}` : "",
        selectedArtistLabel ? `Artiste: ${selectedArtistLabel}` : "",
        materialForMediation,
      ]
        .filter(Boolean)
        .join("\n");
      const stylesPayload = styleTabsToMediationPayload(styleTabs ?? []);

      const base = createEmptyDescriptionsByLang();
      for (const L of MEDIATION_UI_LANGS) {
        for (const k of MEDIATION_DESCRIPTION_KEYS) {
          base[L][k] = descriptionsByLang[L][k];
        }
      }

      const langsToGenerate = generationLangs;
      const totalSteps = langsToGenerate.length;
      const missingSlots: string[] = [];

      for (let stepIndex = 0; stepIndex < langsToGenerate.length; stepIndex++) {
        const lang = langsToGenerate[stepIndex];
        const stepDetail = t("mediation_progress_lang_all_personas", {
          lang: langCodeForProgress(lang),
          personas: stylesPayload.length,
          current: stepIndex + 1,
          total: totalSteps,
        });
        const updateStepProgress = (sub: number) => {
          setMediationProgress({
            percent: mediationPercentByStep(stepIndex, totalSteps, sub),
            detail: stepDetail,
          });
        };

        const { stylesById, analyseGlobale } = await runWithMediationSubProgress(
          () => generatePersonasBatchWithRetry(sourceText, stylesPayload, lang),
          updateStepProgress,
        );
        if (lang === mediationPrimaryLang && analyseGlobale) {
          setLastMediationAnalyseFr(analyseGlobale);
        }

        for (const style of stylesPayload) {
          const styleKey = style.id as DescriptionKey;
          const personaLabel = style.label?.trim() || style.id;
          const text = stylesById[style.id] ?? "";
          if (CANONICAL_MEDIATION_STYLE_SET.has(styleKey)) {
            base[lang][styleKey] = text;
          }
          if (!text) {
            missingSlots.push(`${personaLabel} (${langCodeForProgress(lang)})`);
          }
        }
      }

      setDescriptionsByLang(base);

      if (missingSlots.length > 0) {
        toast.warning(
          t("toast_mediation_partial", {
            count: missingSlots.length,
            examples: missingSlots.slice(0, 4).join(", "),
          }),
        );
      }

      setMediationProgress({
        percent: MEDIATION_GENERATION_PROGRESS.save.start,
        detail: t("mediation_progress_save"),
      });
      await persistMediationToArtwork(base, "toast_mediation_generated", {
        personas: stylesPayload.length,
        langs: langsToGenerate.map(langCodeForProgress).join(" - "),
      });
      setMediationProgress({ percent: 100, detail: t("mediation_progress_done") });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_generate");
      toast.error(msg);
    } finally {
      setGeneratingMediation(false);
      setMediationProgress(null);
    }
  };

  const handleRegenerateMediationForStyle = async (styleKey: DescriptionKey) => {
    if (isVisitorLocked) return;
    if (!artistId) {
      toast.error(t("toast_error_artist_generate"));
      return;
    }
    if (!sourceMaterialForGeneration.trim()) {
      toast.error(t("toast_error_source_required"));
      return;
    }
    const tab = (styleTabs ?? []).find((s) => s.key === styleKey);
    if (!tab) {
      toast.error(t("toast_error_style_tab_unknown"));
      return;
    }
    setRegeneratingMediationStyleKey(styleKey);
    setMediationProgress({ percent: 0, detail: t("mediation_progress_start") });
    try {
      const materialForMediation =
        (sourceMaterialByLang[mediationPrimaryLang] ?? "").trim() ||
        sourceMaterialForGeneration.trim();
      if (persistedArtworkId) {
        setMediationProgress({ percent: 2, detail: t("mediation_progress_persist") });
        await persistArtworkSourceMaterial(sourceMaterialByLang);
        setMediationProgress({
          percent: MEDIATION_GENERATION_PROGRESS.persist.end,
          detail: t("mediation_progress_persist"),
        });
      }
      const sourceText = [
        title.trim() ? `Titre: ${title.trim()}` : "",
        selectedArtistLabel ? `Artiste: ${selectedArtistLabel}` : "",
        materialForMediation,
      ]
        .filter(Boolean)
        .join("\n");
      const stylesPayload = [
        {
          id: tab.key,
          label: tab.label,
          max_tokens: tab.maxTokens,
          style_rules: tab.styleRules ?? undefined,
          system_instruction: tab.systemInstruction ?? undefined,
        },
      ];

      const base = createEmptyDescriptionsByLang();
      for (const L of MEDIATION_UI_LANGS) {
        for (const k of MEDIATION_DESCRIPTION_KEYS) {
          base[L][k] = descriptionsByLang[L][k];
        }
      }

      const langsToGenerate = generationLangs;
      for (let i = 0; i < langsToGenerate.length; i++) {
        const lang = langsToGenerate[i];
        const langDetail = t("mediation_progress_lang", {
          lang: langCodeForProgress(lang),
          current: i + 1,
          total: langsToGenerate.length,
        });
        const updateLangProgress = (sub: number) => {
          setMediationProgress({
            percent: mediationPercentByStep(i, langsToGenerate.length, sub),
            detail: langDetail,
          });
        };
        const generated = await runWithMediationSubProgress(
          () =>
            generateMediation({
              sourceText,
              styles: stylesPayload,
              lang,
            }),
          updateLangProgress,
        );
        if (lang === mediationPrimaryLang) {
          setLastMediationAnalyseFr(generated.analyseGlobale.trim() || null);
        }
        base[lang][styleKey] = (generated.stylesById[tab.key] ?? "").trim();
      }

      setDescriptionsByLang(base);
      setMediationProgress({
        percent: MEDIATION_GENERATION_PROGRESS.save.start,
        detail: t("mediation_progress_save"),
      });

      await persistMediationToArtwork(base, "toast_mediation_style_regenerated", {
        label: tab.label,
        count: langsToGenerate.length,
      });
      setMediationProgress({ percent: 100, detail: t("mediation_progress_done") });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast_error_generate");
      toast.error(msg);
    } finally {
      setRegeneratingMediationStyleKey(null);
      setMediationProgress(null);
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
        <DialogTitle className="sr-only">
          {isEditingExisting ? t("title_edit") : t("title_new")}
          {title.trim() ? ` — ${title.trim()}` : ""}
        </DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              {isEditingExisting ? t("title_edit") : t("title_new")}
              {title.trim() ? (
                <>
                  {" "}
                  <strong className="font-bold">{title.trim()}</strong>
                </>
              ) : null}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className={
                  isEditingExisting
                    ? cn(
                        "h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold",
                        "hover:bg-[#ffecef] hover:text-[#c92f3b]",
                        !hasUnsavedChanges && "opacity-40",
                      )
                    : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
                }
                disabled={
                  isVisitorLocked ||
                  isSubmitting ||
                  isLoading ||
                  isAiBusy ||
                  regeneratingQr ||
                  (isEditingExisting && (artworkDraftLoading || !hasUnsavedChanges))
                }
                onClick={() => void handleSave()}
              >
                {isSubmitting ? t("btn_saving") : t("btn_save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-md text-white hover:bg-white/20 hover:text-white"
                disabled={isAiBusy || artistDialogOpen}
                aria-label={t("btn_close_aria")}
                onClick={() => {
                  if (isAiBusy || artistDialogOpen) return;
                  if (hasUnsavedChanges) {
                    setShowCloseConfirm(true);
                    return;
                  }
                  onOpenChange(false);
                }}
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
        <DialogDescription className="sr-only">
          {isEditingExisting ? t("dialog_edit_desc") : t("dialog_new_desc")}
        </DialogDescription>


        <div className="px-4 sm:px-5 pt-3 pb-4 space-y-4">
        {isVisitorLocked && (
          <Alert variant="destructive" className="border-destructive/60">
            <AlertTitle>{t("alert_visitor_title")}</AlertTitle>
            <AlertDescription>{t("alert_visitor_desc")}</AlertDescription>
          </Alert>
        )}

        {duplicateArtwork && !artworkId?.trim() && (
          <Alert variant="destructive" className="border-destructive/60">
            <AlertTitle>{t("alert_duplicate_title")}</AlertTitle>
            <AlertDescription>{t("alert_duplicate_desc")}</AlertDescription>
          </Alert>
        )}

        <input type="hidden" value={artworkExpoId} readOnly />
        <input type="hidden" value={artworkAgencyId} readOnly />
        <input type="hidden" value={fingerprint} readOnly />

        {/* ── Layout 2 rangées sur 2 colonnes fixes ──────────────────────────────
            Rangée 1 : [Image + Analyser (w-40)] | [Titre + Artiste flex-1] [QR w-40]
            Rangée 2 : [Agence 50%] [Expo 50%] côte à côte
        ──────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* ── Rangée 1 ─────────────────────────────────────────── */}
          <ArtworkModalIdentityRow
            t={t}
            photoInputRef={photoInputRef}
            imageUrl={imageUrl}
            isVisitorLocked={isVisitorLocked}
            isLoading={isLoading}
            uploadingImage={uploadingImage}
            onUploadImage={(file) => void uploadArtworkImage(file)}
            title={title}
            onTitleChange={setTitle}
            artistSearch={artistSearch}
            onArtistSearchChange={setArtistSearch}
            showArtistSuggestions={showArtistSuggestions}
            onArtistSuggestionsOpen={setShowArtistSuggestions}
            selectedArtistDisplay={selectedArtistDisplay}
            filteredArtists={filteredArtists}
            artistId={artistId}
            onSelectArtist={(id, label) => {
              setArtistId(id);
              setArtistSearch(label);
              setShowArtistSuggestions(false);
            }}
            onOpenCreateArtist={() => {
              setShowArtistSuggestions(false);
              setArtistDialogOpen(true);
            }}
            artworkQrImageUrl={artworkQrImageUrl}
            artworkExpoId={artworkExpoId}
            isEditingExisting={isEditingExisting}
            regeneratingQr={regeneratingQr}
            onRegenerateQr={() => void handleRegenerateQr()}
          />

          {/* ── Rangée 2 : [Agence 50%] (rôles &lt; 4) + [Expo] (rôles &lt; 4 ou 4–5) ── */}
          {canManageExpoLink && (
            <div className="flex gap-3 items-start">
              {canPickAgency && (
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs font-medium">{t("label_agency")}</Label>
                <Popover open={artworkAgencyOpen} onOpenChange={setArtworkAgencyOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox"
                      className="h-9 w-full justify-between p-[5px] text-sm font-normal shadow-none"
                      disabled={isVisitorLocked || isLoading}
                    >
                      <span className="truncate">
                        {artworkAgencyId
                          ? (agencyOptions.find((a) => a.id === artworkAgencyId)?.name ?? t("agency_unknown"))
                          : t("agency_select_placeholder")}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t("agency_search_placeholder")} />
                      <CommandList>
                        <CommandEmpty>{t("agency_empty")}</CommandEmpty>
                        <CommandGroup>
                          {agencyOptions.map((a) => (
                            <CommandItem key={a.id} value={a.name} onSelect={() => { setArtworkAgencyId(a.id); setArtworkExpoId(""); setArtworkAgencyOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", artworkAgencyId === a.id ? "opacity-100" : "opacity-0")} />
                              {a.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              )}
              <div className={cn("min-w-0 space-y-1.5", canPickAgency ? "flex-1" : "w-full flex-1")}>
                <Label className="text-xs font-medium">{t("label_expo")}</Label>
                <Popover open={artworkExpoOpen} onOpenChange={setArtworkExpoOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox"
                      className="h-9 w-full justify-between p-[5px] text-sm font-normal shadow-none"
                      disabled={isVisitorLocked || isLoading || !expoAgencyId}
                    >
                      <span className="truncate">
                        {artworkExpoId
                          ? (expoOptions.find((e) => e.id === artworkExpoId)?.name ?? t("expo_unknown"))
                          : expoAgencyId
                            ? t("expo_select_placeholder")
                            : t("expo_agency_unresolved")}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t("expo_search_placeholder")} />
                      <CommandList>
                        <CommandEmpty>{t("expo_empty")}</CommandEmpty>
                        <CommandGroup>
                          {expoOptions.map((e) => (
                            <CommandItem key={e.id} value={e.name} onSelect={() => { setArtworkExpoId(e.id); setArtworkExpoOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", artworkExpoId === e.id ? "opacity-100" : "opacity-0")} />
                              {e.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Erreur analyse image */}
          {!analyzingImage && analyzeImageError && (
            <Alert variant="destructive">
              <AlertTitle>{t("analyze_error_title")}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-xs break-words">{analyzeImageError}</p>
                <Button type="button" variant="outline" size="sm" className="h-8"
                  onClick={() => void handleAnalyzeImage()} disabled={!imageUrl || isVisitorLocked}
                >
                  {t("btn_retry")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

        </div>
        {checkingDuplicate && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("checking_duplicate")}
          </p>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="min-w-0 flex-1 leading-snug">{t("label_source_material")}</Label>
              {imageUrl ? (
                <div className="relative shrink-0">
                  <WorkflowStepBadge step={1} />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-auto gap-1 whitespace-normal border border-amber-300/60 bg-amber-50 px-[5px] py-[5px] text-center text-xs leading-tight text-amber-900 shadow-sm hover:bg-amber-100"
                    disabled={!canAnalyzeImage}
                    onClick={() => void handleAnalyzeImage()}
                  >
                    {analyzingImage ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("btn_analyzing")}
                      </>
                    ) : (
                      t("btn_analyze")
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
            {analyzingImage && analyzeProgress ? (
              <GenerationProgressBar
                percent={analyzeProgress.percent}
                detail={analyzeProgress.detail}
                ariaLabel={t("analyze_progress_aria", {
                  percent: Math.round(analyzeProgress.percent),
                })}
              />
            ) : null}
            <div className="flex items-stretch gap-2">
              <div
                className="flex shrink-0 flex-col gap-1"
                role="group"
                aria-label={t("source_material_lang_group_aria")}
              >
                {MEDIATION_UI_LANGS.map((lng) => {
                  const langEnabled = activeSourceMaterialLangSet.has(lng);
                  return (
                    <Button
                      key={lng}
                      type="button"
                      size="sm"
                      variant={sourceMaterialEditLang === lng ? "default" : "outline"}
                      className={cn(
                        "h-8 w-9 min-w-[2.25rem] px-0 text-xs font-semibold",
                        mediationLangButtonClassName(sourceMaterialEditLang === lng, langEnabled),
                      )}
                      disabled={isVisitorLocked || isLoading || analyzingImage || !langEnabled}
                      aria-pressed={sourceMaterialEditLang === lng}
                      onClick={() => handleSourceMaterialLangSelect(lng)}
                    >
                      {lng.toUpperCase()}
                    </Button>
                  );
                })}
              </div>
              <Textarea
                value={sourceMaterialByLang[sourceMaterialEditLang]}
                onChange={(e) => {
                  const v = e.target.value;
                  setSourceMaterialByLang((prev) => ({ ...prev, [sourceMaterialEditLang]: v }));
                }}
                disabled={isVisitorLocked || isLoading || analyzingImage}
                className={cn(
                  "min-w-0 flex-1 min-h-[170px] text-xs leading-relaxed transition-colors placeholder:text-xs",
                  notesFlash ? "border-amber-400 ring-2 ring-amber-300" : "",
                )}
                placeholder={t("source_material_placeholder")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("source_material_help")}
            </p>
            {analyzeTruncatedWarning ? (
              <Alert className="border-amber-300/80 bg-amber-50 text-amber-950">
                <AlertTitle>{t("analyze_truncated_title")}</AlertTitle>
                <AlertDescription className="text-xs">{analyzeTruncatedWarning}</AlertDescription>
              </Alert>
            ) : null}
            {(imagePersonasFromAnalysis ?? []).length > 0 ? (
              <details className="rounded-md border border-amber-200/60 bg-background/90 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-amber-950/90 hover:underline">
                  {t("analyze_personas_toggle")}
                </summary>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("analyze_personas_hint")}</p>
                <ul className="mt-2 list-none space-y-3 p-0">
                  {(imagePersonasFromAnalysis ?? []).map((persona, idx) => (
                    <li
                      key={`${String(persona.title)}-${idx}`}
                      className="rounded border border-border/40 bg-muted/20 p-2"
                    >
                      <p className="font-semibold text-amber-950">{persona.title || "—"}</p>
                      {persona.tone ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t("analyze_persona_tone")}: {persona.tone}
                        </p>
                      ) : null}
                      <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
                        {persona.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {allowsOptionalLang ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200/70 bg-amber-50/50 px-3 py-2">
                <Label htmlFor="mediation-optional-lang" className="text-xs text-amber-950 shrink-0">
                  {t("mediation_optional_lang_label", { primary: mediationPrimaryLang.toUpperCase() })}
                </Label>
                <div className="relative shrink-0">
                  <WorkflowStepBadge step={2} />
                  <select
                    id="mediation-optional-lang"
                    className="h-8 min-w-[5.5rem] rounded-md border border-amber-300/60 bg-background px-2 text-xs font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                    value={mediationOptionalLang ?? ""}
                    disabled={
                      !imageAnalysisDone ||
                      generatingMediation ||
                      regeneratingMediationStyleKey !== null ||
                      isLoading
                    }
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setMediationOptionalLang(
                        v && isMediationUiLang(v) ? v : null,
                      );
                    }}
                  >
                    <option value="">{t("mediation_optional_lang_none")}</option>
                    {MEDIATION_UI_LANGS.filter((lng) => lng !== mediationPrimaryLang).map((lng) => (
                      <option key={lng} value={lng}>
                        {lng.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] font-medium text-destructive shrink-0">
                  {t("mediation_optional_lang_limit_hint")}
                </p>
                <p className="w-full text-[11px] text-muted-foreground">{t("mediation_optional_lang_hint")}</p>
              </div>
            ) : null}
            <div className="relative w-fit max-w-full">
              <WorkflowStepBadge step={3} />
              <Button
                type="button"
                variant="secondary"
                className="gap-2 border border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100"
                disabled={!canGenerateMediations || isLoading}
                onClick={() => void handleGenerateMediations()}
              >
                {generatingMediation ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    {t("btn_generating")}
                  </>
                ) : !imageAnalysisDone ? (
                  t("btn_waiting_analyze")
                ) : sourceMaterialForGeneration.trim().length === 0 ? (
                  t("btn_waiting_notes")
                ) : (
                  t("btn_generate")
                )}
              </Button>
            </div>
            {generatingMediation && mediationProgress ? (
              <div className="pt-1">
                <MediationGenerationProgressBar
                  percent={mediationProgress.percent}
                  detail={mediationProgress.detail}
                />
              </div>
            ) : null}
            {lastMediationAnalyseFr ? (
              <details className="mt-2 rounded-md border border-amber-200/60 bg-background/90 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-amber-950/90 hover:underline">
                  {t("mediation_ai_analysis_toggle")}
                </summary>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("mediation_ai_analysis_hint")}</p>
                <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/40 bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                  {lastMediationAnalyseFr}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
        <AlertDialog
          open={langGeneratePrompt !== null}
          onOpenChange={(open) => {
            if (!open && langGeneratePrompt) {
              setMediationEditLang(langGeneratePrompt.lang);
              setLangGeneratePrompt(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {langGeneratePrompt
                  ? t("dialog_lang_generate_title", {
                      lang: langCodeForProgress(langGeneratePrompt.lang),
                    })
                  : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {langGeneratePrompt
                  ? t("dialog_lang_generate_desc", {
                      lang: langCodeForProgress(langGeneratePrompt.lang),
                      count: langGeneratePrompt.emptyPersonaCount,
                      persona: (styleTabs ?? []).find((s) => s.key === activeTab)?.label ?? activeTab,
                    })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  if (langGeneratePrompt) {
                    setMediationEditLang(langGeneratePrompt.lang);
                  }
                  setLangGeneratePrompt(null);
                }}
              >
                {t("dialog_lang_generate_no")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-700 text-white hover:bg-amber-800"
                onClick={() => {
                  const lng = langGeneratePrompt?.lang;
                  setLangGeneratePrompt(null);
                  if (lng) {
                    void handleGenerateAllPersonasForLang(lng, { onlyFillEmpty: true });
                  }
                }}
              >
                {t("dialog_lang_generate_yes")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={langAudioGeneratePrompt !== null}
          onOpenChange={(open) => {
            if (!open) setLangAudioGeneratePrompt(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {langAudioGeneratePrompt
                  ? t("dialog_lang_audio_title", {
                      lang: langCodeForProgress(langAudioGeneratePrompt.lang),
                    })
                  : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {langAudioGeneratePrompt
                  ? t("dialog_lang_audio_desc", {
                      lang: langCodeForProgress(langAudioGeneratePrompt.lang),
                    })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setLangAudioGeneratePrompt(null)}>
                {t("dialog_lang_audio_no")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-700 text-white hover:bg-amber-800"
                onClick={() => {
                  const lng = langAudioGeneratePrompt?.lang;
                  setLangAudioGeneratePrompt(null);
                  if (!lng || !persistedArtworkId) return;
                  const langKey = lng.trim().toLowerCase().slice(0, 2);
                  triggerMediationAudioForLang({
                    artworkId: persistedArtworkId,
                    lang: lng,
                    descriptionsByLang: serializeMediationDescriptionsByLang(descriptionsByLang),
                    stylePromptStyleIds: mediationStyleMap,
                  });
                  const cellsToQueue: string[] = [];
                  for (const tab of styleTabs ?? []) {
                    if (!tab.promptStyleId?.trim()) continue;
                    const text = (descriptionsByLang[langKey as MediationUiLang]?.[tab.key] ?? "").trim();
                    if (!text) continue;
                    cellsToQueue.push(audioVoiceCellKey(langKey, tab.promptStyleId));
                  }
                  setAudioOptimisticCells((prev) => {
                    const next = new Set(prev);
                    for (const cell of cellsToQueue) next.add(cell);
                    return [...next];
                  });
                  setAudioStatusRefreshKey((k) => k + 1);
                }}
              >
                {t("dialog_lang_audio_yes")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
            {MEDIATION_UI_LANGS.map((lng) => {
              const langEnabled = activeMediationLangSet.has(lng);
              return (
              <Button
                key={lng}
                type="button"
                size="sm"
                variant={mediationEditLang === lng ? "default" : "outline"}
                className={cn(
                  "h-8 min-w-[2.75rem] px-2 text-xs font-semibold",
                  mediationLangButtonClassName(mediationEditLang === lng, langEnabled),
                )}
                disabled={isAiBusy || isLoading || !langEnabled}
                onClick={() => handleMediationLangSelect(lng)}
              >
                {lng.toUpperCase()}
              </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{mediationLangHelp}</p>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DescriptionKey)}>
            <TabsList className="grid w-full grid-cols-4 gap-2 rounded-none border-0 bg-transparent p-2 text-amber-900 shadow-none [grid-auto-rows:minmax(0,auto)]">
              {(styleTabs ?? []).map((tab) => (
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
            {(styleTabs ?? []).map((tab) => {
              const placeholderLabel = [tab.icon?.trim(), tab.label.trim()].filter(Boolean).join(" ").trim();
              return (
              <TabsContent key={tab.key} value={tab.key}>
                <div className="mb-2 space-y-2">
                  <div className="flex flex-wrap items-end justify-end gap-x-2 gap-y-1">
                    <p className="w-[450px] py-1 text-[11px] font-medium leading-snug text-destructive">
                      {t("mediation_regenerate_hint_line1")}
                      <br />
                      {t("mediation_regenerate_hint_line2")}
                      <br />
                      {t("mediation_regenerate_hint_line3")}
                    </p>
                    <div className="relative shrink-0">
                      <WorkflowStepBadge step={4} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-amber-300/60 text-amber-900 hover:bg-amber-50"
                        disabled={
                          isVisitorLocked ||
                          isLoading ||
                          !artistId ||
                          !sourceMaterialForGeneration.trim() ||
                          generatingMediation ||
                          regeneratingMediationStyleKey !== null
                        }
                        aria-label={t("btn_regenerate_style_ai_aria", { label: tab.label })}
                        onClick={() => void handleRegenerateMediationForStyle(tab.key)}
                      >
                        {regeneratingMediationStyleKey === tab.key ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        {regeneratingMediationStyleKey === tab.key
                          ? t("btn_regenerating_style_ai")
                          : t("btn_regenerate_style_ai")}
                      </Button>
                    </div>
                  </div>
                  {regeneratingMediationStyleKey === tab.key && mediationProgress ? (
                    <MediationGenerationProgressBar
                      percent={mediationProgress.percent}
                      detail={mediationProgress.detail}
                    />
                  ) : null}
                </div>
                <Textarea
                  value={(descriptionsByLang?.[mediationEditLang] ?? {})[tab.key] ?? ""}
                  onChange={(e) =>
                    setDescriptionsByLang((prev) => ({
                      ...prev,
                      [mediationEditLang]: {
                        ...(prev[mediationEditLang] ?? {}),
                        [tab.key]: e.target.value,
                      },
                    }))
                  }
                  disabled={
                    isVisitorLocked ||
                    isLoading ||
                    generatingMediation ||
                    regeneratingMediationStyleKey !== null
                  }
                  className="min-h-[140px] w-full text-sm"
                  placeholder={t("tab_version_placeholder", { label: placeholderLabel })}
                />
                {persistedArtworkId && tab.promptStyleId ? (
                  <div className="mt-2">
                    <AudioPlayer
                      text_id={persistedArtworkId}
                      text_type="mediation"
                      lang={mediationEditLang}
                      prompt_style_id={tab.promptStyleId}
                      variant="onLight"
                      onGenerateClick={() =>
                        openPersonaAudioDialog(tab, { triggerGeneration: true })
                      }
                      onManageVoicesClick={() => openPersonaAudioDialog(tab)}
                    />
                  </div>
                ) : null}
              </TabsContent>
              );
            })}
          </Tabs>
        </div>
        </div>

      </DialogContent>
    </Dialog>
    {persistedArtworkId ? (
      <MediationPersonaAudioDialog
        open={mediationAudioDialogOpen}
        onOpenChange={(next) => {
          setMediationAudioDialogOpen(next);
          if (!next && closeOnMediationAudioClose) {
            onOpenChange(false);
          }
        }}
        artworkId={persistedArtworkId}
        personas={(styleTabs ?? []).map((tab) => ({
          key: tab.key,
          label: tab.label,
          promptStyleId: tab.promptStyleId,
        }))}
        languages={activeMediationLangs}
        descriptionsByLang={descriptionsByLang}
        refreshKey={audioStatusRefreshKey}
        optimisticCells={audioOptimisticCells}
        onOptimisticCellDone={(cellKey) =>
          setAudioOptimisticCells((prev) => prev.filter((key) => key !== cellKey))
        }
        onRetryCell={handlePersonaAudioRetryCell}
        onCancelCell={handlePersonaAudioCancelCell}
        onFillMissing={handleFillMissingMediationVoices}
      />
    ) : null}
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

