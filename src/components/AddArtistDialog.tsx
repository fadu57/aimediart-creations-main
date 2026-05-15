import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarIcon, ChevronDown, ImageIcon, Loader2 } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { computeArtistControl } from "@/lib/artistControl";
import {
  ARTIST_TYPE_OPTIONS,
  SOCIAL_LINK_TYPES,
  emptySocialRecord,
  type SocialLinkType,
} from "@/lib/artistFormConstants";
import { generateMultilingualBiographyWithGrok } from "@/lib/grokBio";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { ARTIST_PHOTO_PLACEHOLDER } from "@/lib/artistAssets";
import {
  ARTIST_BIO_LANGUAGES,
  EMPTY_BIOS,
  hasAnyBioText,
  upsertArtistBioRow,
  useArtistBios,
  type Language,
} from "@/hooks/useArtistBios";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { normalizeArtistBioForStorage } from "@/lib/artistBio";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

const socialSchema = z.record(z.string());

const artistFormSchema = z.object({
  artist_firstname: z.string().min(1, "Le prénom est obligatoire.").trim(),
  artist_lastname: z.string().min(1, "Le nom est obligatoire.").trim(),
  artist_typ: z.array(z.string()).min(1, "Sélectionnez au moins un type d’art."),
  artist_bio: z.string().trim().default(""),
  artist_address: z.string().optional(),
  artist_zipcode: z.string().optional(),
  artist_city: z.string().optional(),
  pays: z.string().optional(),
  artist_nickname: z.string().optional(),
  artist_photo_url: z.string().optional(),
  email: z.union([z.literal(""), z.string().email("Format d’e-mail invalide.")]).optional(),
  phone: z.string().optional(),
  birth_date: z.date().optional().nullable(),
  social: socialSchema.optional(),
});

export type ArtistFormInput = z.infer<typeof artistFormSchema>;

type ArtistsTableUpdate = Database["public"]["Tables"]["artists"]["Update"];
type ArtistsTableInsert = Database["public"]["Tables"]["artists"]["Insert"];

type DbArtistRow = {
  artist_id: string;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_address?: string | null;
  artist_zipcode?: string | null;
  artist_city?: string | null;
  pays?: string | null;
  artist_nickname?: string | null;
  artist_bio?: string | null;
  artist_photo_url?: string | null;
  artist_email?: string | null;
  artist_phone?: string | null;
  artist_birth_date?: string | null;
  artist_typ?: string | string[] | null;
  artist_control?: string | null;
  initiale_artist?: string | null;
};

type ArtistAgencyDetailsRow = {
  artist_id: string;
  agency_id: string;
  agency_specific_bio?: string | null;
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

function getDefaultValues(): ArtistFormInput {
  return {
    artist_firstname: "",
    artist_lastname: "",
    artist_address: "",
    artist_zipcode: "",
    artist_city: "",
    pays: "France",
    artist_nickname: "",
    artist_bio: "",
    artist_photo_url: "",
    email: "",
    phone: "",
    birth_date: undefined,
    artist_typ: [],
    social: emptySocialRecord(),
  };
}

export type AddArtistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (artistId: string) => void;
  artistId?: string | null;
};

export function AddArtistDialog({
  open,
  onOpenChange,
  onSuccess,
  artistId: artistIdProp,
}: AddArtistDialogProps) {
  const { t } = useTranslation("artists");
  const { user, role_name, role_id, agency_id } = useAuthUser();
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const bypassCloseConfirmRef = useRef(false);

  const [editingArtistId, setEditingArtistId] = useState<string | null>(null);
  const [ficheReadOnly, setFicheReadOnly] = useState(false);
  const [duplicateRow, setDuplicateRow] = useState<DbArtistRow | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  const [typesPopoverOpen, setTypesPopoverOpen] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("");
  /** Agence unique pour lecture / écriture des bios (session > détail fiche > picker). */
  const [resolvedArtistAgencyId, setResolvedArtistAgencyId] = useState("");
  const [agencyOptions, setAgencyOptions] = useState<{ id: string; name: string }[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [phoneValid, setPhoneValid] = useState(true);
  const [activeLanguage, setActiveLanguage] = useState<Language>("fr");
  const [biosDraft, setBiosDraft] = useState<Record<Language, string>>(() => ({ ...EMPTY_BIOS }));

  const form = useForm<ArtistFormInput>({
    resolver: zodResolver(artistFormSchema),
    defaultValues: getDefaultValues(),
  });

  const firstname = useWatch({ control: form.control, name: "artist_firstname" });
  const lastname = useWatch({ control: form.control, name: "artist_lastname" });
  const artistTyp = useWatch({ control: form.control, name: "artist_typ" });
  const pays = useWatch({ control: form.control, name: "pays" });
  const photoUrl = useWatch({ control: form.control, name: "artist_photo_url" });

  const agencyForBiosHook = useMemo(() => {
    const sessionA = (agency_id ?? "").trim();
    const resolvedA = resolvedArtistAgencyId.trim();
    const pickedA = selectedAgencyId.trim();
    return sessionA || resolvedA || pickedA || null;
  }, [agency_id, resolvedArtistAgencyId, selectedAgencyId]);

  const { bios, loading: biosLoading } = useArtistBios(open ? editingArtistId : null, agencyForBiosHook);

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

  useEffect(() => {
    if (!open) return;

    if (!editingArtistId) {
      setBiosDraft({ ...EMPTY_BIOS });
      setActiveLanguage("fr");
      return;
    }

    if (biosLoading) return;

    if (
      editingArtistId &&
      !hasAnyBioText(bios) &&
      !(agency_id ?? "").trim() &&
      !resolvedArtistAgencyId.trim() &&
      !selectedAgencyId.trim()
    ) {
      return;
    }

    if (hasAnyBioText(bios)) {
      setBiosDraft({ ...EMPTY_BIOS, ...bios });
    } else {
      setBiosDraft((prev) => {
        if (hasAnyBioText(prev)) return prev;
        return { ...EMPTY_BIOS };
      });
    }
  }, [open, editingArtistId, biosLoading, bios, agency_id, resolvedArtistAgencyId, selectedAgencyId]);

  const resetAll = useCallback(() => {
    form.reset(getDefaultValues());
    setEditingArtistId(null);
    setFicheReadOnly(false);
    setDuplicateRow(null);
    setPendingPhotoFile(null);
    setProcessingPhoto(false);
    setCheckingDuplicate(false);
    setGeneratingBio(false);
    setActiveLanguage("fr");
    setBiosDraft({ ...EMPTY_BIOS });
    setSelectedAgencyId("");
    setResolvedArtistAgencyId("");
    setAgencyOptions([]);
    setPhoneValid(true);
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  }, [form]);

  const artistControlLive = useMemo(() => {
    if (!firstname?.trim() || !lastname?.trim() || !artistTyp?.length) return "";
    return computeArtistControl(firstname.trim(), lastname.trim(), artistTyp);
  }, [firstname, lastname, artistTyp]);

  useEffect(() => {
    if (!open || !artistControlLive || ficheReadOnly) {
      setDuplicateRow(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setCheckingDuplicate(true);

        let qb = supabase
          .from("artists")
          .select("*")
          .eq("artist_control", artistControlLive)
          .is("deleted_at", null);

        if (editingArtistId) {
          qb = qb.neq("artist_id", editingArtistId);
        }

        const { data, error } = await qb.maybeSingle();
        if (cancelled) return;

        setCheckingDuplicate(false);

        if (error) {
          console.warn("Doublon :", error.message);
          setDuplicateRow(null);
          return;
        }

        setDuplicateRow((data as DbArtistRow) ?? null);
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, artistControlLive, editingArtistId, ficheReadOnly]);

  const hasTripleRequired =
    Boolean(firstname?.trim()) && Boolean(lastname?.trim()) && (artistTyp?.length ?? 0) >= 1;

  const canShowGenerateBio = !ficheReadOnly;

  const biosEdited = useMemo(() => {
    if (!editingArtistId || biosLoading) return false;
    return ARTIST_BIO_LANGUAGES.some((lang) => (biosDraft[lang] ?? "") !== (bios[lang] ?? ""));
  }, [bios, biosDraft, biosLoading, editingArtistId]);

  const hasAnyBioDraft = ARTIST_BIO_LANGUAGES.some((lang) => (biosDraft[lang] ?? "").trim().length > 0);

  const hasArtistChanges = !editingArtistId
    ? true
    : Boolean(
        form.formState.isDirty ||
          pendingPhotoFile ||
          biosEdited ||
          hasAnyBioDraft,
      );

  const needsAgencyPicker = useMemo(() => {
    if ((agency_id ?? "").trim()) return false;
    if (hasFullDataAccess(role_name)) return true;
    if (role_id === 1 || role_id === 2 || role_id === 3) return true;
    return false;
  }, [agency_id, role_id, role_name]);

  const agencySelectionOk = !needsAgencyPicker || selectedAgencyId.trim().length > 0;

  const canShowSave =
    !ficheReadOnly &&
    hasTripleRequired &&
    hasAnyBioDraft &&
    !duplicateRow &&
    !checkingDuplicate &&
    !generatingBio &&
    (!editingArtistId || !biosLoading) &&
    agencySelectionOk;

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

      const picked = selectedAgencyId.trim();
      const effectivePicked = needsAgencyPicker && !picked && detailAgency ? detailAgency : picked;
      setResolvedArtistAgencyId(sessionAgency || detailAgency || effectivePicked);
      if (needsAgencyPicker && !picked && detailAgency) {
        setSelectedAgencyId(detailAgency);
      }

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

      let paysValue = "France";
      if (row.pays && COUNTRY_OPTIONS.some((c) => c.label === row.pays)) {
        paysValue = row.pays;
      } else if (row.pays?.trim()) {
        paysValue = "Autres";
      }

      form.reset({
        artist_firstname: row.artist_firstname ?? "",
        artist_lastname: row.artist_lastname ?? "",
        artist_address: row.artist_address ?? "",
        artist_zipcode: row.artist_zipcode ?? "",
        artist_city: row.artist_city ?? "",
        pays: paysValue,
        artist_nickname: row.artist_nickname ?? "",
        artist_bio: "",
        artist_photo_url: row.artist_photo_url ?? "",
        email: row.artist_email ?? "",
        phone: row.artist_phone ?? "",
        birth_date: (() => {
          const raw = (row.artist_birth_date ?? "").trim();
          if (!raw) return undefined;
          const d = new Date(raw);
          return Number.isNaN(d.getTime()) ? undefined : d;
        })(),
        artist_typ: parseArtistTypFromDb(row.artist_typ),
        social,
      });

      setEditingArtistId(row.artist_id);
      setDuplicateRow(null);
      setPendingPhotoFile(null);
    },
    [agency_id, form, needsAgencyPicker, selectedAgencyId],
  );

  useEffect(() => {
    if (!open || !needsAgencyPicker) {
      if (!open) {
        setLoadingAgencies(false);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingAgencies(true);

      const { data, error } = await supabase
        .from("agencies")
        .select("id, name_agency")
        .order("name_agency", {
          ascending: true,
          nullsFirst: false,
        });

      if (cancelled) return;

      if (error) {
        toast.error(error.message);
        setAgencyOptions([]);
        setLoadingAgencies(false);
        return;
      }

      const mapped =
        ((data as Array<{ id?: string | null; name_agency?: string | null }> | null) ?? [])
          .filter((a) => typeof a.id === "string" && a.id.trim())
          .map((a) => ({ id: String(a.id), name: a.name_agency?.trim() || String(a.id) })) ?? [];

      setAgencyOptions(mapped);
      setSelectedAgencyId((prev) => {
        if (prev.trim()) return prev;
        if (mapped.length === 1) return mapped[0].id;
        return "";
      });
      setLoadingAgencies(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, needsAgencyPicker]);

  useEffect(() => {
    if (!open) {
      resetAll();
      return;
    }

    const id = artistIdProp ?? null;
    if (id) {
      let cancelled = false;
      void (async () => {
        const { data, error } = await supabase.from("artists").select("*").eq("artist_id", id).single();

        if (cancelled) return;

        if (error || !data) {
          toast.error(error?.message ?? "Fiche introuvable.");
          onOpenChange(false);
          return;
        }

        await loadArtistIntoForm(data as DbArtistRow);
        if (!cancelled) setFicheReadOnly(true);
      })();

      return () => {
        cancelled = true;
      };
    }

    resetAll();
    setFicheReadOnly(false);
  }, [open, artistIdProp, onOpenChange, resetAll, loadArtistIntoForm]);

  const handleDuplicateNo = () => {
    resetAll();
    onOpenChange(false);
  };

  const handleDuplicateYes = () => {
    if (!duplicateRow) return;
    setFicheReadOnly(false);
    void loadArtistIntoForm(duplicateRow);
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
  
      setBiosDraft((prev) => ({
        ...prev,
        fr: generated.fr,
        en: generated.en,
        es: generated.es,
        de: generated.de,
        it: generated.it,
      }));

      form.setValue("artist_bio", generated.fr, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
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

    const preferredBucket = "images";
    const fallbackBucket = import.meta.env.VITE_SUPABASE_ARTIST_PHOTOS_BUCKET?.trim() || "artist-photos";

    const ext =
      pendingPhotoFile.type === "image/webp" || /\.webp$/i.test(pendingPhotoFile.name)
        ? "webp"
        : "jpg";

    const objectPath = `artists/${crypto.randomUUID()}.${ext}`;

    const tryUpload = async (bucket: string) => {
      const { error } = await supabase.storage.from(bucket).upload(objectPath, pendingPhotoFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        return { ok: false as const, error, bucket };
      }

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      return { ok: true as const, publicUrl: pub.publicUrl, bucket };
    };

    const first = await tryUpload(preferredBucket);
    if (first.ok) {
      return first.publicUrl;
    }

    const second = await tryUpload(fallbackBucket);
    if (second.ok) {
      return second.publicUrl;
    }

    throw new Error(
      `Envoi photo : ${first.error.message} (bucket « ${preferredBucket} ») / ${second.error.message} (bucket « ${fallbackBucket} »).`,
    );
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

    if (duplicateRow && !editingArtistId) {
      toast.error("Un doublon est détecté : utilisez « Oui » pour modifier la fiche, ou « Non » pour fermer.");
      return;
    }

    if (!ARTIST_BIO_LANGUAGES.some((lang) => (biosDraft[lang] ?? "").trim())) {
      toast.error("La biographie est requise avant l’enregistrement.");
      return;
    }

    if (!phoneValid) {
      toast.error("Le numéro de téléphone est invalide pour le pays sélectionné.");
      return;
    }

    const frBioStored = normalizeArtistBioForStorage(biosDraft.fr ?? "");

    setIsSubmitting(true);
    try {
      const sessionAgency = (agency_id ?? "").trim();
      const resolvedStable = resolvedArtistAgencyId.trim();
      const pickedAgency = selectedAgencyId.trim();
      const resolved = await resolveCurrentAgencyId();

      let fallbackArtistAgency = "";
      if (!sessionAgency && !resolvedStable && !pickedAgency && !resolved && editingArtistId) {
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
        sessionAgency || resolvedStable || pickedAgency || resolved || fallbackArtistAgency;

      if (!currentAgencyId) {
        if (needsAgencyPicker) {
          toast.error("Sélectionnez l’agence concernée par cet artiste.");
        } else {
          throw new Error("Impossible de déterminer l'agence de l'utilisateur connecté.");
        }
        return;
      }

      let photoPublicUrl: string | null = null;
      if (pendingPhotoFile) {
        photoPublicUrl = await uploadPendingPhotoFile();
      }

      const phoneStored = (values.phone ?? "").trim();
      const birthStored = values.birth_date ? format(values.birth_date, "yyyy-MM-dd") : null;
      const controlStored = computeArtistControl(values.artist_firstname, values.artist_lastname, values.artist_typ);

      const payloadBase = {
        artist_firstname: values.artist_firstname,
        artist_lastname: values.artist_lastname,
        artist_typ: values.artist_typ.join(" | "),
        artist_bio: frBioStored || null,
        artist_control: controlStored,
        artist_email: (values.email ?? "").trim() || null,
        artist_phone: phoneStored || null,
        artist_birth_date: birthStored,
      };

      let savedArtistId = editingArtistId ?? null;

      if (editingArtistId) {
        if (photoPublicUrl) {
          const payloadCandidates: ArtistsTableUpdate[] = [
            { ...payloadBase, artist_image: photoPublicUrl },
            { ...payloadBase, artist_photo_url: photoPublicUrl },
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
          const { error } = await supabase.from("artists").update(payloadBase).eq("artist_id", editingArtistId);
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
          { ...payloadBase, artist_image: photoPublicUrl },
          { ...payloadBase, artist_photo_url: photoPublicUrl },
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

      const agencyBioPayload: ArtistAgencyDetailsRow = {
        artist_id: savedArtistId,
        agency_id: currentAgencyId,
        agency_specific_bio: frBioStored || null,
      };

      const { error: agencyBioError } = await supabase
        .from("artist_agency_details")
        .upsert(agencyBioPayload, {
          onConflict: "artist_id,agency_id",
        });

      if (agencyBioError) {
        throw new Error(`Bio agence : ${agencyBioError.message}`);
      }

      for (const lang of ARTIST_BIO_LANGUAGES) {
        await upsertArtistBioRow(savedArtistId, currentAgencyId, lang, biosDraft[lang]);
      }

      await persistSocialLinks(savedArtistId);

      bypassCloseConfirmRef.current = true;
      onOpenChange(false);
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
    form.setValue("artist_typ", next, { shouldValidate: true });
  };

  const artistTitleName = [form.watch("artist_firstname"), form.watch("artist_lastname")]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (bypassCloseConfirmRef.current) {
            bypassCloseConfirmRef.current = false;
            onOpenChange(false);
            return;
          }
          if (editingArtistId && hasArtistChanges) {
            const ok = window.confirm("Des modifications non enregistrées existent. Fermer la fiche ?");
            if (!ok) return;
          }
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        hideCloseButton
        className={cn(
          "max-w-3xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl",
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2 px-4 sm:px-5 pb-4">
            <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
              <div className="flex flex-col gap-3 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <h2 className="min-w-0 shrink font-serif text-xl text-white sm:text-2xl sm:pr-2">
                  {editingArtistId
                    ? t("dialog_title_edit", { name: artistTitleName || t("dialog_title_artist_fallback") })
                    : t("dialog_title_create")}
                </h2>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {editingArtistId && ficheReadOnly && (
                    <Button
                      type="button"
                      className="h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                      onClick={() => setFicheReadOnly(false)}
                    >
                      {t("btn_modify")}
                    </Button>
                  )}

                  {canShowGenerateBio && (
                    <Button
                      type="button"
                      variant="default"
                      className="h-9 px-3 text-sm shrink-0 gap-2 border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                      onClick={() => void handleGenerateBio()}
                      disabled={generatingBio || !hasTripleRequired}
                    >
                      {generatingBio ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("btn_generating_bio")}
                        </>
                      ) : (
                        t("btn_generate_bio")
                      )}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="default"
                    className="h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                    onClick={() => onOpenChange(false)}
                  >
                    {t("btn_cancel")}
                  </Button>

                  {!ficheReadOnly && (
                    <Button
                      type="submit"
                      disabled={!canShowSave || isSubmitting || processingPhoto}
                      className={
                        editingArtistId
                          ? `h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] ${
                              !hasArtistChanges && !hasAnyBioDraft ? "invisible pointer-events-none" : ""
                            }`
                          : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
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
              <div className="flex h-[180px] min-h-0 min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-sm font-medium leading-none">{t("bio_label")}</span>
                  {!ficheReadOnly && <RequiredAsterisk />}
                </div>

                {biosLoading && editingArtistId ? (
                  <div className="flex min-h-[200px] items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/20 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                    <span>{t("loading_bio_tabs", "Chargement des biographies…")}</span>
                  </div>
                ) : (
                  <Tabs value={activeLanguage} onValueChange={(v) => setActiveLanguage(v as Language)}>
                    <TabsList className="flex h-auto min-h-9 w-full flex-wrap justify-start gap-1">
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

                    {ARTIST_BIO_LANGUAGES.map((lang) => (
                      <TabsContent key={lang} value={lang}>
                        <Textarea
                          value={biosDraft[lang]}
                          onChange={(e) =>
                            setBiosDraft((prev) => ({
                              ...prev,
                              [lang]: e.target.value,
                            }))
                          }
                          placeholder={`Bio en ${lang.toUpperCase()}...`}
                          rows={14}
                          disabled={ficheReadOnly}
                          spellCheck
                          lang={lang}
                          className="w-full min-h-[240px] min-w-0 resize-y overflow-y-auto p-2 text-xs leading-snug shadow-none"
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </div>

              {!ficheReadOnly && (
                <p className="text-xs text-destructive -mt-0.5">
                  <span className="font-semibold">*</span> {t("required_fields_note")}
                </p>
              )}

              {duplicateRow && !editingArtistId && !ficheReadOnly && (
                <Alert variant="destructive" className="border-destructive/60">
                  <AlertTitle>{t("duplicate_title")}</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{t("duplicate_desc")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={handleDuplicateNo}>
                        {t("btn_duplicate_no")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="gradient-gold gradient-gold-hover-bg text-primary-foreground"
                        onClick={handleDuplicateYes}
                      >
                        {t("btn_duplicate_yes")}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {needsAgencyPicker && (
                <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
                  <Label htmlFor="artist-target-agency" className="inline-flex items-center">
                    {t("agency_label")}
                    {!ficheReadOnly && <RequiredAsterisk />}
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">{t("agency_hint")}</p>

                  {loadingAgencies ? (
                    <p className="text-xs text-muted-foreground">{t("agency_loading")}</p>
                  ) : (
                    <Select
                      value={selectedAgencyId}
                      onValueChange={(v) => setSelectedAgencyId(v)}
                      disabled={ficheReadOnly || agencyOptions.length === 0}
                    >
                      <SelectTrigger id="artist-target-agency" disabled={ficheReadOnly || agencyOptions.length === 0}>
                        <SelectValue
                          placeholder={agencyOptions.length ? t("agency_select_placeholder") : t("agency_select_empty")}
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {agencyOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="group relative h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
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
                        setPendingPhotoFile(null);
                        return;
                      }

                      void (async () => {
                        setProcessingPhoto(true);
                        try {
                          const prepared = await prepareImageForSupabaseUpload(f);
                          setPendingPhotoFile(prepared);
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Traitement de l’image impossible.";
                          toast.error(msg);
                          setPendingPhotoFile(null);
                        } finally {
                          setProcessingPhoto(false);
                        }
                      })();
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
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
                              disabled={ficheReadOnly || Boolean(editingArtistId)}
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
                              disabled={ficheReadOnly || Boolean(editingArtistId)}
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
                    <div className="min-w-0 w-full sm:flex-[2]">
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
                                      "h-10 w-full justify-between font-normal",
                                      !artistTyp?.length && "text-muted-foreground",
                                    )}
                                  >
                                    {artistTyp?.length
                                      ? t("form_art_types_count", { count: artistTyp.length })
                                      : t("form_art_types_empty")}
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

                    <div className="min-w-0 w-full sm:flex-1">
                      <FormField
                        control={form.control}
                        name="birth_date"
                        render={({ field }) => (
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
                                      "h-10 w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground",
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "PPP", { locale: fr })
                                    ) : (
                                      <span>{t("form_birthdate_placeholder")}</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>

                              <PopoverContent className="w-auto p-0" align="start">
                                <BirthDatePickerFr
                                  selected={field.value ?? undefined}
                                  onSelect={field.onChange}
                                  fromYear={1920}
                                  toYear={new Date().getFullYear()}
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-10">
                <FormField
                  control={form.control}
                  name="artist_address"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-5">
                      <FormLabel>{t("form_address_label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form_address_placeholder")} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="artist_zipcode"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("form_zipcode_label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form_zipcode_placeholder")} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="artist_city"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-3">
                      <FormLabel>{t("form_city_label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form_city_placeholder")} {...field} disabled={ficheReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {checkingDuplicate && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("checking_duplicate")}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="pays"
                  render={({ field }) => (
                    <FormItem>
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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form_phone_label")}</FormLabel>
                      <FormControl>
                        <SmartPhoneInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onValidityChange={setPhoneValid}
                          countryName={pays}
                          onCountryNameChange={(name) =>
                            form.setValue("pays", name, { shouldDirty: true, shouldValidate: true })
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

              <Separator className="my-0" />

              <div className={cn(!editingArtistId && "-mt-3")}>
                {!editingArtistId ? (
                  <div className="mb-[5px] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className="min-w-0 flex-1 text-sm leading-snug text-muted-foreground">
                      {t("form_social_label")}
                    </span>
                  </div>
                ) : (
                  <Label className="mb-1 block text-sm font-medium leading-tight">
                    {t("form_social_label")}
                  </Label>
                )}

                <div className="grid max-h-[140px] gap-1 overflow-y-auto overflow-x-hidden pr-1">
                  {SOCIAL_LINK_TYPES.map((type) => (
                    <FormField
                      key={type}
                      control={form.control}
                      name={`social.${type}` as const}
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <div className="grid gap-1 sm:grid-cols-[minmax(0,7.5rem)_1fr] sm:items-center">
                            <FormLabel className="text-xs font-normal leading-tight text-muted-foreground">
                              {type === "web" ? "Web" : type}
                            </FormLabel>
                            <FormControl>
                              <Input
                                className="h-8 text-sm"
                                placeholder="https://…"
                                {...field}
                                disabled={ficheReadOnly}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}