import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  fieldLabel,
  isAgencyLogoField,
  isHiddenAgencyFormKey,
  isReadonlyAgencyKey,
  parseInputForKey,
  skipKeyOnInsert,
  sortAgencyFieldKeys,
  valueToInputString,
} from "@/lib/agencyFormUtils";
import { toast } from "sonner";

type Mode = "create" | "edit";

export type AgencyFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  /** En édition : id de l’agence ; en création : ignoré */
  agencyId: string | null;
  /** Colonnes connues (issues d’un `select * limit 1` ou repli minimal). */
  fieldKeys: string[];
  onSuccess: () => void;
};

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

async function uploadAgencyLogoToStorage(file: File): Promise<string> {
  const prepared = await prepareImageForSupabaseUpload(file);
  const ext = prepared.name.split(".").pop()?.toLowerCase() || "webp";
  const objectPath = `agencies/logos/${crypto.randomUUID()}.${ext}`;
  const preferredBucket = "images";
  const fallbackBucket = import.meta.env.VITE_SUPABASE_ARTIST_PHOTOS_BUCKET?.trim() || "artist-photos";

  const tryUpload = async (bucket: string) => {
    const { error } = await supabase.storage.from(bucket).upload(objectPath, prepared, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) return { ok: false as const, error, bucket };
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return { ok: true as const, publicUrl: pub.publicUrl };
  };

  const first = await tryUpload(preferredBucket);
  if (first.ok) return first.publicUrl;
  const second = await tryUpload(fallbackBucket);
  if (second.ok) return second.publicUrl;
  throw new Error(
    `Envoi du logo : ${first.error.message} (bucket « ${preferredBucket} ») / ${second.error.message} (bucket « ${fallbackBucket} »).`,
  );
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

export function AgencyFormDialog({
  open,
  onOpenChange,
  mode,
  agencyId,
  fieldKeys,
  onSuccess,
}: AgencyFormDialogProps) {
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [logoFileByKey, setLogoFileByKey] = useState<Record<string, File | null>>({});
  const [logoPreviewByKey, setLogoPreviewByKey] = useState<Record<string, string>>({});
  /** Colonnes affichées : élargies après un chargement `select *` en édition. */
  const [activeKeys, setActiveKeys] = useState<string[]>(fieldKeys.length ? fieldKeys : ["id", "name_agency", "logo_agency"]);

  const sortedKeys = sortAgencyFieldKeys(activeKeys.length ? activeKeys : ["id", "name_agency"]);

  const loadRow = useCallback(async () => {
    if (mode !== "edit" || !agencyId) return;
    setLoadingRow(true);
    setLogoFileByKey({});
    setLogoPreviewByKey((prev) => {
      revokeLogoPreviews(prev);
      return {};
    });
    try {
      const { data, error } = await supabase.from("agencies").select("*").eq("id", agencyId).maybeSingle();
      if (error) throw error;
      const row = (data as Record<string, unknown> | null) ?? null;
      if (!row) {
        toast.error("Agence introuvable.");
        onOpenChange(false);
        return;
      }
      const next: Record<string, string> = {};
      for (const k of Object.keys(row)) {
        next[k] = valueToInputString(row[k]);
      }
      setActiveKeys(sortAgencyFieldKeys(Object.keys(row)));
      setValues(next);
      setInitialValues(next);
    } catch (e) {
      toast.error(getErrorMessage(e, "Impossible de charger l’agence."));
      onOpenChange(false);
    } finally {
      setLoadingRow(false);
    }
  }, [mode, agencyId, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setLogoFileByKey({});
      setLogoPreviewByKey((prev) => {
        revokeLogoPreviews(prev);
        return {};
      });
      const keys = sortAgencyFieldKeys(fieldKeys.length ? fieldKeys : ["id", "name_agency", "logo_agency"]);
      setActiveKeys(keys);
      const next: Record<string, string> = {};
      for (const k of keys) {
        if (skipKeyOnInsert(k)) continue;
        next[k] = "";
      }
      setValues(next);
      setInitialValues(next);
      return;
    }
    void loadRow();
  }, [open, mode, agencyId, fieldKeys, loadRow]);

  useEffect(() => {
    if (open) return;
    setLogoFileByKey({});
    setLogoPreviewByKey((prev) => {
      revokeLogoPreviews(prev);
      return {};
    });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const mergedValues = { ...values };
      if (isAgencyLogoField("logo_agency") && logoFileByKey.logo_agency) {
        const url = await uploadAgencyLogoToStorage(logoFileByKey.logo_agency);
        mergedValues.logo_agency = url;
      }

      if (mode === "create") {
        const payload: Record<string, unknown> = {};
        payload.id = crypto.randomUUID();

        for (const k of sortedKeys) {
          if (k === "id") continue;
          if (skipKeyOnInsert(k)) continue;
          const raw = mergedValues[k] ?? "";
          const parsed = parseInputForKey(k, raw);
          if (parsed !== null && parsed !== "") payload[k] = parsed;
        }

        const { error } = await supabase.from("agencies").insert(payload);
        if (error) throw error;
        toast.success("Agence créée.");
      } else {
        if (!agencyId) return;
        const payload: Record<string, unknown> = {};
        for (const k of Object.keys(mergedValues)) {
          if (k === "id" || k === "created_at" || k === "updated_at") continue;
          const raw = mergedValues[k] ?? "";
          const t = raw.trim();
          payload[k] = t === "" ? null : parseInputForKey(k, raw);
        }
        const { error } = await supabase.from("agencies").update(payload).eq("id", agencyId);
        if (error) throw error;
        toast.success("Agence mise à jour.");
      }
      onSuccess();
      setValues(mergedValues);
      setInitialValues(mergedValues);
      setLogoFileByKey({});
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Enregistrement impossible (vérifiez les droits RLS)."));
    } finally {
      setSaving(false);
    }
  };

  const shouldUseTextarea = (key: string) =>
    !isAgencyLogoField(key) &&
    (/description|notes|bio|address|json|metadata|data/i.test(key) || (values[key]?.length ?? 0) > 120);
  const hasFormChanges =
    JSON.stringify(values) !== JSON.stringify(initialValues) ||
    Object.values(logoFileByKey).some((file) => file !== null);
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
        className="max-h-[90vh] max-w-lg overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb] sm:max-w-xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{mode === "create" ? "Nouvelle agence" : "Fiche de l'organisation"}</DialogTitle>
        <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              {mode === "create" ? "Nouvelle agence" : "Fiche de l'organisation"}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className={
                  mode === "edit"
                    ? `h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b] ${
                        !hasFormChanges ? "invisible pointer-events-none" : ""
                      }`
                    : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
                }
                onClick={() => void handleSave()}
                disabled={saving || loadingRow || (mode === "edit" && !hasFormChanges)}
              >
                {saving ? "Enregistrement…" : mode === "create" ? "Enregistrer" : "Enregistrer les modifications"}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-5 pt-3 pb-4">
          {loadingRow ? (
            <p className="text-sm text-muted-foreground py-6">Chargement…</p>
          ) : (
            <div className="grid gap-3 py-1">
              {sortedKeys.map((key) => {
              if (isHiddenAgencyFormKey(key)) return null;

              const readonly = isReadonlyAgencyKey(key, mode);
              const hiddenOnCreate = mode === "create" && skipKeyOnInsert(key);
              if (hiddenOnCreate) return null;

              const v = values[key] ?? "";
              const multiline = shouldUseTextarea(key);

              if (isAgencyLogoField(key)) {
                const previewUrl = logoPreviewByKey[key];
                const showStoredLogo = v.trim() && !previewUrl;
                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`agency-field-${key}`} className="text-xs font-medium">
                      {fieldLabel(key)}
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Téléversez une image : l’URL publique sera enregistrée dans le champ « logo_agency ».
                    </p>
                    {(previewUrl || showStoredLogo) && (
                      <div className="flex items-start gap-3">
                        <img
                          src={previewUrl || v.trim()}
                          alt=""
                          className="h-20 max-w-[200px] rounded-md border border-border object-contain bg-muted/30"
                        />
                      </div>
                    )}
                    <Input
                      id={`agency-field-${key}`}
                      name={`agency_${key}`}
                      type="file"
                      accept="image/*"
                      disabled={readonly || saving}
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
                    {!readonly && (v.trim() || logoFileByKey[key]) && (
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
                );
              }

              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`agency-field-${key}`} className="text-xs font-medium">
                    {fieldLabel(key)}
                  </Label>
                  {multiline ? (
                    <Textarea
                      id={`agency-field-${key}`}
                      name={`agency_${key}`}
                      value={v}
                      readOnly={readonly}
                      rows={4}
                      className={`min-h-[80px] shadow-none ${readonly ? "bg-muted/50" : ""}`}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`agency-field-${key}`}
                      name={`agency_${key}`}
                      value={v}
                      readOnly={readonly}
                      className={readonly ? "bg-muted/50" : "shadow-none"}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </DialogContent>
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
