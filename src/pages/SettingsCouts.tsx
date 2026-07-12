import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  ArrowLeft, Download, Loader2, RotateCcw, AlertCircle,
  Euro, Activity, TrendingUp, Award, RefreshCw, Search, CheckCircle2, XCircle, HelpCircle, History, ExternalLink,
  ArrowUp, ArrowDown, ArrowUpDown, Plus, Paperclip, Trash2, Upload, FileText, Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getCostIntegrityReport, type CostIntegrityReport } from "@/lib/costIntegrity";
import { fetchVerifiedCostKpi } from "@/lib/costKpiApi";
import {
  getCostEvents, getCostSummary, getCostBreakdownByProvider,
  getCostTimeSeries, getCostLinkedFilterOptions, getAllFilteredCostEvents,
  getCostEventsTotals, exportCostsCsv, formatCost, formatUsdToEurHint,
  getCostEventArtworkId, getCostEntityDisplayMetaForEvents,
  getCostEventDisplayKey, getCostEventBioRowId, isCostBioEvent,
  DEFAULT_COST_SORT, KNOWN_COST_PROVIDER_KEYS, costProviderDisplayName, costProviderChartColor,
  hasActiveCostFilters, fillKnownCostProvidersBreakdown,
  effectiveCostEstimatedUsd,
  costEventTotalUnits,
  costEventInputUnitKind,
  costEventOutputUnitKind,
  type CostUnitKind,
  sanitizeCostFilters, EMPTY_COST_LINKED_FILTER_OPTIONS,
  type CostEvent, type CostFilters, type CostSummary, type CostEventsTotals,
  type CostBreakdownItem, type CostTimeSeriesPoint, type CostSelectOptions,
  type CostArtworkDisplayMeta, type CostLinkedFilterOptions,
  type CostSort, type CostSortColumn,
} from "@/lib/costs";
import {
  BACKOFFICE_FORM_CONTROL_CLASS,
  costEventStatusLabel,
  costOperationLabel,
  costToolTypeLabel,
} from "@/lib/costLabels";
import { supabase } from "@/lib/supabase";
import { getUsdToEurRate } from "@/lib/fxRates";
import {
  CURSOR_PLAN_AMOUNTS,
  firstDayNextMonthLabelFr,
  nextCursorPlan,
  parseCursorPlan,
  type CursorPlanName,
} from "@/lib/cursorPlan";
import {
  SUPABASE_PLAN_AMOUNTS,
  nextSupabasePlan,
  parseSupabasePlan,
} from "@/lib/supabasePlan";
import {
  VERCEL_PLAN_AMOUNTS,
  nextVercelPlan,
  parseVercelPlan,
} from "@/lib/vercelPlan";
import { formatOvhAmountEur, OVH_IMPORT_FROM_DATE } from "@/lib/ovhCost";
import {
  estimateGoogleTtsCostUsdForLogs,
  GOOGLE_TTS_FREE_CHARS_PER_MONTH,
  GOOGLE_TTS_USD_PER_MILLION_CHARS,
} from "@/lib/ttsCostEstimator";
import {
  createManualCost, updateManualCost, deleteManualCost, uploadCostDocument, deleteCostDocument,
  getCostDocumentSignedUrl, manualCostDocuments, isManualCostEvent, updateCostDocuments,
  type CostDocument,
} from "@/lib/manualCosts";
import { formatTokenCount } from "@/lib/aiTokenUsage";
import { formatProjectDate, PROJECT_CREATED_DATE } from "@/lib/projectMeta";
import { GoogleBillingCard } from "@/components/admin/GoogleBillingCard";
import { MEDIATION_UI_LANGS } from "@/lib/artworkDescriptionI18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchOpenAiTtsMonthStats, type OpenAiTtsMonthStats } from "@/lib/openAiTtsStats";
import { OPENAI_BILLING_URL, OPENAI_USAGE_URL } from "@/lib/openAiTtsCost";
import { useAuthUser } from "@/hooks/useAuthUser";

// ---------------------------------------------------------------------------
// Types — Fournisseurs
// ---------------------------------------------------------------------------

type CostProvider = {
  id: string;
  provider_key: string;
  provider_name: string;
  category: string | null;
  detected_in_code: boolean;
  configured: boolean;
  actively_used: boolean;
  sync_supported: boolean;
  cost_import_supported: boolean;
  status: string;
  last_detected_at: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

/** Fournisseurs affichés dans la section coûts. */
const COST_PROVIDER_KEYS = KNOWN_COST_PROVIDER_KEYS;

const PROVIDER_FALLBACK: Record<
  typeof COST_PROVIDER_KEYS[number],
  { provider_name: string; category: string; metadata?: Record<string, unknown> }
> = {
  groq: { provider_name: "Groq", category: "llm" },
  google_gemini: { provider_name: "Google Gemini", category: "llm" },
  google_tts: { provider_name: "Google Cloud TTS Neural2", category: "tts" },
  openai: { provider_name: "OpenAI TTS", category: "tts" },
  cursor: { provider_name: "Cursor", category: "other", metadata: { cost_mode: "fixed_monthly" } },
  huggingface: { provider_name: "HuggingFace", category: "image" },
  supabase: { provider_name: "Supabase", category: "other", metadata: { cost_mode: "fixed_monthly" } },
  vercel: { provider_name: "Vercel", category: "other", metadata: { cost_mode: "fixed_monthly" } },
  ovh: {
    provider_name: "OVH",
    category: "other",
    metadata: { billing_mode: "ovh_invoices", import_from_date: OVH_IMPORT_FROM_DATE, currency: "EUR" },
  },
};

function isPlaceholderProvider(p: CostProvider): boolean {
  return p.id.startsWith("placeholder-");
}

/** Affiche toujours les clés COST_PROVIDER_KEYS, même si la ligne SQL manque ou est inactive. */
function mergeCostProviders(rows: CostProvider[]): CostProvider[] {
  const byKey = new Map(rows.map((r) => [r.provider_key, r]));
  const now = new Date().toISOString();
  return COST_PROVIDER_KEYS.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const fb = PROVIDER_FALLBACK[key];
    return {
      id: `placeholder-${key}`,
      provider_key: key,
      provider_name: fb.provider_name,
      category: fb.category,
      detected_in_code: true,
      configured: false,
      actively_used: false,
      sync_supported: false,
      cost_import_supported: false,
      status: "unknown",
      last_detected_at: null,
      last_synced_at: null,
      last_sync_status: null,
      last_sync_error: null,
      notes: null,
      metadata: fb.metadata ?? {},
      updated_at: now,
    };
  }).sort((a, b) => a.provider_name.localeCompare(b.provider_name, "fr"));
}

const FIXED_MONTHLY_PROVIDER_KEYS = ["cursor", "supabase", "vercel"] as const;
type FixedMonthlyProviderKey = typeof FIXED_MONTHLY_PROVIDER_KEYS[number];

const FIXED_MONTHLY_SYNC_FN: Record<FixedMonthlyProviderKey, string> = {
  cursor: "sync-cursor-costs",
  supabase: "sync-supabase-costs",
  vercel: "sync-vercel-costs",
};

/** Fournisseurs avec backfill historique dans l'UI. */
const BACKFILL_PROVIDER_KEYS = ["groq", "google_gemini"] as const;
type BackfillProviderKey = typeof BACKFILL_PROVIDER_KEYS[number];

const GCP_BILLING_DOC_URL = "/downloads/GOOGLE-BILLING-COSTS.md";

function BoolIcon({ ok, okLabel, noLabel }: { ok: boolean; okLabel: string; noLabel: string }) {
  return ok
    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-label={okLabel} />
    : <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-label={noLabel} />;
}

function ProviderStatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0 text-xs">{children}</div>
    </div>
  );
}

type BackfillPreset = "7d" | "30d" | "90d" | "custom";

type ProvidersSyncResponse = {
  success?: boolean;
  synced?: number;
  mode?: string;
  results?: Array<{ provider_key: string; status: string; message: string }>;
  message?: string;
};

function ymdDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function presetDateRange(preset: BackfillPreset): { from: string; to: string } {
  if (preset === "custom") return { from: "", to: TODAY };
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return { from: ymdDaysAgo(days), to: TODAY };
}

async function parseInvokeError(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "Erreur inconnue.";
  const err = error as { message?: string; context?: Response };
  let detail = err.message ?? "Erreur inconnue.";
  try {
    if (err.context?.json) {
      const body = await err.context.json() as Record<string, string>;
      detail = body.details || body.error || body.message || detail;
    }
  } catch { /* ignore */ }
  return detail;
}

async function invokeProvidersSyncCosts(body: Record<string, unknown>): Promise<ProvidersSyncResponse> {
  const { data, error } = await supabase.functions.invoke("providers-sync-costs", { body });
  if (error) throw new Error(await parseInvokeError(error));
  return (data ?? {}) as ProvidersSyncResponse;
}

function billingModeLabel(p: CostProvider, t: (k: string) => string): string {
  const mode = typeof p.metadata?.billing_mode === "string" ? p.metadata.billing_mode : null;
  if (p.provider_key === "groq") return t("providers.billing_estimated");
  if (p.provider_key === "google_gemini") {
    return p.cost_import_supported
      ? t("providers.billing_gcp_export")
      : t("providers.billing_gcp_missing");
  }
  if (p.provider_key === "google_tts") {
    if (mode === "api_per_character" || p.metadata?.app_tts_engine === "google_cloud_tts") {
      return t("providers.billing_api_per_character");
    }
    if (mode === "estimated_from_logs") return t("providers.billing_estimated");
    return t("providers.billing_api_per_character");
  }
  if (p.provider_key === "openai") {
    return t("providers.billing_api_per_character");
  }
  if (p.provider_key === "cursor" && p.metadata?.cost_mode === "fixed_monthly") {
    return t("providers.billing_fixed_monthly");
  }
  if (p.provider_key === "supabase" && p.metadata?.cost_mode === "fixed_monthly") {
    return t("providers.billing_supabase_fixed");
  }
  if (p.provider_key === "vercel" && p.metadata?.cost_mode === "fixed_monthly") {
    return t("providers.billing_vercel_fixed");
  }
  if (p.provider_key === "ovh" && p.metadata?.billing_mode === "ovh_invoices") {
    return `${t("providers.billing_ovh_invoices")} (≥ ${OVH_IMPORT_FROM_DATE})`;
  }
  if (p.provider_key === "huggingface") {
    return t("providers.billing_hf_credits");
  }
  if (mode === "estimated_from_logs") return t("providers.billing_estimated");
  return "—";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FILTERS: CostFilters = {
  dateFrom: "", dateTo: "", toolType: "", provider: "",
  apiName: "", modelName: "", operationName: "", status: "", currency: "",
  artworkId: "", expoId: "", agencyId: "", mediationLangCount: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function frDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Montant en euros formaté pour les labels de barres (ex. « 12,34 € »).
 * Espaces insécables (séparateur de milliers + avant « € ») pour éviter
 * que recharts ne renvoie le symbole « € » à la ligne.
 */
function formatEurChartLabel(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  const formatted = n
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\s/g, "\u00A0");
  return `${formatted}\u00A0€`;
}

/** Date ISO (YYYY-MM-DD) → jj/mm pour les axes de graphiques. */
function chartDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function costWithEurHint(
  value: number,
  currency: string,
  usdEurRate: number | null,
  decimals = 2,
): string {
  const formatted = formatCost(value, currency, decimals);
  if (currency.toUpperCase() === "USD" && usdEurRate != null && usdEurRate > 0) {
    return `${formatted} (${formatUsdToEurHint(value, usdEurRate, decimals)})`;
  }
  return formatted;
}

function CostAmountCell({
  value,
  currency,
  usdEurRate,
  decimals = 2,
  showEurHint = true,
}: {
  value: number;
  currency: string;
  usdEurRate: number | null;
  decimals?: number;
  showEurHint?: boolean;
}) {
  const cur = currency || "EUR";
  const eurHint =
    showEurHint &&
    cur.toUpperCase() === "USD" &&
    usdEurRate != null &&
    usdEurRate > 0
      ? formatUsdToEurHint(value, usdEurRate, decimals)
      : null;
  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span>{formatCost(value, cur, decimals)}</span>
      {eurHint ? (
        <span className="text-[10px] font-normal text-emerald-700/90 dark:text-emerald-400/90">
          {eurHint}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type KpiCardProps = {
  icon: React.ElementType;
  label: string;
  value: string;
  eurHint?: string;
  sub?: string;
};
function KpiCard({ icon: Icon, label, value, eurHint, sub }: KpiCardProps) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <div className="flex flex-wrap items-baseline gap-x-2 mt-0.5">
              <span className="text-xl font-serif font-bold">{value}</span>
              {eurHint && (
                <span className="text-sm font-semibold text-emerald-700/90 dark:text-emerald-400/90 whitespace-nowrap">
                  {eurHint}
                </span>
              )}
            </div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type FiltersBarProps = {
  filters: CostFilters;
  options: CostSelectOptions;
  onChange: (filters: CostFilters) => void;
  onReset: () => void;
  loading: boolean;
};
function FiltersBar({ filters, options, onChange, onReset, loading }: FiltersBarProps) {
  const { t } = useTranslation("settings");

  function set(key: keyof CostFilters, value: string) {
    onChange({ ...filters, [key]: value });
  }

  const inputClass = BACKOFFICE_FORM_CONTROL_CLASS;
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {/* Date début */}
        <div>
          <label className={labelClass}>{t("couts.filter_date_from")}</label>
          <input
            type="date" value={filters.dateFrom ?? ""} max={filters.dateTo || TODAY}
            onChange={(e) => {
              const v = e.target.value;
              set("dateFrom", v);
              if (filters.dateTo && v > filters.dateTo) onChange({ ...filters, dateFrom: v, dateTo: "" });
            }}
            className={inputClass}
          />
        </div>

        {/* Date fin */}
        <div>
          <label className={labelClass}>{t("couts.filter_date_to")}</label>
          <input
            type="date" value={filters.dateTo ?? ""} min={filters.dateFrom || undefined} max={TODAY}
            onChange={(e) => set("dateTo", e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Type d'outil */}
        <div>
          <label className={labelClass}>{t("couts.filter_tool_type")}</label>
          <select value={filters.toolType ?? ""} onChange={(e) => set("toolType", e.target.value)} className={inputClass}>
            <option value="">{t("couts.filter_all")}</option>
            {options.toolTypes.map((v) => (
              <option key={v} value={v}>{costToolTypeLabel(v, t)}</option>
            ))}
          </select>
        </div>

        {/* Fournisseur */}
        <div>
          <label className={labelClass}>{t("couts.filter_provider")}</label>
          <select value={filters.provider ?? ""} onChange={(e) => set("provider", e.target.value)} className={inputClass}>
            <option value="">{t("couts.filter_all")}</option>
            {options.providers.map((v) => (
              <option key={v} value={v}>{costProviderDisplayName(v)}</option>
            ))}
          </select>
        </div>

        {/* Opération */}
        <div>
          <label className={labelClass}>{t("couts.col_operation")}</label>
          <select value={filters.operationName ?? ""} onChange={(e) => set("operationName", e.target.value)} className={inputClass}>
            <option value="">{t("couts.filter_all")}</option>
            {options.operationNames.map((v) => (
              <option key={v} value={v}>{costOperationLabel(v, t)}</option>
            ))}
          </select>
        </div>

        {/* Modèle */}
        <div>
          <label className={labelClass}>{t("couts.filter_model")}</label>
          <select value={filters.modelName ?? ""} onChange={(e) => set("modelName", e.target.value)} className={inputClass}>
            <option value="">{t("couts.filter_all")}</option>
            {options.modelNames.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Statut */}
        <div>
          <label className={labelClass}>{t("couts.filter_status")}</label>
          <select value={filters.status ?? ""} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            <option value="">{t("couts.filter_all")}</option>
            {options.statuses.map((v) => (
              <option key={v} value={v}>{costEventStatusLabel(v, t)}</option>
            ))}
          </select>
        </div>

        {/* Bouton reset */}
        <div className="flex items-end">
          <Button
            type="button" variant="outline" size="sm" onClick={onReset} disabled={loading}
            className="w-full gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t("couts.filter_reset")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saisie manuelle de coûts (admins) + documents joints
// ---------------------------------------------------------------------------

/** Catégories proposées pour une saisie manuelle (tool_type). */
const MANUAL_COST_TOOL_TYPES = ["infrastructure", "service", "abonnement", "materiel", "other"] as const;
const MANUAL_COST_CURRENCIES = ["EUR", "USD", "GBP"] as const;
/** Taille max document (10 Mo) — alignée sur la policy du bucket. */
const MANUAL_DOC_MAX_BYTES = 10 * 1024 * 1024;

type ManualCostDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Si fourni : mode édition (formulaire pré-rempli). Sinon : création. */
  editEvent?: CostEvent | null;
};

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v : "";
}

function ManualCostDialog({ open, onOpenChange, onSaved, editEvent = null }: ManualCostDialogProps) {
  const { t } = useTranslation("settings");
  const inputClass = BACKOFFICE_FORM_CONTROL_CLASS;
  const isEdit = editEvent != null;

  const [date, setDate] = useState(TODAY);
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("");
  const [toolType, setToolType] = useState<string>("service");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("EUR");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [note, setNote] = useState("");
  /** Nouveaux fichiers à téléverser. */
  const [newFiles, setNewFiles] = useState<File[]>([]);
  /** Documents déjà en base conservés (état final souhaité). */
  const [existingDocs, setExistingDocs] = useState<CostDocument[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    if (editEvent) {
      const meta = editEvent.metadata ?? {};
      setDate(editEvent.created_at.slice(0, 10));
      setLabel(metaString(meta, "label") || editEvent.operation_name || "");
      setProvider(editEvent.provider);
      setToolType(editEvent.tool_type || "service");
      setAmount(String(editEvent.cost_estimated ?? ""));
      setCurrency(editEvent.currency || "EUR");
      setInvoiceRef(metaString(meta, "invoice_ref"));
      setNote(metaString(meta, "note"));
      setExistingDocs(manualCostDocuments(meta));
    } else {
      setDate(TODAY); setLabel(""); setProvider(""); setToolType("service");
      setAmount(""); setCurrency("EUR"); setInvoiceRef(""); setNote("");
      setExistingDocs([]);
    }
    setNewFiles([]); setError(null); setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [editEvent]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const tooBig = picked.find((f) => f.size > MANUAL_DOC_MAX_BYTES);
    if (tooBig) {
      setError(t("couts.manual.error_file_too_big"));
      return;
    }
    setError(null);
    setNewFiles((prev) => [...prev, ...picked]);
  };

  const removeNewFile = (idx: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeExistingDoc = (path: string) => {
    setExistingDocs((prev) => prev.filter((d) => d.path !== path));
  };

  const handleSubmit = async () => {
    const amountNum = Number(amount.replace(",", "."));
    if (!label.trim() || !provider.trim()) {
      setError(t("couts.manual.error_required"));
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setError(t("couts.manual.error_amount"));
      return;
    }

    setSaving(true);
    setError(null);

    const originalDocs = editEvent ? manualCostDocuments(editEvent.metadata) : [];

    // Téléverse les nouveaux fichiers
    const uploaded: CostDocument[] = [];
    for (const f of newFiles) {
      const up = await uploadCostDocument(f);
      if (up.error) {
        // Rollback des fichiers déjà téléversés dans cette session
        for (const u of uploaded) await deleteCostDocument(u.path);
        setSaving(false);
        setError(t("couts.manual.error_upload", { detail: up.error }));
        return;
      }
      uploaded.push({ path: up.path, name: up.name });
    }

    const documents: CostDocument[] = [...existingDocs, ...uploaded];

    const payload = {
      date, label: label.trim(), provider, toolType,
      amount: amountNum, currency, invoiceRef, note, documents,
    };

    const { error: saveErr } = isEdit
      ? await updateManualCost(editEvent.id, payload)
      : (await createManualCost(payload));

    if (saveErr) {
      // Rollback des fichiers fraîchement uploadés si l'enregistrement échoue
      for (const u of uploaded) await deleteCostDocument(u.path);
      setSaving(false);
      setError(t("couts.manual.error_save", { detail: saveErr }));
      return;
    }

    // Nettoyage : supprime du bucket les documents retirés
    const keptPaths = new Set(documents.map((d) => d.path));
    for (const d of originalDocs) {
      if (!keptPaths.has(d.path)) await deleteCostDocument(d.path);
    }

    setSaving(false);
    toast.success(isEdit ? t("couts.manual.updated") : t("couts.manual.saved"));
    onOpenChange(false);
    onSaved();
  };

  const knownToolType = MANUAL_COST_TOOL_TYPES.includes(toolType as (typeof MANUAL_COST_TOOL_TYPES)[number]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("couts.manual.dialog_title_edit") : t("couts.manual.dialog_title")}</DialogTitle>
          <DialogDescription>{t("couts.manual.dialog_desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="mc-date" className="text-xs">{t("couts.manual.field_date")}</Label>
              <input
                id="mc-date" type="date" className={inputClass} value={date} max={TODAY}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="mc-toolType" className="text-xs">{t("couts.manual.field_tooltype")}</Label>
              <select
                id="mc-toolType" className={inputClass} value={toolType}
                onChange={(e) => setToolType(e.target.value)}
              >
                {!knownToolType && toolType && <option value={toolType}>{toolType}</option>}
                {MANUAL_COST_TOOL_TYPES.map((tt) => (
                  <option key={tt} value={tt}>{t(`couts.manual.tooltype_${tt}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-label" className="text-xs">{t("couts.manual.field_label")}</Label>
            <input
              id="mc-label" type="text" className={inputClass} value={label}
              placeholder={t("couts.manual.field_label_ph")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="mc-provider" className="text-xs">{t("couts.manual.field_provider")}</Label>
              <input
                id="mc-provider" type="text" className={inputClass} value={provider}
                placeholder={t("couts.manual.field_provider_ph")}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-32">
              <Label htmlFor="mc-amount" className="text-xs">{t("couts.manual.field_amount")}</Label>
              <input
                id="mc-amount" type="text" inputMode="decimal" className={inputClass} value={amount}
                placeholder="0,00"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-24">
              <Label htmlFor="mc-currency" className="text-xs">{t("couts.manual.field_currency")}</Label>
              <select
                id="mc-currency" className={inputClass} value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {MANUAL_COST_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-invoice" className="text-xs">{t("couts.manual.field_invoice")}</Label>
            <input
              id="mc-invoice" type="text" className={inputClass} value={invoiceRef}
              placeholder={t("couts.manual.field_invoice_ph")}
              onChange={(e) => setInvoiceRef(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-note" className="text-xs">{t("couts.manual.field_note")}</Label>
            <textarea
              id="mc-note" rows={2} className={cn(inputClass, "resize-none")} value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("couts.manual.field_document")}</Label>
            <input
              ref={fileInputRef} type="file" multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
              className="hidden" onChange={handleFileChange}
            />

            {(existingDocs.length > 0 || newFiles.length > 0) && (
              <div className="flex flex-col gap-1.5">
                {existingDocs.map((doc) => (
                  <div
                    key={doc.path}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs">
                      <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="truncate">{doc.name || t("couts.manual.existing_document")}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <CostDocumentButton path={doc.path} />
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground hover:text-red-600"
                        onClick={() => removeExistingDoc(doc.path)}
                        aria-label={t("couts.manual.remove_file")}
                        title={t("couts.manual.remove_file")}
                      >
                        <XCircle className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  </div>
                ))}
                {newFiles.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs">
                      <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-red-600"
                      onClick={() => removeNewFile(idx)}
                      aria-label={t("couts.manual.remove_file")}
                      title={t("couts.manual.remove_file")}
                    >
                      <XCircle className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button" variant="outline" size="sm" className="w-fit gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {existingDocs.length > 0 || newFiles.length > 0
                ? t("couts.manual.btn_add_file")
                : t("couts.manual.btn_choose_file")}
            </Button>
            <span className="text-[11px] text-muted-foreground">{t("couts.manual.document_hint")}</span>
          </div>

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("couts.manual.cancel")}
          </Button>
          <Button type="button" disabled={saving} className="gap-2" onClick={() => void handleSubmit()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? t("couts.manual.submit_edit") : t("couts.manual.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton d'ouverture d'un document joint (URL signée à la demande). */
function CostDocumentButton({ path, title }: { path: string; title?: string }) {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    const url = await getCostDocumentSignedUrl(path);
    setLoading(false);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.error(t("couts.manual.error_document_open"));
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      className="inline-flex items-center text-primary hover:text-primary/80 disabled:opacity-50"
      title={title || t("couts.manual.open_document")}
      aria-label={t("couts.manual.open_document")}
      disabled={loading}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        : <Paperclip className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/**
 * Affiche les documents joints d'un coût dans le tableau :
 * - 1 document  → trombone (ouverture directe) ;
 * - N documents → trombone + nombre, avec un menu déroulant pour choisir lequel ouvrir.
 */
function CostDocumentsCell({ documents }: { documents: CostDocument[] }) {
  const { t } = useTranslation("settings");
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  const openDoc = async (path: string) => {
    setLoadingPath(path);
    const url = await getCostDocumentSignedUrl(path);
    setLoadingPath(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error(t("couts.manual.error_document_open"));
  };

  if (documents.length === 0) return null;
  if (documents.length === 1) {
    return <CostDocumentButton path={documents[0].path} title={documents[0].name} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80"
          title={t("couts.manual.open_documents_count", { count: documents.length })}
          aria-label={t("couts.manual.open_documents_count", { count: documents.length })}
        >
          <Paperclip className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[10px] font-semibold tabular-nums leading-none">{documents.length}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[280px]">
        {documents.map((doc) => (
          <DropdownMenuItem
            key={doc.path}
            disabled={loadingPath === doc.path}
            onSelect={(e) => { e.preventDefault(); void openDoc(doc.path); }}
            className="gap-2 text-xs"
          >
            {loadingPath === doc.path
              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              : <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
            <span className="truncate">{doc.name || doc.path}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CostDocumentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Coût concerné (manuel ou automatique). */
  event: CostEvent | null;
};

/**
 * Dialogue dédié à la gestion des pièces jointes d'un coût SANS toucher
 * aux autres champs — utilisé notamment pour les coûts automatiques (OVH…).
 */
function CostDocumentsDialog({ open, onOpenChange, onSaved, event }: CostDocumentsDialogProps) {
  const { t } = useTranslation("settings");
  const [existingDocs, setExistingDocs] = useState<CostDocument[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setExistingDocs(event ? manualCostDocuments(event.metadata) : []);
      setNewFiles([]);
      setError(null);
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, event]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    if (picked.find((f) => f.size > MANUAL_DOC_MAX_BYTES)) {
      setError(t("couts.manual.error_file_too_big"));
      return;
    }
    setError(null);
    setNewFiles((prev) => [...prev, ...picked]);
  };

  const handleSubmit = async () => {
    if (!event) return;
    setSaving(true);
    setError(null);

    const originalDocs = manualCostDocuments(event.metadata);
    const uploaded: CostDocument[] = [];
    for (const f of newFiles) {
      const up = await uploadCostDocument(f);
      if (up.error) {
        for (const u of uploaded) await deleteCostDocument(u.path);
        setSaving(false);
        setError(t("couts.manual.error_upload", { detail: up.error }));
        return;
      }
      uploaded.push({ path: up.path, name: up.name });
    }

    const documents = [...existingDocs, ...uploaded];
    const { error: saveErr } = await updateCostDocuments(event.id, documents, event.metadata);

    if (saveErr) {
      for (const u of uploaded) await deleteCostDocument(u.path);
      setSaving(false);
      setError(t("couts.manual.error_save", { detail: saveErr }));
      return;
    }

    const keptPaths = new Set(documents.map((d) => d.path));
    for (const d of originalDocs) {
      if (!keptPaths.has(d.path)) await deleteCostDocument(d.path);
    }

    setSaving(false);
    toast.success(t("couts.manual.documents_saved"));
    onOpenChange(false);
    onSaved();
  };

  const title = event
    ? `${costProviderDisplayName(event.provider)}${event.operation_name ? ` — ${costOperationLabel(event.operation_name, t)}` : ""}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("couts.manual.documents_dialog_title")}</DialogTitle>
          <DialogDescription className="truncate" title={title}>{title}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <input
            ref={fileInputRef} type="file" multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
            className="hidden" onChange={handleFileChange}
          />

          {(existingDocs.length > 0 || newFiles.length > 0) && (
            <div className="flex flex-col gap-1.5">
              {existingDocs.map((doc) => (
                <div
                  key={doc.path}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs">
                    <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{doc.name || t("couts.manual.existing_document")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <CostDocumentButton path={doc.path} />
                    <button
                      type="button"
                      className="inline-flex items-center text-muted-foreground hover:text-red-600"
                      onClick={() => setExistingDocs((prev) => prev.filter((d) => d.path !== doc.path))}
                      aria-label={t("couts.manual.remove_file")}
                      title={t("couts.manual.remove_file")}
                    >
                      <XCircle className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                </div>
              ))}
              {newFiles.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs">
                    <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={t("couts.manual.remove_file")}
                    title={t("couts.manual.remove_file")}
                  >
                    <XCircle className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button" variant="outline" size="sm" className="w-fit gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {existingDocs.length > 0 || newFiles.length > 0
              ? t("couts.manual.btn_add_file")
              : t("couts.manual.btn_choose_file")}
          </Button>
          <span className="text-[11px] text-muted-foreground">{t("couts.manual.document_hint")}</span>

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("couts.manual.cancel")}
          </Button>
          <Button type="button" disabled={saving} className="gap-2" onClick={() => void handleSubmit()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("couts.manual.submit_edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CostsTableProps = {
  events: CostEvent[];
  loading: boolean;
  error: string | null;
  page: number;
  total: number;
  sort: CostSort;
  onSortChange: (sort: CostSort) => void;
  onPageChange: (p: number) => void;
  onExport: () => void;
  exportingCsv?: boolean;
  currency: string;
  totals: CostEventsTotals | null;
  loadingTotals: boolean;
  usdEurRate: number | null;
  isAdmin?: boolean;
  filters: CostFilters;
  linkedFilterOptions: CostLinkedFilterOptions;
  artworkMetaById: Record<string, CostArtworkDisplayMeta>;
  onFiltersChange: (filters: CostFilters) => void;
  onAddCost?: () => void;
  onEditCost?: (event: CostEvent) => void;
  onAttachCost?: (event: CostEvent) => void;
  onDeleted?: () => void;
};

const COST_TABLE_SORTABLE_COLUMNS: { column: CostSortColumn; labelKey: string }[] = [
  { column: "created_at", labelKey: "couts.col_date" },
  { column: "tool_type", labelKey: "couts.col_tool_type" },
  { column: "provider", labelKey: "couts.col_provider" },
  { column: "model_name", labelKey: "couts.col_model" },
  { column: "operation_name", labelKey: "couts.col_operation" },
  { column: "cost_estimated", labelKey: "couts.col_cost" },
];

const COST_TABLE_STATIC_COLUMNS = [
  "couts.col_artwork",
  "couts.col_expo",
  "couts.col_agency",
  "couts.col_mediation_langs",
  "couts.col_units_in",
  "couts.col_units_out",
  "couts.col_tokens_total",
  "couts.col_source",
] as const;

function nextCostSort(column: CostSortColumn, current: CostSort): CostSort {
  if (current.column === column) {
    return { column, ascending: !current.ascending };
  }
  const descFirst =
    column === "created_at" ||
    column === "cost_estimated" ||
    column === "mediation_lang_count";
  return { column, ascending: !descFirst };
}

type SortableThProps = {
  label: string;
  column: CostSortColumn;
  sort: CostSort;
  onSort: (column: CostSortColumn) => void;
};

function SortableTh({ label, column, sort, onSort }: SortableThProps) {
  const active = sort.column === column;
  const SortIcon = active ? (sort.ascending ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className="px-1.5 py-2.5 text-left text-[11px] font-semibold leading-tight text-muted-foreground">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-start gap-0.5 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
        aria-sort={active ? (sort.ascending ? "ascending" : "descending") : "none"}
      >
        {label}
        <SortIcon className={cn("h-3 w-3 shrink-0", active ? "text-primary" : "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

function costUnitKindClass(kind: CostUnitKind): string {
  if (kind === "audio") return "text-violet-400";
  if (kind === "text") return "text-sky-400";
  if (kind === "characters") return "text-amber-500";
  return "text-muted-foreground";
}

function CostUnitsCell({
  value,
  kind,
  t,
}: {
  value: number | null | undefined;
  kind: CostUnitKind;
  t: (key: string) => string;
}) {
  if (value == null) return <>—</>;
  const label = kind !== "unknown" ? t(`couts.units_kind_${kind}`) : null;
  const tooltip = kind !== "unknown" ? t(`couts.units_tooltip_${kind}`) : undefined;
  return (
    <span className="inline-flex items-baseline justify-end gap-0.5" title={tooltip}>
      <span>{value.toLocaleString("fr-FR")}</span>
      {label ? (
        <span className={cn("text-[9px] font-semibold leading-none", costUnitKindClass(kind))}>
          {label}
        </span>
      ) : null}
    </span>
  );
}

function CostsTable({
  events, loading, error, page, total, sort, onSortChange, onPageChange, onExport, exportingCsv = false, currency,
  totals, loadingTotals, usdEurRate, isAdmin = false, filters, linkedFilterOptions, artworkMetaById,
  onFiltersChange,
  onAddCost, onEditCost, onAttachCost, onDeleted,
}: CostsTableProps) {
  const { t } = useTranslation("settings");
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const filterSelectClass = cn(BACKOFFICE_FORM_CONTROL_CLASS, "h-9 w-full min-w-0 text-xs");
  const { artworks, expos, agencies, selectOptions, mediationLangCounts } = linkedFilterOptions;

  const setEntityFilter = (key: "artworkId" | "expoId" | "agencyId" | "toolType" | "mediationLangCount", value: string) => {
    const next: CostFilters = { ...filters };
    if (key === "toolType") {
      next.toolType = value;
      onFiltersChange(next);
      return;
    }
    if (key === "mediationLangCount") {
      next.mediationLangCount = value;
      onFiltersChange(next);
      return;
    }
    next[key] = value;
    if (key === "expoId" && value) {
      next.artworkId = "";
    } else if (key === "agencyId" && value) {
      next.artworkId = "";
      next.expoId = "";
    } else if (key === "artworkId" && value) {
      next.expoId = "";
      next.agencyId = "";
    }
    onFiltersChange(next);
  };

  const handleSort = (column: CostSortColumn) => {
    onSortChange(nextCostSort(column, sort));
  };

  const handleDeleteManual = async (e: CostEvent) => {
    if (!window.confirm(t("couts.manual.confirm_delete"))) return;
    setDeletingId(e.id);
    const { error: delErr } = await deleteManualCost(
      e.id,
      manualCostDocuments(e.metadata).map((d) => d.path),
    );
    setDeletingId(null);
    if (delErr) {
      toast.error(t("couts.manual.error_delete", { detail: delErr }));
      return;
    }
    toast.success(t("couts.manual.deleted"));
    onDeleted?.();
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" aria-hidden />
        <span className="text-sm text-muted-foreground">{t("settings_loading")}</span>
      </div>
    );
  }

  const isEmpty = !loading && events.length === 0;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("couts.filter_artwork")}
            </label>
            <select
              value={filters.artworkId ?? ""}
              onChange={(e) => setEntityFilter("artworkId", e.target.value)}
              className={filterSelectClass}
            >
              <option value="">{t("couts.filter_all")}</option>
              {artworks.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("couts.filter_expo")}
            </label>
            <select
              value={filters.expoId ?? ""}
              onChange={(e) => setEntityFilter("expoId", e.target.value)}
              className={filterSelectClass}
            >
              <option value="">{t("couts.filter_all")}</option>
              {expos.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("couts.filter_agency")}
            </label>
            <select
              value={filters.agencyId ?? ""}
              onChange={(e) => setEntityFilter("agencyId", e.target.value)}
              className={filterSelectClass}
            >
              <option value="">{t("couts.filter_all")}</option>
              {agencies.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("couts.filter_tool_type")}
            </label>
            <select
              value={filters.toolType ?? ""}
              onChange={(e) => setEntityFilter("toolType", e.target.value)}
              className={filterSelectClass}
            >
              <option value="">{t("couts.filter_all")}</option>
              {selectOptions.toolTypes.map((v) => (
                <option key={v} value={v}>{costToolTypeLabel(v, t)}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("couts.filter_mediation_lang_count")}
            </label>
            <select
              value={filters.mediationLangCount ?? ""}
              onChange={(e) => setEntityFilter("mediationLangCount", e.target.value)}
              className={filterSelectClass}
            >
              <option value="">{t("couts.filter_all")}</option>
              {mediationLangCounts.map((n) => (
                <option key={n} value={String(n)}>
                  {t("couts.filter_mediation_lang_count_option", { count: n })}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString("fr-FR")} {t("couts.events_count")}
        </p>
        <div className="flex items-center gap-2">
          {isAdmin && onAddCost && (
            <Button type="button" size="sm" onClick={onAddCost} className="gap-2">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("couts.manual.btn_add")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={exportingCsv || total === 0}
            className="gap-2"
          >
            {exportingCsv ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            {t("couts.btn_export_csv")}
          </Button>
        </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 py-16 text-center">
          <Euro className="h-10 w-10 text-muted-foreground/30 mb-3" aria-hidden />
          <p className="font-medium text-muted-foreground">{t("couts.empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("couts.empty_sub")}</p>
        </div>
      ) : (
        <>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
        {t("couts.units_legend")}
      </p>
      <div className="max-h-[540px] overflow-x-auto overflow-y-auto rounded-xl border border-border/50">
        <table className="w-full min-w-[1100px] table-fixed text-[12px]">
          <colgroup>
            <col className="w-[96px]" />
            <col className="w-[60px]" />
            <col className="w-[78px]" />
            <col className="w-[80px]" />
            <col className="w-[92px]" />
            <col className="w-[84px]" />
            <col className="w-[100px]" />
            <col className="w-[90px]" />
            <col className="w-[90px]" />
            <col className="w-[52px]" />
            <col className="w-[46px]" />
            <col className="w-[46px]" />
            <col className="w-[52px]" />
            <col className="w-[92px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border/50 bg-muted/40">
              {COST_TABLE_SORTABLE_COLUMNS.map(({ column, labelKey }) => (
                <SortableTh
                  key={column}
                  column={column}
                  label={t(labelKey)}
                  sort={sort}
                  onSort={handleSort}
                />
              ))}
              {COST_TABLE_STATIC_COLUMNS.map((labelKey) => {
                if (labelKey === "couts.col_artwork") {
                  return (
                    <SortableTh
                      key={labelKey}
                      column="artwork_title"
                      label={t(labelKey)}
                      sort={sort}
                      onSort={handleSort}
                    />
                  );
                }
                if (labelKey === "couts.col_expo") {
                  return (
                    <SortableTh
                      key={labelKey}
                      column="expo_title"
                      label={t(labelKey)}
                      sort={sort}
                      onSort={handleSort}
                    />
                  );
                }
                if (labelKey === "couts.col_agency") {
                  return (
                    <SortableTh
                      key={labelKey}
                      column="agency_title"
                      label={t(labelKey)}
                      sort={sort}
                      onSort={handleSort}
                    />
                  );
                }
                if (labelKey === "couts.col_mediation_langs") {
                  return (
                    <SortableTh
                      key={labelKey}
                      column="mediation_lang_count"
                      label={t(labelKey)}
                      sort={sort}
                      onSort={handleSort}
                    />
                  );
                }
                return (
                  <th
                    key={labelKey}
                    className="px-1.5 py-2.5 text-left text-[11px] font-semibold leading-tight text-muted-foreground"
                  >
                    {t(labelKey)}
                  </th>
                );
              })}
            </tr>
            <tr className="border-b border-border/50 bg-muted/25">
              <td colSpan={5} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("couts.table_totals_label")}
              </td>
              <td className="px-2 py-1.5 font-mono text-[12px] font-semibold text-primary">
                {loadingTotals ? (
                  "…"
                ) : (
                  <CostAmountCell
                    value={totals?.totalCost ?? 0}
                    currency={totals?.currency ?? currency}
                    usdEurRate={usdEurRate}
                  />
                )}
              </td>
              <td colSpan={4} />
              <td className="px-1.5 py-1.5 text-right font-mono text-[12px] font-semibold whitespace-nowrap">
                {loadingTotals ? "…" : (totals?.totalInputUnits ?? 0).toLocaleString("fr-FR")}
              </td>
              <td className="px-1.5 py-1.5 text-right font-mono text-[12px] font-semibold whitespace-nowrap">
                {loadingTotals ? "…" : (totals?.totalOutputUnits ?? 0).toLocaleString("fr-FR")}
              </td>
              <td className="px-1.5 py-1.5 text-right font-mono text-[12px] font-semibold whitespace-nowrap">
                {loadingTotals
                  ? "…"
                  : ((totals?.totalInputUnits ?? 0) + (totals?.totalOutputUnits ?? 0)).toLocaleString("fr-FR")}
              </td>
              <td />
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => {
              const displayKey = getCostEventDisplayKey(e);
              const entityMeta = displayKey ? artworkMetaById[displayKey] : undefined;
              const artworkId = getCostEventArtworkId(e);
              const bioRowId = getCostEventBioRowId(e);
              const entityTitle =
                entityMeta?.title ??
                (artworkId ? artworks.find((a) => a.id === artworkId)?.label : null);
              const entityPending = Boolean(displayKey && !entityMeta);
              const entityLabel =
                entityTitle ??
                (entityPending ? "…" : (isCostBioEvent(e) && bioRowId ? "…" : "—"));

              return (
              <tr
                key={e.id}
                className={cn(
                  "border-b border-border/30 transition-colors hover:bg-muted/20",
                  i % 2 !== 0 && "bg-muted/10",
                  e.status === "partial" && "italic",
                )}
              >
                <td className="px-2 py-1 text-[12px] text-muted-foreground font-mono truncate leading-tight" title={frDate(e.created_at)}>
                  {frDate(e.created_at)}
                </td>
                <td className="px-2 py-1 truncate leading-tight">
                  <span className="rounded bg-primary/10 px-1 py-0 text-[12px] font-medium text-primary">
                    {costToolTypeLabel(e.tool_type, t)}
                  </span>
                </td>
                <td className="px-2 py-1 text-[12px] font-medium truncate leading-tight" title={costProviderDisplayName(e.provider)}>
                  {costProviderDisplayName(e.provider)}
                </td>
                <td className="px-2 py-1 text-[12px] text-muted-foreground truncate leading-tight" title={e.model_name ?? undefined}>
                  {e.model_name ?? "—"}
                </td>
                <td className="px-2 py-1 text-[12px] truncate leading-tight" title={e.operation_name ?? undefined}>
                  {e.operation_name ? costOperationLabel(e.operation_name, t) : "—"}
                </td>
                <td className="px-2 py-1 font-mono text-[12px] font-semibold text-primary leading-tight">
                  <CostAmountCell
                    value={effectiveCostEstimatedUsd(e)}
                    currency={e.currency}
                    usdEurRate={usdEurRate}
                    showEurHint={false}
                  />
                </td>
                <td
                  className="px-2 py-1 text-[12px] truncate leading-tight"
                  title={entityTitle ?? entityMeta?.linkedEntityId ?? artworkId ?? bioRowId ?? undefined}
                >
                  {entityLabel}
                </td>
                <td
                  className="px-2 py-1 text-[12px] truncate leading-tight"
                  title={entityMeta?.expoName ?? undefined}
                >
                  {entityMeta?.expoName ?? (entityPending ? "…" : "—")}
                </td>
                <td
                  className="px-2 py-1 text-[12px] truncate leading-tight"
                  title={entityMeta?.agencyName ?? undefined}
                >
                  {entityMeta?.agencyName ?? (entityPending ? "…" : "—")}
                </td>
                <td className="px-2 py-1 text-center text-[12px] tabular-nums leading-tight">
                  {entityMeta && entityMeta.mediationLangCount >= 0
                    ? entityMeta.mediationLangCount
                    : isCostBioEvent(e)
                      ? "—"
                      : entityPending
                        ? "…"
                        : "—"}
                </td>
                <td className="px-1.5 py-1 text-[12px] text-right font-mono whitespace-nowrap leading-tight">
                  <CostUnitsCell value={e.input_units} kind={costEventInputUnitKind(e)} t={t} />
                </td>
                <td className="px-1.5 py-1 text-[12px] text-right font-mono whitespace-nowrap leading-tight">
                  <CostUnitsCell value={e.output_units} kind={costEventOutputUnitKind(e)} t={t} />
                </td>
                <td className="px-1.5 py-1 text-[12px] text-right font-mono whitespace-nowrap leading-tight">
                  {(() => {
                    const total = costEventTotalUnits(e);
                    if (total == null) return "—";
                    const inKind = costEventInputUnitKind(e);
                    const outKind = costEventOutputUnitKind(e);
                    const tooltip =
                      inKind !== "unknown" && outKind !== "unknown"
                        ? `${t(`couts.units_tooltip_${inKind}`)} + ${t(`couts.units_tooltip_${outKind}`)}`
                        : undefined;
                    return (
                      <span className="font-medium" title={tooltip}>
                        {total.toLocaleString("fr-FR")}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-2 py-1 text-[12px] text-muted-foreground leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={e.source ?? undefined}>{e.source ?? "—"}</span>
                    <CostDocumentsCell documents={manualCostDocuments(e.metadata)} />
                    {isAdmin && !isManualCostEvent(e) && onAttachCost && (
                      <button
                        type="button"
                        onClick={() => onAttachCost(e)}
                        className="inline-flex items-center text-muted-foreground hover:text-primary"
                        title={t("couts.manual.attach_documents")}
                        aria-label={t("couts.manual.attach_documents")}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    {isAdmin && isManualCostEvent(e) && onEditCost && (
                      <button
                        type="button"
                        onClick={() => onEditCost(e)}
                        className="inline-flex items-center text-muted-foreground hover:text-primary"
                        title={t("couts.manual.edit")}
                        aria-label={t("couts.manual.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    {isAdmin && isManualCostEvent(e) && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteManual(e)}
                        disabled={deletingId === e.id}
                        className="inline-flex items-center text-muted-foreground hover:text-red-600 disabled:opacity-50"
                        title={t("couts.manual.delete")}
                        aria-label={t("couts.manual.delete")}
                      >
                        {deletingId === e.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline" size="sm" disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            ‹ Préc.
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline" size="sm" disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Suiv. ›
          </Button>
        </div>
      )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
// ProvidersSection
// ---------------------------------------------------------------------------

function providerStatusBadge(status: string) {
  const cfg: Record<string, { cls: string; icon: React.ElementType; label: string }> = {
    active:                    { cls: "bg-green-100 text-green-800",    icon: CheckCircle2, label: "Actif" },
    configured_not_used:       { cls: "bg-orange-100 text-orange-700",  icon: AlertCircle,  label: "Non utilisé" },
    inactive:                  { cls: "bg-gray-100 text-gray-600",      icon: XCircle,      label: "Inactif" },
    unknown:                   { cls: "bg-gray-100 text-gray-500",      icon: HelpCircle,   label: "Inconnu" },
    error:                     { cls: "bg-red-100 text-red-700",        icon: XCircle,      label: "Erreur" },
    detected_not_configured:   { cls: "bg-yellow-100 text-yellow-800",  icon: AlertCircle,  label: "Non configuré" },
    not_implemented:           { cls: "bg-blue-100 text-blue-700",      icon: HelpCircle,   label: "Non impl." },
    success:                   { cls: "bg-green-100 text-green-800",    icon: CheckCircle2, label: "OK" },
    partial:                   { cls: "bg-orange-100 text-orange-700",  icon: AlertCircle,  label: "Partiel" },
    skipped:                   { cls: "bg-gray-100 text-gray-500",      icon: HelpCircle,   label: "Ignoré" },
  };
  const c = cfg[status] ?? cfg.unknown;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${c.cls}`}>
      <Icon className="h-3 w-3" aria-hidden /> {c.label}
    </span>
  );
}

type CursorPlanToggleProps = {
  provider: CostProvider;
  onUpdated: (metadata: Record<string, unknown>) => void;
};

function CursorPlanToggle({ provider, onUpdated }: CursorPlanToggleProps) {
  const { t } = useTranslation("settings");
  const currentPlan = parseCursorPlan(provider.metadata?.plan);
  const targetPlan = nextCursorPlan(currentPlan);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentAmount = CURSOR_PLAN_AMOUNTS[currentPlan];
  const targetAmount = CURSOR_PLAN_AMOUNTS[targetPlan];
  const effectiveFrom = firstDayNextMonthLabelFr();

  const handleConfirm = async () => {
    setLoading(true);
    const prevMeta = { ...provider.metadata };
    onUpdated({
      ...provider.metadata,
      plan: targetPlan,
      amount_usd: targetAmount,
    });
    try {
      const { data, error } = await supabase.functions.invoke("cost-providers-update-plan", {
        method: "PATCH",
        body: { provider_key: "cursor", plan: targetPlan },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx?.json) {
            const body = await ctx.json() as Record<string, string>;
            detail = body.details || body.error || error.message;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const resp = data as { success?: boolean; new_plan?: string; new_amount?: number };
      if (!resp?.success) throw new Error(t("providers.cursor_plan_error"));
      toast.success(t("providers.cursor_plan_success", {
        plan: resp.new_plan ?? targetPlan,
        amount: resp.new_amount ?? targetAmount,
      }));
      setConfirmOpen(false);
    } catch (err) {
      onUpdated(prevMeta);
      toast.error(t("providers.cursor_plan_error") + " — " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {t("providers.cursor_plan_toggle", {
          plan: targetPlan,
          amount: targetAmount,
        })}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!loading) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md" hideCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("providers.cursor_plan_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("providers.cursor_plan_confirm_desc", {
                fromPlan: currentPlan,
                fromAmount: currentAmount,
                toPlan: targetPlan,
                toAmount: targetAmount,
                effectiveFrom,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={loading} onClick={() => setConfirmOpen(false)}>
              {t("providers.backfill_cancel")}
            </Button>
            <Button type="button" disabled={loading} className="gap-2" onClick={() => void handleConfirm()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("providers.cursor_plan_confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type SupabasePlanToggleProps = {
  provider: CostProvider;
  onUpdated: (metadata: Record<string, unknown>) => void;
};

function SupabasePlanToggle({ provider, onUpdated }: SupabasePlanToggleProps) {
  const { t } = useTranslation("settings");
  const currentPlan = parseSupabasePlan(provider.metadata?.plan);
  const targetPlan = nextSupabasePlan(currentPlan);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentAmount = SUPABASE_PLAN_AMOUNTS[currentPlan];
  const targetAmount = SUPABASE_PLAN_AMOUNTS[targetPlan];
  const effectiveFrom = firstDayNextMonthLabelFr();

  const handleConfirm = async () => {
    setLoading(true);
    const prevMeta = { ...provider.metadata };
    onUpdated({
      ...provider.metadata,
      plan: targetPlan,
      amount_usd: targetAmount,
    });
    try {
      const { data, error } = await supabase.functions.invoke("cost-providers-update-plan", {
        method: "PATCH",
        body: { provider_key: "supabase", plan: targetPlan },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx?.json) {
            const body = await ctx.json() as Record<string, string>;
            detail = body.details || body.error || error.message;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const resp = data as { success?: boolean; new_plan?: string; new_amount?: number };
      if (!resp?.success) throw new Error(t("providers.supabase_plan_error"));
      toast.success(t("providers.supabase_plan_success", {
        plan: resp.new_plan ?? targetPlan,
        amount: resp.new_amount ?? targetAmount,
      }));
      setConfirmOpen(false);
    } catch (err) {
      onUpdated(prevMeta);
      toast.error(t("providers.supabase_plan_error") + " — " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {t("providers.supabase_plan_toggle", {
          plan: targetPlan,
          amount: targetAmount,
        })}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!loading) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md" hideCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("providers.supabase_plan_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("providers.supabase_plan_confirm_desc", {
                fromPlan: currentPlan,
                fromAmount: currentAmount,
                toPlan: targetPlan,
                toAmount: targetAmount,
                effectiveFrom,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={loading} onClick={() => setConfirmOpen(false)}>
              {t("providers.backfill_cancel")}
            </Button>
            <Button type="button" disabled={loading} className="gap-2" onClick={() => void handleConfirm()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("providers.supabase_plan_confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type VercelPlanToggleProps = {
  provider: CostProvider;
  onUpdated: (metadata: Record<string, unknown>) => void;
};

function VercelPlanToggle({ provider, onUpdated }: VercelPlanToggleProps) {
  const { t } = useTranslation("settings");
  const currentPlan = parseVercelPlan(provider.metadata?.plan);
  const targetPlan = nextVercelPlan(currentPlan);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentAmount = VERCEL_PLAN_AMOUNTS[currentPlan];
  const targetAmount = VERCEL_PLAN_AMOUNTS[targetPlan];
  const effectiveFrom = firstDayNextMonthLabelFr();

  const handleConfirm = async () => {
    setLoading(true);
    const prevMeta = { ...provider.metadata };
    onUpdated({
      ...provider.metadata,
      plan: targetPlan,
      amount_usd: targetAmount,
    });
    try {
      const { data, error } = await supabase.functions.invoke("cost-providers-update-plan", {
        method: "PATCH",
        body: { provider_key: "vercel", plan: targetPlan },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx?.json) {
            const body = await ctx.json() as Record<string, string>;
            detail = body.details || body.error || error.message;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const resp = data as { success?: boolean; new_plan?: string; new_amount?: number };
      if (!resp?.success) throw new Error(t("providers.vercel_plan_error"));
      toast.success(t("providers.vercel_plan_success", {
        plan: resp.new_plan ?? targetPlan,
        amount: resp.new_amount ?? targetAmount,
      }));
      setConfirmOpen(false);
    } catch (err) {
      onUpdated(prevMeta);
      toast.error(t("providers.vercel_plan_error") + " — " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {t("providers.vercel_plan_toggle", {
          plan: targetPlan,
          amount: targetAmount,
        })}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!loading) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md" hideCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("providers.vercel_plan_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("providers.vercel_plan_confirm_desc", {
                fromPlan: currentPlan,
                fromAmount: currentAmount,
                toPlan: targetPlan,
                toAmount: targetAmount,
                effectiveFrom,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={loading} onClick={() => setConfirmOpen(false)}>
              {t("providers.backfill_cancel")}
            </Button>
            <Button type="button" disabled={loading} className="gap-2" onClick={() => void handleConfirm()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("providers.vercel_plan_confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type OvhInvoiceSummaryProps = { refreshKey: number };

function currentCalendarMonthStartLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01T00:00:00.000`;
}

type OpenAiTtsStatsBlockProps = {
  stats: OpenAiTtsMonthStats | null;
  loading: boolean;
  compact?: boolean;
  usdEurRate?: number | null;
};

function OpenAiTtsStatsBlock({ stats, loading, compact, usdEurRate: usdEurRateProp = null }: OpenAiTtsStatsBlockProps) {
  const { t } = useTranslation("settings");
  const [usdEurRateLocal, setUsdEurRateLocal] = useState<number | null>(null);

  useEffect(() => {
    if (usdEurRateProp != null) return;
    let cancelled = false;
    void getUsdToEurRate().then((rate) => {
      if (!cancelled) setUsdEurRateLocal(rate);
    });
    return () => { cancelled = true; };
  }, [usdEurRateProp]);

  const usdEurRate = usdEurRateProp ?? usdEurRateLocal;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {t("providers.tts_openai_loading")}
      </div>
    );
  }

  if (!stats) return null;

  const empty = stats.apiCallCount === 0 && stats.costRecalculatedUsd === 0;

  return (
    <div className={cn(
      "space-y-3 leading-snug",
      compact ? "text-[11px]" : "text-xs",
    )}
    >
      <p className={cn("font-medium text-foreground", !compact && "text-sm")}>
        {t("providers.tts_openai_title")}
      </p>
      {!compact && (
        <p className="text-muted-foreground">{t("providers.tts_openai_note")}</p>
      )}

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground/90">{t("providers.tts_openai_billing_disclaimer_title")}</p>
        <p>{t("providers.tts_openai_billing_disclaimer_body")}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          <a
            href={OPENAI_USAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("providers.tts_openai_link_usage")}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
          <a
            href={OPENAI_BILLING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("providers.tts_openai_link_billing")}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
        </div>
      </div>

      {empty ? (
        <p className="text-muted-foreground">{t("providers.tts_openai_month_empty")}</p>
      ) : (
        <div className="flex flex-col gap-2 text-muted-foreground">
          <p className="font-medium text-foreground/90">
            {t("providers.tts_openai_cost_recalculated", {
              cost: costWithEurHint(stats.costRecalculatedUsd, "USD", usdEurRate, 2),
            })}
          </p>
          {Math.abs(stats.costLoggedUsd - stats.costRecalculatedUsd) > 0.01 ? (
            <p className="text-[11px]">
              {t("providers.tts_openai_cost_logged_legacy", {
                cost: costWithEurHint(stats.costLoggedUsd, "USD", usdEurRate, 2),
              })}
            </p>
          ) : null}
          <p>
            {t("providers.tts_openai_month_mp3", {
              count: stats.audioFileCount,
              avg: costWithEurHint(stats.avgCostUsd, "USD", usdEurRate, 3),
            })}
          </p>
          <p className="text-[11px]">
            {t("providers.tts_openai_reconciliation_calls", {
              apiCalls: stats.apiCallCount,
              uniqueCells: stats.uniqueVoiceCells,
            })}
          </p>
          {stats.regenerationExtraCalls > 0 ? (
            <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
              {t("providers.tts_openai_regenerations_summary", {
                extra: stats.regenerationExtraCalls,
                cost: costWithEurHint(stats.regenerationExtraCostRecalculatedUsd, "USD", usdEurRate, 2),
              })}
            </p>
          ) : null}
          {stats.unloggedReadyFiles > 0 ? (
            <p className="text-[11px] text-destructive">
              {t("providers.tts_openai_unlogged_warning", { count: stats.unloggedReadyFiles })}
            </p>
          ) : (
            <p className="text-[11px] text-emerald-700/90">
              {t("providers.tts_openai_reconciliation_ok")}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("providers.tts_openai_gender_f", { count: stats.byGender.F })}</span>
            <span>{t("providers.tts_openai_gender_m", { count: stats.byGender.M })}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("providers.tts_openai_type_bio", { count: stats.byTextType.bio })}</span>
            <span>{t("providers.tts_openai_type_mediation", { count: stats.byTextType.mediation })}</span>
          </div>

          {stats.regenerations.length > 0 && !compact ? (
            <div className="mt-1 rounded-md border border-border/40 overflow-hidden">
              <p className="bg-muted/30 px-2 py-1.5 text-[11px] font-medium text-foreground">
                {t("providers.tts_openai_regenerations_table_title")}
              </p>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border/30 text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">{t("providers.tts_openai_regen_col_type")}</th>
                      <th className="px-2 py-1 font-medium">{t("providers.tts_openai_regen_col_lang")}</th>
                      <th className="px-2 py-1 font-medium">{t("providers.tts_openai_regen_col_calls")}</th>
                      <th className="px-2 py-1 font-medium text-right">{t("providers.tts_openai_regen_col_extra_cost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.regenerations.map((row) => (
                      <tr key={row.cellKey} className="border-b border-border/20 last:border-0">
                        <td className="px-2 py-1 capitalize">{row.textType || "—"}</td>
                        <td className="px-2 py-1 uppercase">{row.lang}</td>
                        <td className="px-2 py-1">
                          {t("providers.tts_openai_regen_calls_detail", {
                            total: row.callCount,
                            extra: row.extraCalls,
                          })}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {costWithEurHint(row.costRecalculatedUsd, "USD", usdEurRate, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

type OpenAiTtsSummaryCardProps = { refreshKey: number; usdEurRate: number | null };

function OpenAiTtsSummaryCard({ refreshKey, usdEurRate }: OpenAiTtsSummaryCardProps) {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OpenAiTtsMonthStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchOpenAiTtsMonthStats().then((s) => {
      if (!cancelled) {
        setStats(s);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <Card className="glass-card border-emerald-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" aria-hidden />
          {t("couts.openai_tts_card_title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OpenAiTtsStatsBlock stats={stats} loading={loading} usdEurRate={usdEurRate} />
      </CardContent>
    </Card>
  );
}

type GoogleTtsMonthlyEstimateProps = { refreshKey: number };

function GoogleTtsMonthlyEstimate({ refreshKey }: GoogleTtsMonthlyEstimateProps) {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(true);
  const [charsUsed, setCharsUsed] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [callCount, setCallCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const monthStart = currentCalendarMonthStartLocal();
      const { data, error } = await supabase
        .from("ai_usage_logs")
        .select("completion_tokens, total_tokens, created_at")
        .eq("provider", "google_tts")
        .gte("created_at", monthStart);

      if (cancelled) return;

      if (error || !data?.length) {
        setCharsUsed(0);
        setCostUsd(0);
        setCallCount(0);
      } else {
        const logs = data
          .map((row) => {
            const ct = Math.max(0, Number(row.completion_tokens ?? 0));
            const chars = ct > 0 ? ct : Math.max(0, Number(row.total_tokens ?? 0));
            return {
              characterCount: chars,
              created_at: String(row.created_at ?? ""),
            };
          })
          .filter((log) => log.characterCount > 0 && log.created_at);

        const totalChars = logs.reduce((sum, log) => sum + log.characterCount, 0);
        setCharsUsed(totalChars);
        setCostUsd(estimateGoogleTtsCostUsdForLogs(logs));
        setCallCount(logs.length);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const quotaRemaining = Math.max(0, GOOGLE_TTS_FREE_CHARS_PER_MONTH - charsUsed);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {t("providers.tts_cloud_loading")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2 text-[11px] leading-snug">
      <p className="text-muted-foreground">{t("providers.tts_cloud_note")}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        <p className="text-muted-foreground">
          {t("providers.tts_cloud_rate", { price: GOOGLE_TTS_USD_PER_MILLION_CHARS })}
        </p>
        <p className="text-muted-foreground">
          {t("providers.tts_cloud_free_quota", {
            quota: formatTokenCount(GOOGLE_TTS_FREE_CHARS_PER_MONTH),
          })}
        </p>
      </div>
      {callCount === 0 ? (
        <p className="text-muted-foreground">{t("providers.tts_cloud_month_empty")}</p>
      ) : (
        <p className="font-medium text-foreground/90">
          {t("providers.tts_cloud_month_stats", {
            cost: formatCost(costUsd, "USD", 4),
            chars: formatTokenCount(charsUsed),
            remaining: formatTokenCount(quotaRemaining),
            count: callCount,
          })}
        </p>
      )}
    </div>
  );
}

type OpenAiTtsMonthlyEstimateProps = { refreshKey: number };

function OpenAiTtsMonthlyEstimate({ refreshKey }: OpenAiTtsMonthlyEstimateProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OpenAiTtsMonthStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchOpenAiTtsMonthStats().then((s) => {
      if (!cancelled) {
        setStats(s);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
      <OpenAiTtsStatsBlock stats={stats} loading={loading} compact />
    </div>
  );
}

function OvhInvoiceSummary({ refreshKey }: OvhInvoiceSummaryProps) {
  const { t } = useTranslation("settings");
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("ai_usage_events")
        .select("cost_estimated")
        .eq("provider", "ovh")
        .gte("created_at", `${OVH_IMPORT_FROM_DATE}T00:00:00.000Z`);
      if (cancelled) return;
      if (error || !data) {
        setCount(0);
        setTotal(0);
      } else {
        let sum = 0;
        for (const row of data) {
          sum += Number((row as { cost_estimated?: number | null }).cost_estimated ?? 0);
        }
        setCount(data.length);
        setTotal(sum);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) return null;

  return (
    <p className="text-[11px] text-muted-foreground leading-snug">
      {count === 0
        ? t("providers.ovh_no_invoices", { from: OVH_IMPORT_FROM_DATE })
        : t("providers.ovh_stats", { count, total: formatOvhAmountEur(total), from: OVH_IMPORT_FROM_DATE })}
    </p>
  );
}

type OvhSyncInvoicesButtonProps = {
  disabled?: boolean;
  configured: boolean;
  onSynced: () => void;
};

const OVH_API_TOKEN_URL = "https://eu.api.ovh.com/createToken/?GET=/me/bill&GET=/me/bill/*";

function OvhSyncInvoicesButton({ disabled, configured, onSynced }: OvhSyncInvoicesButtonProps) {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    if (!configured) {
      toast.error(t("providers.ovh_api_missing"));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ovh-sync-invoices", {
        method: "POST",
        body: {},
      });
      if (error) throw new Error(await parseInvokeError(error));
      const resp = data as {
        message?: string;
        imported?: number;
        already_imported?: number;
        errors?: string[];
      };
      const imported = resp?.imported ?? 0;
      const already = resp?.already_imported ?? 0;
      if (imported > 0) {
        toast.success(t("providers.ovh_sync_success", { imported, already }));
      } else if (already > 0) {
        toast.info(t("providers.ovh_sync_up_to_date", { already }));
      } else {
        toast.info(resp?.message ?? t("providers.ovh_sync_empty"));
      }
      if (resp?.errors?.length) {
        toast.warning(resp.errors.slice(0, 2).join(" — "));
      }
      onSynced();
    } catch (err) {
      toast.error(t("providers.ovh_sync_error") + " — " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      disabled={disabled || loading || !configured}
      title={!configured ? t("providers.ovh_api_missing") : undefined}
      onClick={() => void handleSync()}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      {t("providers.ovh_sync_invoices")}
    </Button>
  );
}

type FixedMonthlySyncButtonProps = {
  providerKey: FixedMonthlyProviderKey;
  disabled?: boolean;
  onDone: () => void;
};

function FixedMonthlySyncButton({ providerKey, disabled, onDone }: FixedMonthlySyncButtonProps) {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(FIXED_MONTHLY_SYNC_FN[providerKey], {
        method: "POST",
        body: {},
      });
      if (error) throw new Error(await parseInvokeError(error));
      const resp = data as { message?: string; amount?: number; currency?: string; already_synced?: boolean };
      if (resp?.already_synced) {
        toast.info(t("providers.fixed_monthly_already_synced"));
      } else if (typeof resp?.amount === "number" && resp.amount > 0) {
        if (resp.currency === "EUR") {
          toast.success(t("providers.fixed_monthly_sync_success_eur", { amount: resp.amount }));
        } else {
          toast.success(t("providers.fixed_monthly_sync_success", { amount: resp.amount }));
        }
      } else {
        toast.info(resp?.message ?? t("providers.fixed_monthly_sync_skipped"));
      }
      onDone();
    } catch (err) {
      toast.error(t("providers.fixed_monthly_sync_error") + " — " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      disabled={disabled || loading}
      onClick={() => void handleSync()}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      {t("providers.action_sync_subscription")}
    </Button>
  );
}

type ProviderBackfillDialogProps = {
  providerKey: BackfillProviderKey | null;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (providerKey: BackfillProviderKey, dateFrom: string, dateTo: string) => void;
};

function ProviderBackfillDialog({ providerKey, onOpenChange, loading, onSubmit }: ProviderBackfillDialogProps) {
  const { t } = useTranslation("settings");
  const open = providerKey !== null;
  const [preset, setPreset] = useState<BackfillPreset>("90d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(TODAY);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !providerKey) return;
    const range = presetDateRange("90d");
    setPreset("90d");
    setDateFrom(range.from);
    setDateTo(range.to);
    setValidationError(null);
  }, [open, providerKey]);

  const applyPreset = (p: BackfillPreset) => {
    setPreset(p);
    setValidationError(null);
    if (p === "custom") return;
    const range = presetDateRange(p);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleSubmit = () => {
    if (!dateFrom || !dateTo) {
      setValidationError(t("providers.backfill_error_dates_required"));
      return;
    }
    if (dateFrom > dateTo) {
      setValidationError(t("providers.backfill_error_invalid_range"));
      return;
    }
    setValidationError(null);
    if (providerKey) onSubmit(providerKey, dateFrom, dateTo);
  };

  const titleKey = providerKey === "google_gemini"
    ? "providers.backfill_title_gemini"
    : "providers.backfill_title";
  const descKey = providerKey === "google_gemini"
    ? "providers.backfill_desc_gemini"
    : "providers.backfill_desc";

  const presetBtnCls = (p: BackfillPreset) =>
    `rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
      preset === p
        ? "border-primary bg-primary/10 text-primary"
        : "border-border bg-background text-muted-foreground hover:bg-muted/50"
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" hideCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descKey)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("providers.backfill_preset_label")}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={presetBtnCls("7d")} onClick={() => applyPreset("7d")}>
                {t("providers.backfill_preset_7d")}
              </button>
              <button type="button" className={presetBtnCls("30d")} onClick={() => applyPreset("30d")}>
                {t("providers.backfill_preset_30d")}
              </button>
              <button type="button" className={presetBtnCls("90d")} onClick={() => applyPreset("90d")}>
                {t("providers.backfill_preset_90d")}
              </button>
              <button type="button" className={presetBtnCls("custom")} onClick={() => applyPreset("custom")}>
                {t("providers.backfill_preset_custom")}
              </button>
            </div>
          </div>

          <div className="flex flex-row gap-3">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Label htmlFor="groq-backfill-from" className="text-xs">{t("providers.backfill_date_from")}</Label>
              <input
                id="groq-backfill-from"
                type="date"
                className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={dateFrom}
                max={dateTo || TODAY}
                onChange={(e) => {
                  setPreset("custom");
                  setDateFrom(e.target.value);
                  setValidationError(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Label htmlFor="groq-backfill-to" className="text-xs">{t("providers.backfill_date_to")}</Label>
              <input
                id="groq-backfill-to"
                type="date"
                className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={dateTo}
                min={dateFrom || undefined}
                max={TODAY}
                onChange={(e) => {
                  setPreset("custom");
                  setDateTo(e.target.value);
                  setValidationError(null);
                }}
              />
            </div>
          </div>

          {validationError && (
            <p className="text-xs text-red-600" role="alert">{validationError}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            {t("providers.backfill_cancel")}
          </Button>
          <Button type="button" disabled={loading} className="gap-2" onClick={handleSubmit}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("providers.backfill_submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProvidersSectionProps = {
  onCostsRefresh?: () => void;
  showOpenAiTtsReconciliation?: boolean;
};

function ProvidersSection({ onCostsRefresh, showOpenAiTtsReconciliation = false }: ProvidersSectionProps) {
  const { t } = useTranslation("settings");

  const [providers, setProviders] = useState<CostProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillProviderKey, setBackfillProviderKey] = useState<BackfillProviderKey | null>(null);
  const [ovhRefreshKey, setOvhRefreshKey] = useState(0);
  const [ttsRefreshKey, setTtsRefreshKey] = useState(0);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMsg = useCallback((type: "success" | "error" | "warning", text: string) => {
    setActionMsg({ type, text });
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setActionMsg(null), 8000);
  }, []);

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    const { data, error } = await supabase
      .from("cost_providers")
      .select("*")
      .in("provider_key", [...COST_PROVIDER_KEYS])
      .order("provider_name", { ascending: true });
    setLoadingProviders(false);
    if (!error && Array.isArray(data)) {
      setProviders(mergeCostProviders(data as CostProvider[]));
    }
  }, []);

  useEffect(() => {
    void loadProviders();
    return () => { if (msgTimerRef.current) clearTimeout(msgTimerRef.current); };
  }, [loadProviders]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzeLoading(true);
    setActionMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("providers-analyze", { body: {} });
      if (error) {
        // Extraire le vrai message depuis le body de la réponse HTTP
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx?.json) {
            const body = await ctx.json() as Record<string, string>;
            detail = body?.details || body?.error || body?.message || error.message;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const analyzed = (data as { analyzed?: number })?.analyzed ?? 0;
      showMsg("success", t("providers.analyze_success", { count: analyzed }));
      await loadProviders();
      setTtsRefreshKey((k) => k + 1);
    } catch (err) {
      showMsg("error", t("providers.analyze_error") + " — " + String(err));
    } finally {
      setAnalyzeLoading(false);
    }
  }, [loadProviders, showMsg, t]);

  const handleSync = useCallback(async (providerKey?: string) => {
    setSyncLoading(true);
    setActionMsg(null);
    try {
      const data = await invokeProvidersSyncCosts({
        ...(providerKey ? { provider_key: providerKey } : {}),
        mode: "incremental",
        days: 7,
      });
      const synced = data.synced ?? 0;
      showMsg("success", t("providers.sync_success", { count: synced }));
      await loadProviders();
      setTtsRefreshKey((k) => k + 1);
      onCostsRefresh?.();
    } catch (err) {
      showMsg("error", t("providers.sync_error") + " — " + String(err));
    } finally {
      setSyncLoading(false);
    }
  }, [loadProviders, onCostsRefresh, showMsg, t]);

  const handleProviderBackfill = useCallback(async (
    providerKey: BackfillProviderKey,
    dateFrom: string,
    dateTo: string,
  ) => {
    setBackfillLoading(true);
    setActionMsg(null);
    try {
      const data = await invokeProvidersSyncCosts({
        provider_key: providerKey,
        mode: "backfill",
        date_from: dateFrom,
        date_to: dateTo,
      });
      const result = data.results?.find((r) => r.provider_key === providerKey);
      const msg = result?.message ?? data.message ?? t("providers.backfill_done");

      const isEmptyGroq = providerKey === "groq" && /aucun log groq/i.test(msg);
      const isEmptyGemini = providerKey === "google_gemini" && (
        /0 ligne\(s\) mappée/i.test(msg) ||
        /,\s*0 mappée/i.test(msg) ||
        /gemini=0/i.test(msg)
      );
      const isGcpMissing = result?.status === "not_implemented" || /prérequis google billing manquants/i.test(msg);

      if (isGcpMissing) {
        showMsg("warning", t("providers.gcp_config_required") + " — " + msg);
      } else if (result?.status === "success" && (isEmptyGroq || isEmptyGemini)) {
        showMsg("warning", t("providers.backfill_empty", { from: dateFrom, to: dateTo }) + " — " + msg);
      } else if (result?.status === "error") {
        showMsg("error", t("providers.backfill_error") + " — " + msg);
      } else {
        showMsg("success", msg);
        setBackfillProviderKey(null);
      }

      await loadProviders();
      onCostsRefresh?.();
    } catch (err) {
      showMsg("error", t("providers.backfill_error") + " — " + String(err));
    } finally {
      setBackfillLoading(false);
    }
  }, [loadProviders, onCostsRefresh, showMsg, t]);

  const frDateShort = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium">{t("providers.section_title")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleAnalyze} disabled={analyzeLoading || syncLoading || backfillLoading}
              className="gap-2"
            >
              {analyzeLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Search className="h-3.5 w-3.5" aria-hidden />}
              {t("providers.btn_analyze")}
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => void handleSync()} disabled={analyzeLoading || syncLoading || backfillLoading}
              className="gap-2"
            >
              {syncLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              {t("providers.btn_sync")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("providers.section_sub")}</p>
        <p className="text-xs text-muted-foreground/80 mt-1">{t("providers.section_sub_costs")}</p>
      </CardHeader>

      <CardContent>
        {/* Message retour action */}
        {actionMsg && (
          <Alert
            variant={actionMsg.type === "error" ? "destructive" : "default"}
            className={`mb-4 ${actionMsg.type === "warning" ? "border-orange-300 bg-orange-50 text-orange-900" : ""}`}
          >
            <AlertDescription className="text-sm">{actionMsg.text}</AlertDescription>
          </Alert>
        )}

        <ProviderBackfillDialog
          providerKey={backfillProviderKey}
          onOpenChange={(o) => { if (!o) setBackfillProviderKey(null); }}
          loading={backfillLoading}
          onSubmit={(key, from, to) => void handleProviderBackfill(key, from, to)}
        />

        {/* Loading */}
        {loadingProviders && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary mr-3" aria-hidden />
            <span className="text-sm text-muted-foreground">{t("settings_loading")}</span>
          </div>
        )}

        {/* Empty state */}
        {!loadingProviders && providers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" aria-hidden />
            <p className="font-medium text-muted-foreground">{t("providers.empty_title")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("providers.empty_sub")}</p>
            <Button type="button" variant="outline" size="sm" className="mt-4 gap-2" onClick={handleAnalyze} disabled={analyzeLoading}>
              {analyzeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Search className="h-3.5 w-3.5" aria-hidden />}
              {t("providers.btn_analyze")}
            </Button>
          </div>
        )}

        {/* Liste fournisseurs — cartes compactes (pas de scroll horizontal) */}
        {!loadingProviders && providers.length > 0 && (
          <div className="flex flex-col gap-3">
            {providers.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border/50 bg-muted/5 p-4 space-y-3"
              >
                {/* En-tête : identité + action */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        {p.provider_key === "google_tts"
                          ? t("providers.tts_cloud_title")
                          : p.provider_name}
                      </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{p.provider_key}</code>
                      {p.category && (
                        <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
                          {p.category}
                        </span>
                      )}
                    </div>
                    {isPlaceholderProvider(p) && (
                      <p className="text-[11px] text-yellow-800 bg-yellow-50 rounded px-2 py-1 leading-snug">
                        {t("providers.provider_row_missing")}
                      </p>
                    )}
                    {p.notes && (
                      <p className="text-[11px] text-muted-foreground leading-snug">{p.notes}</p>
                    )}
                    {p.provider_key === "google_tts" && (
                      <GoogleTtsMonthlyEstimate refreshKey={ttsRefreshKey} />
                    )}
                    {p.provider_key === "openai" && showOpenAiTtsReconciliation && (
                      <OpenAiTtsMonthlyEstimate refreshKey={ttsRefreshKey} />
                    )}
                    {p.provider_key === "google_gemini" && !p.cost_import_supported && (
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800">
                          {t("providers.gcp_config_required")}
                        </span>
                        <a
                          href={GCP_BILLING_DOC_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          {t("providers.gcp_doc_link")}
                        </a>
                      </div>
                    )}
                    {p.provider_key === "supabase" && parseSupabasePlan(p.metadata?.plan) === "Free" && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {t("providers.supabase_free_note")}
                      </p>
                    )}
                    {p.provider_key === "vercel" && parseVercelPlan(p.metadata?.plan) === "Hobby" && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {t("providers.vercel_hobby_note")}
                      </p>
                    )}
                    {p.provider_key === "ovh" && (
                      <>
                        <OvhInvoiceSummary refreshKey={ovhRefreshKey} />
                        {!p.configured && (
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800">
                              {t("providers.ovh_api_required")}
                            </span>
                            <a
                              href={OVH_API_TOKEN_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden />
                              {t("providers.ovh_api_link")}
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {p.provider_key === "cursor" && (
                      <>
                        <CursorPlanToggle
                          provider={p}
                          onUpdated={(metadata) => {
                            setProviders((prev) =>
                              prev.map((row) =>
                                row.provider_key === "cursor" ? { ...row, metadata } : row,
                              ),
                            );
                          }}
                        />
                        <FixedMonthlySyncButton
                          providerKey="cursor"
                          disabled={syncLoading || backfillLoading}
                          onDone={() => {
                            void loadProviders();
                            onCostsRefresh?.();
                          }}
                        />
                      </>
                    )}
                    {p.provider_key === "supabase" && (
                      <>
                        <SupabasePlanToggle
                          provider={p}
                          onUpdated={(metadata) => {
                            setProviders((prev) =>
                              prev.map((row) =>
                                row.provider_key === "supabase" ? { ...row, metadata } : row,
                              ),
                            );
                          }}
                        />
                        <FixedMonthlySyncButton
                          providerKey="supabase"
                          disabled={syncLoading || backfillLoading}
                          onDone={() => {
                            void loadProviders();
                            onCostsRefresh?.();
                          }}
                        />
                      </>
                    )}
                    {p.provider_key === "vercel" && (
                      <>
                        <VercelPlanToggle
                          provider={p}
                          onUpdated={(metadata) => {
                            setProviders((prev) =>
                              prev.map((row) =>
                                row.provider_key === "vercel" ? { ...row, metadata } : row,
                              ),
                            );
                          }}
                        />
                        <FixedMonthlySyncButton
                          providerKey="vercel"
                          disabled={syncLoading || backfillLoading}
                          onDone={() => {
                            void loadProviders();
                            onCostsRefresh?.();
                          }}
                        />
                      </>
                    )}
                    {p.provider_key === "ovh" && (
                      <OvhSyncInvoicesButton
                        configured={p.configured}
                        disabled={syncLoading || backfillLoading}
                        onSynced={() => {
                          setOvhRefreshKey((k) => k + 1);
                          void loadProviders();
                          onCostsRefresh?.();
                        }}
                      />
                    )}
                    {(BACKFILL_PROVIDER_KEYS as readonly string[]).includes(p.provider_key) && (
                      <Button
                        type="button" variant="outline" size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={syncLoading || backfillLoading}
                        onClick={() => setBackfillProviderKey(p.provider_key as BackfillProviderKey)}
                      >
                        <History className="h-3.5 w-3.5" aria-hidden />
                        {t("providers.action_backfill")}
                      </Button>
                    )}
                    {p.cost_import_supported && (
                      <Button
                        type="button" variant="outline" size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={syncLoading || backfillLoading}
                        onClick={() => void handleSync(p.provider_key)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        {t("providers.action_resync")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Indicateurs — grille responsive */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 pt-1 border-t border-border/40">
                  <ProviderStatCell label={t("providers.col_configured")}>
                    <BoolIcon ok={p.configured} okLabel="Configuré" noLabel="Non configuré" />
                  </ProviderStatCell>
                  <ProviderStatCell label={t("providers.col_actively_used")}>
                    <BoolIcon ok={p.actively_used} okLabel="Utilisé" noLabel="Non utilisé" />
                  </ProviderStatCell>
                  <ProviderStatCell label={t("providers.col_billing_mode")}>
                    <span className="text-muted-foreground leading-snug">{billingModeLabel(p, t)}</span>
                  </ProviderStatCell>
                  <ProviderStatCell label={t("providers.col_sync")}>
                    <BoolIcon ok={p.cost_import_supported} okLabel="Import supporté" noLabel="Non supporté" />
                  </ProviderStatCell>
                  <ProviderStatCell label={t("providers.col_status")}>
                    {providerStatusBadge(p.status)}
                  </ProviderStatCell>
                  <ProviderStatCell label={t("providers.col_sync_status")}>
                    {p.last_sync_status
                      ? providerStatusBadge(p.last_sync_status)
                      : <span className="text-muted-foreground">—</span>}
                  </ProviderStatCell>
                </div>

                {/* Dates + erreur sync */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-muted-foreground font-mono border-t border-border/30 pt-2">
                  <span>
                    <span className="font-sans font-semibold text-muted-foreground/80 mr-1">
                      {t("providers.col_last_detected")} :
                    </span>
                    {frDateShort(p.last_detected_at)}
                  </span>
                  <span>
                    <span className="font-sans font-semibold text-muted-foreground/80 mr-1">
                      {t("providers.col_last_synced")} :
                    </span>
                    {frDateShort(p.last_synced_at)}
                  </span>
                </div>
                {p.last_sync_error && (
                  <p className="text-xs text-red-600 leading-snug" title={p.last_sync_error}>
                    {p.last_sync_error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export default function SettingsCouts() {
  const { t } = useTranslation("settings");
  const { role_id, global_role_id, session, loading: authLoading } = useAuthUser();
  const showOpenAiTtsReconciliation = role_id === 1;
  /** Saisie manuelle des coûts réservée aux admins globaux (role_id 1-2). */
  const isCostAdmin = global_role_id === 1 || global_role_id === 2;
  const [manualCostOpen, setManualCostOpen] = useState(false);
  const [editCostEvent, setEditCostEvent] = useState<CostEvent | null>(null);
  const [attachCostEvent, setAttachCostEvent] = useState<CostEvent | null>(null);

  // ---- State ----
  const [filters, setFilters] = useState<CostFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<CostSort>(DEFAULT_COST_SORT);

  const [events,  setEvents]  = useState<CostEvent[]>([]);
  const [total,   setTotal]   = useState(0);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [byProvider, setByProvider] = useState<CostBreakdownItem[]>([]);
  const [timeSeries, setTimeSeries] = useState<CostTimeSeriesPoint[]>([]);
  const [linkedFilterOptions, setLinkedFilterOptions] = useState<CostLinkedFilterOptions>(
    EMPTY_COST_LINKED_FILTER_OPTIONS,
  );
  const [artworkMetaById, setArtworkMetaById] = useState<Record<string, CostArtworkDisplayMeta>>({});
  const [eventsTotals, setEventsTotals] = useState<CostEventsTotals | null>(null);
  const [loadingEventsTotals, setLoadingEventsTotals] = useState(true);

  const [loadingEvents,  setLoadingEvents]  = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCharts,  setLoadingCharts]  = useState(true);
  const [errorEvents,    setErrorEvents]    = useState<string | null>(null);
  const [costsRefreshKey, setCostsRefreshKey] = useState(0);
  const [usdEurRate, setUsdEurRate] = useState<number | null>(null);
  const [integrityReport, setIntegrityReport] = useState<CostIntegrityReport | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [kpiIntegrity, setKpiIntegrity] = useState<{
    rows_scanned: number;
    cursor_total_usd: number;
    computed_at: string;
  } | null>(null);
  const kpiBarRef = useRef<HTMLDivElement>(null);
  const [kpiBarHeight, setKpiBarHeight] = useState(120);

  const isGlobalCostViewer = global_role_id != null && global_role_id >= 1 && global_role_id <= 3;

  const refreshCostData = useCallback(() => {
    setCostsRefreshKey((k) => k + 1);
  }, []);

  // ---- Options filtres liées (cascade expo / œuvre / agence / outils) ----
  useEffect(() => {
    let cancelled = false;
    void getCostLinkedFilterOptions(filters).then((linked) => {
      if (cancelled) return;
      setLinkedFilterOptions(linked);
      setFilters((prev) => {
        const sanitized = sanitizeCostFilters(prev, linked);
        const changed = (Object.keys(sanitized) as (keyof CostFilters)[]).some(
          (k) => sanitized[k] !== prev[k],
        );
        return changed ? sanitized : prev;
      });
    });
    return () => { cancelled = true; };
  }, [filters, costsRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    void getUsdToEurRate().then((rate) => {
      if (!cancelled) setUsdEurRate(rate);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isGlobalCostViewer) {
      setIntegrityReport(null);
      return;
    }
    let cancelled = false;
    void getCostIntegrityReport().then((report) => {
      if (!cancelled) setIntegrityReport(report);
    });
    return () => { cancelled = true; };
  }, [isGlobalCostViewer, costsRefreshKey]);

  // ---- Chargement événements ----
  useEffect(() => {
    let cancelled = false;
    setLoadingEvents(true);
    setErrorEvents(null);

    getCostEvents(filters, page, PAGE_SIZE, sort).then(({ data, count, error }) => {
      if (cancelled) return;
      setLoadingEvents(false);
      if (error) { setErrorEvents(error); return; }
      setEvents(data);
      setTotal(count);
    }).catch((e) => {
      if (!cancelled) { setLoadingEvents(false); setErrorEvents(String(e)); }
    });

    return () => { cancelled = true; };
  }, [filters, page, sort, costsRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    if (events.length === 0) {
      setArtworkMetaById({});
      return;
    }
    void getCostEntityDisplayMetaForEvents(events).then((map) => {
      if (!cancelled) setArtworkMetaById(map);
    });
    return () => { cancelled = true; };
  }, [events]);

  useEffect(() => {
    let cancelled = false;

    if (authLoading || !session) {
      return () => { cancelled = true; };
    }

    setLoadingEventsTotals(true);
    setLoadingSummary(true);
    setLoadingCharts(true);
    setKpiError(null);

    void fetchVerifiedCostKpi(filters, usdEurRate)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setKpiError(error ?? t("couts.kpi_error_fallback"));
          setKpiIntegrity(null);
          setSummary(null);
          setByProvider([]);
          setEventsTotals(null);
          const ts = await getCostTimeSeries(filters, { usdToEurRate: usdEurRate });
          if (!cancelled) setTimeSeries(ts);
          return;
        }
        setKpiError(null);
        setSummary(data.summary);
        setByProvider(data.byProvider);
        setEventsTotals({
          totalCost: data.summary.totalCost,
          totalInputUnits: data.summary.totalInputUnits ?? 0,
          totalOutputUnits: data.summary.totalOutputUnits ?? 0,
          currency: data.summary.currency,
        });
        setKpiIntegrity({
          rows_scanned: data.integrity.rows_scanned,
          cursor_total_usd: data.integrity.cursor_total_usd,
          computed_at: data.integrity.computed_at,
        });
        const ts = await getCostTimeSeries(filters, { usdToEurRate: usdEurRate });
        if (!cancelled) setTimeSeries(ts);
      })
      .catch((e) => {
        if (!cancelled) {
          setKpiError(String(e));
          setSummary(null);
          setByProvider([]);
          setEventsTotals(null);
          setKpiIntegrity(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEventsTotals(false);
          setLoadingSummary(false);
          setLoadingCharts(false);
        }
      });

    return () => { cancelled = true; };
  }, [filters, costsRefreshKey, usdEurRate, authLoading, session, t]);

  // ---- Handlers ----
  const handleFiltersChange = useCallback((f: CostFilters) => {
    setFilters(f);
    setPage(0);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSort(DEFAULT_COST_SORT);
    setPage(0);
  }, []);

  const handleSortChange = useCallback((next: CostSort) => {
    setSort(next);
    setPage(0);
  }, []);

  const [exportingCsv, setExportingCsv] = useState(false);

  const handleExport = useCallback(() => {
    void (async () => {
      setExportingCsv(true);
      try {
        const { data, error } = await getAllFilteredCostEvents(filters, sort);
        if (error) {
          toast.error(t("couts.export_error", { detail: error }));
          return;
        }
        if (data.length === 0) {
          toast.warning(t("couts.export_empty"));
          return;
        }
        await exportCostsCsv(data);
        toast.success(t("couts.export_done", { count: data.length.toLocaleString("fr-FR") }));
      } catch (e) {
        toast.error(t("couts.export_error", { detail: String(e) }));
      } finally {
        setExportingCsv(false);
      }
    })();
  }, [filters, sort, t]);

  // ---- KPI cards ----
  const currency = summary?.currency ?? "EUR";
  const isUsd = currency.toUpperCase() === "USD";
  const fxSub = isUsd && usdEurRate
    ? t("couts.fx_rate_hint", { rate: usdEurRate.toFixed(4) })
    : undefined;

  const kpis = useMemo(() => {
    if (!summary) return [];
    const eurTotal = isUsd && usdEurRate
      ? formatUsdToEurHint(summary.totalCost, usdEurRate, 2)
      : undefined;
    const eurAvg = isUsd && usdEurRate
      ? formatUsdToEurHint(summary.avgCostPerCall, usdEurRate, 2)
      : undefined;
    return [
      {
        icon: Euro,
        label: t("couts.kpi_total_cost"),
        value: formatCost(summary.totalCost, currency, 2),
        eurHint: eurTotal,
        sub: fxSub ?? currency,
      },
      {
        icon: Activity,
        label: t("couts.kpi_call_count"),
        value: summary.callCount.toLocaleString("fr-FR"),
        sub: t("couts.kpi_call_count_sub"),
      },
      {
        icon: TrendingUp,
        label: t("couts.kpi_avg_cost"),
        value: formatCost(summary.avgCostPerCall, currency, 2),
        eurHint: eurAvg,
        sub: t("couts.kpi_avg_cost_sub"),
      },
      {
        icon: Award,
        label: t("couts.kpi_top_provider"),
        value: summary.topProvider ?? "—",
        sub: summary.topTool ? `outil : ${summary.topTool}` : undefined,
      },
    ];
  }, [summary, currency, isUsd, usdEurRate, fxSub, t]);

  useEffect(() => {
    const el = kpiBarRef.current;
    if (!el) return;
    const update = () => setKpiBarHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadingSummary, kpiError, summary, kpis.length]);

  // ---- Chart data ----
  // Montant converti en euros (les barres affichent le coût en €, 2 décimales).
  const toEur = (v: number) => (isUsd && usdEurRate ? v * usdEurRate : v);

  const providerChartData = useMemo(() => {
    const source = hasActiveCostFilters(filters)
      ? byProvider
      : fillKnownCostProvidersBreakdown(byProvider);
    return source.map((item) => ({
      providerKey: item.label,
      name: costProviderDisplayName(item.label),
      coût: parseFloat(item.totalCost.toFixed(6)),
      eur: toEur(item.totalCost),
      appels: item.callCount,
    }));
  }, [byProvider, filters, isUsd, usdEurRate]);

  const timeSeriesChartData = timeSeries.slice(-60).map((p) => ({
    date: chartDateFr(p.date),
    coût: parseFloat(p.totalCost.toFixed(6)),
    eur: toEur(p.totalCost),
    appels: p.callCount,
  }));

  // ---- Render ----
  return (
    <div className="container py-8 space-y-6">

      {/* Barre KPI — fixe en haut, toujours visible au scroll */}
      <div
        ref={kpiBarRef}
        className="fixed left-0 right-0 z-40 border-b border-border/50 bg-[#121212] shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
        style={{ top: "calc(4.25rem + 10px)" }}
      >
        <div className="mx-auto w-full max-w-[1200px] px-4 py-3">
          {loadingSummary ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="glass-card animate-pulse">
                  <CardContent className="h-20 rounded-xl bg-muted/30 p-5" />
                </Card>
              ))}
            </div>
          ) : kpiError || !summary ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">{t("couts.kpi_error_title")}</p>
                <p className="mt-1 text-sm">{kpiError ?? t("couts.kpi_error_fallback")}</p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.label} {...kpi} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div aria-hidden style={{ height: kpiBarHeight }} />

      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden />
              {t("couts.back_settings")}
            </Link>
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight">{t("couts.page_title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("couts.page_sub")}</p>
          <p className="text-xs text-muted-foreground/90 mt-1.5">
            {t("couts.project_created", { date: formatProjectDate(PROJECT_CREATED_DATE) })}
          </p>
        </div>
      </div>

      {integrityReport && !integrityReport.ok && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-1">{t("couts.integrity_alert_title")}</p>
            <ul className="list-disc pl-4 space-y-0.5 text-sm">
              {integrityReport.issues.map((issue) => (
                <li key={issue.code}>
                  {issue.code === "mediation_logs_without_artwork"
                    ? t("couts.integrity_mediation_logs_without_artwork", { count: issue.count })
                    : issue.code === "usage_logs_without_artwork"
                      ? t("couts.integrity_usage_logs_without_artwork", { count: issue.count })
                    : issue.code === "openai_events_without_text_id"
                      ? t("couts.integrity_openai_without_text_id", { count: issue.count })
                      : issue.code === "logs_unreadable"
                        ? t("couts.integrity_logs_unreadable")
                        : `${issue.message} (${issue.count})`}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Filtres — au-dessus du tableau détaillé */}
      <FiltersBar
        filters={filters}
        options={linkedFilterOptions.selectOptions}
        onChange={handleFiltersChange}
        onReset={handleReset}
        loading={loadingEvents}
      />

      {/* Table détaillée */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("couts.table_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CostsTable
            events={events}
            loading={loadingEvents}
            error={errorEvents}
            page={page}
            total={total}
            sort={sort}
            onSortChange={handleSortChange}
            onPageChange={setPage}
            onExport={handleExport}
            exportingCsv={exportingCsv}
            currency={currency}
            totals={eventsTotals}
            loadingTotals={loadingEventsTotals}
            usdEurRate={usdEurRate}
            isAdmin={isCostAdmin}
            filters={filters}
            linkedFilterOptions={linkedFilterOptions}
            artworkMetaById={artworkMetaById}
            onFiltersChange={handleFiltersChange}
            onAddCost={() => { setEditCostEvent(null); setManualCostOpen(true); }}
            onEditCost={(ev) => { setEditCostEvent(ev); setManualCostOpen(true); }}
            onAttachCost={(ev) => setAttachCostEvent(ev)}
            onDeleted={refreshCostData}
          />
        </CardContent>
      </Card>

      {/* Graphiques */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Série temporelle */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("couts.chart_timeline_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCharts ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              </div>
            ) : timeSeriesChartData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                {t("settings_no_data")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timeSeriesChartData} margin={{ top: 48, right: 28, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatEurChartLabel} />
                  <Tooltip
                    formatter={(_value: number, _name, item) => [formatEurChartLabel(item?.payload?.eur), "Coût"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="eur" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={32}>
                    <LabelList
                      dataKey="eur"
                      position="top"
                      angle={-45}
                      offset={12}
                      formatter={formatEurChartLabel}
                      style={{ fontSize: 9, fill: "hsl(var(--foreground))", textAnchor: "start" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Répartition par fournisseur */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("couts.chart_provider_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCharts ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              </div>
            ) : providerChartData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                {t("settings_no_data")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, providerChartData.length * 34 + 40)}>
                <BarChart data={providerChartData} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatEurChartLabel} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} interval={0} />
                  <Tooltip
                    formatter={(_value: number, _name, item) => [formatEurChartLabel(item?.payload?.eur), "Coût"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="eur" radius={[0, 3, 3, 0]} maxBarSize={22}>
                    {providerChartData.map((entry, index) => (
                      <Cell
                        key={entry.providerKey}
                        fill={costProviderChartColor(entry.providerKey, index)}
                      />
                    ))}
                    <LabelList
                      dataKey="eur"
                      position="right"
                      formatter={formatEurChartLabel}
                      style={{ fontSize: 9, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {kpiIntegrity && !kpiError && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {t("couts.kpi_verified", {
              count: kpiIntegrity.rows_scanned.toLocaleString("fr-FR"),
              cursor: kpiIntegrity.cursor_total_usd.toFixed(2),
            })}
          </AlertDescription>
        </Alert>
      )}

      {showOpenAiTtsReconciliation ? (
        <OpenAiTtsSummaryCard refreshKey={costsRefreshKey} usdEurRate={usdEurRate} />
      ) : null}

      {/* Budgets Google Cloud (cache Budget API) */}
      <GoogleBillingCard />

      {/* Section Fournisseurs */}
      <ProvidersSection
        onCostsRefresh={refreshCostData}
        showOpenAiTtsReconciliation={showOpenAiTtsReconciliation}
      />

      {isCostAdmin && (
        <ManualCostDialog
          open={manualCostOpen}
          onOpenChange={(o) => { setManualCostOpen(o); if (!o) setEditCostEvent(null); }}
          onSaved={refreshCostData}
          editEvent={editCostEvent}
        />
      )}

      {isCostAdmin && (
        <CostDocumentsDialog
          open={attachCostEvent != null}
          onOpenChange={(o) => { if (!o) setAttachCostEvent(null); }}
          onSaved={refreshCostData}
          event={attachCostEvent}
        />
      )}
    </div>
  );
}
