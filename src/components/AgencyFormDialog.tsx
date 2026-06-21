import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { assertImageFileAllowed, prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { uploadAgencyLogo } from "@/lib/storagePaths";
import {
  COMMERCIAL_AGENCY_KEYS,
  defaultCommercialAgencyValues,
  fieldLabel,
  isAgencyIdentityFormKey,
  isAgencyLogoField,
  isHiddenAgencyFormKey,
  isReadonlyAgencyKey,
  parseInputForKey,
  skipKeyOnInsert,
  sortAgencyFieldKeys,
  valueToInputString,
} from "@/lib/agencyFormUtils";
import {
  AGENCY_LEGAL_REP_ROLES,
  AGENCY_STRUCTURE_CATEGORIES,
  AGENCY_STRUCTURE_TYPES,
  appendAgencyIdentityPayload,
  defaultAgencyIdentityValues,
  formatSiretDisplay,
  legalRepRolesForStructureType,
  structureTypesForCategory,
  validateAgencyIdentityValues,
} from "@/lib/agencyIdentity";
import {
  COMMERCIAL_KIND_OPTIONS,
  COMMERCIAL_PLAN_OPTIONS,
  computeDiscountEurFromPercent,
  computeDiscountPercentFromEur,
  formatCommercialDiscountInput,
  formatCommercialDiscountEurInput,
  parseCommercialDiscountInput,
  resolveCommercialDiscountForSave,
  syncCommercialDiscountDisplayValues,
  type CommercialDiscountDriver,
  type CommercialKind,
  type CommercialPlanCode,
} from "@/lib/organisation/commercialTerms";
import { fetchPricingByPlanCode } from "@/lib/organisation/publicHomeData";
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
  /** Admins globaux (role 1–3) : remises et profil commercial. */
  canEditCommercialTerms?: boolean;
  onSuccess: () => void;
};

function formatCommercialEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function validateCommercialValues(values: Record<string, string>): string | null {
  const plan = (values.commercial_plan_code ?? "").trim().toUpperCase();
  if (!["ATELIER", "HORIZON", "RAYONNEMENT"].includes(plan)) {
    return "Sélectionnez l'abonnement concerné (Atelier, Horizon ou Rayonnement).";
  }
  const pctRaw = (values.discount_percent ?? "").trim().replace(",", ".");
  if (pctRaw !== "") {
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return "La remise en % doit être comprise entre 0 et 100.";
    }
  }
  const eurRaw = (values.discount_amount_eur ?? "").trim().replace(",", ".");
  if (eurRaw !== "") {
    const eur = Number(eurRaw);
    if (!Number.isFinite(eur) || eur < 0) {
      return "La remise en € doit être un montant positif ou nul.";
    }
  }
  return null;
}

function mergeCommercialDefaults(values: Record<string, string>): Record<string, string> {
  return { ...defaultCommercialAgencyValues(), ...values };
}

function mergeAgencyFormDefaults(values: Record<string, string>): Record<string, string> {
  return { ...defaultAgencyIdentityValues(), ...defaultCommercialAgencyValues(), ...values };
}

function appendCommercialPayload(
  payload: Record<string, unknown>,
  mergedValues: Record<string, string>,
  discountDriver: CommercialDiscountDriver | null,
): void {
  const resolvedDiscount = resolveCommercialDiscountForSave(mergedValues, discountDriver);
  for (const key of COMMERCIAL_AGENCY_KEYS) {
    const raw = mergedValues[key] ?? "";
    if (key === "commercial_notes") {
      const t = raw.trim();
      payload[key] = t === "" ? null : t;
      continue;
    }
    if (key === "commercial_kind") {
      payload[key] = (raw.trim() || "standard") as CommercialKind;
      continue;
    }
    if (key === "commercial_plan_code") {
      const plan = raw.trim().toUpperCase();
      payload[key] = plan === "" ? null : (plan as CommercialPlanCode);
      continue;
    }
    if (key === "discount_percent") {
      payload[key] = resolvedDiscount.discount_percent;
      continue;
    }
    if (key === "discount_amount_eur") {
      payload[key] = resolvedDiscount.discount_amount_eur;
      continue;
    }
    payload[key] = parseInputForKey(key, raw);
  }
}

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

async function uploadAgencyLogoToStorage(file: File, agencyId: string): Promise<string> {
  const prepared = await prepareImageForSupabaseUpload(file);
  const id = agencyId.trim();
  if (!id) throw new Error("Identifiant organisation requis pour le logo.");
  try {
    return await uploadAgencyLogo(id, prepared, prepared.name);
  } catch (primaryErr) {
    const ext = prepared.name.split(".").pop()?.toLowerCase() || "webp";
    const legacyPath = `agencies/logos/${crypto.randomUUID()}.${ext}`;
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

export function AgencyFormDialog({
  open,
  onOpenChange,
  mode,
  agencyId,
  fieldKeys,
  canEditCommercialTerms = false,
  onSuccess,
}: AgencyFormDialogProps) {
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [logoFileByKey, setLogoFileByKey] = useState<Record<string, File | null>>({});
  const [logoPreviewByKey, setLogoPreviewByKey] = useState<Record<string, string>>({});
  const [listPriceEur, setListPriceEur] = useState<number | null>(null);
  const discountDriverRef = useRef<CommercialDiscountDriver | null>(null);
  /** Colonnes affichées : élargies après un chargement `select *` en édition. */
  const [activeKeys, setActiveKeys] = useState<string[]>(fieldKeys.length ? fieldKeys : ["id", "name_agency", "logo_agency"]);

  const sortedKeys = sortAgencyFieldKeys(activeKeys.length ? activeKeys : ["id", "name_agency"]);

  const structureCategory = values.structure_category?.trim() ?? "";
  const structureType = values.structure_type?.trim() ?? "";
  const identityStructureOptions = useMemo(
    () => AGENCY_STRUCTURE_TYPES.filter((t) => t.category === structureCategory),
    [structureCategory],
  );
  const identityRoleOptions = useMemo(
    () =>
      AGENCY_LEGAL_REP_ROLES.filter((r) =>
        legalRepRolesForStructureType(structureType).includes(r.value),
      ),
    [structureType],
  );

  const applyDiscountSync = useCallback(
    (
      prev: Record<string, string>,
      driver: CommercialDiscountDriver,
      rawValue: string,
    ): Record<string, string> => {
      discountDriverRef.current = driver;
      const next = { ...prev, [driver === "percent" ? "discount_percent" : "discount_amount_eur"]: rawValue };
      if (listPriceEur == null || listPriceEur <= 0) return next;

      if (driver === "percent") {
        const pct = parseCommercialDiscountInput(rawValue);
        if (pct == null) return next;
        return {
          ...next,
          discount_amount_eur: formatCommercialDiscountEurInput(
            computeDiscountEurFromPercent(listPriceEur, pct),
          ),
        };
      }

      const eur = parseCommercialDiscountInput(rawValue);
      if (eur == null) return next;
      return {
        ...next,
        discount_amount_eur: formatCommercialDiscountEurInput(eur),
        discount_percent: formatCommercialDiscountInput(
          computeDiscountPercentFromEur(listPriceEur, eur),
        ),
      };
    },
    [listPriceEur],
  );

  useEffect(() => {
    if (!open || !canEditCommercialTerms) {
      setListPriceEur(null);
      return;
    }
    const plan = values.commercial_plan_code?.trim().toUpperCase();
    if (!plan) {
      setListPriceEur(null);
      return;
    }
    let cancelled = false;
    void fetchPricingByPlanCode(plan).then((row) => {
      if (cancelled) return;
      setListPriceEur(row?.pricing_monthly_ttc_eur ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canEditCommercialTerms, values.commercial_plan_code]);

  useEffect(() => {
    if (!open || !canEditCommercialTerms || listPriceEur == null || listPriceEur <= 0) return;
    const driver = discountDriverRef.current;
    if (driver === "percent") {
      setValues((prev) => applyDiscountSync(prev, "percent", prev.discount_percent ?? "0"));
      return;
    }
    if (driver === "eur") {
      setValues((prev) => applyDiscountSync(prev, "eur", prev.discount_amount_eur ?? "0"));
      return;
    }
    setValues((prev) => syncCommercialDiscountDisplayValues(prev, listPriceEur));
  }, [open, canEditCommercialTerms, listPriceEur, values.commercial_plan_code, applyDiscountSync]);

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
      setActiveKeys(sortAgencyFieldKeys(Object.keys(row)));
      const nextValues = mergeAgencyFormDefaults(
        Object.fromEntries(Object.keys(row).map((k) => [k, valueToInputString(row[k])])),
      );
      const loadedEur = parseCommercialDiscountInput(nextValues.discount_amount_eur);
      if (loadedEur != null) {
        nextValues.discount_amount_eur = formatCommercialDiscountEurInput(loadedEur);
      }
      if (nextValues.siret?.trim()) {
        nextValues.siret = formatSiretDisplay(nextValues.siret);
      }
      discountDriverRef.current = null;
      setValues(nextValues);
      setInitialValues(nextValues);
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
      if (canEditCommercialTerms) {
        Object.assign(next, defaultCommercialAgencyValues());
      }
      Object.assign(next, defaultAgencyIdentityValues());
      discountDriverRef.current = null;
      setValues(next);
      setInitialValues(next);
      return;
    }
    void loadRow();
  }, [open, mode, agencyId, fieldKeys, loadRow, canEditCommercialTerms]);

  useEffect(() => {
    if (open) return;
    setLogoFileByKey({});
    setLogoPreviewByKey((prev) => {
      revokeLogoPreviews(prev);
      return {};
    });
  }, [open]);

  const handleSave = async () => {
    const identityError = validateAgencyIdentityValues(values);
    if (identityError) {
      toast.error(identityError);
      return;
    }
    if (canEditCommercialTerms) {
      const commercialError = validateCommercialValues(values);
      if (commercialError) {
        toast.error(commercialError);
        return;
      }
    }

    setSaving(true);
    try {
      const mergedValues = canEditCommercialTerms ? mergeAgencyFormDefaults(values) : { ...defaultAgencyIdentityValues(), ...values };
      const targetAgencyId =
        mode === "edit" ? agencyId?.trim() || "" : String(mergedValues.id ?? "").trim() || crypto.randomUUID();

      if (isAgencyLogoField("logo_agency") && logoFileByKey.logo_agency) {
        const url = await uploadAgencyLogoToStorage(logoFileByKey.logo_agency, targetAgencyId);
        mergedValues.logo_agency = url;
      }

      if (mode === "create") {
        const payload: Record<string, unknown> = {};
        payload.id = targetAgencyId;

        for (const k of sortedKeys) {
          if (k === "id") continue;
          if (skipKeyOnInsert(k)) continue;
          if (isAgencyIdentityFormKey(k)) continue;
          const raw = mergedValues[k] ?? "";
          const parsed = parseInputForKey(k, raw);
          if (parsed !== null && parsed !== "") payload[k] = parsed;
        }
        appendAgencyIdentityPayload(payload, mergedValues);
        if (canEditCommercialTerms) {
          appendCommercialPayload(payload, mergedValues, discountDriverRef.current);
        }

        const { error } = await supabase.from("agencies").insert(payload);
        if (error) throw error;
        toast.success("Agence créée.");
      } else {
        if (!agencyId) return;
        const payload: Record<string, unknown> = {};
        for (const k of Object.keys(mergedValues)) {
          if (k === "id" || k === "created_at" || k === "updated_at") continue;
          if (canEditCommercialTerms && (COMMERCIAL_AGENCY_KEYS as readonly string[]).includes(k)) continue;
          if (isAgencyIdentityFormKey(k)) continue;
          const raw = mergedValues[k] ?? "";
          const t = raw.trim();
          payload[k] = t === "" ? null : parseInputForKey(k, raw);
        }
        appendAgencyIdentityPayload(payload, mergedValues);
        if (canEditCommercialTerms) {
          appendCommercialPayload(payload, mergedValues, discountDriverRef.current);
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

              <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Identité juridique</p>

                <div className="space-y-1.5">
                  <Label htmlFor="agency-structure-category" className="text-xs font-medium">
                    {fieldLabel("structure_category")}
                  </Label>
                  <Select
                    value={structureCategory || undefined}
                    onValueChange={(value) =>
                      setValues((prev) => ({
                        ...prev,
                        structure_category: value,
                        structure_type: "",
                        legal_rep_role: "",
                      }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger id="agency-structure-category" className="shadow-none">
                      <SelectValue placeholder="Choisir une famille de structure" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENCY_STRUCTURE_CATEGORIES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="agency-structure-type" className="text-xs font-medium">
                    {fieldLabel("structure_type")}
                  </Label>
                  <Select
                    value={structureType || undefined}
                    onValueChange={(value) =>
                      setValues((prev) => ({
                        ...prev,
                        structure_type: value,
                        legal_rep_role: legalRepRolesForStructureType(value).includes(
                          prev.legal_rep_role as (typeof AGENCY_LEGAL_REP_ROLES)[number]["value"],
                        )
                          ? prev.legal_rep_role
                          : "",
                      }))
                    }
                    disabled={saving || !structureCategory}
                  >
                    <SelectTrigger id="agency-structure-type" className="shadow-none">
                      <SelectValue placeholder="Choisir une forme juridique" />
                    </SelectTrigger>
                    <SelectContent>
                      {identityStructureOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="agency-siret" className="text-xs font-medium">
                    {fieldLabel("siret")}
                  </Label>
                  <Input
                    id="agency-siret"
                    name="agency_siret"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="XXX XXX XXX XXXXX"
                    value={values.siret ?? ""}
                    disabled={saving}
                    className="shadow-none font-mono tracking-wide"
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        siret: formatSiretDisplay(e.target.value),
                      }))
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">14 chiffres — format XXX XXX XXX XXXXX</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="agency-legal-rep-firstname" className="text-xs font-medium">
                      {fieldLabel("legal_rep_firstname")}
                    </Label>
                    <Input
                      id="agency-legal-rep-firstname"
                      name="agency_legal_rep_firstname"
                      value={values.legal_rep_firstname ?? ""}
                      disabled={saving}
                      className="shadow-none"
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, legal_rep_firstname: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="agency-legal-rep-lastname" className="text-xs font-medium">
                      {fieldLabel("legal_rep_lastname")}
                    </Label>
                    <Input
                      id="agency-legal-rep-lastname"
                      name="agency_legal_rep_lastname"
                      value={values.legal_rep_lastname ?? ""}
                      disabled={saving}
                      className="shadow-none"
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, legal_rep_lastname: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="agency-legal-rep-role" className="text-xs font-medium">
                    {fieldLabel("legal_rep_role")}
                  </Label>
                  <Select
                    value={(values.legal_rep_role?.trim() || undefined) as string | undefined}
                    onValueChange={(value) =>
                      setValues((prev) => ({ ...prev, legal_rep_role: value }))
                    }
                    disabled={saving || !structureType}
                  >
                    <SelectTrigger id="agency-legal-rep-role" className="shadow-none">
                      <SelectValue placeholder="Choisir la qualité du responsable légal" />
                    </SelectTrigger>
                    <SelectContent>
                      {identityRoleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {canEditCommercialTerms ? (
                <div className="mt-2 space-y-3 rounded-lg border border-[#9d2525]/20 bg-[#fff9f7] p-4">
                  <p className="text-sm font-semibold text-[#9d2525]">Conditions commerciales</p>

                  <div className="space-y-1.5">
                    <Label htmlFor="agency-commercial-kind" className="text-xs font-medium">
                      {fieldLabel("commercial_kind")}
                    </Label>
                    <Select
                      value={(values.commercial_kind?.trim() || "standard") as CommercialKind}
                      onValueChange={(value) =>
                        setValues((prev) => ({ ...prev, commercial_kind: value }))
                      }
                      disabled={saving}
                    >
                      <SelectTrigger id="agency-commercial-kind" className="shadow-none">
                        <SelectValue placeholder="Choisir un profil" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMERCIAL_KIND_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agency-commercial-plan" className="text-xs font-medium">
                      {fieldLabel("commercial_plan_code")}
                    </Label>
                    <Select
                      value={
                        values.commercial_plan_code?.trim()
                          ? (values.commercial_plan_code.trim().toUpperCase() as CommercialPlanCode)
                          : undefined
                      }
                      onValueChange={(value) =>
                        setValues((prev) => ({ ...prev, commercial_plan_code: value }))
                      }
                      disabled={saving}
                    >
                      <SelectTrigger id="agency-commercial-plan" className="shadow-none">
                        <SelectValue placeholder="Choisir un abonnement" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMERCIAL_PLAN_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-[85px] shrink-0 space-y-1.5">
                      <Label htmlFor="agency-discount-percent" className="text-xs font-medium">
                        {fieldLabel("discount_percent")}
                      </Label>
                      <Input
                        id="agency-discount-percent"
                        name="agency_discount_percent"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={values.discount_percent ?? "0"}
                        disabled={saving}
                        className="w-[80px] items-center justify-center text-center shadow-none"
                        onChange={(e) =>
                          setValues((prev) => applyDiscountSync(prev, "percent", e.target.value))
                        }
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 items-end gap-3">
                      <div className="w-[150px] shrink-0 space-y-1.5">
                        <Label
                          htmlFor="agency-discount-eur"
                          className="block w-[120px] shrink-0 whitespace-nowrap text-xs font-medium"
                        >
                          {fieldLabel("discount_amount_eur")}
                        </Label>
                        <Input
                          id="agency-discount-eur"
                          name="agency_discount_amount_eur"
                          type="number"
                          min={0}
                          step="0.01"
                          value={values.discount_amount_eur ?? "0.00"}
                          disabled={saving}
                          className="w-[120px] items-center justify-center text-right shadow-none"
                          onChange={(e) =>
                            setValues((prev) => applyDiscountSync(prev, "eur", e.target.value))
                          }
                          onBlur={(e) => {
                            const n = parseCommercialDiscountInput(e.target.value);
                            if (n == null) return;
                            setValues((prev) => ({
                              ...prev,
                              discount_amount_eur: formatCommercialDiscountEurInput(n),
                            }));
                          }}
                        />
                      </div>
                      <div className="shrink-0 pb-2.5 text-right">
                        <p className="text-[10px] font-medium text-muted-foreground">Remise annuelle</p>
                        <p className="text-sm font-semibold tabular-nums text-[#9d2525]">
                          {formatCommercialEur(
                            Math.round((parseCommercialDiscountInput(values.discount_amount_eur) ?? 0) * 12 * 100) /
                              100,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agency-commercial-notes" className="text-xs font-medium">
                      {fieldLabel("commercial_notes")}
                    </Label>
                    <Textarea
                      id="agency-commercial-notes"
                      name="agency_commercial_notes"
                      value={values.commercial_notes ?? ""}
                      rows={3}
                      disabled={saving}
                      className="min-h-[72px] shadow-none"
                      placeholder="Ex. Partenariat vitrine AIMediArt — org réelle, usage démo"
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, commercial_notes: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : null}
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
