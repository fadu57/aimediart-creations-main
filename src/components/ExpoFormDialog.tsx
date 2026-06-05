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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SponsorDialog } from "@/components/SponsorDialog";
import {
  ExpoHorairesEditor,
  type ExpoHoraires,
  HORAIRES_VIDE,
  parseExpoHoraires,
} from "@/components/ExpoHorairesEditor";

type Mode = "create" | "edit";

export type ExpoFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  expoId: string | null;
  /** Colonnes connues (sans `*_id`), issues d’un `select * limit 1` ou repli minimal. */
  fieldKeys: string[];
  onSuccess: () => void;
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

async function uploadExpoLogoToStorage(file: File, expoId: string): Promise<string> {
  const prepared = await prepareImageForSupabaseUpload(file);
  const id = expoId.trim();
  if (!id) throw new Error("Identifiant exposition requis pour le logo.");
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

export function ExpoFormDialog({ open, onOpenChange, mode, expoId, fieldKeys, onSuccess, canPickAgency = false }: ExpoFormDialogProps) {
  const { i18n } = useTranslation();
  const { role_id } = useAuthUser();
  const canTriggerTranslation = typeof role_id === "number" && role_id < 6 && mode === "edit" && !!expoId;
  const [translating, setTranslating] = useState(false);
  const [translatingLangs, setTranslatingLangs] = useState<Set<string>>(new Set());
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
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
  const [sponsorLogos, setSponsorLogos] = useState<{ url: string; nom: string }[]>([]);
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
        setAgencies((data ?? []).map((a) => ({ id: a.id as string, name: a.name_agency as string })));
      });
  }, [canPickAgency, open]);

  // Chargement des logos sponsors de l'expo (mode édition uniquement)
  useEffect(() => {
    if (!open || mode !== "edit" || !expoId) { setSponsorLogos([]); return; }
    supabase
      .from("sponsors")
      .select("nom_sponsor, url_logo_sponsor")
      .eq("id_expo", expoId)
      .not("url_logo_sponsor", "is", null)
      .then(({ data }) => {
        setSponsorLogos(
          (data ?? [])
            .filter((s) => (s as { url_logo_sponsor?: string }).url_logo_sponsor)
            .map((s) => ({
              url: (s as { url_logo_sponsor: string }).url_logo_sponsor,
              nom: (s as { nom_sponsor: string }).nom_sponsor ?? "",
            })),
        );
      });
  }, [open, mode, expoId]);

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
        toast.error("Exposition introuvable.");
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
    } catch (e) {
      toast.error(getErrorMessage(e, "Impossible de charger l’exposition."));
      onOpenChange(false);
    } finally {
      setLoadingRow(false);
    }
  }, [mode, expoId, onOpenChange]);

  useEffect(() => {
    if (!open) return;
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
      toast.error("Le nom de l'exposition est obligatoire.");
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
          const url = await uploadExpoLogoToStorage(file, targetExpoId);
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

        for (const k of sortedKeys) {
          if (k === "id") continue;
          if (k.endsWith("_id")) continue;
          if (skipKeyOnInsert(k)) continue;
          const raw = mergedValues[k] ?? "";
          const parsed = parseInputForKey(k, raw);
          if (parsed !== null && parsed !== "") payload[k] = parsed;
        }

        const { error } = await supabase.from("expos").insert(payload);
        if (error) throw error;
        toast.success("Exposition créée.");
      } else {
        if (!expoId) return;
        const payload: Record<string, unknown> = {};
        if (canPickAgency) payload.agency_id = selectedAgencyId || null;
        payload.curator_name = curatorName;
        payload.curator = null;
        payload.expo_horaires = horaires;
        for (const k of Object.keys(mergedValues)) {
          if (k === "id" || k.endsWith("_id") || k === "created_at" || k === "updated_at") continue;
          const raw = mergedValues[k] ?? "";
          const t = raw.trim();
          payload[k] = t === "" ? null : parseInputForKey(k, raw);
        }
        const { error } = await supabase.from("expos").update(payload).eq("id", expoId);
        if (error) throw error;
        toast.success("Exposition mise à jour.");
      }
      onSuccess();
      setValues(mergedValues);
      setInitialValues(mergedValues);
      setInitialSelectedAgencyId(selectedAgencyId);
      setInitialSelectedCuratorId(selectedCuratorId);
      setInitialHoraires(horaires);
      setLogoFileByKey({});
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Enregistrement impossible (vérifiez les droits RLS)."));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Crée tous les jobs translate_fiche en parallèle (inserts rapides),
   * puis exécute les workers UN PAR UN pour éviter le rate-limit Groq.
   * Après chaque langue réussie, recharge expo_descript_i18n depuis la DB.
   */
  const triggerExpoTranslation = async (sourceText: string, sourceLang: string) => {
    if (!canTriggerTranslation || !sourceText.trim()) return;
    const targetLangs = (["fr", "en", "de", "es", "it"] as const).filter((l) => l !== sourceLang);
    setTranslating(true);
    setTranslatingLangs(new Set(targetLangs));
    try {
      const { invokeAiWorker } = await import("@/lib/aiJobs/invokeAiWorker");

      // 1. Créer tous les jobs en parallèle (simples inserts DB, très rapides)
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

      // 2. Exécuter les workers séquentiellement (évite le rate-limit Groq 429)
      for (const { lang, jobId } of jobEntries) {
        if (!jobId) {
          setTranslatingLangs((prev) => { const s = new Set(prev); s.delete(lang); return s; });
          continue;
        }
        try {
          const result = await invokeAiWorker(jobId);
          if (!result.ok) {
            console.warn(`[triggerExpoTranslation] worker ${lang}:`, result.message);
          }
          // Recharge le JSONB depuis la DB pour mettre à jour les badges immédiatement
          if (expoId) {
            const { data: expoRow } = await supabase
              .from("expos")
              .select("expo_descript_i18n")
              .eq("id", expoId)
              .single();
            if (expoRow) {
              const raw = (expoRow as { expo_descript_i18n?: unknown }).expo_descript_i18n;
              const str = typeof raw === "string" ? raw : JSON.stringify(raw ?? {});
              setValues((prev) => ({ ...prev, expo_descript_i18n: str }));
            }
          }
        } finally {
          setTranslatingLangs((prev) => { const s = new Set(prev); s.delete(lang); return s; });
        }
      }

      toast.success("Traductions terminées !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la traduction.");
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
    JSON.stringify(horaires) !== JSON.stringify(initialHoraires);
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
        className="max-h-[92vh] max-w-lg overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb] sm:max-w-xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{mode === "create" ? "Nouvelle exposition" : "Fiche de l'exposition"}</DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              {mode === "create" ? "Nouvelle exposition" : "Fiche de l'exposition"}
            </h2>
            <Button
              type="button"
              variant="default"
              className={mode === "edit"
                ? `h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] ${
                    !hasFormChanges ? "invisible pointer-events-none" : ""
                  }`
                : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"}
              onClick={() => {
                void handleSave();
              }}
              disabled={saving || loadingRow || (mode === "edit" && !hasFormChanges)}
            >
              {saving
                ? "Enregistrement…"
                : mode === "create"
                  ? "Enregistrer"
                  : "Enregistrer les modifications"}
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-5 pt-3 pb-4">
          {loadingRow ? (
            <p className="text-sm text-muted-foreground py-6">Chargement…</p>
          ) : (
            <div className="grid gap-3 py-1">

              {/* Sélecteur d'agence — admins globaux uniquement (role_id < 4) */}
              {canPickAgency && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Agence</Label>
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
                            : "— Aucune agence —"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Rechercher une agence…" className="h-9" />
                        <CommandList>
                          <CommandEmpty>Aucune agence trouvée.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => { setSelectedAgencyId(""); setAgencyOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !selectedAgencyId ? "opacity-100" : "opacity-0")} />
                              — Aucune agence —
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
                  <Label className="text-xs font-medium">Commissaire d'expo</Label>
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
                            ? (curatorUsers.find((u) => u.id === selectedCuratorId)?.label ?? "Utilisateur inconnu")
                            : "— Aucun commissaire —"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Rechercher un membre…" className="h-9" />
                        <CommandList>
                          <CommandEmpty>Aucun membre trouvé.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => { setSelectedCuratorId(""); setCuratorOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !selectedCuratorId ? "opacity-100" : "opacity-0")} />
                              — Aucun commissaire —
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

              // Rendu côte à côte des deux champs date
              if (key === "date_expo_du" && sortedKeys.includes("date_expo_au")) {
                const dateKeys = ["date_expo_du", "date_expo_au"] as const;
                return (
                  <div key="date-range" className="flex gap-3 items-end">
                    {dateKeys.map((dk) => {
                      const dv = values[dk] ?? "";
                      const dReadonly = isReadonlyExpoKey(dk, mode);
                      const dHidden = mode === "create" && skipKeyOnInsert(dk);
                      if (dHidden) return null;
                      return (
                        <div key={dk} className="space-y-1.5 w-[150px]">
                          <Label htmlFor={`expo-field-${dk}`} className="text-xs font-medium">
                            {fieldLabel(dk)}
                          </Label>
                          <Input
                            id={`expo-field-${dk}`}
                            name={`expo_${dk}`}
                            type="date"
                            value={dv ? dv.slice(0, 10) : ""}
                            readOnly={dReadonly || !canEditFields}
                            className={cn("shadow-none w-auto", dReadonly ? "bg-muted/50" : "")}
                            onChange={(e) => setValues((prev) => ({ ...prev, [dk]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // zip_expo est rendu dans le bloc lieu_expo — on le saute ici
              if (key === "zip_expo" && sortedKeys.includes("lieu_expo")) return null;

              // lieu_expo : rendu côte à côte avec zip_expo (zip à gauche, w-150px)
              if (key === "lieu_expo" && sortedKeys.includes("zip_expo")) {
                const zipV = values["zip_expo"] ?? "";
                const lieuV = values["lieu_expo"] ?? "";
                const zipRo = isReadonlyExpoKey("zip_expo", mode);
                const lieuRo = isReadonlyExpoKey("lieu_expo", mode);
                return (
                  <div key="zip-lieu" className="flex gap-3 items-end">
                    <div className="space-y-1.5 w-[150px] shrink-0">
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
                      <Label htmlFor="expo-field-lieu_expo" className="text-xs font-medium">
                        {fieldLabel("lieu_expo")}
                      </Label>
                      <Input
                        id="expo-field-lieu_expo"
                        name="expo_lieu_expo"
                        value={lieuV}
                        readOnly={lieuRo || !canEditFields}
                        className={cn("shadow-none", lieuRo ? "bg-muted/50" : "")}
                        onChange={(e) => setValues((prev) => ({ ...prev, lieu_expo: e.target.value }))}
                      />
                    </div>
                  </div>
                );
              }

              // expo_descript_i18n : même pattern que VisitorWelcome.extractExpoDescription
              // Structure JSONB : { "fr": "...", "en": "...", "de": "...", "es": "...", "it": "..." }
              if (key === "expo_descript_i18n") {
                const currentLang = i18n.language?.slice(0, 2) || "fr";
                let parsed: Record<string, string> = {};
                try {
                  const p = JSON.parse(v || "{}") as unknown;
                  if (typeof p === "object" && p !== null) {
                    // Filtrer source_lang si présent (migration depuis ancienne structure)
                    const { source_lang: _, ...rest } = p as Record<string, string>;
                    parsed = rest;
                  }
                } catch {
                  // texte brut legacy → stocker sous la langue courante
                  if (v.trim()) parsed = { [currentLang]: v.trim() };
                }
                // Afficher : langue courante → fr → premier dispo
                const displayText = parsed[currentLang] ?? parsed["fr"] ?? Object.values(parsed)[0] ?? "";
                const LANGS = ["fr", "en", "de", "es", "it"] as const;
                const getLangStatus = (l: string) =>
                  (parsed[l] ?? "").trim() ? "filled" : "empty";
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="expo-field-expo_descript_i18n" className="text-xs font-medium">
                        {fieldLabel(key)}
                        <span className="ml-1.5 text-[10px] font-normal uppercase text-muted-foreground">
                          ({currentLang})
                        </span>
                      </Label>
                      {canTriggerTranslation && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs shrink-0"
                          disabled={translating || !displayText.trim()}
                          onClick={() => void triggerExpoTranslation(displayText, currentLang)}
                        >
                          {translating
                            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            : <Languages className="h-3 w-3" aria-hidden />}
                          Traduire (EN/DE/ES/IT)
                        </Button>
                      )}
                    </div>
                    <Textarea
                      id="expo-field-expo_descript_i18n"
                      rows={5}
                      className={cn("shadow-none min-h-[100px] resize-none", (!canEditFields || readonly) && "bg-muted/50")}
                      value={displayText}
                      readOnly={readonly || !canEditFields}
                      placeholder="Descriptif de l'exposition…"
                      onChange={(e) => {
                        const updated = { ...parsed, [currentLang]: e.target.value };
                        setValues((prev) => ({ ...prev, expo_descript_i18n: JSON.stringify(updated) }));
                      }}
                    />
                    {/* Badges de statut par langue : vert=traduit, amber=en cours, gris=vide */}
                    <div className="flex items-center gap-1.5">
                      {LANGS.map((l) => {
                        const status = getLangStatus(l);
                        const isRunning = translatingLangs.has(l);
                        const isCurrent = l === currentLang;
                        return (
                          <span
                            key={l}
                            title={
                              isRunning ? `${l.toUpperCase()} : traduction en cours…`
                              : status === "filled" ? `${l.toUpperCase()} : traduit`
                              : `${l.toUpperCase()} : manquant`
                            }
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
                              isRunning
                                ? "bg-amber-400/20 text-amber-700 border-amber-400/40 dark:text-amber-300"
                                : status === "filled"
                                ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground border-border/50",
                              isCurrent && "ring-1 ring-offset-1 ring-primary/60",
                            )}
                          >
                            {isRunning && <Loader2 className="h-2 w-2 animate-spin" aria-hidden />}
                            {l}
                          </span>
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
                    <div className="flex items-start gap-4">
                      <div className="w-[150px] shrink-0 space-y-2">
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
                          className="cursor-pointer shadow-none file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            e.target.value = "";
                            if (!file) return;
                            try {
                              assertImageFileAllowed(file);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Fichier image invalide.");
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
                        {!readonly && canEditFields && (v.trim() || logoFileByKey[key]) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={saving}
                            onClick={() => {
                              setValues((prev) => ({ ...prev, [key]: "" }));
                              setLogoFileByKey((prev) => ({ ...prev, [key]: null }));
                              setLogoPreviewByKey((prev) => {
                                const u = prev[key];
                                if (u) URL.revokeObjectURL(u);
                                const { [key]: _, ...rest } = prev;
                                return rest;
                              });
                            }}
                          >
                            Retirer le logo
                          </Button>
                        )}
                      </div>
                      {sponsorLogos.length > 0 && (
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                            Sponsors / Mécènes
                          </p>
                          <Carousel opts={{ align: "start", loop: false }} className="w-full">
                            <CarouselContent className="-ml-2">
                              {sponsorLogos.map((s, i) => (
                                <CarouselItem key={i} className="pl-2 basis-1/3">
                                  <div
                                    className="flex h-16 items-center justify-center rounded-md border border-border bg-muted/20 p-1"
                                    title={s.nom}
                                  >
                                    <img src={s.url} alt={s.nom} className="max-h-full max-w-full object-contain" />
                                  </div>
                                </CarouselItem>
                              ))}
                            </CarouselContent>
                            {sponsorLogos.length > 3 && (
                              <>
                                <CarouselPrevious className="left-0" />
                                <CarouselNext className="right-0" />
                              </>
                            )}
                          </Carousel>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={key} className={cn("space-y-1.5", isDatePicker && "w-[150px]")}>
                  <Label htmlFor={`expo-field-${key}`} className="text-xs font-medium">
                    {fieldLabel(key)}
                    {key === "id" && mode === "create" && (
                      <span className="text-muted-foreground font-normal"> (vide = UUID généré)</span>
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

          {/* Horaires d'ouverture */}
          {!loadingRow && (
            <div className="pt-3 border-t border-border mt-1 space-y-1.5">
              <Label className="text-xs font-medium">Horaires d'ouverture</Label>
              <ExpoHorairesEditor
                value={horaires}
                onChange={setHoraires}
                disabled={saving}
                readonly={!canEditFields}
              />
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
                🤝 Ajouter sponsors / mécènes
              </Button>
            </div>
          )}
        </div>

      </DialogContent>
      <SponsorDialog
        open={showSponsorDialog}
        onOpenChange={setShowSponsorDialog}
        expoId={expoId}
        expoName={values["expo_name"] ?? ""}
      />

      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la fermeture</AlertDialogTitle>
            <AlertDialogDescription>
              Des modifications non enregistrées existent. Fermer la fiche ?
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
    </Dialog>
  );
}
