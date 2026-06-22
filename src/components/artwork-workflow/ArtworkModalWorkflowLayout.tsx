import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Loader2, RefreshCw, X } from "lucide-react";
import type { TFunction } from "i18next";

import { WorkflowRegenerationNotice } from "@/components/artwork-workflow/WorkflowRegenerationNotice";
import { WorkflowIaStatusBadges } from "@/components/artwork-workflow/WorkflowIaStatusBadges";
import { WorkflowPersonaVoiceStatus } from "@/components/artwork-workflow/WorkflowPersonaVoiceStatus";
import { MultiOptionalLangPicker } from "@/components/artwork-workflow/MultiOptionalLangPicker";
import type { MediationVoiceFillState } from "@/services/audioService";
import { ArtworkWorkflowMarkdown, isVerseMediationStyleKey } from "@/components/artwork-workflow/ArtworkWorkflowMarkdown";
import { PhotoCaptureField } from "@/components/artwork-workflow/PhotoCaptureField";
import { TextEditModal } from "@/components/artwork-workflow/TextEditModal";
import { WorkflowClassicTabNav, type WorkflowTabId } from "@/components/artwork-workflow/WorkflowClassicTabNav";
import { WorkflowStepIndicator } from "@/components/artwork-workflow/WorkflowStepIndicator";
import { MediationPersonaAudioPanel } from "@/components/MediationPersonaAudioPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { MediationDescriptionKey, MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { MEDIATION_UI_LANGS } from "@/lib/artworkDescriptionI18n";
import { cn } from "@/lib/utils";

type ArtistOption = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_nickname?: string | null;
};

type StyleTabEntry = {
  key: MediationDescriptionKey;
  label: string;
  icon?: string | null;
  promptStyleId?: string | null;
};

export type ArtworkModalWorkflowLayoutProps = {
  t: TFunction<"artwork_modal">;
  isEditingExisting: boolean;
  title: string;
  onTitleChange: (value: string) => void;
  agencyLabel: string;
  canPickAgency: boolean;
  agencyOptions: { id: string; name: string }[];
  artworkAgencyId: string;
  onAgencyChange: (id: string) => void;
  artworkAgencyOpen: boolean;
  onAgencyOpenChange: (open: boolean) => void;
  expoOptions: { id: string; name: string }[];
  artworkExpoId: string;
  onExpoChange: (id: string) => void;
  artworkExpoOpen: boolean;
  onExpoOpenChange: (open: boolean) => void;
  canManageExpoLink: boolean;
  artistSearch: string;
  onArtistSearchChange: (value: string) => void;
  showArtistSuggestions: boolean;
  onArtistSuggestionsOpen: (open: boolean) => void;
  selectedArtistDisplay: string;
  filteredArtists: ArtistOption[];
  artistId: string;
  onSelectArtist: (id: string, label: string) => void;
  onOpenCreateArtist: () => void;
  imageUrl: string;
  uploadingImage: boolean;
  onUploadImage: (file: File) => void;
  artworkQrImageUrl: string;
  coreFieldsComplete: boolean;
  imageAnalysisDone: boolean;
  hasMediations: boolean;
  workflowHasSavedOnce: boolean;
  isVisitorLocked: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  isAiBusy: boolean;
  canSave: boolean;
  canAnalyze: boolean;
  canGenerateMediations: boolean;
  canGenerateAudio: boolean;
  mediationGenerationBlocked: boolean;
  audioGenerationBlocked: boolean;
  canUnlockRegeneration: boolean;
  mediationUnlock: boolean;
  audioUnlock: boolean;
  onUnlockMediationGeneration: () => void;
  onUnlockAudioGeneration: () => void;
  voiceFillState: MediationVoiceFillState;
  audioStatusRefreshKey: number;
  analyzingImage: boolean;
  analyzeProgress: { percent: number; detail: string } | null;
  analyzeImageError: string | null;
  onAnalyze: () => void;
  onSave: () => void;
  onClose: () => void;
  onGenerateMediations: () => void;
  generatingMediation: boolean;
  mediationProgress: { percent: number; detail: string } | null;
  sourceMaterialPreview: string;
  sourceMaterialEditOpen: boolean;
  onSourceMaterialEditOpenChange: (open: boolean) => void;
  onSourceMaterialSave: (value: string) => void;
  mediationEditLang: MediationUiLang;
  onMediationLangSelect: (lang: MediationUiLang) => void;
  mediationLangHelp: string;
  planMaxMediationLangs: number;
  mediationPrimaryLang: MediationUiLang;
  workflowOptionalLangs: MediationUiLang[];
  onWorkflowOptionalLangsChange: (langs: MediationUiLang[]) => void;
  planAllowsOptionalLang: boolean;
  planEnabledLangSet: Set<MediationUiLang>;
  mediationLegacyLangs: MediationUiLang[];
  styleTabs: StyleTabEntry[];
  activeTab: MediationDescriptionKey;
  onActiveTabChange: (key: MediationDescriptionKey) => void;
  descriptionsByLang: Record<MediationUiLang, Record<MediationDescriptionKey, string>>;
  onMediationTextSave: (styleKey: MediationDescriptionKey, value: string) => void;
  mediationTextEdit: { styleKey: MediationDescriptionKey; label: string } | null;
  onMediationTextEditChange: (edit: { styleKey: MediationDescriptionKey; label: string } | null) => void;
  persistedArtworkId: string;
  isEtincellePlan: boolean;
  onOpenPersonaAudio: (tab: StyleTabEntry, options?: { triggerGeneration?: boolean }) => void;
  duplicateArtwork: { artwork_id: string; artwork_title: string | null } | null;
  checkingDuplicate: boolean;
  regeneratingMediationStyleKey: MediationDescriptionKey | null;
  onRegenerateMediationForStyle: (key: MediationDescriptionKey) => void;
  isEditingArtwork: boolean;
  artworkDraftLoading: boolean;
  artworkStatus: string;
  hasImageAnalysis: boolean;
  mediationCount: number;
  mediationLangsLabel: string;
  voiceReadyCount: number;
  voiceExpectedCount: number;
  voiceLangsLabel: string;
  onOpenMediationVoices?: () => void;
  activeMediationLangs: MediationUiLang[];
  audioOptimisticCells: readonly string[];
  onAudioOptimisticCellDone: (cellKey: string) => void;
  onAudioRetryCell: (lang: string, styleKey: string, promptStyleId: string) => void;
  onAudioCancelCell: (lang: string, promptStyleId: string) => void | Promise<void>;
  onFillMissingMediationVoices: () => void | Promise<void>;
  initialWorkflowTab?: WorkflowTabId;
};

function mediationLangButtonClassName(isSelected: boolean, langEnabled: boolean): string {
  if (!langEnabled) {
    return "border border-dashed border-muted-foreground/40 bg-muted/60 text-muted-foreground/50";
  }
  if (isSelected) {
    return "border-amber-700 bg-amber-700 text-white";
  }
  return "border-amber-500 bg-amber-50 text-amber-950";
}

function ProgressBar({ percent, detail }: { percent: number; detail: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <Progress value={clamped} className="h-2" />
      <div className="flex items-center justify-between gap-2 text-[11px] text-amber-800/90">
        <span className="min-w-0 truncate">{detail}</span>
        <span className="shrink-0 tabular-nums">{clamped} %</span>
      </div>
    </div>
  );
}

function TabPrerequisite({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function workflowTabStepDone(
  coreFieldsComplete: boolean,
  imageAnalysisDone: boolean,
  hasMediations: boolean,
  voiceAllReady: boolean,
  hasQrCode: boolean,
): Partial<Record<WorkflowTabId, boolean>> {
  return {
    identite: coreFieldsComplete,
    analyse: imageAnalysisDone,
    mediations: hasMediations,
    audio: voiceAllReady,
    qrcode: hasQrCode,
  };
}

const WORKFLOW_HEADER_STEPS: { id: WorkflowTabId; label: string; title: string; subtitle: string }[] = [
  { id: "identite", label: "Identité de l'œuvre", title: "Identité", subtitle: "de l'œuvre" },
  { id: "analyse", label: "Analyse de l'œuvre", title: "Analyse", subtitle: "de l'œuvre" },
  { id: "mediations", label: "Création des médiations", title: "Création", subtitle: "des médiations" },
  { id: "audio", label: "Création des audios", title: "Création", subtitle: "des audios" },
  { id: "qrcode", label: "Visualisation du QR-Code", title: "Visualisation", subtitle: "du QR-Code" },
];

export function ArtworkModalWorkflowLayout(props: ArtworkModalWorkflowLayoutProps) {
  const {
    t,
    isEditingExisting,
    title,
    onTitleChange,
    agencyLabel,
    canPickAgency,
    agencyOptions,
    artworkAgencyId,
    onAgencyChange,
    artworkAgencyOpen,
    onAgencyOpenChange,
    expoOptions,
    artworkExpoId,
    onExpoChange,
    artworkExpoOpen,
    onExpoOpenChange,
    canManageExpoLink,
    artistSearch,
    onArtistSearchChange,
    showArtistSuggestions,
    onArtistSuggestionsOpen,
    selectedArtistDisplay,
    filteredArtists,
    artistId,
    onSelectArtist,
    onOpenCreateArtist,
    imageUrl,
    uploadingImage,
    onUploadImage,
    artworkQrImageUrl,
    coreFieldsComplete,
    imageAnalysisDone,
    hasMediations,
    workflowHasSavedOnce,
    isVisitorLocked,
    isLoading,
    isSubmitting,
    isAiBusy,
    canSave,
    canAnalyze,
    canGenerateMediations,
    canGenerateAudio,
    mediationGenerationBlocked,
    audioGenerationBlocked,
    canUnlockRegeneration,
    mediationUnlock,
    audioUnlock,
    onUnlockMediationGeneration,
    onUnlockAudioGeneration,
    voiceFillState,
    audioStatusRefreshKey,
    analyzingImage,
    analyzeProgress,
    analyzeImageError,
    onAnalyze,
    onSave,
    onClose,
    onGenerateMediations,
    generatingMediation,
    mediationProgress,
    sourceMaterialPreview,
    sourceMaterialEditOpen,
    onSourceMaterialEditOpenChange,
    onSourceMaterialSave,
    mediationEditLang,
    onMediationLangSelect,
    mediationLangHelp,
    planMaxMediationLangs,
    mediationPrimaryLang,
    workflowOptionalLangs,
    onWorkflowOptionalLangsChange,
    planAllowsOptionalLang,
    planEnabledLangSet,
    mediationLegacyLangs,
    styleTabs,
    activeTab,
    onActiveTabChange,
    descriptionsByLang,
    onMediationTextSave,
    mediationTextEdit,
    onMediationTextEditChange,
    persistedArtworkId,
    isEtincellePlan,
    onOpenPersonaAudio,
    duplicateArtwork,
    checkingDuplicate,
    regeneratingMediationStyleKey,
    onRegenerateMediationForStyle,
    isEditingArtwork,
    artworkDraftLoading,
    artworkStatus,
    hasImageAnalysis,
    mediationCount,
    mediationLangsLabel,
    voiceReadyCount,
    voiceExpectedCount,
    voiceLangsLabel,
    onOpenMediationVoices,
    activeMediationLangs,
    audioOptimisticCells,
    onAudioOptimisticCellDone,
    onAudioRetryCell,
    onAudioCancelCell,
    onFillMissingMediationVoices,
    initialWorkflowTab,
  } = props;

  const statusKey = artworkStatus.trim().toLowerCase();
  const statusBadgeClass =
    statusKey === "active"
      ? "bg-emerald-600 text-white"
      : statusKey === "draft"
        ? "bg-amber-500 text-white"
        : statusKey === "inactive"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground";
  const statusBadgeLabel =
    statusKey === "active"
      ? "Activée"
      : statusKey === "draft"
        ? "Brouillon"
        : statusKey === "inactive"
          ? "Désactivée"
          : "Statut inconnu";

  const [workflowTab, setWorkflowTab] = useState<WorkflowTabId>(initialWorkflowTab ?? "identite");

  useEffect(() => {
    if (initialWorkflowTab) setWorkflowTab(initialWorkflowTab);
  }, [initialWorkflowTab]);

  const workflowStepDone = workflowTabStepDone(
    coreFieldsComplete,
    imageAnalysisDone,
    hasMediations,
    voiceFillState.allReady && voiceFillState.totalExpected > 0,
    Boolean(artworkQrImageUrl?.trim()),
  );

  const workflowSteps = WORKFLOW_HEADER_STEPS.map(({ id, label, title, subtitle }) => ({
    label,
    title,
    subtitle,
    state:
      workflowTab === id
        ? ("active" as const)
        : workflowStepDone[id]
          ? ("done" as const)
          : ("pending" as const),
  }));

  const mediationEditValue = mediationTextEdit
    ? (descriptionsByLang[mediationEditLang]?.[mediationTextEdit.styleKey] ?? "")
    : "";

  const openVoicesTab = () => {
    setWorkflowTab("audio");
    onOpenMediationVoices?.();
  };

  const audioPersonas = styleTabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    promptStyleId: tab.promptStyleId,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogTitle className="sr-only">
        {isEditingExisting ? t("title_edit") : t("title_new")}
        {title.trim() ? ` — ${title.trim()}` : ""}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {isEditingExisting ? t("dialog_edit_desc") : t("dialog_new_desc")}
      </DialogDescription>

      <div className="sticky top-0 z-30 border-b border-[#c92f3b] bg-[#E63946] px-3 py-2.5 shadow-sm max-sm:py-3.5 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-serif text-lg text-white sm:text-xl">
                {isEditingExisting ? t("title_edit") : t("title_new")}
              </h2>
              {isEditingExisting && statusKey ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    statusBadgeClass,
                  )}
                >
                  {statusBadgeLabel}
                </span>
              ) : null}
            </div>
            {isEditingExisting && title.trim() ? (
              <p className="truncate text-sm font-medium text-white/95">{title.trim()}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-9 border border-white bg-white px-3 text-sm font-semibold text-[#E63946]",
                "hover:bg-[#ffecef] hover:text-[#c92f3b]",
                !canSave && "pointer-events-none opacity-40",
              )}
              disabled={isVisitorLocked || isSubmitting || isLoading || isAiBusy || !canSave}
              onClick={onSave}
            >
              {isSubmitting ? t("btn_saving") : t("btn_save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-white hover:bg-white/20"
              disabled={isAiBusy}
              aria-label={t("btn_close_aria")}
              onClick={onClose}
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="mt-2 w-full max-sm:mt-2.5">
          <WorkflowStepIndicator steps={workflowSteps} variant="header" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4">
        {artworkDraftLoading ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-muted/20 py-16"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="h-8 w-8 animate-spin text-[#E63946]" aria-hidden />
            <p className="text-sm text-muted-foreground">Chargement de l&apos;œuvre…</p>
          </div>
        ) : (
          <>
        {isEditingExisting ? (
          <p className="rounded-md border border-[#E63946]/25 bg-[#fff5f6] px-3 py-2 text-xs text-[#9b1f2a]">
            Mode prototype — modification d&apos;une œuvre existante. Les données enregistrées sont
            préremplies ; vous pouvez reprendre le parcours à n&apos;importe quelle étape.
          </p>
        ) : null}

        {isVisitorLocked ? (
          <Alert variant="destructive">
            <AlertTitle>{t("alert_visitor_title")}</AlertTitle>
            <AlertDescription>{t("alert_visitor_desc")}</AlertDescription>
          </Alert>
        ) : null}

        {duplicateArtwork && !isEditingArtwork ? (
          <Alert variant="destructive">
            <AlertTitle>{t("alert_duplicate_title")}</AlertTitle>
            <AlertDescription>{t("alert_duplicate_desc")}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs
          value={workflowTab}
          onValueChange={(v) => setWorkflowTab(v as WorkflowTabId)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="sticky top-0 z-20 -mx-3 bg-background/95 px-3 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4">
            <WorkflowClassicTabNav stepDone={workflowStepDone} />
          </div>

          <TabsContent value="identite" className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none">
        <section className="space-y-3 rounded-lg border border-border/60 bg-background/80 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("label_agency")}</Label>
            {canPickAgency ? (
              <Popover open={artworkAgencyOpen} onOpenChange={onAgencyOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between text-sm font-normal"
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
                <PopoverContent className="w-[min(calc(100vw-2rem),320px)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("agency_search_placeholder")} />
                    <CommandList>
                      <CommandEmpty>{t("agency_empty")}</CommandEmpty>
                      <CommandGroup>
                        {agencyOptions.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={a.name}
                            onSelect={() => {
                              onAgencyChange(a.id);
                              onAgencyOpenChange(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                artworkAgencyId === a.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {a.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Input value={agencyLabel} disabled readOnly className="h-10 bg-muted/40 text-sm" />
            )}
          </div>

          {canManageExpoLink ? (
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("label_expo")} <span className="text-destructive">*</span>
              </Label>
              <Popover open={artworkExpoOpen} onOpenChange={onExpoOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between text-sm font-normal"
                    disabled={isVisitorLocked || isLoading}
                  >
                    <span className="truncate">
                      {artworkExpoId
                        ? (expoOptions.find((e) => e.id === artworkExpoId)?.name ?? t("expo_unknown"))
                        : t("expo_select_placeholder")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(calc(100vw-2rem),320px)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("expo_search_placeholder")} />
                    <CommandList>
                      <CommandEmpty>{t("expo_empty")}</CommandEmpty>
                      <CommandGroup>
                        {expoOptions.map((e) => (
                          <CommandItem
                            key={e.id}
                            value={e.name}
                            onSelect={() => {
                              onExpoChange(e.id);
                              onExpoOpenChange(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                artworkExpoId === e.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {e.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("label_title")} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={isVisitorLocked || isLoading}
              className="h-10 text-sm"
              placeholder="Nom de l'œuvre"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("label_artist")} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                value={artistSearch}
                onChange={(e) => {
                  onArtistSearchChange(e.target.value);
                  onArtistSuggestionsOpen(true);
                }}
                onFocus={() => onArtistSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => onArtistSuggestionsOpen(false), 120)}
                placeholder={selectedArtistDisplay}
                disabled={isVisitorLocked || isLoading}
                className="h-10 text-sm"
              />
              {showArtistSuggestions ? (
                <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
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
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={onOpenCreateArtist}
                    >
                      <span className="text-base leading-none">+</span>
                      {t("btn_create_artist")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Photo de l&apos;œuvre <span className="text-destructive">*</span>
            </Label>
            <PhotoCaptureField
              imageUrl={imageUrl}
              uploading={uploadingImage}
              disabled={isVisitorLocked || isLoading}
              onFileSelected={onUploadImage}
            />
          </div>

          {checkingDuplicate ? (
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("checking_duplicate")}
            </p>
          ) : null}
        </section>
          </TabsContent>

          <TabsContent value="analyse" className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none">
        {!coreFieldsComplete ? (
          <TabPrerequisite>
            Complétez d&apos;abord l&apos;onglet Identité (exposition, titre, artiste, photo) puis enregistrez.
          </TabPrerequisite>
        ) : (
          <section className="space-y-3 rounded-lg border border-amber-200/70 bg-amber-50/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Analyse de l&apos;image
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 w-full gap-1 border border-amber-300/60 bg-amber-50 text-amber-900 sm:w-auto"
                disabled={!canAnalyze}
                onClick={onAnalyze}
              >
                {analyzingImage ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("btn_analyzing")}
                  </>
                ) : (
                  t("btn_analyze")
                )}
              </Button>
            </div>

            {analyzeProgress ? <ProgressBar percent={analyzeProgress.percent} detail={analyzeProgress.detail} /> : null}

            {analyzeImageError ? (
              <Alert variant="destructive">
                <AlertTitle>{t("analyze_error_title")}</AlertTitle>
                <AlertDescription className="text-xs">{analyzeImageError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs">{t("label_source_material")}</Label>
              <button
                type="button"
                className={cn(
                  "w-full rounded-md border border-amber-200/80 bg-background px-3 py-2 text-left",
                  "hover:border-amber-400 hover:bg-amber-50/50",
                  !sourceMaterialPreview.trim() && "text-muted-foreground italic text-xs",
                )}
                disabled={!imageAnalysisDone || isVisitorLocked || isLoading}
                onClick={() => onSourceMaterialEditOpenChange(true)}
              >
                {sourceMaterialPreview.trim() ? (
                  <ArtworkWorkflowMarkdown text={sourceMaterialPreview} clampPreview />
                ) : (
                  "Cliquez pour saisir ou modifier la description…"
                )}
              </button>
            </div>
          </section>
        )}
          </TabsContent>

          <TabsContent value="mediations" className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none">
        {!imageAnalysisDone ? (
          <TabPrerequisite>
            Effectuez d&apos;abord l&apos;analyse de l&apos;image dans l&apos;onglet Analyse.
          </TabPrerequisite>
        ) : (
          <section className="space-y-3 rounded-lg border border-amber-200/70 bg-amber-50/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Médiations IA
            </p>

            {planAllowsOptionalLang || planMaxMediationLangs <= 1 ? (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t("mediation_optional_lang_label", { primary: mediationPrimaryLang.toUpperCase() })}
                </Label>
                <MultiOptionalLangPicker
                  primaryLang={mediationPrimaryLang}
                  availableLangs={[...MEDIATION_UI_LANGS]}
                  selectedLangs={workflowOptionalLangs}
                  maxOptional={Math.max(0, planMaxMediationLangs - 1)}
                  disabled={generatingMediation || isLoading || planMaxMediationLangs <= 1}
                  onChange={onWorkflowOptionalLangsChange}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
              <Button
                type="button"
                className="h-10 w-full gap-2 border border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100 sm:w-auto"
                variant="secondary"
                disabled={!canGenerateMediations}
                onClick={onGenerateMediations}
              >
                {generatingMediation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("btn_generating")}
                  </>
                ) : (
                  t("btn_generate")
                )}
              </Button>
              {mediationGenerationBlocked ? (
                <WorkflowRegenerationNotice
                  className="flex-1"
                  lines={[
                    "Les textes de médiation ont tous été déjà générés.",
                    "Une 2e génération n'est plus possible.",
                    "Mais vous pouvez toujours modifier ce texte en cliquant sur le texte.",
                  ]}
                  canUnlock={canUnlockRegeneration}
                  unlocked={mediationUnlock}
                  onUnlock={onUnlockMediationGeneration}
                />
              ) : null}
            </div>

            {mediationProgress ? (
              <ProgressBar percent={mediationProgress.percent} detail={mediationProgress.detail} />
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs">{t("label_mediations")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {MEDIATION_UI_LANGS.map((lng) => {
                  const langEnabled =
                    planEnabledLangSet.has(lng) || mediationLegacyLangs.includes(lng);
                  return (
                    <Button
                      key={lng}
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-8 min-w-[2.5rem] px-2 text-xs font-semibold",
                        mediationLangButtonClassName(mediationEditLang === lng, langEnabled),
                      )}
                      disabled={isAiBusy || isLoading || !langEnabled}
                      onClick={() => onMediationLangSelect(lng)}
                    >
                      {lng.toUpperCase()}
                    </Button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">{mediationLangHelp}</p>

              <WorkflowIaStatusBadges
                hasImageAnalysis={hasImageAnalysis}
                mediationCount={mediationCount}
                mediationLangsLabel={mediationLangsLabel}
                voiceReadyCount={voiceReadyCount}
                voiceExpectedCount={voiceExpectedCount}
                voiceLangsLabel={voiceLangsLabel}
                onOpenVoices={openVoicesTab}
              />

              <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as MediationDescriptionKey)}>
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 bg-transparent p-0 sm:grid-cols-4">
                  {styleTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className="min-h-[2.75rem] rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[11px] data-[state=active]:bg-amber-100 sm:text-xs"
                    >
                      {tab.icon ? <span className="mr-1">{tab.icon}</span> : null}
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {styleTabs.map((tab) => {
                  const text = (descriptionsByLang[mediationEditLang]?.[tab.key] ?? "").trim();
                  return (
                    <TabsContent key={tab.key} value={tab.key} className="mt-2 space-y-2">
                      <button
                        type="button"
                        className={cn(
                          "min-h-[120px] w-full rounded-md border border-border/60 bg-background px-3 py-2 text-left",
                          "hover:border-amber-400 hover:bg-amber-50/30",
                          !text && "italic text-muted-foreground text-sm",
                        )}
                        disabled={isVisitorLocked || isLoading || generatingMediation}
                        onClick={() => onMediationTextEditChange({ styleKey: tab.key, label: tab.label })}
                      >
                        {text ? (
                          <ArtworkWorkflowMarkdown
                            text={text}
                            clampPreview
                            className="text-sm"
                            verseMode={isVerseMediationStyleKey(tab.key)}
                          />
                        ) : (
                          t("tab_version_placeholder", { label: tab.label })
                        )}
                      </button>
                      {persistedArtworkId ? (
                        <WorkflowPersonaVoiceStatus
                          artworkId={persistedArtworkId}
                          lang={mediationEditLang}
                          promptStyleId={tab.promptStyleId}
                          hasText={Boolean(text)}
                          refreshKey={audioStatusRefreshKey}
                        />
                      ) : null}
                      {!isEtincellePlan ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          disabled={
                            isVisitorLocked ||
                            isLoading ||
                            generatingMediation ||
                            mediationGenerationBlocked
                          }
                          onClick={() => onRegenerateMediationForStyle(tab.key)}
                        >
                          {regeneratingMediationStyleKey === tab.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          {t("btn_regenerate_style_ai")}
                        </Button>
                      ) : null}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </section>
        )}
          </TabsContent>

          <TabsContent value="audio" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:outline-none">
        {!hasMediations ? (
          <TabPrerequisite>
            Générez d&apos;abord les médiations dans l&apos;onglet Médiations.
          </TabPrerequisite>
        ) : !workflowHasSavedOnce || !persistedArtworkId ? (
          <TabPrerequisite>
            Enregistrez l&apos;œuvre pour activer la génération des guides audio.
          </TabPrerequisite>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {audioGenerationBlocked ? (
              <WorkflowRegenerationNotice
                lines={[
                  "Les guides audio ont tous été déjà générés.",
                  "Une 2e génération globale n'est plus possible.",
                  "Vous pouvez toujours écouter ou gérer les voix existantes ci-dessous.",
                ]}
                canUnlock={canUnlockRegeneration}
                unlocked={audioUnlock}
                onUnlock={onUnlockAudioGeneration}
              />
            ) : null}
            <MediationPersonaAudioPanel
              active={workflowTab === "audio"}
              artworkId={persistedArtworkId}
              personas={audioPersonas}
              languages={activeMediationLangs}
              descriptionsByLang={descriptionsByLang}
              refreshKey={audioStatusRefreshKey}
              optimisticCells={audioOptimisticCells}
              onOptimisticCellDone={onAudioOptimisticCellDone}
              onRetryCell={onAudioRetryCell}
              onCancelCell={onAudioCancelCell}
              onFillMissing={onFillMissingMediationVoices}
              variant="inline"
            />
          </div>
        )}
          </TabsContent>

          <TabsContent value="qrcode" className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none">
        {!hasMediations ? (
          <TabPrerequisite>
            Le QR code visiteur est généré après la création des médiations.
          </TabPrerequisite>
        ) : artworkQrImageUrl ? (
          <section className="flex flex-col items-center gap-4 rounded-lg border border-amber-200/70 bg-amber-50/40 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">QR code visiteur</p>
            <img
              src={artworkQrImageUrl}
              alt={t("qr_alt")}
              className="h-44 w-44 rounded-lg border border-white bg-white object-contain shadow-md sm:h-52 sm:w-52"
            />
            <p className="max-w-sm text-center text-xs text-muted-foreground">
              Scannez ce code pour accéder à la fiche publique de l&apos;œuvre.
            </p>
          </section>
        ) : (
          <TabPrerequisite>
            Enregistrez l&apos;œuvre avec des médiations actives pour générer le QR code.
          </TabPrerequisite>
        )}
          </TabsContent>
        </Tabs>
          </>
        )}
      </div>

      <TextEditModal
        open={sourceMaterialEditOpen}
        onOpenChange={onSourceMaterialEditOpenChange}
        title={t("label_source_material")}
        description="Décrivez l'œuvre ou les intentions de l'artiste pour alimenter les médiations IA."
        value={sourceMaterialPreview}
        onSave={onSourceMaterialSave}
        placeholder={t("source_material_placeholder")}
        editorKind="prose"
        contentLang={mediationPrimaryLang}
      />

      {mediationTextEdit ? (
        <TextEditModal
          open
          onOpenChange={(open) => {
            if (!open) onMediationTextEditChange(null);
          }}
          title={`Médiation — ${mediationTextEdit.label}`}
          description={`Langue : ${mediationEditLang.toUpperCase()}`}
          value={mediationEditValue}
          onSave={(value) => onMediationTextSave(mediationTextEdit.styleKey, value)}
          placeholder={t("tab_version_placeholder", { label: mediationTextEdit.label })}
          editorKind="mediation"
          contentLang={mediationEditLang}
        />
      ) : null}
    </div>
  );
}
