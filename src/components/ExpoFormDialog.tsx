import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, Languages, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { assertImageFileAllowed, prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { uploadExpoLogo } from "@/lib/storagePaths";
import {
  fieldLabel,
  filterExpoFormKeys,
  isExpoLogoField,
  isReadonlyExpoKey,
  parseInputForKey,
  skipKeyOnInsert,
  sortExpoFieldKeys,
  valueToInputString,
} from "@/lib/expoFormUtils";
import { sanitizeTranslationOutput } from "@/lib/sanitizeTranslationOutput";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { SponsorDialog, type Sponsor, type SponsorLogoEntry } from "@/components/SponsorDialog";
import {
  ExpoHorairesEditor,
  type ExpoHoraires,
  HORAIRES_VIDE,
  parseExpoHoraires,
} from "@/components/ExpoHorairesEditor";
import { ExpoEmotionsDialog } from "@/components/ExpoEmotionsDialog";

type Mode = "create" | "edit";

export type ExpoFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  expoId: string | null;
  /** Colonnes connues (sans `*_id`), issues d’un `select * limit 1` ou repli minimal. */
  fieldKeys: string[];
  onSuccess: () => void;
  /** Propagation des logos sponsors vers la page parente (cartes expo). */
  onSponsorsChange?: (logos: SponsorLogoEntry[], scopeExpoId: string | null, sponsors: Sponsor[]) => void;
  /** Vrai pour les admins globaux (role_id < 4) — affiche le sélecteur d'agence. */
  canPickAgency?: boolean;
};

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

async function uploadExpoLogoToStorage(file: File, expoId: string, t: TFunction): Promise<string> {
  const prepared = await prepareImageForSupabaseUpload(file);
  const id = expoId.trim();
  if (!id) throw new Error(t("form.logo_expo_id_required"));
  try {
    return await uploadExpoLogo(id, prepared, prepared.name);
  } catch (primaryErr) {
    const ext = prepared.name.split(".").pop()?.toLowerCase() || "webp";
    const legacyPath = `expos/logos/${crypto.randomUUID()}.${ext}`;
    const legacyBucket = import.meta.env.VITE_SUPABASE_ARTIST_PHOTOS_BUCKET?.trim() || "artist-photos";
    const { error } = await supabase.storage.from(legacyBucket).upload(legacyPath, prepared, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      throw primaryErr instanceof Error ? primaryErr : new Error(String(primaryErr));
    }
    const { data: pub } = supabase.storage.from(legacyBucket).getPublicUrl(legacyPath);
    return pub.publicUrl;
  }
}

function revokeLogoPreviews(urls: Record<string, string>) {
  for (const u of Object.values(urls)) {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }
}

type AgencyOption = { id: string; name: string };
type CuratorOption = { id: string; label: string; email: string };

const DESCRIPT_LANGS = ["fr", "en", "de", "es", "it"] as const;

function parseExpoDescriptI18n(raw: string): Record<string, string> {
  try {
    const p = JSON.parse(raw || "{}") as unknown;
    if (typeof p === "object" && p !== null) {
      const { source_lang: _, ...rest } = p as Record<string, string>;
      const cleaned: Record<string, string> = {};
      for (const [lang, value] of Object.entries(rest)) {
        if (typeof value === "string") cleaned[lang] = sanitizeTranslationOutput(value);
      }
      return cleaned;
    }
  } catch {
    if (raw.trim()) return { fr: sanitizeTranslationOutput(raw.trim()) };
  }
  return {};
}

export function ExpoFormDialog({ open, onOpenChange, mode, expoId, fieldKeys, onSuccess, onSponsorsChange, canPickAgency = false }: ExpoFormDialogProps) {
  const { i18n, t } = useTranslation("expos");
  const { role_id } = useAuthUser();
  const canTriggerTranslation = typeof role_id === "number" && role_id < 6 && mode === "edit" && !!expoId;
  const [translating, setTranslating] = useState(false);
  const [translatingLangs, setTranslatingLangs] = useState<Set<string>>(new Set());
  const [descriptLang, setDescriptLang] = useState<string>("fr");
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showEmotionsDialog, setShowEmotionsDialog] = useState(false);
  const [showSponsorDialog, setShowSponsorDialog] = useState(false);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("");
  const [initialSelectedAgencyId, setInitialSelectedAgencyId] = useState<string>("");
  const [curatorUsers, setCuratorUsers] = useState<CuratorOption[]>([]);
  const [curatorOpen, setCuratorOpen] = useState(false);
  const [selectedCuratorId, setSelectedCuratorId] = useState<string>("");
  const [initialSelectedCuratorId, setInitialSelectedCuratorId] = useState<string>("");
  /** Nom commissaire chargé depuis la DB, pour pré-sélectionner le picker une fois la liste prête. */
  const [pendingCuratorLabel, setPendingCuratorLabel] = useState<string>("");
  const [horaires, setHoraires] = useState<ExpoHoraires>({ ...HORAIRES_VIDE });
  const [initialHoraires, setInitialHoraires] = useState<ExpoHoraires>({ ...HORAIRES_VIDE });
  const [typeNavigation, setTypeNavigation] = useState<boolean>(false);
  const [initialTypeNavigation, setInitialTypeNavigation] = useState<boolean>(false);
  const [expoIndoor, setExpoIndoor] = useState<boolean>(true);
  const [initialExpoIndoor, setInitialExpoIndoor] = useState<boolean>(true);
  const [sponsorLogos, setSponsorLogos] = useState<SponsorLogoEntry[]>([]);
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  /** Fichier image choisi pour un champ logo (avant enregistrement). */
  const [logoFileByKey, setLogoFileByKey] = useState<Record<string, File | null>>({});
  const [logoPreviewByKey, setLogoPreviewByKey] = useState<Record<string, string>>({});
  const [activeKeys, setActiveKeys] = useState<string[]>(
    sortExpoFieldKeys(fieldKeys.length ? fieldKeys : ["id", "expo_name"]),
  );

  const sortedKeys = sortExpoFieldKeys(activeKeys.length ? activeKeys : ["id", "expo_name"]);

  // Chargement de la liste des agences (uniquement pour les admins globaux)
  useEffect(() => {
    if (!canPickAgency || !open) return;
    supabase
      .from("agencies")
      .select("id, name_agency")
      .order("name_agency", { ascending: true })
      .then(({ data }) => {
        setAgencies(((data ?? []) as Array<{ id: string; name_agency: string }>).map((a) => ({ id: a.id, name: a.name_agency })));
      });
  }, [canPickAgency, open]);

  const applySponsorLogos = useCallback((logos: SponsorLogoEntry[]) => {
    setSponsorLogos([...logos]);
  }, []);

  // Chargement des logos sponsors de l'expo (mode édition uniquement)
  const loadSponsorLogos = useCallback(async () => {
    if (mode !== "edit" || !expoId) {
      setSponsorLogos([]);
      return;
    }
    const { data, error } = await supabase
      .from("sponsors")
      .select("id, nom_sponsor, url_logo_sponsor")
      .eq("id_expo", expoId)
      .not("url_logo_sponsor", "is", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[ExpoFormDialog] loadSponsorLogos:", error.message);
      return;
    }
    applySponsorLogos(
      (data ?? [])
        .filter((s) => (s as { url_logo_sponsor?: string }).url_logo_sponsor)
        .map((s) => ({
          id: (s as { id: string }).id,
          url: (s as { url_logo_sponsor: string }).url_logo_sponsor,
          nom: (s as { nom_sponsor: string }).nom_sponsor ?? "",
        })),
    );
  }, [mode, expoId, applySponsorLogos]);

  useEffect(() => {
    if (!open) return;
    void loadSponsorLogos();
  }, [open, loadSponsorLogos]);

  // Chargement des members de l'agence pour le picker curator
  useEffect(() => {
    if (!selectedAgencyId || !open) {
      setCuratorUsers([]);
      return;
    }
    supabase
      .from("agency_users")
      .select("user_id")
      .eq("agency_id", selectedAgencyId)
      .then(async ({ data: auRows }) => {
        const ids = [...new Set((auRows ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
        if (!ids.length) { setCuratorUsers([]); return; }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, username")
          .in("id", ids);
        const byId = new Map<string, CuratorOption>();
        for (const p of profiles ?? []) {
          const pr = p as { id: string; first_name?: string | null; last_name?: string | null; username?: string | null };
          const full = [pr.first_name, pr.last_name].filter(Boolean).join(" ").trim();
          byId.set(pr.id, { id: pr.id, label: full || pr.username || pr.id, email: "" });
        }
        // Même nom affiché = un seul membre (évite doublons agency_users / comptes)
        const byLabel = new Map<string, CuratorOption>();
        for (const opt of [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"))) {
          const key = opt.label.toLowerCase();
          if (!byLabel.has(key)) byLabel.set(key, opt);
        }
        setCuratorUsers([...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, "fr")));
      });
  }, [selectedAgencyId, open]);

  // Pré-sélection du commissaire après chargement des membres de l'agence
  useEffect(() => {
    if (!pendingCuratorLabel.trim() || !curatorUsers.length) return;
    const hit = curatorUsers.find((u) => u.label === pendingCuratorLabel.trim());
    if (hit) {
      setSelectedCuratorId(hit.id);
      setInitialSelectedCuratorId(hit.id);
    }
    setPendingCuratorLabel("");
  }, [curatorUsers, pendingCuratorLabel]);

  const loadRow = useCallback(async () => {
    if (mode !== "edit" || !expoId) return;
    setLoadingRow(true);
    setLogoFileByKey({});
    setLogoPreviewByKey((prev) => {
      revokeLogoPreviews(prev);
      return {};
    });
    try {
      const { data, error } = await supabase.from("expos").select("*").eq("id", expoId).maybeSingle();
      if (error) throw error;
      const row = (data as Record<string, unknown> | null) ?? null;
      if (!row) {
        toast.error(t("form.expo_not_found"));
        onOpenChange(false);
        return;
      }
      const keys = sortExpoFieldKeys(filterExpoFormKeys(Object.keys(row)));
      const next: Record<string, string> = {};
      for (const k of keys) {
        next[k] = valueToInputString(row[k]);
      }
      setActiveKeys(keys);
      setValues(next);
      setInitialValues(next);
      // Toujours capturer l'agency_id (nécessaire pour le picker curator)
      const aid = typeof row.agency_id === "string" ? row.agency_id.trim() : "";
      setSelectedAgencyId(aid);
      setInitialSelectedAgencyId(aid);
      const savedCurator =
        (typeof row.curator_name === "string" ? row.curator_name.trim() : "") ||
        (typeof row.curator === "string" ? row.curator.trim() : "");
      setSelectedCuratorId("");
      setInitialSelectedCuratorId("");
      setPendingCuratorLabel(savedCurator);
      // Charger les horaires depuis le JSONB
      const loadedHoraires = parseExpoHoraires(row.expo_horaires);
      setHoraires(loadedHoraires);
      setInitialHoraires(loadedHoraires);
      // Charger type_navigation
      const loadedTypeNav = row.type_navigation === true;
      setTypeNavigation(loadedTypeNav);
      setInitialTypeNavigation(loadedTypeNav);
      const loadedExpoIndoor = row.expo_indoor !== false;
      setExpoIndoor(loadedExpoIndoor);
      setInitialExpoIndoor(loadedExpoIndoor);
    } catch (e) {
      toast.error(getErrorMessage(e, t("form.expo_load_failed")));
      onOpenChange(false);
    } finally {
      setLoadingRow(false);
    }
  }, [mode, expoId, onOpenChange, t]);

  useEffect(() => {
    if (!open) return;
    setDescriptLang(i18n.language?.slice(0, 2) || "fr");
    if (mode === "create") {
      setLogoFileByKey({});
      setLogoPreviewByKey((prev) => {
        revokeLogoPreviews(prev);
        return {};
      });
      const keys = sortExpoFieldKeys(fieldKeys.length ? fieldKeys : ["id", "expo_name"]);
      setActiveKeys(keys);
      const next: Record<string, string> = {};
      for (const k of keys) {
        if (skipKeyOnInsert(k)) continue;
        next[k] = "";
      }
      if (!keys.includes("id")) next.id = "";
      setValues(next);
      setInitialValues(next);
      if (canPickAgency) {
        setSelectedAgencyId("");
        setInitialSelectedAgencyId("");
      }
      setSelectedCuratorId("");
      setInitialSelectedCuratorId("");
      setPendingCuratorLabel("");
      const emptyHoraires = { ...HORAIRES_VIDE };
      setHoraires(emptyHoraires);
      setInitialHoraires(emptyHoraires);
      setTypeNavigation(false);
      setInitialTypeNavigation(false);
      setExpoIndoor(true);
      setInitialExpoIndoor(true);
      return;
    }
    void loadRow();
  }, [open, mode, expoId, fieldKeys, loadRow]);

  useEffect(() => {
    if (open) return;
    setLogoFileByKey({});
    setLogoPreviewByKey((prev) => {
      revokeLogoPreviews(prev);
      return {};
    });
  }, [open]);

  const handleSave = async () => {
    const expoName = (values["expo_name"] ?? "").trim();
    if (!expoName) {
      toast.error(t("form.expo_name_required"));
      return;
    }
    setSaving(true);
    try {
      const mergedValues = { ...values };
      const targetExpoId =
        mode === "edit"
          ? expoId?.trim() || ""
          : mergedValues.id?.trim() || crypto.randomUUID();

      for (const k of sortedKeys) {
        if (!isExpoLogoField(k)) continue;
        const file = logoFileByKey[k];
        if (file) {
          const url = await uploadExpoLogoToStorage(file, targetExpoId, t);
          mergedValues[k] = url;
        }
      }

      const curatorName = selectedCuratorId
        ? (curatorUsers.find((u) => u.id === selectedCuratorId)?.label ?? null)
        : null;

      if (mode === "create") {
        const payload: Record<string, unknown> = {};
        payload.id = targetExpoId;
        if (canPickAgency && selectedAgencyId) payload.agency_id = selectedAgencyId;
        if (curatorName) payload.curator_name = curatorName;
        payload.curator = null;
        payload.expo_horaires = horaires;
        payload.type_navigation = typeNavigation;
        payload.expo_indoor = expoIndoor;

        for (const k of sortedKeys) {
          if (k === "id") continue;
          if (k.endsWith("_id")) continue;
          if (skipKeyOnInsert(k)) continue;
          const raw = mergedValues[k] ?? "";
          const parsed = parseInputForKey(k, raw);
          if (parsed !== null && parsed !== "") payload[k] = parsed;
        }

        const { error } = await supabase.from("expos").insert(payload as never);
        if (error) throw error;
        toast.success(t("form.expo_created"));
      } else {
        if (!expoId) return;
        const payload: Record<string, unknown> = {};
        if (canPickAgency) payload.agency_id = selectedAgencyId || null;
        payload.curator_name = curatorName;
        payload.curator = null;
        payload.expo_horaires = horaires;
        payload.type_navigation = typeNavigation;
        payload.expo_indoor = expoIndoor;
        for (const k of Object.keys(mergedValues)) {
          if (k === "id" || k.endsWith("_id") || k === "created_at" || k === "updated_at") continue;
          const raw = mergedValues[k] ?? "";
          const t = raw.trim();
          payload[k] = t === "" ? null : parseInputForKey(k, raw);
        }
        const { error } = await supabase.from("expos").update(payload as never).eq("id", expoId);
        if (error) throw error;
        toast.success(t("form.expo_updated"));
      }
      onSuccess();
      setValues(mergedValues);
      setInitialValues(mergedValues);
      setInitialSelectedAgencyId(selectedAgencyId);
      setInitialSelectedCuratorId(selectedCuratorId);
      setInitialHoraires(horaires);
      setInitialTypeNavigation(typeNavigation);
      setInitialExpoIndoor(expoIndoor);
      setLogoFileByKey({});
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, t("form.save_failed_rls")));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Crée tous les jobs translate_fiche en parallèle (inserts rapides),
   * puis exécute les workers UN PAR UN pour éviter le rate-limit Groq.
   * Après chaque langue réussie, recharge expo_descript_i18n depuis la DB.
   */
  const reloadExpoDescriptFromDb = async () => {
    if (!expoId) return;
    const { data: expoRow } = await supabase
      .from("expos")
      .select("expo_descript_i18n")
      .eq("id", expoId)
      .single();
    if (!expoRow) return;
    const raw = (expoRow as { expo_descript_i18n?: unknown }).expo_descript_i18n;
    const str = typeof raw === "string" ? raw : JSON.stringify(raw ?? {});
    setValues((prev) => ({ ...prev, expo_descript_i18n: str }));
    setInitialValues((prev) => ({ ...prev, expo_descript_i18n: str }));
  };

  const triggerExpoTranslation = async (sourceText: string, sourceLang: string) => {
    if (!canTriggerTranslation || !expoId) return;
    if (!sourceText.trim()) {
      toast.error(t("form.translate_source_required"));
      return;
    }
    const targetLangs = DESCRIPT_LANGS.filter((l) => l !== sourceLang);
    setTranslating(true);
    setTranslatingLangs(new Set(targetLangs));
    let okCount = 0;
    let failCount = 0;
    try {
      const parsed = parseExpoDescriptI18n(values.expo_descript_i18n ?? "");
      const updatedSource = { ...parsed, [sourceLang]: sourceText.trim() };
      const serialized = JSON.stringify(updatedSource);
      setValues((prev) => ({ ...prev, expo_descript_i18n: serialized }));

      const { error: saveErr } = await supabase
        .from("expos")
        .update({ expo_descript_i18n: updatedSource })
        .eq("id", expoId);
      if (saveErr) {
        toast.error(t("form.translate_save_source_failed", { message: saveErr.message }));
        return;
      }

      const { invokeAiWorker } = await import("@/lib/aiJobs/invokeAiWorker");

      const jobEntries = await Promise.all(
        targetLangs.map(async (targetLang) => {
          const { data, error } = await supabase.functions.invoke("ai-create-job", {
            body: {
              job_type: "translate_fiche",
              payload: { expo_id: expoId, sourceLang, targetLang, texteSource: sourceText.trim() },
              model: "llama-3.1-8b-instant",
            },
          });
          if (error) {
            console.error(`[triggerExpoTranslation] create failed for ${targetLang}`, error);
            return { lang: targetLang, jobId: null as string | null };
          }
          const jobId = (data as { job?: { id?: string } })?.job?.id ?? null;
          return { lang: targetLang, jobId };
        }),
      );

      for (const { lang, jobId } of jobEntries) {
        if (!jobId) {
          failCount += 1;
          setTranslatingLangs((prev) => { const s = new Set(prev); s.delete(lang); return s; });
          continue;
        }
        try {
          const result = await invokeAiWorker(jobId);
          if (!result.ok) {
            failCount += 1;
            console.warn(`[triggerExpoTranslation] worker ${lang}:`, result.message);
          } else {
            okCount += 1;
            await reloadExpoDescriptFromDb();
          }
        } catch (workerErr) {
          failCount += 1;
          console.warn(`[triggerExpoTranslation] worker ${lang}:`, workerErr);
        } finally {
          setTranslatingLangs((prev) => { const s = new Set(prev); s.delete(lang); return s; });
        }
      }

      if (okCount > 0 && failCount === 0) {
        toast.success(t("form.translate_done"));
      } else if (okCount > 0) {
        toast.warning(t("form.translate_partial", { ok: okCount, fail: failCount }));
      } else {
        toast.error(t("form.translate_none"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("form.translate_error"));
    } finally {
      setTranslating(false);
      setTranslatingLangs(new Set());
    }
  };

  const shouldUseTextarea = (key: string) =>
    /description|notes|bio|address|json|metadata|data/i.test(key) || (values[key]?.length ?? 0) > 120;
  const canEditFields = true;
  const hasFormChanges =
    JSON.stringify(values) !== JSON.stringify(initialValues) ||
    Object.values(logoFileByKey).some((file) => file !== null) ||
    (canPickAgency && selectedAgencyId !== initialSelectedAgencyId) ||
    selectedCuratorId !== initialSelectedCuratorId ||
    JSON.stringify(horaires) !== JSON.stringify(initialHoraires) ||
    typeNavigation !== initialTypeNavigation ||
    expoIndoor !== initialExpoIndoor;
  const requestClose = () => {
    if (mode === "edit" && hasFormChanges) {
      setShowCloseConfirm(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          requestClose();
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] max-h-[min(92dvh,100%)] max-w-5xl overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{mode === "create" ? t("form.title_create") : t("form.title_edit")}</DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="min-w-0 font-serif text-lg text-white sm:text-2xl">
              {mode === "create" ? t("form.title_create") : t("form.title_edit")}
            </h2>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {mode === "edit" && expoId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmotionsDialog(true)}
                  disabled={saving || loadingRow}
                  className="h-9 w-full px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] sm:w-auto"
                >
                  {t("form.adjust_emotions")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={saving || loadingRow}
                className="h-9 w-full px-3 text-sm border border-white/70 bg-transparent text-white hover:bg-white/10 sm:w-auto"
              >
                {t("form.close")}
              </Button>
              <Button
                type="button"
                variant="default"
                className={mode === "edit"
                  ? `h-9 w-full px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] sm:w-auto ${
                      !hasFormChanges ? "invisible pointer-events-none" : ""
                    }`
                  : "h-9 w-full px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground sm:w-auto"}
                onClick={() => {
                  void handleSave();
                }}
                disabled={saving || loadingRow || (mode === "edit" && !hasFormChanges)}
              >
                {saving
                  ? t("form.saving")
                  : mode === "create"
                    ? t("form.save")
                    : t("form.save_changes")}
              </Button>
            </div>
          </div>
        </div>

        <div className="min-w-0 px-4 sm:px-5 pt-3 pb-4">
          {loadingRow ? (
            <p className="text-sm text-muted-foreground py-6">{t("form.loading")}</p>
          ) : (
            <div className="grid min-w-0 gap-3 py-1">

              {/* Sélecteur d'agence — admins globaux uniquement (role_id < 4) */}
              {canPickAgency && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("form.agency_label")}</Label>
                  <Popover open={agencyOpen} onOpenChange={setAgencyOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={agencyOpen}
                        className="w-full justify-between font-normal shadow-none"
                        disabled={saving}
                      >
                        <span className="truncate">
                          {selectedAgencyId
                            ? (agencies.find((a) => a.id === selectedAgencyId)?.name ?? selectedAgencyId)
                            : t("form.no_agency")}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("form.search_agency")} className="h-9" />
                        <CommandList>
                          <CommandEmpty>{t("form.no_agency_found")}</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => { setSelectedAgencyId(""); setAgencyOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !selectedAgencyId ? "opacity-100" : "opacity-0")} />
                              {t("form.no_agency")}
                            </CommandItem>
                            {agencies.map((a) => (
                              <CommandItem
                                key={a.id}
                                value={a.name}
                                onSelect={() => { setSelectedAgencyId(a.id); setAgencyOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedAgencyId === a.id ? "opacity-100" : "opacity-0")} />
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

              {/* Picker curator — affiché dès qu'une agence est connue */}
              {selectedAgencyId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("form.curator_label")}</Label>
                  <Popover open={curatorOpen} onOpenChange={setCuratorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={curatorOpen}
                        className="w-full justify-between font-normal shadow-none"
                        disabled={saving}
                      >
                        <span className="truncate">
                          {selectedCuratorId
                            ? (curatorUsers.find((u) => u.id === selectedCuratorId)?.label ?? t("form.unknown_user"))
                            : t("form.no_curator")}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("form.search_member")} className="h-9" />
                        <CommandList>
                          <CommandEmpty>{t("form.no_member_found")}</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => { setSelectedCuratorId(""); setCuratorOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !selectedCuratorId ? "opacity-100" : "opacity-0")} />
                              {t("form.no_curator")}
                            </CommandItem>
                            {curatorUsers.map((u) => (
                              <CommandItem
                                key={u.id}
                                value={`${u.id} ${u.label}`}
                                onSelect={() => { setSelectedCuratorId(u.id); setCuratorOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedCuratorId === u.id ? "opacity-100" : "opacity-0")} />
                                {u.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {sortedKeys.map((key) => {
              const readonly = isReadonlyExpoKey(key, mode);
              const hiddenOnCreate = mode === "create" && skipKeyOnInsert(key);
              if (hiddenOnCreate) return null;

              const v = values[key] ?? "";
              const multiline = shouldUseTextarea(key);
              const isDatePicker = key === "date_expo_du" || key === "date_expo_au";
              const isLogo = isExpoLogoField(key);
              const previewUrl = logoPreviewByKey[key];
              const showStoredLogo = v.trim() && !previewUrl;

              // date_expo_au est rendu dans le bloc de date_expo_du — on le saute ici
              if (key === "date_expo_au" && sortedKeys.includes("date_expo_du")) return null;

              // date_expo_du est rendu dans le bloc expo_name — on le saute ici
              if (
                key === "date_expo_du" &&
                sortedKeys.includes("expo_name") &&
                sortedKeys.includes("date_expo_au")
              ) return null;

              // expo_name : si les deux dates sont présentes, les rendre à droite sur la même ligne
              if (
                key === "expo_name" &&
                sortedKeys.includes("date_expo_du") &&
                sortedKeys.includes("date_expo_au")
              ) {
                const nameRo = isReadonlyExpoKey("expo_name", mode);
                const nameV = values["expo_name"] ?? "";
                const dateKeys = ["date_expo_du", "date_expo_au"] as const;
                return (
                  <div key="name-dates" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor="expo-field-expo_name" className="text-xs font-medium">
                        {fieldLabel("expo_name")}
                      </Label>
                      <Input
                        id="expo-field-expo_name"
                        name="expo_expo_name"
                        value={nameV}
                        readOnly={nameRo || !canEditFields}
                        className={cn("shadow-none", nameRo ? "bg-muted/50" : "")}
                        onChange={(e) => setValues((prev) => ({ ...prev, expo_name: e.target.value }))}
                      />
                    </div>
                    {dateKeys.map((dk) => {
                      const dv = values[dk] ?? "";
                      const dReadonly = isReadonlyExpoKey(dk, mode);
                      const dHidden = mode === "create" && skipKeyOnInsert(dk);
                      if (dHidden) return null;
                      return (
                        <div key={dk} className="w-full min-w-0 space-y-1.5 sm:w-[130px] sm:shrink-0">
                          <Label htmlFor={`expo-field-${dk}`} className="text-xs font-medium">
                            {fieldLabel(dk)}
                          </Label>
                          <Input
                            id={`expo-field-${dk}`}
                            name={`expo_${dk}`}
                            type="date"
                            value={dv ? dv.slice(0, 10) : ""}
                            readOnly={dReadonly || !canEditFields}
                            className={cn("w-full shadow-none sm:w-[130px] sm:px-0", dReadonly ? "bg-muted/50" : "")}
                            onChange={(e) => setValues((prev) => ({ ...prev, [dk]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // Rendu côte à côte des deux champs date (fallback sans expo_name)
              if (key === "date_expo_du" && sortedKeys.includes("date_expo_au")) {
                const dateKeys = ["date_expo_du", "date_expo_au"] as const;
                return (
                  <div key="date-range" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    {dateKeys.map((dk) => {
                      const dv = values[dk] ?? "";
                      const dReadonly = isReadonlyExpoKey(dk, mode);
                      const dHidden = mode === "create" && skipKeyOnInsert(dk);
                      if (dHidden) return null;
                      return (
                        <div key={dk} className="w-full min-w-0 space-y-1.5 sm:w-[130px]">
                          <Label htmlFor={`expo-field-${dk}`} className="text-xs font-medium">
                            {fieldLabel(dk)}
                          </Label>
                          <Input
                            id={`expo-field-${dk}`}
                            name={`expo_${dk}`}
                            type="date"
                            value={dv ? dv.slice(0, 10) : ""}
                            readOnly={dReadonly || !canEditFields}
                            className={cn("w-full shadow-none sm:w-[130px] sm:px-0", dReadonly ? "bg-muted/50" : "")}
                            onChange={(e) => setValues((prev) => ({ ...prev, [dk]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // city_expo est rendu dans le bloc zip_expo — on le saute ici
              if (key === "city_expo" && sortedKeys.includes("zip_expo")) return null;

              // zip_expo : rendu côte à côte avec city_expo (zip à gauche w-150px, ville flex-1)
              if (key === "zip_expo" && sortedKeys.includes("city_expo")) {
                const zipV = values["zip_expo"] ?? "";
                const cityV = values["city_expo"] ?? "";
                const zipRo = isReadonlyExpoKey("zip_expo", mode);
                const cityRo = isReadonlyExpoKey("city_expo", mode);
                return (
                  <div key="zip-city" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="w-full min-w-0 space-y-1.5 sm:w-[150px] sm:shrink-0">
                      <Label htmlFor="expo-field-zip_expo" className="text-xs font-medium">
                        {fieldLabel("zip_expo")}
                      </Label>
                      <Input
                        id="expo-field-zip_expo"
                        name="expo_zip_expo"
                        value={zipV}
                        readOnly={zipRo || !canEditFields}
                        className={cn("shadow-none", zipRo ? "bg-muted/50" : "")}
                        onChange={(e) => setValues((prev) => ({ ...prev, zip_expo: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <Label htmlFor="expo-field-city_expo" className="text-xs font-medium">
                        {fieldLabel("city_expo")}
                      </Label>
                      <Input
                        id="expo-field-city_expo"
                        name="expo_city_expo"
                        value={cityV}
                        readOnly={cityRo || !canEditFields}
                        className={cn("shadow-none", cityRo ? "bg-muted/50" : "")}
                        onChange={(e) => setValues((prev) => ({ ...prev, city_expo: e.target.value }))}
                      />
                    </div>
                  </div>
                );
              }

              // tel_ref_expo est rendu dans le bloc ref_expo — on le saute ici
              if (key === "tel_ref_expo" && sortedKeys.includes("ref_expo")) return null;

              // ref_expo : rendu côte à côte avec tel_ref_expo (ref flex-1, tél flex-1)
              if (key === "ref_expo" && sortedKeys.includes("tel_ref_expo")) {
                const refV = values["ref_expo"] ?? "";
                const telV = values["tel_ref_expo"] ?? "";
                const refRo = isReadonlyExpoKey("ref_expo", mode);
                const telRo = isReadonlyExpoKey("tel_ref_expo", mode);
                return (
                  <div key="ref-tel" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <Label htmlFor="expo-field-ref_expo" className="text-xs font-medium">
                        {fieldLabel("ref_expo")}
                      </Label>
                      <Input
                        id="expo-field-ref_expo"
                        name="expo_ref_expo"
                        value={refV}
                        readOnly={refRo || !canEditFields}
                        className={cn("shadow-none", refRo ? "bg-muted/50" : "")}
                        onChange={(e) => setValues((prev) => ({ ...prev, ref_expo: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <Label htmlFor="expo-field-tel_ref_expo" className="text-xs font-medium">
                        {fieldLabel("tel_ref_expo")}
                      </Label>
                      <Input
                        id="expo-field-tel_ref_expo"
                        name="expo_tel_ref_expo"
                        value={telV}
                        readOnly={telRo || !canEditFields}
                        className={cn("shadow-none", telRo ? "bg-muted/50" : "")}
                        onChange={(e) => setValues((prev) => ({ ...prev, tel_ref_expo: e.target.value }))}
                      />
                    </div>
                  </div>
                );
              }

              // expo_descript_i18n : même pattern que VisitorWelcome.extractExpoDescription
              // Structure JSONB : { "fr": "...", "en": "...", "de": "...", "es": "...", "it": "..." }
              if (key === "expo_descript_i18n") {
                const parsed = parseExpoDescriptI18n(v);
                const displayText = parsed[descriptLang] ?? "";
                const getLangStatus = (l: string) =>
                  (parsed[l] ?? "").trim() ? "filled" : "empty";
                const translateTargets = DESCRIPT_LANGS
                  .filter((l) => l !== descriptLang)
                  .map((l) => l.toUpperCase())
                  .join("/");
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Label htmlFor="expo-field-expo_descript_i18n" className="text-xs font-medium">
                        {fieldLabel(key)}
                        <span className="ml-1.5 text-[10px] font-normal uppercase text-muted-foreground">
                          ({descriptLang})
                        </span>
                      </Label>
                      {canTriggerTranslation && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs shrink-0"
                          disabled={translating || !displayText.trim()}
                          onClick={() => void triggerExpoTranslation(displayText, descriptLang)}
                        >
                          {translating
                            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            : <Languages className="h-3 w-3" aria-hidden />}
                          {t("form.translate_button", { targets: translateTargets })}
                        </Button>
                      )}
                    </div>
                    <Textarea
                      id="expo-field-expo_descript_i18n"
                      rows={5}
                      className={cn("shadow-none min-h-[100px] resize-none", (!canEditFields || readonly) && "bg-muted/50")}
                      value={displayText}
                      readOnly={readonly || !canEditFields}
                      placeholder={t("form.descript_placeholder", { lang: descriptLang.toUpperCase() })}
                      onChange={(e) => {
                        const updated = { ...parsed, [descriptLang]: e.target.value };
                        setValues((prev) => ({ ...prev, expo_descript_i18n: JSON.stringify(updated) }));
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      {DESCRIPT_LANGS.map((l) => {
                        const status = getLangStatus(l);
                        const isRunning = translatingLangs.has(l);
                        const isCurrent = l === descriptLang;
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setDescriptLang(l)}
                            title={
                              isRunning ? t("form.lang_status_running", { lang: l.toUpperCase() })
                              : status === "filled" ? t("form.lang_status_filled", { lang: l.toUpperCase() })
                              : t("form.lang_status_empty", { lang: l.toUpperCase() })
                            }
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border transition-colors",
                              isRunning
                                ? "bg-amber-400/20 text-amber-700 border-amber-400/40 dark:text-amber-300"
                                : status === "filled"
                                ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground border-border/50",
                              isCurrent
                                ? "ring-1 ring-offset-1 ring-primary/60"
                                : "hover:bg-accent hover:text-accent-foreground",
                            )}
                          >
                            {isRunning && <Loader2 className="h-2 w-2 animate-spin" aria-hidden />}
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              if (isLogo) {
                const logoSrc = previewUrl || v.trim();
                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`expo-field-${key}`} className="text-xs font-medium">
                      {fieldLabel(key)}
                    </Label>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="mx-auto w-full max-w-[150px] shrink-0 space-y-2 lg:mx-0">
                        {(previewUrl || showStoredLogo) && (
                          <img
                            src={logoSrc}
                            alt=""
                            className="h-20 w-full rounded-md border border-border object-contain bg-muted/30"
                          />
                        )}
                        <Input
                          id={`expo-field-${key}`}
                          name={`expo_${key}`}
                          type="file"
                          accept="image/*"
                          disabled={readonly || saving || !canEditFields}
                          className="cursor-pointer shadow-none text-transparent file:text-foreground file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            e.target.value = "";
                            if (!file) return;
                            try {
                              assertImageFileAllowed(file);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : t("form.invalid_image_file"));
                              return;
                            }
                            setLogoFileByKey((prev) => ({ ...prev, [key]: file }));
                            setLogoPreviewByKey((prev) => {
                              const old = prev[key];
                              if (old) URL.revokeObjectURL(old);
                              return { ...prev, [key]: URL.createObjectURL(file) };
                            });
                          }}
                        />
                      </div>
                      {/* Navigation + lieu — à droite du logo, côte à côte */}
                      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                        <div className="w-full min-w-0 shrink-0 space-y-2 lg:w-[270px]">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("form.navTypeLabel")}
                          </p>
                          <div className="space-y-1.5">
                            <label className="flex cursor-pointer items-start gap-2 text-sm">
                              <input
                                type="radio"
                                name="type_navigation"
                                value="false"
                                checked={!typeNavigation}
                                onChange={() => setTypeNavigation(false)}
                                disabled={saving}
                                className="mt-0.5 accent-primary"
                              />
                              <span className="flex-1">{t("form.navTypeSameArtist")}</span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 text-sm">
                              <input
                                type="radio"
                                name="type_navigation"
                                value="true"
                                checked={typeNavigation}
                                onChange={() => setTypeNavigation(true)}
                                disabled={saving}
                                className="mt-0.5 accent-primary"
                              />
                              <span>{t("form.navTypeScanSequence")}</span>
                            </label>
                          </div>
                        </div>
                        <div className="w-full min-w-0 shrink-0 space-y-2 lg:w-[350px]">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("form.venueTypeLabel")}
                          </p>
                          <div className="space-y-1.5">
                            <label className="flex cursor-pointer items-start gap-2 text-sm">
                              <input
                                type="radio"
                                name="expo_indoor"
                                value="true"
                                checked={expoIndoor}
                                onChange={() => setExpoIndoor(true)}
                                disabled={saving}
                                className="mt-0.5 accent-primary"
                              />
                              <span className="flex-1">{t("form.venueIndoor")}</span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 text-sm">
                              <input
                                type="radio"
                                name="expo_indoor"
                                value="false"
                                checked={!expoIndoor}
                                onChange={() => setExpoIndoor(false)}
                                disabled={saving}
                                className="mt-0.5 accent-primary"
                              />
                              <span>{t("form.venueOutdoor")}</span>
                            </label>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              }

              return (
                <div key={key} className={cn("min-w-0 space-y-1.5", isDatePicker && "w-full sm:w-[150px]")}>
                  <Label htmlFor={`expo-field-${key}`} className="text-xs font-medium">
                    {fieldLabel(key)}
                    {key === "id" && mode === "create" && (
                      <span className="text-muted-foreground font-normal">{t("form.id_uuid_hint")}</span>
                    )}
                  </Label>
                  {multiline ? (
                    <Textarea
                      id={`expo-field-${key}`}
                      name={`expo_${key}`}
                      value={v}
                      readOnly={readonly || !canEditFields}
                      rows={4}
                      className={`min-h-[80px] shadow-none ${readonly ? "bg-muted/50" : ""}`}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  ) : isDatePicker ? (
                    <Input
                      id={`expo-field-${key}`}
                      name={`expo_${key}`}
                      type="date"
                      value={v ? v.slice(0, 10) : ""}
                      readOnly={readonly || !canEditFields}
                      className={cn("shadow-none w-auto", readonly ? "bg-muted/50" : "")}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`expo-field-${key}`}
                      name={`expo_${key}`}
                      value={v}
                      readOnly={readonly || !canEditFields}
                      className={cn(
                        readonly ? "bg-muted/50" : "shadow-none",
                        key === "expo_descript_i18n" && "h-[150px]",
                      )}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  )}
                </div>
              );
              })}
            </div>
          )}

          {/* Horaires d'ouverture + Sponsors côte-à-côte */}
          {!loadingRow && (
            <div className="mt-1 flex flex-col gap-4 border-t border-border pt-3 lg:flex-row lg:items-start lg:gap-6">
              <div className="w-full min-w-0 space-y-1.5 lg:w-[350px] lg:shrink-0">
                <Label className="text-xs font-medium">{t("form.opening_hours")}</Label>
                <ExpoHorairesEditor
                  value={horaires}
                  onChange={setHoraires}
                  disabled={saving}
                  readonly={!canEditFields}
                />
              </div>
              {sponsorLogos.length > 0 && (
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {t("form.sponsors_title")}
                  </p>
                  <Carousel
                    key={sponsorLogos.map((s) => s.id).join(",")}
                    orientation="vertical"
                    opts={{ align: "start", loop: true }}
                    className="w-full h-[200px]"
                  >
                    <CarouselContent className="-mt-2">
                      {sponsorLogos.map((s) => (
                        <CarouselItem key={s.id} className="pt-2 basis-1/2">
                          <div
                            className="flex h-16 items-center justify-center rounded-md border border-border bg-muted/20 p-1 cursor-pointer hover:border-primary hover:bg-muted/40 transition-colors"
                            title={t("form.sponsor_edit_title", { name: s.nom })}
                            onClick={() => { setSelectedSponsorId(s.id); setShowSponsorDialog(true); }}
                          >
                            <img key={`${s.id}-${s.url}`} src={s.url} alt={s.nom} className="max-h-full max-w-full object-contain" />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    {sponsorLogos.length > 2 && (
                      <>
                        <CarouselPrevious />
                        <CarouselNext />
                      </>
                    )}
                  </Carousel>
                </div>
              )}
            </div>
          )}

          {/* Bouton sponsors — disponible uniquement en mode édition */}
          {!loadingRow && mode === "edit" && expoId && (
            <div className="pt-3 border-t border-border mt-1">
              <Button
                type="button"
                variant="outline"
                className="w-full text-sm"
                onClick={() => setShowSponsorDialog(true)}
              >
                {t("form.add_sponsors")}
              </Button>
            </div>
          )}
        </div>

      </DialogContent>
      <SponsorDialog
        open={showSponsorDialog}
        onOpenChange={(v) => {
          setShowSponsorDialog(v);
          if (!v) setSelectedSponsorId(null);
        }}
        expoId={expoId}
        expoName={values["expo_name"] ?? ""}
        initialSponsorId={selectedSponsorId}
        onSponsorsChange={(logos, scopeExpoId) => {
          applySponsorLogos(logos);
          onSponsorsChange?.(logos, scopeExpoId);
        }}
      />

      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("form.close_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("form.close_confirm_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("form.no")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setShowCloseConfirm(false);
                onOpenChange(false);
              }}
            >
              {t("form.yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ExpoEmotionsDialog open={showEmotionsDialog} onOpenChange={setShowEmotionsDialog} />
    </Dialog>
  );
}
