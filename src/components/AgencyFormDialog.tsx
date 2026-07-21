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
  fieldLabel as agencyFieldLabelFallback,
  isAgencyAddressInlineKey,
  isAgencyContactInlineKey,
  isAgencyCountryField,
  isAgencyLogoField,
  isHiddenAgencyFormKey,
  isAgencyTimestampDisplayKey,
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
  isAgencyIdentityFormKey,
  legalRepRoleLabel,
  legalRepRolesForStructureType,
  structureCategoryLabel,
  structureTypeLabel,
  structureTypesForCategory,
  validateAgencyIdentityValues,
} from "@/lib/agencyIdentity";
import {
  COMMERCIAL_KIND_ADD_OPTION,
  COMMERCIAL_KIND_OPTIONS,
  COMMERCIAL_PLAN_OPTIONS,
  commercialKindOptionLabel,
  commercialPlanLabel,
  computeDiscountEurFromPercent,
  computeDiscountPercentFromEur,
  formatCommercialDiscountInput,
  formatCommercialDiscountEurInput,
  isPresetCommercialKind,
  normalizeCommercialKindForSave,
  parseCommercialDiscountInput,
  resolveCommercialDiscountForSave,
  syncCommercialDiscountDisplayValues,
  type CommercialDiscountDriver,
  type CommercialPlanCode,
} from "@/lib/organisation/commercialTerms";
import { fetchPricingByPlanCode } from "@/lib/organisation/publicHomeData";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuthUser } from "@/hooks/useAuthUser";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { CountryFlagIcon } from "@/components/CountryFlagIcon";

type Mode = "create" | "edit";

export type AgencyFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  /** En édition : id de l'agence ; en création : ignoré */
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

function validateCommercialValues(
  values: Record<string, string>,
  t: TFunction,
  commercialKindInputMode: "preset" | "custom",
): string | null {
  const plan = (values.commercial_plan_code ?? "").trim().toUpperCase();
  if (!["ATELIER", "HORIZON", "RAYONNEMENT"].includes(plan)) {
    return t("form.validate_plan_required");
  }
  const kind = (values.commercial_kind ?? "").trim();
  if (commercialKindInputMode === "custom" && !kind) {
    return t("form.validate_commercial_kind_required");
  }
  const pctRaw = (values.discount_percent ?? "").trim().replace(",", ".");
  if (pctRaw !== "") {
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return t("form.validate_percent_range");
    }
  }
  const eurRaw = (values.discount_amount_eur ?? "").trim().replace(",", ".");
  if (eurRaw !== "") {
    const eur = Number(eurRaw);
    if (!Number.isFinite(eur) || eur < 0) {
      return t("form.validate_eur_positive");
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
      payload[key] = normalizeCommercialKindForSave(raw);
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

function resolveAgencyCountryValue(raw: string): string {
  const paysRaw = raw.trim();
  if (!paysRaw) return "";
  if (COUNTRY_OPTIONS.some((c) => c.label === paysRaw)) return paysRaw;
  return "Autres";
}

async function uploadAgencyLogoToStorage(file: File, agencyId: string, t: TFunction): Promise<string> {
  const prepared = await prepareImageForSupabaseUpload(file);
  const id = agencyId.trim();
  if (!id) throw new Error(t("form.logo_org_id_required"));
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
  const { t } = useTranslation("agencies");
  const fl = (key: string) => t(`fields.${key}`, { defaultValue: agencyFieldLabelFallback(key) });
  const { role_id } = useAuthUser();
  const showCommercialTermsBlock =
    canEditCommercialTerms &&
    typeof role_id === "number" &&
    role_id >= 1 &&
    role_id <= 3;
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [logoFileByKey, setLogoFileByKey] = useState<Record<string, File | null>>({});
  const [logoPreviewByKey, setLogoPreviewByKey] = useState<Record<string, string>>({});
  const [listPriceEur, setListPriceEur] = useState<number | null>(null);
  const discountDriverRef = useRef<CommercialDiscountDriver | null>(null);
  const [commercialKindInputMode, setCommercialKindInputMode] = useState<"preset" | "custom">("preset");
  const [savedCustomCommercialKinds, setSavedCustomCommercialKinds] = useState<string[]>([]);
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
    if (!open || !showCommercialTermsBlock) {
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
  }, [open, showCommercialTermsBlock, values.commercial_plan_code]);

  useEffect(() => {
    if (!open || !showCommercialTermsBlock || listPriceEur == null || listPriceEur <= 0) return;
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
  }, [open, showCommercialTermsBlock, listPriceEur, values.commercial_plan_code, applyDiscountSync]);

  const syncCommercialKindInputMode = useCallback((kind: string | null | undefined) => {
    setCommercialKindInputMode(isPresetCommercialKind(kind) ? "preset" : "custom");
  }, []);

  useEffect(() => {
    if (!open || !showCommercialTermsBlock) return;
    let cancelled = false;
    void supabase
      .from("agencies")
      .select("commercial_kind")
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const customs = [
          ...new Set(
            (data ?? [])
              .map((row) => (row.commercial_kind ?? "").trim())
              .filter((kind) => kind && !isPresetCommercialKind(kind)),
          ),
        ].sort((a, b) => a.localeCompare(b, "fr"));
        setSavedCustomCommercialKinds(customs);
      });
    return () => {
      cancelled = true;
    };
  }, [open, showCommercialTermsBlock]);

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
        toast.error(t("form.agency_not_found"));
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
      if ("agency_pays" in nextValues) {
        nextValues.agency_pays = resolveAgencyCountryValue(nextValues.agency_pays ?? "");
      }
      discountDriverRef.current = null;
      setValues(nextValues);
      setInitialValues(nextValues);
      syncCommercialKindInputMode(nextValues.commercial_kind);
    } catch (e) {
      toast.error(getErrorMessage(e, t("form.agency_load_failed")));
      onOpenChange(false);
    } finally {
      setLoadingRow(false);
    }
  }, [mode, agencyId, onOpenChange, t, syncCommercialKindInputMode]);

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
      if (showCommercialTermsBlock) {
        Object.assign(next, defaultCommercialAgencyValues());
      }
      Object.assign(next, defaultAgencyIdentityValues());
      if (keys.includes("agency_pays")) {
        next.agency_pays = "France";
      }
      discountDriverRef.current = null;
      setValues(next);
      setInitialValues(next);
      setCommercialKindInputMode("preset");
      return;
    }
    void loadRow();
  }, [open, mode, agencyId, fieldKeys, loadRow, showCommercialTermsBlock]);

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
    if (showCommercialTermsBlock) {
      const commercialError = validateCommercialValues(values, t, commercialKindInputMode);
      if (commercialError) {
        toast.error(commercialError);
        return;
      }
    }

    setSaving(true);
    try {
      const mergedValues = showCommercialTermsBlock ? mergeAgencyFormDefaults(values) : { ...defaultAgencyIdentityValues(), ...values };
      const targetAgencyId =
        mode === "edit" ? agencyId?.trim() || "" : String(mergedValues.id ?? "").trim() || crypto.randomUUID();

      if (isAgencyLogoField("logo_agency") && logoFileByKey.logo_agency) {
        const url = await uploadAgencyLogoToStorage(logoFileByKey.logo_agency, targetAgencyId, t);
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
        if (showCommercialTermsBlock) {
          appendCommercialPayload(payload, mergedValues, discountDriverRef.current);
        }

        const { error } = await supabase.from("agencies").insert(payload);
        if (error) throw error;
        toast.success(t("form.agency_created"));
      } else {
        if (!agencyId) return;
        const payload: Record<string, unknown> = {};
        for (const k of Object.keys(mergedValues)) {
          if (k === "id" || k === "created_at" || k === "updated_at") continue;
          if (showCommercialTermsBlock && (COMMERCIAL_AGENCY_KEYS as readonly string[]).includes(k)) continue;
          if (isAgencyIdentityFormKey(k)) continue;
          const raw = mergedValues[k] ?? "";
          const t = raw.trim();
          payload[k] = t === "" ? null : parseInputForKey(k, raw);
        }
        appendAgencyIdentityPayload(payload, mergedValues);
        if (showCommercialTermsBlock) {
          appendCommercialPayload(payload, mergedValues, discountDriverRef.current);
        }
        const { error } = await supabase.from("agencies").update(payload).eq("id", agencyId);
        if (error) throw error;
        toast.success(t("form.agency_updated"));
      }
      onSuccess();
      setValues(mergedValues);
      setInitialValues(mergedValues);
      setLogoFileByKey({});
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, t("form.save_failed_rls")));
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
        className="flex w-full max-h-[90vh] max-w-[800px] flex-col gap-0 overflow-hidden rounded-lg border-border bg-background p-0 shadow-xl bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb] sm:p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{mode === "create" ? t("form.title_create") : t("form.title_edit")}</DialogTitle>
        <div className="w-full shrink-0 rounded-t-lg border-b border-[#c92f3b] bg-[#E63946] px-4 py-3 shadow-sm sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-white sm:text-2xl">
              {mode === "create" ? t("form.title_create") : t("form.title_edit")}
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
                {saving ? t("form.saving") : mode === "create" ? t("form.save") : t("form.save_changes")}
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4 pt-3 sm:px-5">
          {loadingRow ? (
            <p className="text-sm text-muted-foreground py-6">{t("form.loading")}</p>
          ) : (
            <div className="grid gap-3 py-1">
              {(() => {
                const logoKey = "logo_agency";
                const nameKey = "name_agency";
                const acronymeKey = "acronyme_expo";

                const isHeaderKeyVisible = (key: string) =>
                  sortedKeys.includes(key) &&
                  !isHiddenAgencyFormKey(key) &&
                  !(mode === "create" && skipKeyOnInsert(key));

                const showLogo = isHeaderKeyVisible(logoKey);
                const showName = isHeaderKeyVisible(nameKey);
                const showAcronyme = isHeaderKeyVisible(acronymeKey);
                if (!showLogo && !showName && !showAcronyme) return null;

                const logoValue = values[logoKey] ?? "";
                const logoReadonly = isReadonlyAgencyKey(logoKey, mode);
                const previewUrl = logoPreviewByKey[logoKey];
                const showStoredLogo = logoValue.trim() && !previewUrl;

                return (
                  <div className="space-y-3">
                    {showLogo ? (
                      <div className="space-y-2">
                        <Label htmlFor={`agency-field-${logoKey}`} className="text-xs font-medium">
                          {fl(logoKey)}
                        </Label>
                        <div className="flex items-start gap-3">
                          {previewUrl || showStoredLogo ? (
                            <img
                              src={previewUrl || logoValue.trim()}
                              alt={fl(logoKey)}
                              className="h-20 w-[200px] shrink-0 rounded-md border border-border object-contain bg-muted/30"
                            />
                          ) : (
                            <div
                              className="flex h-20 w-[200px] shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-[11px] text-muted-foreground"
                              aria-hidden
                            >
                              —
                            </div>
                          )}
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <Input
                              id={`agency-field-${logoKey}`}
                              name={`agency_${logoKey}`}
                              type="file"
                              accept="image/*"
                              disabled={logoReadonly || saving}
                              className="w-[130px] cursor-pointer shadow-none file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                e.target.value = "";
                                if (!file) return;
                                try {
                                  assertImageFileAllowed(file);
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error ? err.message : t("form.invalid_image_file"),
                                  );
                                  return;
                                }
                                setLogoFileByKey((prev) => ({ ...prev, [logoKey]: file }));
                                setLogoPreviewByKey((prev) => {
                                  const old = prev[logoKey];
                                  if (old) URL.revokeObjectURL(old);
                                  return { ...prev, [logoKey]: URL.createObjectURL(file) };
                                });
                              }}
                            />
                            {!logoReadonly && (logoValue.trim() || logoFileByKey[logoKey]) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-[130px] border border-black px-2 text-xs"
                                disabled={saving}
                                onClick={() => {
                                  setValues((prev) => ({ ...prev, [logoKey]: "" }));
                                  setLogoFileByKey((prev) => ({ ...prev, [logoKey]: null }));
                                  setLogoPreviewByKey((prev) => {
                                    const u = prev[logoKey];
                                    if (u) URL.revokeObjectURL(u);
                                    const { [logoKey]: _, ...rest } = prev;
                                    return rest;
                                  });
                                }}
                              >
                                {t("form.remove_logo")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {(showName || showAcronyme) ? (
                      <div className="flex flex-row flex-nowrap items-start gap-3">
                        {showName ? (
                          <div className="w-[390px] shrink-0 space-y-1.5">
                            <Label htmlFor={`agency-field-${nameKey}`} className="text-xs font-medium">
                              {fl(nameKey)}
                            </Label>
                            <Input
                              id={`agency-field-${nameKey}`}
                              name={`agency_${nameKey}`}
                              value={values[nameKey] ?? ""}
                              readOnly={isReadonlyAgencyKey(nameKey, mode)}
                              className={
                                isReadonlyAgencyKey(nameKey, mode)
                                  ? "grid bg-muted/50"
                                  : "grid shadow-none"
                              }
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [nameKey]: e.target.value }))
                              }
                            />
                          </div>
                        ) : null}
                        {showAcronyme ? (
                          <div className="w-[150px] shrink-0 space-y-1.5">
                            <Label htmlFor={`agency-field-${acronymeKey}`} className="text-xs font-medium">
                              {fl(acronymeKey)}
                            </Label>
                            <Input
                              id={`agency-field-${acronymeKey}`}
                              name={`agency_${acronymeKey}`}
                              value={values[acronymeKey] ?? ""}
                              readOnly={isReadonlyAgencyKey(acronymeKey, mode)}
                              className={
                                isReadonlyAgencyKey(acronymeKey, mode) ? "bg-muted/50" : "shadow-none"
                              }
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [acronymeKey]: e.target.value }))
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {sortedKeys.map((key) => {
              if (isHiddenAgencyFormKey(key)) return null;
              if (key === "name_agency" || key === "logo_agency" || key === "acronyme_expo") return null;
              if (isAgencyTimestampDisplayKey(key)) return null;

              const readonly = isReadonlyAgencyKey(key, mode);
              const hiddenOnCreate = mode === "create" && skipKeyOnInsert(key);
              if (hiddenOnCreate) return null;

              const v = values[key] ?? "";
              const multiline = shouldUseTextarea(key);

              if (isAgencyLogoField(key)) {
                return null;
              }

              if (isAgencyAddressInlineKey(key)) {
                if (key !== "cedex_agency") return null;

                const cedexKey = "cedex_agency";
                const paysKey = "agency_pays";
                const zipKey = "zip_agency";
                const cityKey = "city_agency";

                const isInlineFieldVisible = (fieldKey: string) =>
                  sortedKeys.includes(fieldKey) &&
                  !isHiddenAgencyFormKey(fieldKey) &&
                  !(mode === "create" && skipKeyOnInsert(fieldKey));

                const showCedex = isInlineFieldVisible(cedexKey);
                const showPays = isInlineFieldVisible(paysKey);
                const showZip = isInlineFieldVisible(zipKey);
                const showCity = isInlineFieldVisible(cityKey);
                if (!showCedex && !showPays && !showZip && !showCity) return null;

                const cedexReadonly = isReadonlyAgencyKey(cedexKey, mode);
                const paysReadonly = isReadonlyAgencyKey(paysKey, mode);
                const zipReadonly = isReadonlyAgencyKey(zipKey, mode);
                const cityReadonly = isReadonlyAgencyKey(cityKey, mode);
                const countryValue = resolveAgencyCountryValue(values[paysKey] ?? "");

                return (
                  <div key="agency-address-inline" className="flex flex-row flex-nowrap items-start gap-3">
                    {showCedex ? (
                      <div className="w-[150px] shrink-0 space-y-1.5">
                        <Label htmlFor={`agency-field-${cedexKey}`} className="text-xs font-medium">
                          {fl(cedexKey)}
                        </Label>
                        <Input
                          id={`agency-field-${cedexKey}`}
                          name={`agency_${cedexKey}`}
                          value={values[cedexKey] ?? ""}
                          readOnly={cedexReadonly}
                          className={cedexReadonly ? "bg-muted/50" : "shadow-none"}
                          onChange={(e) => setValues((prev) => ({ ...prev, [cedexKey]: e.target.value }))}
                        />
                      </div>
                    ) : null}
                    {showPays ? (
                      <div className="w-[50px] shrink-0 space-y-1.5">
                        <Label htmlFor={`agency-field-${paysKey}`} className="text-xs font-medium">
                          {fl(paysKey)}
                        </Label>
                        <Select
                          value={countryValue || undefined}
                          onValueChange={(value) =>
                            setValues((prev) => ({ ...prev, [paysKey]: value }))
                          }
                          disabled={paysReadonly || saving}
                        >
                          <SelectTrigger id={`agency-field-${paysKey}`} className="shadow-none">
                            <SelectValue placeholder={t("form.choose_country")} />
                          </SelectTrigger>
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
                      </div>
                    ) : null}
                    {showZip ? (
                      <div className="w-[80px] shrink-0 space-y-1.5">
                        <Label htmlFor={`agency-field-${zipKey}`} className="text-xs font-medium">
                          {fl(zipKey)}
                        </Label>
                        <Input
                          id={`agency-field-${zipKey}`}
                          name={`agency_${zipKey}`}
                          value={values[zipKey] ?? ""}
                          readOnly={zipReadonly}
                          className={zipReadonly ? "bg-muted/50" : "shadow-none"}
                          onChange={(e) => setValues((prev) => ({ ...prev, [zipKey]: e.target.value }))}
                        />
                      </div>
                    ) : null}
                    {showCity ? (
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`agency-field-${cityKey}`} className="text-xs font-medium">
                          {fl(cityKey)}
                        </Label>
                        <Input
                          id={`agency-field-${cityKey}`}
                          name={`agency_${cityKey}`}
                          value={values[cityKey] ?? ""}
                          readOnly={cityReadonly}
                          className={cityReadonly ? "bg-muted/50" : "shadow-none"}
                          onChange={(e) => setValues((prev) => ({ ...prev, [cityKey]: e.target.value }))}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (isAgencyContactInlineKey(key)) {
                if (key !== "mail_agency") return null;

                const mailKey = "mail_agency";
                const phoneKey = "phone_agency";
                const webKey = "web_agency";

                const isInlineFieldVisible = (fieldKey: string) =>
                  sortedKeys.includes(fieldKey) &&
                  !isHiddenAgencyFormKey(fieldKey) &&
                  !(mode === "create" && skipKeyOnInsert(fieldKey));

                const showMail = isInlineFieldVisible(mailKey);
                const showPhone = isInlineFieldVisible(phoneKey);
                const showWeb = isInlineFieldVisible(webKey);
                if (!showMail && !showPhone && !showWeb) return null;

                const mailReadonly = isReadonlyAgencyKey(mailKey, mode);
                const phoneReadonly = isReadonlyAgencyKey(phoneKey, mode);
                const webReadonly = isReadonlyAgencyKey(webKey, mode);

                return (
                  <div key="agency-contact-inline" className="flex flex-row flex-nowrap items-start gap-3">
                    {showMail ? (
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`agency-field-${mailKey}`} className="text-xs font-medium">
                          {fl(mailKey)}
                        </Label>
                        <Input
                          id={`agency-field-${mailKey}`}
                          name={`agency_${mailKey}`}
                          type="email"
                          autoComplete="email"
                          value={values[mailKey] ?? ""}
                          readOnly={mailReadonly}
                          className={mailReadonly ? "bg-muted/50" : "shadow-none"}
                          onChange={(e) => setValues((prev) => ({ ...prev, [mailKey]: e.target.value }))}
                        />
                      </div>
                    ) : null}
                    {showPhone ? (
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`agency-field-${phoneKey}`} className="text-xs font-medium">
                          {fl(phoneKey)}
                        </Label>
                        <Input
                          id={`agency-field-${phoneKey}`}
                          name={`agency_${phoneKey}`}
                          type="tel"
                          autoComplete="tel"
                          value={values[phoneKey] ?? ""}
                          readOnly={phoneReadonly}
                          className={phoneReadonly ? "bg-muted/50" : "shadow-none"}
                          onChange={(e) => setValues((prev) => ({ ...prev, [phoneKey]: e.target.value }))}
                        />
                      </div>
                    ) : null}
                    {showWeb ? (
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`agency-field-${webKey}`} className="text-xs font-medium">
                          {fl(webKey)}
                        </Label>
                        <Input
                          id={`agency-field-${webKey}`}
                          name={`agency_${webKey}`}
                          type="url"
                          autoComplete="url"
                          value={values[webKey] ?? ""}
                          readOnly={webReadonly}
                          className={webReadonly ? "bg-muted/50" : "shadow-none"}
                          onChange={(e) => setValues((prev) => ({ ...prev, [webKey]: e.target.value }))}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (isAgencyCountryField(key)) {
                const countryValue = resolveAgencyCountryValue(v);
                return (
                  <div key={key} className="w-[50px] shrink-0 space-y-1.5">
                    <Label htmlFor={`agency-field-${key}`} className="text-xs font-medium">
                      {fl(key)}
                    </Label>
                    <Select
                      value={countryValue || undefined}
                      onValueChange={(value) =>
                        setValues((prev) => ({ ...prev, [key]: value }))
                      }
                      disabled={readonly || saving}
                    >
                      <SelectTrigger id={`agency-field-${key}`} className="shadow-none">
                        <SelectValue placeholder={t("form.choose_country")} />
                      </SelectTrigger>
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
                  </div>
                );
              }

              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`agency-field-${key}`} className="text-xs font-medium">
                    {fl(key)}
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
                <p className="text-sm font-semibold text-foreground">{t("form.legal_identity")}</p>

                <div className="flex flex-row flex-nowrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="agency-structure-category" className="text-xs font-medium">
                      {fl("structure_category")}
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
                        <SelectValue placeholder={t("form.choose_structure_family")} />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENCY_STRUCTURE_CATEGORIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {structureCategoryLabel(option.value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="agency-structure-type" className="text-xs font-medium">
                      {fl("structure_type")}
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
                        <SelectValue placeholder={t("form.choose_legal_form")} />
                      </SelectTrigger>
                      <SelectContent>
                        {identityStructureOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {structureTypeLabel(option.value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-[180px] shrink-0 space-y-1.5">
                    <Label htmlFor="agency-siret" className="text-xs font-medium">
                      {fl("siret")}
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
                    <p className="text-[11px] text-muted-foreground">{t("form.siret_hint")}</p>
                  </div>
                </div>

                <div className="flex flex-row flex-nowrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="agency-legal-rep-firstname" className="text-xs font-medium">
                      {fl("legal_rep_firstname")}
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
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="agency-legal-rep-lastname" className="text-xs font-medium">
                      {fl("legal_rep_lastname")}
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
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="agency-legal-rep-role" className="text-xs font-medium">
                      {fl("legal_rep_role")}
                    </Label>
                    <Select
                      value={(values.legal_rep_role?.trim() || undefined) as string | undefined}
                      onValueChange={(value) =>
                        setValues((prev) => ({ ...prev, legal_rep_role: value }))
                      }
                      disabled={saving || !structureType}
                    >
                      <SelectTrigger id="agency-legal-rep-role" className="shadow-none">
                        <SelectValue placeholder={t("form.choose_legal_rep_role")} />
                      </SelectTrigger>
                      <SelectContent>
                        {identityRoleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {legalRepRoleLabel(option.value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {showCommercialTermsBlock ? (
                <div className="space-y-3 rounded-lg border border-[#9d2525]/20 bg-[#fff9f7] p-4">
                  <p className="text-sm font-semibold text-[#9d2525]">{t("form.commercial_terms")}</p>

                  <div className="flex flex-row flex-nowrap items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor="agency-commercial-kind" className="text-xs font-medium">
                        {fl("commercial_kind")}
                      </Label>
                      {commercialKindInputMode === "custom" ? (
                        <div className="space-y-1.5">
                          <Input
                            id="agency-commercial-kind"
                            name="agency_commercial_kind"
                            value={
                              isPresetCommercialKind(values.commercial_kind)
                                ? ""
                                : (values.commercial_kind ?? "")
                            }
                            disabled={saving}
                            className="shadow-none"
                            placeholder={t("form.commercial_kind_custom_placeholder")}
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, commercial_kind: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="text-[11px] text-primary underline-offset-2 hover:underline"
                            disabled={saving}
                            onClick={() => {
                              setCommercialKindInputMode("preset");
                              setValues((prev) => ({ ...prev, commercial_kind: "standard" }));
                            }}
                          >
                            {t("form.commercial_kind_choose_preset")}
                          </button>
                        </div>
                      ) : (
                        <Select
                          value={values.commercial_kind?.trim() || "standard"}
                          onValueChange={(value) => {
                            if (value === COMMERCIAL_KIND_ADD_OPTION) {
                              setCommercialKindInputMode("custom");
                              setValues((prev) => ({ ...prev, commercial_kind: "" }));
                              return;
                            }
                            setValues((prev) => ({ ...prev, commercial_kind: value }));
                          }}
                          disabled={saving}
                        >
                          <SelectTrigger id="agency-commercial-kind" className="shadow-none">
                            <SelectValue placeholder={t("form.choose_profile")} />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMERCIAL_KIND_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {commercialKindOptionLabel(option.value)}
                              </SelectItem>
                            ))}
                            {savedCustomCommercialKinds.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {kind}
                              </SelectItem>
                            ))}
                            <SelectItem value={COMMERCIAL_KIND_ADD_OPTION}>
                              {t("form.add_commercial_kind")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor="agency-commercial-plan" className="text-xs font-medium">
                        {fl("commercial_plan_code")}
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
                          <SelectValue placeholder={t("form.choose_plan")} />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMERCIAL_PLAN_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {commercialPlanLabel(option.value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-[70px] shrink-0 space-y-1.5">
                      <Label htmlFor="agency-discount-percent" className="text-xs font-medium">
                        {fl("discount_percent")}
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
                        className="w-[70px] items-center justify-center text-center shadow-none"
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
                          {fl("discount_amount_eur")}
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
                        <p className="text-[10px] font-medium text-muted-foreground">{t("form.annual_discount")}</p>
                        <p className="text-sm font-semibold tabular-nums text-[#9d2525]">
                          {formatCommercialEur(
                            Math.round((parseCommercialDiscountInput(values.discount_amount_eur) ?? 0) * 12 * 100) /
                              100,
                          )}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor="agency-commercial-notes" className="text-xs font-medium">
                          {fl("commercial_notes")}
                        </Label>
                        <Textarea
                          id="agency-commercial-notes"
                          name="agency_commercial_notes"
                          value={values.commercial_notes ?? ""}
                          rows={2}
                          disabled={saving}
                          className="min-h-[62px] shadow-none"
                          placeholder={t("form.commercial_notes_placeholder")}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, commercial_notes: e.target.value }))
                          }
                        />
                      </div>
                    </div>
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
    </Dialog>
  );
}
