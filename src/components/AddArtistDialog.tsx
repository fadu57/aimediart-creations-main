import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarIcon, ChevronDown, ImageIcon, Loader2, X } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { artistsMatchForDuplicate, computeArtistControl } from "@/lib/artistControl";
import {
  ARTIST_TYPE_OPTIONS,
  SOCIAL_LINK_TYPES,
  emptySocialRecord,
  type SocialLinkType,
} from "@/lib/artistFormConstants";
import { generateMultilingualBiographyWithGrok } from "@/lib/grokBio";
import { clampLocalDay, coerceFormDate, computeArtistAgeYears, parseDateOnlyString, resolveArtistBirthDate, startOfLocalDay } from "@/lib/artistAge";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { removeSupabaseStorageObjectByPublicUrl } from "@/lib/supabaseStorage";
import { uploadCatalogArtistPhoto } from "@/lib/storagePaths";
import { ARTIST_PHOTO_PLACEHOLDER } from "@/lib/artistAssets";
import {
  ARTIST_BIO_LANGUAGES,
  EMPTY_BIOS,
  hasAnyBioText,
  loadArtistBioFormData,
  loadArtistBiosForForm,
  upsertArtistBioRow,
  type Language,
} from "@/hooks/useArtistBios";
import { AudioVoiceLangStatus } from "@/components/AudioVoiceLangStatus";
import { resolveBioPromptStyleId } from "@/services/audioService";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  normalizePostalCode,
  postalPlaceholderForCountryLabel,
  validatePostalCodeForCountryLabel,
} from "@/lib/postalCode";

import { Button } from "@/components/ui/button";
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
import { BirthDatePickerFr } from "@/components/BirthDatePickerFr";
import { CountryFlagIcon } from "@/components/CountryFlagIcon";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function RequiredAsterisk() {
  return (
    <span className="text-destructive ml-0.5 font-semibold leading-none" aria-hidden>
      *
    </span>
  );
}

function normalizePickerDate(date: Date | undefined): Date | undefined {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
  return date;
}

function ArtistAgeDisplay({ ageYears, missingText, yearsText }: {
  ageYears: number | null;
  missingText: string;
  yearsText: string;
}) {
  return (
    <p className="text-sm font-black text-center text-muted-foreground tabular-nums">
      {ageYears === null ? missingText : yearsText}
    </p>
  );
}

const socialSchema = z.record(z.string());

const artistFormSchemaBase = z.object({
  artist_firstname: z.string().min(1, "Le prénom est obligatoire.").trim(),
  artist_lastname: z.string().min(1, "Le nom est obligatoire.").trim(),
  artist_typ: z.array(z.string()).min(1, "Sélectionnez au moins un type d’art."),
  country: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  artist_nickname: z.string().optional(),
  artist_photo_url: z.string().optional(),
  email: z.union([z.literal(""), z.string().email("Format d’e-mail invalide.")]).optional(),
  phone: z.string().optional(),
  birth_date: z.date().optional().nullable(),
  death_date: z.date().optional().nullable(),
  artist_vivant: z.boolean().default(true),
  social: socialSchema.optional(),
});

const artistFormSchema = artistFormSchemaBase.superRefine((data, ctx) => {
  const today = startOfLocalDay(new Date());
  const birth = coerceFormDate(data.birth_date);
  const death = coerceFormDate(data.death_date);

  if (birth && birth > today) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["birth_date"],
      message: "La date de naissance ne peut pas être postérieure à aujourd’hui.",
    });
  }

  if (data.artist_vivant === false) {
    if (death && death > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["death_date"],
        message: "La date de décès ne peut pas être postérieure à aujourd’hui.",
      });
    }
    if (birth && death && death < birth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birth_date"],
        message: "La date de naissance doit être antérieure à la date de décès.",
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["death_date"],
        message: "La date de décès doit être postérieure à la date de naissance.",
      });
    }
    return;
  }

  const normalizedPostal = normalizePostalCode(data.postalCode ?? "");
  if (!normalizedPostal) return;

  const res = validatePostalCodeForCountryLabel(normalizedPostal, data.country ?? "");
  if (res.ok === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["postalCode"],
      message: res.message,
    });
  }
});

export type ArtistFormInput = z.infer<typeof artistFormSchema>;

type ArtistsTableUpdate = Database["public"]["Tables"]["artists"]["Update"];
type ArtistsTableInsert = Database["public"]["Tables"]["artists"]["Insert"];

type DbArtistRow = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_pays?: string | null;
  /** @deprecated côté DB à privilégier `artist_pays` ; conservé pour lecture héritée. */
  pays?: string | null;
  artist_adresse?: string | null;
  artist_adresse2?: string | null;
  artist_ville?: string | null;
  artist_address?: string | null;
  artist_zipcode?: string | null;
  artist_city?: string | null;
  artist_nickname?: string | null;
  artist_photo_url?: string | null;
  artist_email?: string | null;
  artist_phone?: string | null;
  artist_birth_date?: string | null;
  artist_death_date?: string | null;
  artist_vivant?: boolean | null;
  artist_typ?: string | string[] | null;
  artist_control?: string | null;
  initiale_artist?: string | null;
};

function parseArtistTypFromDb(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    return raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

const ART_TYPES_PREVIEW_MAX = 2;

function formatArtTypesButtonLabel(types: string[], moreLabel: (count: number) => string): string {
  if (!types.length) return "";
  const head = types.slice(0, ART_TYPES_PREVIEW_MAX).join(", ");
  const rest = types.length - ART_TYPES_PREVIEW_MAX;
  if (rest > 0) return `${head} ${moreLabel(rest)}`;
  return head;
}

function getDefaultValues(): ArtistFormInput {
  return {
    artist_firstname: "",
    artist_lastname: "",
    country: "France",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    city: "",
    artist_nickname: "",
    artist_photo_url: "",
    email: "",
    phone: "",
    birth_date: undefined,
    death_date: undefined,
    artist_vivant: true,
    artist_typ: [],
    social: emptySocialRecord(),
  };
}

/** Empreinte stable des champs RHF pour détecter toute modification (hors bios / agence / photo). */
function serializeArtistFormSnapshot(values: ArtistFormInput): string {
  const birth = coerceFormDate(values.birth_date);
  const death = coerceFormDate(values.death_date);
  const social = values.social ?? emptySocialRecord();

  return JSON.stringify({
    artist_firstname: (values.artist_firstname ?? "").trim(),
    artist_lastname: (values.artist_lastname ?? "").trim(),
    artist_typ: [...(values.artist_typ ?? [])].sort(),
    country: values.country ?? "",
    addressLine1: (values.addressLine1 ?? "").trim(),
    addressLine2: (values.addressLine2 ?? "").trim(),
    postalCode: normalizePostalCode(values.postalCode ?? ""),
    city: (values.city ?? "").trim(),
    artist_nickname: (values.artist_nickname ?? "").trim(),
    artist_photo_url: (values.artist_photo_url ?? "").trim(),
    email: (values.email ?? "").trim(),
    phone: (values.phone ?? "").trim(),
    birth_date: birth ? format(birth, "yyyy-MM-dd") : null,
    death_date: death ? format(death, "yyyy-MM-dd") : null,
    artist_vivant: values.artist_vivant !== false,
    social: Object.fromEntries(
      SOCIAL_LINK_TYPES.map((type) => [type, (social[type] ?? "").trim()] as const),
    ),
  });
}

const ARTIST_BIRTH_YEAR_MIN = 1800;

export type AddArtistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (artistId: string) => void;
  artistId?: string | null;
  /** Page /artist/edit : ouvrir directement en mode édition (pas lecture seule). */
  initialEditMode?: boolean;
};

export function AddArtistDialog({
  open,
  onOpenChange,
  onSuccess,
  artistId: artistIdProp,
  initialEditMode = false,
}: AddArtistDialogProps) {
  const { t } = useTranslation("artists");
  const { user, agency_id } = useAuthUser();
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const bypassCloseConfirmRef = useRef(false);
  const pendingPhotoFileRef = useRef<File | null>(null);
  const photoDirtyRef = useRef(false);
  const artistBiosRef = useRef<Record<Language, string>>({ ...EMPTY_BIOS });
  const artistBiosFromDbRef = useRef<Record<Language, string>>({ ...EMPTY_BIOS });
  /** Agence enregistrée au chargement de la fiche (hors react-hook-form). */
  const savedAgencyIdRef = useRef("");
  /** Valeurs RHF au dernier chargement / enregistrement réussi. */
  const initialFormSnapshotRef = useRef("");
  /** `artist_bios` chargées depuis la base (évite d’écraser les bios si save avant fin de load). */
  const biosLoadedRef = useRef(false);
  const editingArtistIdRef = useRef<string | null>(null);
  const loadArtistIntoFormRef = useRef<(row: DbArtistRow) => Promise<void>>(async () => {});
  const initialLoadDoneRef = useRef<string | null>(null);
  const artistLoadInFlightRef = useRef<string | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const photoChangeTokenRef = useRef(0);

  onOpenChangeRef.current = onOpenChange;

  const markPhotoAsChanged = useCallback((file: File | null) => {
    if (!file) {
      photoChangeTokenRef.current = 0;
      setPendingPhotoFile(null);
      setPhotoDirty(false);
      photoDirtyRef.current = false;
      pendingPhotoFileRef.current = null;
      return;
    }

    photoChangeTokenRef.current += 1;
    setPendingPhotoFile(file);
    setPhotoDirty(true);
    photoDirtyRef.current = true;
    pendingPhotoFileRef.current = file;
  }, []);

  const clearPendingPhotoState = useCallback(() => {
    photoChangeTokenRef.current = 0;
    setPendingPhotoFile(null);
    setPhotoDirty(false);
    photoDirtyRef.current = false;
    pendingPhotoFileRef.current = null;
  }, []);

  const [editingArtistId, setEditingArtistId] = useState<string | null>(null);
  const [ficheReadOnly, setFicheReadOnly] = useState(false);
  const [duplicateRow, setDuplicateRow] = useState<DbArtistRow | null>(null);
  const [duplicateBioFr, setDuplicateBioFr] = useState("");
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [forceCreateDespiteDuplicate, setForceCreateDespiteDuplicate] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  const [typesPopoverOpen, setTypesPopoverOpen] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoDirty, setPhotoDirty] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [internalOpen, setInternalOpen] = useState(open);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  /** Agence pour lecture / écriture des bios (session > détail fiche > agency_users). */
  const [resolvedArtistAgencyId, setResolvedArtistAgencyId] = useState("");
  const [phoneValid, setPhoneValid] = useState(true);
  const [activeLanguage, setActiveLanguage] = useState<Language>("fr");
  /** Contenu des textarea — chargé depuis `artist_bios`, modifié localement ensuite. */
  const [artistBios, setArtistBios] = useState<Record<Language, string>>(() => ({ ...EMPTY_BIOS }));
  const [artistBioRowIds, setArtistBioRowIds] = useState<Partial<Record<Language, string>>>({});
  const [bioPromptStyleId, setBioPromptStyleId] = useState<string | null>(null);
  const [audioStatusRefreshKey, setAudioStatusRefreshKey] = useState(0);
  const [biosLoading, setBiosLoading] = useState(false);

  const form = useForm<ArtistFormInput>({
    resolver: zodResolver(artistFormSchema),
    defaultValues: getDefaultValues(),
  });

  const { isDirty } = useFormState({ control: form.control });
  const watchedFormValues = useWatch({ control: form.control });

  const firstname = useWatch({ control: form.control, name: "artist_firstname" });
  const lastname = useWatch({ control: form.control, name: "artist_lastname" });
  const artistTyp = useWatch({ control: form.control, name: "artist_typ" });
  const country = useWatch({ control: form.control, name: "country" });
  const artistVivant = useWatch({ control: form.control, name: "artist_vivant" });
  const [birthDateWatched, deathDateWatched] = form.watch(["birth_date", "death_date"]);
  const photoUrl = useWatch({ control: form.control, name: "artist_photo_url" });

  const artistAgeYears = computeArtistAgeYears(
    birthDateWatched,
    deathDateWatched,
    artistVivant !== false,
  );

  const today = startOfLocalDay(new Date());
  const birthDateBound = coerceFormDate(birthDateWatched);
  const deathDateBound = coerceFormDate(deathDateWatched);
  const birthPickerMin = useMemo(() => new Date(ARTIST_BIRTH_YEAR_MIN, 0, 1), []);
  const birthPickerMax =
    artistVivant === false && deathDateBound
      ? deathDateBound < today
        ? deathDateBound
        : today
      : today;
  const deathPickerMin = birthDateBound ?? birthPickerMin;
  const deathPickerMax = today;

  useEffect(() => {
    if (artistVivant !== false) return;

    const birth = coerceFormDate(form.getValues("birth_date"));
    const death = coerceFormDate(form.getValues("death_date"));
    if (!birth || !death) return;

    const maxBirth = death < today ? death : today;
    if (birth > maxBirth) {
      form.setValue("birth_date", maxBirth, {
        shouldDirty: true,
        shouldValidate: true,
        shouldNotify: true,
      });
    } else if (death < birth) {
      form.setValue("death_date", birth, {
        shouldDirty: true,
        shouldValidate: true,
        shouldNotify: true,
      });
    }
  }, [artistVivant, birthDateWatched, deathDateWatched, form, today]);

  const bioArtistId = useMemo(() => {
    const id = (artistIdProp ?? editingArtistId ?? "").trim();
    return id || null;
  }, [artistIdProp, editingArtistId]);

  /** Une seule requête `artist_bios` par artist_id — aucune autre table, aucun re-fetch agence. */
  useEffect(() => {
    if (!bioArtistId) {
      setArtistBios({ ...EMPTY_BIOS });
      setArtistBioRowIds({});
      artistBiosFromDbRef.current = { ...EMPTY_BIOS };
      biosLoadedRef.current = true;
      setBiosLoading(false);
      return;
    }

    let cancelled = false;
    setBiosLoading(true);
    biosLoadedRef.current = false;

    void (async () => {
      try {
        const loaded = await loadArtistBioFormData(bioArtistId);
        if (cancelled) return;
        setArtistBios(loaded.texts);
        setArtistBioRowIds(loaded.rowIds);
        artistBiosFromDbRef.current = loaded.texts;
        biosLoadedRef.current = true;
        if (import.meta.env.DEV) {
          console.debug("[AddArtistDialog] artist_bios", bioArtistId, loaded);
        }
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : "Chargement impossible.";
        toast.error(`artist_bios : ${msg}`);
        console.warn("[AddArtistDialog] artist_bios", msg);
        biosLoadedRef.current = false;
      } finally {
        if (!cancelled) {
          setBiosLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bioArtistId]);

  useEffect(() => {
    void resolveBioPromptStyleId().then(setBioPromptStyleId);
  }, []);

  const bioAudioTargetsByLang = useMemo(() => {
    const map: Record<string, { lang: string; text_id: string; prompt_style_id: string } | null> = {};
    if (!bioPromptStyleId) return map;
    for (const lang of ARTIST_BIO_LANGUAGES) {
      const rowId = artistBioRowIds[lang];
      const hasText = (artistBios[lang] ?? "").trim().length > 0;
      map[lang] = rowId && hasText
        ? { lang, text_id: rowId, prompt_style_id: bioPromptStyleId }
        : null;
    }
    return map;
  }, [artistBioRowIds, artistBios, bioPromptStyleId]);

  useEffect(() => {
    if (open) {
      setInternalOpen(true);
      bypassCloseConfirmRef.current = false;
      return;
    }
    setInternalOpen(false);
    setDiscardDialogOpen(false);
  }, [open]);

  useEffect(() => {
    void form.trigger("postalCode");
  }, [country, form]);

  const previewSrc = useMemo(() => {
    if (pendingPhotoFile) {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      const url = URL.createObjectURL(pendingPhotoFile);
      previewObjectUrlRef.current = url;
      return url;
    }
    const trimmed = (photoUrl ?? "").trim();
    return trimmed || ARTIST_PHOTO_PLACEHOLDER;
  }, [pendingPhotoFile, photoUrl]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  const resetAll = useCallback(() => {
    const defaults = getDefaultValues();
    form.reset(defaults);
    initialFormSnapshotRef.current = serializeArtistFormSnapshot(defaults);
    biosLoadedRef.current = true;
    setEditingArtistId(null);
    setFicheReadOnly(false);
    setDuplicateRow(null);
    setDuplicateBioFr("");
    setIsDuplicateModalOpen(false);
    setForceCreateDespiteDuplicate(false);
    clearPendingPhotoState();
    setProcessingPhoto(false);
    setCheckingDuplicate(false);
    setGeneratingBio(false);
    setActiveLanguage("fr");
    setResolvedArtistAgencyId("");
    savedAgencyIdRef.current = "";
    setPhoneValid(true);
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  }, [clearPendingPhotoState, form]);

  const hasTripleRequired =
    Boolean(firstname?.trim()) && Boolean(lastname?.trim()) && (artistTyp?.length ?? 0) >= 1;

  const artistControlLive = useMemo(() => {
    if (!hasTripleRequired) return "";
    return computeArtistControl(firstname.trim(), lastname.trim(), artistTyp);
  }, [firstname, lastname, artistTyp, hasTripleRequired]);

  const duplicateLookupKey = useMemo(() => {
    if (!hasTripleRequired) return "";
    return `${firstname?.trim()}\u0000${lastname?.trim()}\u0000${[...(artistTyp ?? [])].sort().join("|")}`;
  }, [firstname, lastname, artistTyp, hasTripleRequired]);

  useEffect(() => {
    setForceCreateDespiteDuplicate(false);
  }, [duplicateLookupKey]);

  useEffect(() => {
    if (!open || !hasTripleRequired || ficheReadOnly) {
      setDuplicateRow(null);
      setDuplicateBioFr("");
      setIsDuplicateModalOpen(false);
      return;
    }

    const fn = firstname?.trim() ?? "";
    const ln = lastname?.trim() ?? "";
    const types = artistTyp ?? [];

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setCheckingDuplicate(true);

        const { data, error } = await supabase
          .from("artists")
          .select("*")
          .is("deleted_at", null)
          .ilike("artist_firstname", fn)
          .ilike("artist_lastname", ln);

        if (cancelled) return;

        setCheckingDuplicate(false);

        if (error) {
          console.warn("Doublon :", error.message);
          setDuplicateRow(null);
          setDuplicateBioFr("");
          return;
        }

        const rows = (data as DbArtistRow[] | null) ?? [];
        const match =
          rows.find(
            (row) =>
              row.artist_id !== editingArtistId &&
              artistsMatchForDuplicate(
                fn,
                ln,
                types,
                row.artist_firstname ?? "",
                row.artist_lastname ?? "",
                parseArtistTypFromDb(row.artist_typ),
              ),
          ) ?? null;

        setDuplicateRow(match);
        if (!match?.artist_id) {
          setDuplicateBioFr("");
          return;
        }

        try {
          const bios = await loadArtistBiosForForm(match.artist_id);
          if (!cancelled) setDuplicateBioFr((bios.fr ?? "").trim());
        } catch {
          if (!cancelled) setDuplicateBioFr("");
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, duplicateLookupKey, hasTripleRequired, firstname, lastname, artistTyp, editingArtistId, ficheReadOnly]);

  const canShowGenerateBio = !ficheReadOnly;

  pendingPhotoFileRef.current = pendingPhotoFile;
  photoDirtyRef.current = photoDirty;
  artistBiosRef.current = artistBios;
  editingArtistIdRef.current = editingArtistId;

  const formFieldsChanged = useMemo(() => {
    const snapshot = initialFormSnapshotRef.current;
    if (!snapshot) return isDirty;
    const merged = { ...getDefaultValues(), ...watchedFormValues } as ArtistFormInput;
    return serializeArtistFormSnapshot(merged) !== snapshot;
  }, [isDirty, watchedFormValues]);

  const biosChanged = useMemo(
    () =>
      ARTIST_BIO_LANGUAGES.some(
        (lang) =>
          (artistBios[lang] ?? "").trim() !== (artistBiosFromDbRef.current[lang] ?? "").trim(),
      ),
    [artistBios],
  );

  const hasUnsavedChanges = useMemo(() => {
    const hasPendingPhoto = Boolean(pendingPhotoFile || photoDirty || photoChangeTokenRef.current > 0);

    if (editingArtistId) {
      return Boolean(formFieldsChanged || hasPendingPhoto || biosChanged);
    }

    const hasBio = ARTIST_BIO_LANGUAGES.some((lang) => (artistBios[lang] ?? "").trim().length > 0);
    return Boolean(formFieldsChanged || hasPendingPhoto || hasBio);
  }, [artistBios, biosChanged, editingArtistId, formFieldsChanged, pendingPhotoFile, photoDirty]);

  const hasArtistChanges = hasUnsavedChanges;

  const finalizeClose = useCallback(() => {
    setDiscardDialogOpen(false);
    setInternalOpen(false);
    onOpenChangeRef.current(false);
  }, []);

  const attemptClose = useCallback(() => {
    if (bypassCloseConfirmRef.current) {
      bypassCloseConfirmRef.current = false;
      finalizeClose();
      return;
    }

    if (hasUnsavedChanges) {
      setDiscardDialogOpen(true);
      return;
    }

    finalizeClose();
  }, [finalizeClose, hasUnsavedChanges]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setInternalOpen(true);
        onOpenChangeRef.current(true);
        return;
      }
      attemptClose();
    },
    [attemptClose],
  );

  const handleDialogDismissAttempt = useCallback(
    (event: Event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      attemptClose();
    },
    [attemptClose, hasUnsavedChanges],
  );

  const canSave = editingArtistId
    ? !ficheReadOnly && hasTripleRequired && hasArtistChanges && !generatingBio
    : !ficheReadOnly && hasTripleRequired && !generatingBio;

  const resolveCurrentAgencyId = useCallback(async (): Promise<string | null> => {
    const agencyFromSession = (agency_id ?? "").trim();
    if (agencyFromSession) return agencyFromSession;

    const authUserId = user?.id?.trim();
    if (!authUserId) return null;

    const { data, error } = await supabase
      .from("agency_users")
      .select("agency_id")
      .eq("user_id", authUserId)
      .order("role_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Résolution agency_id (agency_users) :", error.message);
      return null;
    }

    const agencyFromProfile =
      (data as {
        agency_id?: string | null;
      } | null)?.agency_id ?? null;

    return agencyFromProfile?.trim() || null;
  }, [agency_id, user?.id]);

  const loadArtistIntoForm = useCallback(
    async (row: DbArtistRow) => {
      const sessionAgency = (agency_id ?? "").trim();

      const { data: agencyRow } = await supabase
        .from("artist_agency_details")
        .select("agency_id")
        .eq("artist_id", row.artist_id)
        .order("agency_id", { ascending: true })
        .limit(1)
        .maybeSingle();

      const detailAgency =
        (((agencyRow as { agency_id?: string | null } | null)?.agency_id ?? "") as string).trim();

      const agencyAtLoad = sessionAgency || detailAgency || "";
      setResolvedArtistAgencyId(agencyAtLoad);
      savedAgencyIdRef.current = agencyAtLoad;

      const social = emptySocialRecord();
      const { data: links } = await supabase
        .from("social_links")
        .select("type_link, url")
        .eq("artist_id", row.artist_id);

      for (const link of links ?? []) {
        const tl = link.type_link as SocialLinkType;
        if (SOCIAL_LINK_TYPES.includes(tl) && typeof link.url === "string") {
          social[tl] = link.url;
        }
      }

      let countryValue = "France";
      const paysRaw = row.artist_pays ?? row.pays ?? "";
      if (paysRaw && COUNTRY_OPTIONS.some((c) => c.label === paysRaw)) {
        countryValue = paysRaw;
      } else if (paysRaw.trim()) {
        countryValue = "Autres";
      }

      const line1 = (row.artist_adresse ?? "").trim() || (row.artist_address ?? "").trim();
      const cityVal = (row.artist_ville ?? "").trim() || (row.artist_city ?? "").trim();

      const deathDate = parseDateOnlyString(row.artist_death_date ?? "");
      const isLiving = row.artist_vivant !== false;
      const birthDate = resolveArtistBirthDate(
        parseDateOnlyString(row.artist_birth_date ?? ""),
        deathDate,
        isLiving,
      );

      const loadedValues: ArtistFormInput = {
        artist_firstname: row.artist_firstname ?? "",
        artist_lastname: row.artist_lastname ?? "",
        country: countryValue,
        addressLine1: line1,
        addressLine2: row.artist_adresse2 ?? "",
        postalCode: row.artist_zipcode ?? "",
        city: cityVal,
        artist_nickname: row.artist_nickname ?? "",
        artist_photo_url: row.artist_photo_url ?? "",
        email: row.artist_email ?? "",
        phone: row.artist_phone ?? "",
        birth_date: birthDate,
        death_date: deathDate,
        artist_vivant: isLiving,
        artist_typ: parseArtistTypFromDb(row.artist_typ),
        social,
      };

      form.reset(loadedValues);
      initialFormSnapshotRef.current = serializeArtistFormSnapshot(loadedValues);

      setEditingArtistId(row.artist_id);
      setDuplicateRow(null);
      setDuplicateBioFr("");
    },
    [agency_id, form],
  );

  loadArtistIntoFormRef.current = loadArtistIntoForm;

  useEffect(() => {
    if (artistIdProp && initialLoadDoneRef.current && initialLoadDoneRef.current !== artistIdProp) {
      initialLoadDoneRef.current = null;
      artistLoadInFlightRef.current = null;
    }
  }, [artistIdProp]);

  useEffect(() => {
    if (!open) {
      resetAll();
      initialLoadDoneRef.current = null;
      artistLoadInFlightRef.current = null;
      return;
    }

    const id = artistIdProp ?? null;
    if (id) {
      if (initialLoadDoneRef.current === id || artistLoadInFlightRef.current === id) {
        return;
      }

      artistLoadInFlightRef.current = id;
      let cancelled = false;
      void (async () => {
        const { data, error } = await supabase.from("artists").select("*").eq("artist_id", id).maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          artistLoadInFlightRef.current = null;
          toast.error(error?.message ?? "Fiche introuvable.");
          onOpenChangeRef.current(false);
          return;
        }

        await loadArtistIntoFormRef.current(data as DbArtistRow);
        if (cancelled) return;

        setFicheReadOnly(!initialEditMode);
        initialLoadDoneRef.current = id;
        artistLoadInFlightRef.current = null;
      })();

      return () => {
        cancelled = true;
      };
    }

    initialLoadDoneRef.current = null;
    artistLoadInFlightRef.current = null;
    resetAll();
    setFicheReadOnly(false);
  }, [open, artistIdProp, initialEditMode, resetAll]);

  const handleUseExistingArtistFiche = () => {
    if (!duplicateRow) return;
    setIsDuplicateModalOpen(false);
    setForceCreateDespiteDuplicate(false);
    setFicheReadOnly(false);
    clearPendingPhotoState();
    void loadArtistIntoForm(duplicateRow).then(() => {
      initialLoadDoneRef.current = duplicateRow.artist_id;
    });
  };

  const handleCreateDespiteDuplicate = () => {
    setForceCreateDespiteDuplicate(true);
    setIsDuplicateModalOpen(false);
    void form.handleSubmit(onSubmit)();
  };

  const handleGenerateBio = async () => {
    const p = form.getValues("artist_firstname").trim();
    const n = form.getValues("artist_lastname").trim();
    const types = form.getValues("artist_typ");
  
    if (!p || !n || !types.length) {
      toast.error("Renseignez le prénom, le nom et au moins un type d’art.");
      return;
    }
  
    setGeneratingBio(true);
    try {
      const generated = await generateMultilingualBiographyWithGrok({
        prenom: p,
        name: n,
        artTypes: types,
      });

      setArtistBios({
        fr: generated.fr,
        en: generated.en,
        es: generated.es,
        de: generated.de,
        it: generated.it,
      });

      setActiveLanguage("fr");
      toast.success(t("messages.bio_generated"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur lors de la génération.";
      toast.error(msg);
    } finally {
      setGeneratingBio(false);
    }
  };

  const uploadPendingPhotoFile = async (): Promise<string> => {
    if (!pendingPhotoFile) {
      throw new Error("Aucun fichier à envoyer.");
    }

    const ext =
      pendingPhotoFile.type === "image/webp" || /\.webp$/i.test(pendingPhotoFile.name)
        ? "webp"
        : pendingPhotoFile.type === "image/png" || /\.png$/i.test(pendingPhotoFile.name)
          ? "png"
          : "jpg";

    const artistKey = editingArtistId?.trim() || crypto.randomUUID();
    const previousPhotoUrl = (form.getValues("artist_photo_url") ?? "").trim();

    if (previousPhotoUrl && editingArtistId) {
      await removeSupabaseStorageObjectByPublicUrl(previousPhotoUrl);
    }

    try {
      return await uploadCatalogArtistPhoto(artistKey, pendingPhotoFile, pendingPhotoFile.name);
    } catch (primaryErr) {
      const objectPath = `artists/${artistKey}.${ext}`;
      const legacyBucket =
        import.meta.env.VITE_SUPABASE_ARTIST_PHOTOS_BUCKET?.trim() || "artist-photos";
      const { error } = await supabase.storage.from(legacyBucket).upload(objectPath, pendingPhotoFile, {
        cacheControl: "3600",
        upsert: Boolean(editingArtistId),
      });
      if (error) {
        throw primaryErr instanceof Error ? primaryErr : new Error(String(primaryErr));
      }
      const { data: pub } = supabase.storage.from(legacyBucket).getPublicUrl(objectPath);
      return pub.publicUrl;
    }
  };

  const persistSocialLinks = async (artistId: string) => {
    const social = form.getValues("social");
    const rows: { artist_id: string; type_link: string; url: string }[] = [];

    for (const type of SOCIAL_LINK_TYPES) {
      const url = (social[type] ?? "").trim();
      if (!url) continue;

      try {
        new URL(url);
      } catch {
        toast.error(`URL invalide pour ${type}.`);
        throw new Error("url");
      }

      rows.push({ artist_id: artistId, type_link: type, url });
    }

    await supabase.from("social_links").delete().eq("artist_id", artistId);

    if (rows.length === 0) return;

    const { error } = await supabase.from("social_links").insert(rows);
    if (error) throw new Error(`Réseaux sociaux : ${error.message}`);
  };

  const onSubmit = async (values: ArtistFormInput) => {
    if (ficheReadOnly) return;

    if (duplicateRow && !editingArtistId && !forceCreateDespiteDuplicate) {
      setIsDuplicateModalOpen(true);
      return;
    }

    const shouldPersistBios =
      !editingArtistId || biosLoadedRef.current || biosChanged || hasAnyBioText(artistBios);

    if (
      shouldPersistBios &&
      !ARTIST_BIO_LANGUAGES.some((lang) => (artistBios[lang] ?? "").trim())
    ) {
      toast.error("La biographie est requise avant l’enregistrement.");
      return;
    }

    if (!phoneValid) {
      toast.error("Le numéro de téléphone est invalide pour le pays sélectionné.");
      return;
    }

    setIsSubmitting(true);
    try {
      const sessionAgency = (agency_id ?? "").trim();
      const resolvedStable = resolvedArtistAgencyId.trim();
      const resolved = await resolveCurrentAgencyId();

      let fallbackArtistAgency = "";
      if (!sessionAgency && !resolvedStable && !resolved && editingArtistId) {
        const { data: agencyRow } = await supabase
          .from("artist_agency_details")
          .select("agency_id")
          .eq("artist_id", editingArtistId)
          .order("agency_id", { ascending: true })
          .limit(1)
          .maybeSingle();

        fallbackArtistAgency =
          ((agencyRow as { agency_id?: string | null } | null)?.agency_id ?? "").trim();
      }

      const currentAgencyId =
        sessionAgency || resolvedStable || resolved || fallbackArtistAgency;

      if (!currentAgencyId) {
        throw new Error("Impossible de déterminer l'agence de l'utilisateur connecté.");
      }

      let photoPublicUrl: string | null = null;
      if (pendingPhotoFile) {
        photoPublicUrl = await uploadPendingPhotoFile();
      }

      const phoneStored = (values.phone ?? "").trim();
      const isLiving = values.artist_vivant !== false;
      const birthStored = values.birth_date ? format(values.birth_date, "yyyy-MM-dd") : null;
      const deathStored =
        !isLiving && values.death_date ? format(values.death_date, "yyyy-MM-dd") : null;
      const controlStored = computeArtistControl(values.artist_firstname, values.artist_lastname, values.artist_typ);

      const addr1 = isLiving ? (values.addressLine1 ?? "").trim() : "";
      const addr2 = isLiving ? (values.addressLine2 ?? "").trim() : "";
      const cityStored = isLiving ? (values.city ?? "").trim() : "";
      const countryStored = isLiving ? (values.country ?? "").trim() : "";
      const postalNormalized = isLiving ? normalizePostalCode(values.postalCode ?? "") : "";

      const addressDbPayload = {
        artist_pays: countryStored || null,
        artist_zipcode: postalNormalized || null,
        artist_ville: cityStored || null,
        artist_adresse: addr1 || null,
        artist_adresse2: addr2 || null,
        artist_address: addr1 || null,
        artist_city: cityStored || null,
      };

      const payloadBase = {
        artist_firstname: values.artist_firstname,
        artist_lastname: values.artist_lastname,
        artist_typ: values.artist_typ.join(" | "),
        artist_control: controlStored,
        artist_vivant: isLiving,
        artist_email: isLiving ? (values.email ?? "").trim() || null : null,
        artist_phone: isLiving ? phoneStored || null : null,
        artist_birth_date: birthStored,
        artist_death_date: deathStored,
        ...addressDbPayload,
      };

      let savedArtistId = editingArtistId ?? null;

      if (editingArtistId) {
        if (photoPublicUrl) {
          const payloadCandidates: ArtistsTableUpdate[] = [
            { ...(payloadBase as ArtistsTableUpdate), artist_image: photoPublicUrl },
            { ...(payloadBase as ArtistsTableUpdate), artist_photo_url: photoPublicUrl },
          ];

          let lastError: Error | null = null;

          for (const p of payloadCandidates) {
            const { error } = await supabase.from("artists").update(p).eq("artist_id", editingArtistId);
            if (!error) {
              lastError = null;
              savedArtistId = editingArtistId;
              break;
            }
            lastError =
              error instanceof Error ? error : new Error(String((error as { message?: string }).message ?? ""));
          }

          if (lastError) throw lastError;
        } else {
          const { error } = await supabase
            .from("artists")
            .update(payloadBase as ArtistsTableUpdate)
            .eq("artist_id", editingArtistId);
          if (error) {
            throw error instanceof Error
              ? error
              : new Error(String((error as { message?: string }).message ?? ""));
          }
          savedArtistId = editingArtistId;
        }

        toast.success("Artiste mis à jour.");
      } else {
        const payloadCandidates: ArtistsTableInsert[] = [
          { ...(payloadBase as ArtistsTableInsert), artist_image: photoPublicUrl },
          { ...(payloadBase as ArtistsTableInsert), artist_photo_url: photoPublicUrl },
        ];

        let lastError: Error | null = null;
        let createdArtistId: string | null = null;

        for (const p of payloadCandidates) {
          const { data, error } = await supabase
            .from("artists")
            .insert(p)
            .select("artist_id")
            .single();

          if (!error) {
            lastError = null;
            createdArtistId =
              ((data as {
                artist_id?: string | null;
              } | null)?.artist_id ?? null) ?? null;
            break;
          }

          lastError =
            error instanceof Error ? error : new Error(String((error as { message?: string }).message ?? ""));
        }

        if (lastError) throw lastError;

        savedArtistId = createdArtistId;
        toast.success("Artiste enregistré.");
      }

      if (!savedArtistId) {
        throw new Error("artist_id introuvable après sauvegarde.");
      }

      if (shouldPersistBios) {
        const { error: agencyLinkError } = await supabase
          .from("artist_agency_details")
          .upsert(
            { artist_id: savedArtistId, agency_id: currentAgencyId },
            { onConflict: "artist_id,agency_id" },
          );

        if (agencyLinkError) {
          throw new Error(`Liaison agence : ${agencyLinkError.message}`);
        }

        for (const lang of ARTIST_BIO_LANGUAGES) {
          await upsertArtistBioRow(savedArtistId, lang, artistBios[lang]);
        }
        const bioData = await loadArtistBioFormData(savedArtistId);
        setArtistBioRowIds(bioData.rowIds);
        setAudioStatusRefreshKey((k) => k + 1);
      }

      if (isLiving) {
        await persistSocialLinks(savedArtistId);
      } else {
        await supabase.from("social_links").delete().eq("artist_id", savedArtistId);
      }

      clearPendingPhotoState();
      initialFormSnapshotRef.current = serializeArtistFormSnapshot(values);
      form.reset(values);
      artistBiosFromDbRef.current = { ...artistBios };
      savedAgencyIdRef.current =
        (agency_id ?? "").trim() || resolvedArtistAgencyId.trim() || savedAgencyIdRef.current;
      setForceCreateDespiteDuplicate(false);
      bypassCloseConfirmRef.current = true;
      setDiscardDialogOpen(false);
      setInternalOpen(false);
      onOpenChangeRef.current(false);
      onSuccess?.(savedArtistId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enregistrement impossible.";
      if (msg !== "url") toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleArtistType = (value: string, checked: boolean) => {
    const current = form.getValues("artist_typ");
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    form.setValue("artist_typ", next, { shouldValidate: true, shouldDirty: true });
  };

  const artistTitleName = [form.watch("artist_firstname"), form.watch("artist_lastname")]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

  const postalPlaceholder = postalPlaceholderForCountryLabel(country ?? "");

  const duplicateDisplayName = duplicateRow
    ? [duplicateRow.artist_firstname, duplicateRow.artist_lastname]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .join(" ") || t("artist_no_name")
    : "";
  const duplicateTypLabels = duplicateRow ? parseArtistTypFromDb(duplicateRow.artist_typ) : [];
  const duplicatePhotoSrc = (duplicateRow?.artist_photo_url ?? "").trim() || ARTIST_PHOTO_PLACEHOLDER;

  return (
    <>
      <Dialog open={internalOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={handleDialogDismissAttempt}
        onInteractOutside={handleDialogDismissAttempt}
        onEscapeKeyDown={handleDialogDismissAttempt}
        className={cn(
          "left-1/2 top-[calc(4.25rem+1rem)] max-h-[calc(100vh-5.5rem)] w-[96vw] max-w-3xl -translate-x-1/2 translate-y-0",
          "overflow-x-hidden overflow-y-auto border-border bg-background p-0 shadow-xl",
          "data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4",
          "data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-left-1/2",
          "bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb]",
        )}
        {...(!editingArtistId || ficheReadOnly ? { "aria-describedby": undefined } : {})}
      >
        <DialogTitle className="sr-only">
          {editingArtistId
            ? t("dialog_title_edit", { name: artistTitleName || t("dialog_title_artist_fallback") })
            : t("dialog_title_create")}
        </DialogTitle>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 sm:px-5 pb-4">
            <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
              <div className="flex flex-col gap-3 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <h2 className="min-w-0 shrink font-serif text-xl text-white sm:text-2xl sm:pr-2">
                  {editingArtistId
                    ? t("dialog_title_edit", { name: artistTitleName || t("dialog_title_artist_fallback") })
                    : t("dialog_title_create")}
                </h2>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {editingArtistId && (
                    <a
                      href={`mailto:contact@aimediart.com?subject=${encodeURIComponent(t("btn_report_error_email_subject"))}&body=${encodeURIComponent(`Artiste : ${artistTitleName || "inconnu"}\nArtist ID : ${editingArtistId}\n\nDécrivez l'information erronée :`)}`}
                      className="inline-flex h-9 w-[150px] items-center justify-center gap-1.5 rounded-md border border-white/60 bg-[#FDFDFC] px-3 text-[11px] font-black text-[#D99726]/80 text-center hover:border-white hover:text-white transition-colors"
                      title={t("btn_report_error_title")}
                    >
                      ⚠️ {t("btn_report_error")}
                    </a>
                  )}
                  {editingArtistId && ficheReadOnly && (
                    <Button
                      type="button"
                      className="h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                      onClick={() => setFicheReadOnly(false)}
                    >
                      {t("btn_modify")}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="default"
                    className="h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                    onClick={() => attemptClose()}
                  >
                    {t("btn_cancel")}
                  </Button>

                  {!ficheReadOnly && (
                    <Button
                      type="submit"
                      disabled={!canSave || isSubmitting || processingPhoto}
                      className={
                        editingArtistId
                          ? "h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] disabled:opacity-50"
                          : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground disabled:opacity-50"
                      }
                    >
                      {isSubmitting
                        ? t("btn_submitting")
                        : editingArtistId
                          ? t("btn_save_changes")
                          : t("btn_save")}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 w-full">
              <div className="grid gap-3 sm:grid-cols-3">
                {!ficheReadOnly && (
                  <p className="col-span-full text-xs leading-tight text-destructive">
                    <span className="font-semibold">*</span> {t("required_fields_note")}
                  </p>
                )}

                <FormField
                  control={form.control}
                  name="artist_firstname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="inline-flex items-center">
                        {t("form_firstname_label")}
                        <RequiredAsterisk />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form_firstname_placeholder")}
                          {...field}
                          disabled={ficheReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="artist_lastname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="inline-flex items-center">
                        {t("form_lastname_label")}
                        <RequiredAsterisk />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form_lastname_placeholder")}
                          {...field}
                          disabled={ficheReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="artist_nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form_nickname_label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form_nickname_placeholder")} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
                <div className="w-full max-w-[480px]">
                  <FormField
                    control={form.control}
                    name="artist_typ"
                    render={() => (
                      <FormItem className="flex flex-col gap-[5px] space-y-0">
                        <FormLabel className="inline-flex min-h-[1.25rem] flex-wrap items-center gap-x-1 gap-y-0.5">
                          <span className="inline-flex items-center">
                            {t("form_art_types_label")}
                            <RequiredAsterisk />
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {t("form_art_types_hint")}
                          </span>
                        </FormLabel>

                        <Popover open={typesPopoverOpen} onOpenChange={setTypesPopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={ficheReadOnly}
                                className={cn(
                                  "h-10 w-full justify-between gap-2 font-normal",
                                  !artistTyp?.length && "text-muted-foreground",
                                )}
                              >
                                <span className="min-w-0 truncate text-left">
                                  {artistTyp?.length
                                    ? formatArtTypesButtonLabel(artistTyp, (count) =>
                                        t("form_art_types_preview_more", { count }),
                                      )
                                    : t("form_art_types_empty")}
                                </span>
                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>

                          <PopoverContent className="w-[min(560px,calc(100vw-2rem))] p-0" align="start">
                            <ScrollArea className="max-h-72 p-2">
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pr-3">
                                {ARTIST_TYPE_OPTIONS.map((opt, idx) => (
                                  <label
                                    key={opt}
                                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/80"
                                  >
                                    <Checkbox
                                      id={`add-artist-type-${idx}`}
                                      name={`artist_type_${idx}`}
                                      checked={artistTyp?.includes(opt)}
                                      disabled={ficheReadOnly}
                                      onCheckedChange={(c) => toggleArtistType(opt, c === true)}
                                    />
                                    <span className="leading-snug">{opt}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex w-fit shrink-0 flex-col gap-3">
                  <FormField
                    control={form.control}
                    name="birth_date"
                    render={({ field }) => {
                      const birthDisplay = coerceFormDate(field.value);
                      return (
                      <FormItem className="flex w-full flex-col gap-[5px] space-y-0">
                        <FormLabel className="min-h-[1.25rem]">{t("form_birthdate_label")}</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={ficheReadOnly}
                                className={cn(
                                  "h-10 w-[180px] max-w-full pl-3 pr-2 text-left text-sm font-normal",
                                  !birthDisplay && "text-muted-foreground",
                                )}
                              >
                                {birthDisplay ? (
                                  format(birthDisplay, "PPP", { locale: fr })
                                ) : (
                                  <span className="truncate">{t("form_birthdate_placeholder")}</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>

                          <PopoverContent className="w-auto p-0" align="start">
                            <BirthDatePickerFr
                              selected={birthDisplay}
                              minDate={birthPickerMin}
                              maxDate={birthPickerMax}
                              onSelect={(date) => {
                                const next = date
                                  ? clampLocalDay(normalizePickerDate(date)!, birthPickerMin, birthPickerMax)
                                  : null;
                                field.onChange(next);
                                form.setValue("birth_date", next, {
                                  shouldDirty: true,
                                  shouldTouch: true,
                                  shouldValidate: true,
                                  shouldNotify: true,
                                });
                              }}
                              fromYear={ARTIST_BIRTH_YEAR_MIN}
                              toYear={birthPickerMax.getFullYear()}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                    }}
                  />

                  {artistVivant === false && (
                    <FormField
                      control={form.control}
                      name="death_date"
                      render={({ field }) => {
                        const deathDisplay = coerceFormDate(field.value);
                        return (
                        <FormItem className="flex w-full flex-col gap-[5px] space-y-0">
                          <FormLabel className="min-h-[1.25rem]">{t("form_deathdate_label")}</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={ficheReadOnly}
                                  className={cn(
                                    "h-10 w-[180px] max-w-full pl-3 pr-2 text-left text-sm font-normal",
                                    !deathDisplay && "text-muted-foreground",
                                  )}
                                >
                                  {deathDisplay ? (
                                    format(deathDisplay, "PPP", { locale: fr })
                                  ) : (
                                    <span className="truncate">{t("form_deathdate_placeholder")}</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>

                            <PopoverContent className="w-auto p-0" align="start">
                              <BirthDatePickerFr
                                selected={deathDisplay}
                                minDate={deathPickerMin}
                                maxDate={deathPickerMax}
                                onSelect={(date) => {
                                  const next = date
                                    ? clampLocalDay(normalizePickerDate(date)!, deathPickerMin, deathPickerMax)
                                    : null;
                                  field.onChange(next);
                                  form.setValue("death_date", next, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                    shouldNotify: true,
                                  });
                                }}
                                fromYear={deathPickerMin.getFullYear()}
                                toYear={deathPickerMax.getFullYear()}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                      }}
                    />
                  )}
                </div>

                <div className="flex min-w-0 shrink-0 flex-col gap-3">
                  <FormField
                    control={form.control}
                    name="artist_vivant"
                    render={({ field }) => (
                      <FormItem className="flex w-full flex-col gap-[5px] space-y-0">
                        <FormControl>
                          <RadioGroup
                            value={field.value === false ? "deceased" : "alive"}
                            onValueChange={(v) => {
                              const alive = v === "alive";
                              field.onChange(alive);
                              form.setValue("artist_vivant", alive, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              if (alive) {
                                form.setValue("death_date", null, { shouldDirty: true, shouldValidate: false });
                              }
                            }}
                            disabled={ficheReadOnly}
                            className="flex flex-col gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="alive" id="artist-living-alive" />
                              <Label htmlFor="artist-living-alive" className="cursor-pointer text-sm font-normal">
                                {t("form_living_alive")}
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="deceased" id="artist-living-deceased" />
                              <Label htmlFor="artist-living-deceased" className="cursor-pointer text-sm font-normal">
                                {t("form_living_deceased")}
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <ArtistAgeDisplay
                    ageYears={artistAgeYears}
                    missingText={t("form_age_missing")}
                    yearsText={t("form_age_years", { count: artistAgeYears ?? 0 })}
                  />
                </div>
              </div>

              <div className="relative flex h-[170px] flex-col gap-4 min-[726px]:flex-row min-[726px]:flex-nowrap min-[726px]:items-start">
                <div className="absolute left-[180px] flex h-full min-h-0 min-w-0 w-full max-w-[550px] flex-col gap-2 sm:w-[550px] sm:max-w-none sm:shrink-0">
                {biosLoading && bioArtistId ? (
                  <>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium leading-none">{t("bio_label")}</span>
                      {canShowGenerateBio && (
                        <Button
                          type="button"
                          variant="default"
                          className="h-8 shrink-0 gap-1.5 border border-[#E63946] bg-white px-2.5 text-xs font-semibold text-[#E63946] shadow-none hover:bg-[#ffecef] hover:text-[#c92f3b]"
                          onClick={() => void handleGenerateBio()}
                          disabled={generatingBio || !hasTripleRequired}
                        >
                          {generatingBio ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t("btn_generating_bio")}
                            </>
                          ) : (
                            t("btn_generate_bio")
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/20 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                      <span>{t("loading_bio_tabs", "Chargement des biographies…")}</span>
                    </div>
                  </>
                ) : (
                  <Tabs
                    value={activeLanguage}
                    onValueChange={(v) => setActiveLanguage(v as Language)}
                    className="flex h-full min-h-0 flex-col"
                  >
                    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium leading-none">{t("bio_label")}</span>
                      {canShowGenerateBio && (
                        <>
                          {artistBios[activeLanguage]?.trim() ? (
                            <>
                              {/* Bio existante : 3 actions */}
                              <Button
                                type="button"
                                variant="default"
                                className="h-8 shrink-0 gap-1.5 border border-[#E63946] bg-white px-2.5 text-xs font-semibold text-[#E63946] shadow-none hover:bg-[#ffecef] hover:text-[#c92f3b]"
                                onClick={() => void handleGenerateBio()}
                                disabled={generatingBio || !hasTripleRequired}
                                title={t("btn_report_error_title", "Regénérer la biographie via l'IA")}
                              >
                                {generatingBio ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    {t("btn_generating_bio")}
                                  </>
                                ) : (
                                  t("bio_regen")
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className="h-8 shrink-0 gap-1.5 border border-amber-500 bg-white px-2.5 text-xs font-semibold text-amber-600 shadow-none hover:bg-amber-50"
                                onClick={() => {
                                  setArtistBios((prev) => ({ ...prev, [activeLanguage]: "" }));
                                }}
                              >
                                {t("bio_new")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="default"
                              className="h-8 shrink-0 gap-1.5 border border-[#E63946] bg-white px-2.5 text-xs font-semibold text-[#E63946] shadow-none hover:bg-[#ffecef] hover:text-[#c92f3b]"
                              onClick={() => void handleGenerateBio()}
                              disabled={generatingBio || !hasTripleRequired}
                            >
                              {generatingBio ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  {t("btn_generating_bio")}
                                </>
                              ) : (
                                t("btn_generate_bio")
                              )}
                            </Button>
                          )}
                        </>
                      )}
                      <TabsList className="flex h-auto min-h-9 w-auto shrink-0 flex-wrap justify-start gap-1">
                        {ARTIST_BIO_LANGUAGES.map((lang) => (
                          <TabsTrigger
                            key={lang}
                            value={lang}
                            type="button"
                            className="shrink-0 gap-1.5 px-2.5 text-xs sm:text-sm"
                          >
                            {lang.toUpperCase()}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      <AudioVoiceLangStatus
                        languages={ARTIST_BIO_LANGUAGES}
                        text_type="bio"
                        targetsByLang={bioAudioTargetsByLang}
                        refreshKey={audioStatusRefreshKey}
                        className="min-w-0 flex-1 justify-end"
                      />
                    </div>

                    <div className="mt-2 h-[115px] w-[540px] shrink-0">
                      {ARTIST_BIO_LANGUAGES.map((lang) => (
                        <TabsContent
                          key={lang}
                          value={lang}
                          className="mt-0 h-full data-[state=inactive]:hidden"
                        >
                          <Textarea
                            value={artistBios[lang] ?? ""}
                            onChange={(e) => {
                              setArtistBios((prev) => ({ ...prev, [lang]: e.target.value }));
                            }}
                            placeholder={`Bio en ${lang.toUpperCase()}… (spécifique à votre organisation)`}
                            disabled={ficheReadOnly}
                            spellCheck
                            lang={lang}
                            className="h-[115px] min-h-[115px] w-[540px] min-w-[540px] resize-none overflow-y-auto p-2 text-xs leading-snug shadow-none"
                          />
                        </TabsContent>
                      ))}
                    </div>
                  </Tabs>
                )}
                </div>

                <div className="group relative h-40 w-40 shrink-0 self-start overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                  {previewSrc ? (
                    <img src={previewSrc} alt={t("photo_alt_preview")} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}

                  {processingPhoto && (
                    <div
                      className="absolute inset-0 z-20 flex items-center justify-center bg-background/75"
                      aria-busy
                      aria-label={t("photo_processing_aria")}
                    >
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-black/40" />

                  {!ficheReadOnly && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="secondary"
                        className="pointer-events-auto bg-white/10 text-white hover:bg-white/15 border border-white/20"
                        disabled={processingPhoto}
                        onClick={() => photoFileInputRef.current?.click()}
                      >
                        {pendingPhotoFile || (photoUrl ?? "").trim() ? t("btn_photo_replace") : t("btn_photo_change")}
                      </Button>
                    </div>
                  )}

                  <input
                    ref={photoFileInputRef}
                    id="artist-photo-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    tabIndex={-1}
                    disabled={processingPhoto || ficheReadOnly}
                    onChange={(e) => {
                      const input = e.target;
                      const f = input.files?.[0] ?? null;
                      input.value = "";
                      if (!f) {
                        markPhotoAsChanged(null);
                        return;
                      }

                      void (async () => {
                        setProcessingPhoto(true);
                        try {
                          const prepared = await prepareImageForSupabaseUpload(f);
                          markPhotoAsChanged(prepared);
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Traitement de l’image impossible.";
                          toast.error(msg);
                          markPhotoAsChanged(null);
                        } finally {
                          setProcessingPhoto(false);
                        }
                      })();
                    }}
                  />
                </div>
              </div>

              {checkingDuplicate && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("checking_duplicate")}
                </p>
              )}

              {artistVivant !== false && (
              <div className="grid gap-3 sm:grid-cols-10">
                <div className="sm:col-span-10">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
                    <div className="order-2 min-w-0 flex-1 sm:order-1">
                      <FormField
                        control={form.control}
                        name="addressLine2"
                        render={({ field }) => (
                          <FormItem className="space-y-[5px]">
                            <FormLabel>{t("form_address_line2_label")}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("form_address_line2_placeholder")}
                                {...field}
                                disabled={ficheReadOnly}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="order-1 w-full max-w-full sm:order-2 sm:w-[363px] sm:shrink-0">
                      <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                          <FormItem className="space-y-[5px]">
                            <FormLabel>{t("form_address_label")}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("form_address_placeholder")}
                                {...field}
                                disabled={ficheReadOnly}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem className="w-[100px] max-w-full justify-self-start space-y-[5px] sm:col-span-1">
                      <FormLabel>{t("form_country_label")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={ficheReadOnly}>
                        <FormControl>
                          <SelectTrigger disabled={ficheReadOnly}>
                            <SelectValue placeholder={t("form_country_placeholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {COUNTRY_OPTIONS.map((c) => (
                            <SelectItem key={c.label} value={c.label}>
                              <span className="flex items-center gap-2">
                                <CountryFlagIcon iso={c.iso} />
                                <span>{c.label}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem className="w-[115px] max-w-full justify-self-start space-y-[5px] sm:col-span-2">
                      <FormLabel>{t("form_zipcode_label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={postalPlaceholder} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="space-y-[5px] sm:col-span-7">
                      <FormLabel>{t("form_city_label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form_city_placeholder")} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              )}

              {artistVivant !== false && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="space-y-[5px]">
                      <FormLabel>{t("form_phone_label")}</FormLabel>
                      <FormControl>
                        <SmartPhoneInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onValidityChange={setPhoneValid}
                          countryName={country}
                          countrySelectorLocked={
                            Boolean((country ?? "").trim()) && country !== "Autres"
                          }
                          onCountryNameChange={(name) =>
                            form.setValue("country", name, { shouldDirty: true, shouldValidate: true })
                          }
                          disabled={ficheReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form_email_label")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t("form_email_placeholder")} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              )}
            </div>
          </form>
        </Form>

        {isDuplicateModalOpen &&
          duplicateRow &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4"
              onClick={() => setIsDuplicateModalOpen(false)}
              role="presentation"
            >
              <div
                className="relative w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={t("duplicate_modal_aria")}
              >
                <button
                  type="button"
                  onClick={() => setIsDuplicateModalOpen(false)}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  aria-label={t("btn_cancel")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>

                <h3 className="pr-8 text-base font-semibold text-foreground">{t("duplicate_modal_title")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("duplicate_modal_desc")}</p>

                <div className="mt-4 flex gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <img
                    src={duplicatePhotoSrc}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
                  />
                  <div className="min-w-0 text-left text-sm">
                    <p className="font-semibold text-foreground">{duplicateDisplayName}</p>
                    {duplicateTypLabels.length > 0 && (
                      <p className="mt-1 text-muted-foreground">
                        {t("duplicate_existing_types")} : {duplicateTypLabels.join(" · ")}
                      </p>
                    )}
                    {(duplicateRow.artist_email ?? "").trim() && (
                      <p className="mt-1 truncate text-muted-foreground">{duplicateRow.artist_email}</p>
                    )}
                    {duplicateBioFr && (
                      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{duplicateBioFr}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setIsDuplicateModalOpen(false)}
                  >
                    {t("btn_cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={handleCreateDespiteDuplicate}
                    disabled={isSubmitting}
                  >
                    {t("btn_create_new_anyway")}
                  </Button>
                  <Button
                    type="button"
                    className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground sm:w-auto"
                    onClick={handleUseExistingArtistFiche}
                  >
                    {t("btn_use_existing_fiche")}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </DialogContent>
    </Dialog>

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
            <AlertDialogDescription>
              Des modifications non enregistrées existent. Fermer la fiche ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
            <AlertDialogAction onClick={finalizeClose}>Fermer sans enregistrer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}