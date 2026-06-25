import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Gauge,
  Loader2,
  RefreshCw,
  Shield,
  Star,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  inferExperienceScores,
  inferModelProfileKind,
  mergeScoresFromCache,
} from "@/lib/aiModelExperienceScores";
import { usageAggregationKey } from "@/lib/aiUsageModelId";
import { AI_USAGE_REFRESH_EVENT } from "@/lib/aiUsageRefresh";
import {
  AI_APP_SETTINGS_KEYS,
  type CachedAiModel,
} from "@/lib/settingsKeys";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppSettingRow = Record<string, unknown>;

const USAGE_PAGE_SIZE = 1000;

/** Identifiant modèle pour comparaisons (trim ; casse ignorée car les API sont souvent incohérentes). */
function normalizeModelId(id: string | null | undefined): string {
  return (id ?? "").trim();
}

function modelIdsEqual(a: string, b: string): boolean {
  const na = normalizeModelId(a);
  const nb = normalizeModelId(b);
  if (!na || !nb) return na === nb;
  return na.toLowerCase() === nb.toLowerCase();
}

/**
 * Valeur `app_settings.value` pour selected_ai_model : texte, JSON string, ou jsonb objet.
 */
function parseSelectedAiModelSettingValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return "";
    if ((t.startsWith('"') && t.endsWith('"')) || t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (typeof parsed === "string") return parsed.trim();
        if (parsed && typeof parsed === "object") {
          const o = parsed as Record<string, unknown>;
          const id = o.model_id ?? o.id ?? o.modelId ?? o.selected_model ?? o.model;
          if (typeof id === "string" && id.trim()) return id.trim();
        }
      } catch {
        /* chaîne brute */
      }
    }
    return t;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const id = o.model_id ?? o.id ?? o.modelId ?? o.selected_model ?? o.model;
    if (typeof id === "string") return id.trim();
  }
  const s = String(raw).trim();
  return s === "[object Object]" ? "" : s;
}

function getProjectUrl(): string {
  const raw = import.meta.env.VITE_SUPABASE_URL;
  return typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
}

const PLAYGROUND_FALLBACK_GEMINI = "https://aistudio.google.com/";
const PLAYGROUND_FALLBACK_GROQ = "https://console.groq.com/playground";

function resolvePlaygroundUrl(provider: CachedAiModel["provider"], raw: unknown): string {
  const fromJson = typeof raw === "string" ? raw.trim() : "";
  if (fromJson) return fromJson;
  return provider === "gemini" ? PLAYGROUND_FALLBACK_GEMINI : PLAYGROUND_FALLBACK_GROQ;
}

function parseModelsCache(raw: string | null | undefined): CachedAiModel[] {
  if (raw == null || String(raw).trim() === "") return [];
  try {
    const v = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x): CachedAiModel | null => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id.trim() : "";
        const provider = o.provider === "gemini" || o.provider === "groq" ? o.provider : null;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const tpm = typeof o.tpm_limit === "number" ? o.tpm_limit : Number(o.tpm_limit);
        const fallback = inferExperienceScores(id, name || id, provider);
        const qsRaw = o.quality_score;
        const ssRaw = o.speed_score;
        const bsRaw = o.balance_score;
        const trRaw = o.tpm_resilience_score;
        const qsParsed = typeof qsRaw === "number" ? qsRaw : Number(qsRaw);
        const ssParsed = typeof ssRaw === "number" ? ssRaw : Number(ssRaw);
        const bsParsed = typeof bsRaw === "number" ? bsRaw : Number(bsRaw);
        const trParsed = typeof trRaw === "number" ? trRaw : Number(trRaw);
        const merged = mergeScoresFromCache(
          {
            quality_score: Number.isFinite(qsParsed) ? qsParsed : undefined,
            speed_score: Number.isFinite(ssParsed) ? ssParsed : undefined,
            tpm_resilience_score: Number.isFinite(trParsed) ? trParsed : undefined,
            balance_score: Number.isFinite(bsParsed) ? bsParsed : undefined,
          },
          fallback,
        );
        if (!id || !provider) return null;
        const playground_url = resolvePlaygroundUrl(provider, o.playground_url);
        return {
          id,
          provider,
          name: name || id,
          tpm_limit: Number.isFinite(tpm) && tpm > 0 ? Math.round(tpm) : 0,
          quality_score: merged.quality_score,
          speed_score: merged.speed_score,
          tpm_resilience_score: merged.tpm_resilience_score,
          balance_score: merged.balance_score,
          playground_url,
        };
      })
      .filter((x): x is CachedAiModel => x != null);
  } catch {
    return [];
  }
}

function aggregateTotalsByModelId(
  rows: { model_id: string | null; total_tokens: number | null }[] | null | undefined,
): Record<string, number> {
  const acc: Record<string, number> = {};
  if (!rows?.length) return acc;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const id = r.model_id != null ? usageAggregationKey(String(r.model_id)) : "";
    if (!id) continue;
    const raw = r.total_tokens;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    acc[id] = (acc[id] ?? 0) + Math.round(n);
  }
  return acc;
}

async function fetchAllUsageLogRows(): Promise<{ model_id: string | null; total_tokens: number | null }[]> {
  const all: { model_id: string | null; total_tokens: number | null }[] = [];
  for (let from = 0; ; from += USAGE_PAGE_SIZE) {
    const to = from + USAGE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("model_id, total_tokens")
      .range(from, to);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    all.push(...batch);
    if (batch.length < USAGE_PAGE_SIZE) break;
  }
  return all;
}

function providerLabel(p: CachedAiModel["provider"]): string {
  return p === "gemini" ? "Gemini" : "Groq";
}

/** Séparateur adapté à Excel (souvent FR) : le point-virgule évite les conflits avec les décimales. */
const CSV_SEP = ";";

function escapeCsvField(value: string, sep: string): string {
  let s = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s.includes('"')) s = s.replace(/"/g, '""');
  if (s.includes(sep) || s.includes("\n")) {
    return `"${s}"`;
  }
  return s;
}

function formatExportDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function downloadCsvUtf8Bom(filename: string, lines: string[]): void {
  const body = lines.join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type SortableColumn =
  | "action"
  | "provider"
  | "tpm"
  | "tokens"
  | "quality"
  | "speed"
  | "tpm_resilience"
  | "balance";
type SortDirection = "asc" | "desc";

function sortModelsRow(
  list: CachedAiModel[],
  column: SortableColumn | null,
  direction: SortDirection,
  usageByModelId: Record<string, number>,
  activeModelId: string,
): CachedAiModel[] {
  if (!column || list.length === 0) return list;
  const mult = direction === "asc" ? 1 : -1;
  const out = [...list];
  out.sort((a, b) => {
    let cmp = 0;
    if (column === "action") {
      const ra = modelIdsEqual(a.id, activeModelId) ? 1 : 0;
      const rb = modelIdsEqual(b.id, activeModelId) ? 1 : 0;
      cmp = ra - rb;
    } else if (column === "provider") {
      cmp = a.provider.localeCompare(b.provider);
    } else if (column === "tpm") {
      cmp = a.tpm_limit - b.tpm_limit;
    } else if (column === "quality") {
      cmp = a.quality_score - b.quality_score;
    } else if (column === "speed") {
      cmp = a.speed_score - b.speed_score;
    } else if (column === "tpm_resilience") {
      cmp = a.tpm_resilience_score - b.tpm_resilience_score;
    } else if (column === "balance") {
      cmp = a.balance_score - b.balance_score;
    } else {
      const ta = usageByModelId[usageAggregationKey(a.id)] ?? 0;
      const tb = usageByModelId[usageAggregationKey(b.id)] ?? 0;
      cmp = ta - tb;
    }
    if (cmp !== 0) return mult * cmp;
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });
  return out;
}

async function postDiscoverFreeModels(): Promise<{ count: number; warnings?: string[] }> {
  const base = getProjectUrl();
  const anonKey = typeof import.meta.env.VITE_SUPABASE_ANON_KEY === "string"
    ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
    : "";
  if (!base || !anonKey) {
    throw new Error(
      "Configuration Supabase manquante : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.",
    );
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    throw new Error(sessionErr.message || "Impossible de lire la session.");
  }
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Session expirée ou absente : reconnectez-vous pour actualiser la liste des modèles.");
  }

  const url = `${base}/functions/v1/discover-free-models`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Impossible d’atteindre la fonction Edge (réseau ou URL). Détails : ${msg}. URL appelée : ${url}`,
    );
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* réponse non JSON */
  }

  if (!res.ok) {
    const errMsg =
      body &&
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : text.slice(0, 300) || `HTTP ${res.status}`;
    const details =
      body &&
      typeof body === "object" &&
      body !== null &&
      "details" in body &&
      typeof (body as { details: unknown }).details === "string"
        ? (body as { details: string }).details
        : "";
    throw new Error(details ? `${errMsg} — ${details}` : errMsg);
  }

  const count =
    body && typeof body === "object" && body !== null && "count" in body
      ? Number((body as { count: unknown }).count)
      : 0;
  const warnings =
    body &&
    typeof body === "object" &&
    body !== null &&
    "warnings" in body &&
    Array.isArray((body as { warnings: unknown }).warnings)
      ? (body as { warnings: string[] }).warnings.filter((w) => typeof w === "string")
      : undefined;

  return {
    count: Number.isFinite(count) ? count : 0,
    warnings,
  };
}

type ScoreBadgeKind = "quality" | "speed" | "balance" | "tpm_resilience";

function modelScoreAccentClass(value: number, kind: ScoreBadgeKind): string {
  if (kind === "speed") {
    if (value >= 8) {
      return "border-emerald-600/40 bg-emerald-500/14 text-emerald-900 dark:text-emerald-100";
    }
    if (value >= 4) {
      return "border-amber-600/40 bg-amber-500/12 text-amber-950 dark:text-amber-100";
    }
    return "border-rose-600/45 bg-rose-500/12 text-rose-950 dark:text-rose-100";
  }
  if (value >= 8) {
    return "border-emerald-600/40 bg-emerald-500/14 text-emerald-900 dark:text-emerald-100";
  }
  if (value >= 6) {
    return "border-amber-600/40 bg-amber-500/12 text-amber-950 dark:text-amber-100";
  }
  return "border-border/60 bg-muted/45 text-muted-foreground";
}

function ModelScoreBadge({
  value,
  kind,
  icon,
  compact,
}: {
  value: number;
  kind: ScoreBadgeKind;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-0.5 rounded-full border font-semibold tabular-nums",
        compact ? "px-1 py-0.5 text-[10px] leading-tight" : "px-2 py-0.5 text-xs",
        modelScoreAccentClass(value, kind),
      )}
    >
      {icon ? (
        <span className={cn("inline-flex shrink-0 opacity-90", compact && "[&_svg]:h-2.5 [&_svg]:w-2.5")}>
          {icon}
        </span>
      ) : null}
      {value.toFixed(1)} / 10
    </span>
  );
}

export type AiModelControlPanelProps = {
  appSettingsRows: AppSettingRow[];
  onRefreshRows: () => Promise<void>;
};

export function AiModelControlPanel({ appSettingsRows, onRefreshRows }: AiModelControlPanelProps) {
  const { t } = useTranslation("settings");
  const rowByKey = useMemo(() => {
    const map = new Map<string, AppSettingRow>();
    for (const r of appSettingsRows) {
      const k = r.key != null ? String(r.key) : "";
      if (k) map.set(k, r);
    }
    return map;
  }, [appSettingsRows]);

  const models = useMemo(() => {
    const raw = rowByKey.get(AI_APP_SETTINGS_KEYS.modelsCache)?.value;
    return parseModelsCache(raw != null ? String(raw) : "");
  }, [rowByKey]);

  const [activeModelId, setActiveModelId] = useState("");

  const [usageByModelId, setUsageByModelId] = useState<Record<string, number>>({});
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  const loadUsageTotals = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const rows = await fetchAllUsageLogRows();
      // Table vide ou aucune donnée agrégeable : objet vide → chaque modèle affichera 0 via ?? 0
      setUsageByModelId(aggregateTotalsByModelId(rows));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible de charger les consommations.";
      setUsageError(msg);
      setUsageByModelId({});
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsageTotals();
  }, [loadUsageTotals]);

  useEffect(() => {
    const onRefresh = () => void loadUsageTotals();
    window.addEventListener(AI_USAGE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(AI_USAGE_REFRESH_EVENT, onRefresh);
  }, [loadUsageTotals]);

  /** Lecture initiale / synchro : `selected_ai_model` depuis les lignes chargées ou requête directe si absent. */
  useEffect(() => {
    const key = AI_APP_SETTINGS_KEYS.selectedModel;
    const fromRow = rowByKey.get(key);

    if (fromRow !== undefined) {
      const parsed = parseSelectedAiModelSettingValue(fromRow.value);
      const next = normalizeModelId(parsed);
      setActiveModelId(next);
      if (import.meta.env.DEV) {
        console.log("[AiModelControlPanel] selected_ai_model ← app_settings (props)", next);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
      if (cancelled || error) {
        if (import.meta.env.DEV && error) {
          console.warn("[AiModelControlPanel] lecture selected_ai_model:", error.message);
        }
        return;
      }
      const parsed = parseSelectedAiModelSettingValue(data?.value);
      const next = normalizeModelId(parsed);
      setActiveModelId(next);
      if (import.meta.env.DEV) {
        console.log("[AiModelControlPanel] selected_ai_model ← app_settings (fetch)", next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rowByKey]);

  const [discovering, setDiscovering] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const [sortColumn, setSortColumn] = useState<SortableColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedModels = useMemo(
    () => sortModelsRow(models, sortColumn, sortDirection, usageByModelId, activeModelId),
    [models, sortColumn, sortDirection, usageByModelId, activeModelId],
  );

  const setSort = useCallback((column: SortableColumn, direction: SortDirection) => {
    setSortColumn(column);
    setSortDirection(direction);
  }, []);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    try {
      const { count, warnings } = await postDiscoverFreeModels();
      toast.success(t("ai_toast_discover_ok", { count }));
      if (warnings?.length) {
        toast.message(t("ai_models_warnings_title"), { description: warnings.join(" · ") });
      }
      await onRefreshRows();
      await loadUsageTotals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ai_toast_discover_error"));
    } finally {
      setDiscovering(false);
    }
  }, [onRefreshRows, loadUsageTotals, t]);

  const handleExportCsv = useCallback(() => {
    if (sortedModels.length === 0) {
      toast.error(t("ai_models_export_empty"));
      return;
    }
    const sep = CSV_SEP;
    const headers = [
      t("ai_models_col_name"),
      t("ai_models_col_provider"),
      t("ai_models_col_quality"),
      t("ai_models_col_speed"),
      t("ai_models_col_tpm_resilience"),
      t("ai_models_col_balance"),
      t("ai_models_col_tpm"),
      t("ai_models_col_tokens"),
    ];
    const headerLine = headers.map((h) => escapeCsvField(h, sep)).join(sep);
    const dataLines = sortedModels.map((m) => {
      const tpmStr = m.tpm_limit > 0 ? String(m.tpm_limit) : "";
      const consumed = usageByModelId[usageAggregationKey(m.id)] ?? 0;
      const row = [
        m.name,
        providerLabel(m.provider),
        m.quality_score.toFixed(1),
        m.speed_score.toFixed(1),
        m.tpm_resilience_score.toFixed(1),
        m.balance_score.toFixed(1),
        tpmStr,
        String(consumed),
      ];
      return row.map((cell) => escapeCsvField(cell, sep)).join(sep);
    });
    const filename = `export-controle-ia-${formatExportDateLocal()}.csv`;
    try {
      downloadCsvUtf8Bom(filename, [headerLine, ...dataLines]);
      toast.success(t("ai_models_export_ok"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ai_models_export_error"));
    }
  }, [sortedModels, usageByModelId, t]);

  const handleActivate = useCallback(
    async (m: CachedAiModel) => {
      if (modelIdsEqual(m.id, activeModelId)) return;
      setActivatingId(m.id);
      try {
        const key = AI_APP_SETTINGS_KEYS.selectedModel;
        const payload: { value: string; max_tokens?: number } = { value: m.id };
        if (m.tpm_limit > 0) {
          payload.max_tokens = m.tpm_limit;
        }

        const { data, error } = await supabase
          .from("app_settings")
          .update(payload)
          .eq("key", key)
          .select("value");

        if (error != null) {
          console.error("[AiModelControlPanel] Supabase — mise à jour selected_ai_model :", error);
          toast.error(error.message || "Impossible d’enregistrer le modèle (erreur Supabase).");
          return;
        }

        const updatedRows = Array.isArray(data) ? data : [];
        if (updatedRows.length === 0) {
          const hint =
            "Aucune ligne mise à jour. Vérifiez que la clé « selected_ai_model » existe dans app_settings et que votre rôle peut faire un UPDATE (RLS).";
          console.error("[AiModelControlPanel] Mise à jour 0 ligne pour key=", key, "payload=", payload);
          toast.error(hint);
          return;
        }

        const confirmed = parseSelectedAiModelSettingValue(updatedRows[0]?.value);
        const nextId = normalizeModelId(confirmed) || normalizeModelId(m.id);
        setActiveModelId(nextId);
        toast.success(`Modèle actif : ${m.name}`);
        await onRefreshRows();
        await loadUsageTotals();
      } catch (e) {
        console.error("[AiModelControlPanel] Erreur inattendue lors de la sélection du modèle :", e);
        toast.error(e instanceof Error ? e.message : "Impossible d’enregistrer le modèle.");
      } finally {
        setActivatingId(null);
      }
    },
    [activeModelId, onRefreshRows, loadUsageTotals],
  );

  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4 shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{t("ai_section_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("ai_models_intro_tokens")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("ai_models_intro_scores")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="gap-2 shrink-0 border border-amber-300/60 shadow-none"
            disabled={discovering}
            onClick={() => void handleDiscover()}
          >
            {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {discovering ? t("ai_btn_refresh_loading") : t("ai_btn_refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 shrink-0 border border-border/70 bg-background shadow-none hover:bg-muted/40"
            disabled={sortedModels.length === 0}
            onClick={() => handleExportCsv()}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            {t("ai_models_export")}
          </Button>
        </div>
      </div>

      {usageError && (
        <p className="text-sm text-destructive" role="alert">
          {usageError}{" "}
          <span className="text-muted-foreground">
            (vérifiez les politiques RLS : lecture sur <code className="rounded bg-muted px-1">ai_usage_logs</code> pour
            les administrateurs.)
          </span>
        </p>
      )}

      <div className="w-full max-w-[1084px] mx-auto overflow-hidden rounded-md border border-black/50 bg-background/80">
        <table className="w-full min-w-0 table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-[23%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground md:text-[10px]">
              <th className="max-w-0 px-1.5 py-2 md:px-2 md:py-2.5">
                <span className="block max-w-full truncate text-left text-xs font-semibold normal-case tracking-normal">
                  {t("ai_models_col_name")}
                </span>
                <span className="sr-only"> — {t("ai_models_col_name_hint")}</span>
              </th>
              <th className="px-1.5 py-2 whitespace-normal md:px-2 md:py-2.5 text-center">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none text-xs font-semibold normal-case tracking-normal">
                    {t("ai_models_col_provider")}
                  </span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label={t("ai_models_sort_group_provider")}
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "provider" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "provider" && sortDirection === "asc"}
                      aria-label={t("ai_models_sort_provider_asc")}
                      onClick={() => setSort("provider", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "provider" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "provider" && sortDirection === "desc"}
                      aria-label={t("ai_models_sort_provider_desc")}
                      onClick={() => setSort("provider", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th className="px-1.5 py-2 whitespace-normal md:px-2 md:py-2.5 text-center">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none inline-flex items-center gap-0.5 md:gap-1">
                    <Star className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                    {t("ai_models_col_quality")}
                  </span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label="Tri par indice de qualité"
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "quality" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "quality" && sortDirection === "asc"}
                      aria-label="Tri croissant : qualité la plus faible d’abord"
                      onClick={() => setSort("quality", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "quality" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "quality" && sortDirection === "desc"}
                      aria-label="Tri décroissant : modèles les plus « intelligents » en premier"
                      onClick={() => setSort("quality", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th className="px-1.5 py-2 whitespace-normal md:px-2 md:py-2.5 text-center">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none inline-flex items-center gap-0.5 md:gap-1">
                    <Zap className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                    {t("ai_models_col_speed")}
                  </span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label="Tri par vitesse"
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "speed" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "speed" && sortDirection === "asc"}
                      aria-label="Tri croissant : vitesse la plus faible d’abord"
                      onClick={() => setSort("speed", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "speed" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "speed" && sortDirection === "desc"}
                      aria-label="Tri décroissant : modèles les plus rapides en premier"
                      onClick={() => setSort("speed", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th
                className="px-0.5 py-2 text-center md:px-1 md:py-2.5"
                title={t("ai_models_col_tpm_resilience")}
              >
                <div className="flex items-center justify-center gap-0.5">
                  <span className="select-none inline-flex items-center gap-0.5">
                    <Shield className="h-3 w-3 shrink-0 self-center opacity-80" aria-hidden />
                    <span className="whitespace-pre-line text-center text-[8px] leading-[1.15] md:text-[9px]">
                      {t("ai_models_hdr_tpm_resilience")}
                    </span>
                  </span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label={t("ai_models_col_tpm_resilience")}
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "tpm_resilience" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "tpm_resilience" && sortDirection === "asc"}
                      aria-label="Tri croissant : résilience TPM la plus faible d’abord"
                      onClick={() => setSort("tpm_resilience", "asc")}
                    >
                      <ChevronUp className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "tpm_resilience" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "tpm_resilience" && sortDirection === "desc"}
                      aria-label="Tri décroissant : meilleure résilience TPM en tête"
                      onClick={() => setSort("tpm_resilience", "desc")}
                    >
                      <ChevronDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th className="px-0.5 py-2 text-center md:px-1 md:py-2.5">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none inline-flex items-center gap-0.5">
                    <Gauge className="h-3 w-3 shrink-0 self-center opacity-80" aria-hidden />
                    <span className="whitespace-pre-line text-center text-[8px] leading-[1.15] md:text-[9px]">
                      {t("ai_models_hdr_balance")}
                    </span>
                  </span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label="Tri par compromis global"
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "balance" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "balance" && sortDirection === "asc"}
                      aria-label="Tri croissant : compromis global le plus faible d’abord"
                      onClick={() => setSort("balance", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "balance" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "balance" && sortDirection === "desc"}
                      aria-label="Tri décroissant : meilleur compromis global en premier"
                      onClick={() => setSort("balance", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th className="px-1.5 py-2 whitespace-normal md:px-2 md:py-2.5 text-center">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none leading-tight">{t("ai_models_col_tpm")}</span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label="Tri par plafond TPM"
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "tpm" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "tpm" && sortDirection === "asc"}
                      aria-label="Tri croissant : plafond du plus bas au plus élevé"
                      onClick={() => setSort("tpm", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "tpm" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "tpm" && sortDirection === "desc"}
                      aria-label="Tri décroissant : plafond du plus élevé au plus bas"
                      onClick={() => setSort("tpm", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th className="px-1.5 py-2 whitespace-normal md:px-2 md:py-2.5 text-center">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none leading-tight">{t("ai_models_col_tokens")}</span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label="Tri par tokens consommés"
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "tokens" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "tokens" && sortDirection === "asc"}
                      aria-label="Tri croissant : consommation la plus faible d’abord"
                      onClick={() => setSort("tokens", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "tokens" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "tokens" && sortDirection === "desc"}
                      aria-label="Tri décroissant : consommation la plus forte d’abord"
                      onClick={() => setSort("tokens", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
              <th className="px-1.5 py-2 text-center md:px-2 md:py-2.5">
                <div className="flex items-center justify-center gap-0.5 md:gap-1.5">
                  <span className="select-none">{t("ai_models_col_action")}</span>
                  <div
                    className="inline-flex shrink-0 flex-col gap-0 leading-none"
                    role="group"
                    aria-label={t("ai_models_sort_group_status")}
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "action" && sortDirection === "asc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "action" && sortDirection === "asc"}
                      aria-label={t("ai_models_sort_status_asc")}
                      onClick={() => setSort("action", "asc")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "-mt-1 rounded p-0.5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        sortColumn === "action" && sortDirection === "desc"
                          ? "text-primary"
                          : "text-muted-foreground/40 hover:text-muted-foreground/80",
                      )}
                      aria-pressed={sortColumn === "action" && sortDirection === "desc"}
                      aria-label={t("ai_models_sort_status_desc")}
                      onClick={() => setSort("action", "desc")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {models.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-8 text-center text-muted-foreground">
                  {t("ai_models_empty_table")}
                </td>
              </tr>
            ) : (
              sortedModels.map((m) => {
                const isActive = modelIdsEqual(m.id, activeModelId);
                const consumed = usageByModelId[usageAggregationKey(m.id)] ?? 0;
                const busy = activatingId === m.id;
                const kind = inferModelProfileKind(m.id, m.name, m.provider);
                const profileLine =
                  kind === "deep_research"
                    ? t("ai_models_profile_deep_research")
                    : kind === "groq_70b"
                      ? t("ai_models_profile_groq_70b")
                      : kind === "gemini_flash"
                        ? t("ai_models_profile_gemini_flash")
                        : null;
                const q = m.quality_score;
                const highQuality = q >= 8;
                return (
                  <tr
                    key={`${m.provider}:${m.id}`}
                    className={cn(
                      "border-b border-border/40 last:border-b-0",
                      isActive && "bg-emerald-500/5",
                    )}
                  >
                    <td className="min-w-0 max-w-0 px-1.5 py-2 align-middle md:px-2 md:py-2.5">
                      <Link
                        to="/settings?section=prompts-ia"
                        className={cn(
                          "block w-full min-w-0 truncate text-xs font-medium text-foreground",
                          "cursor-pointer rounded-sm underline-offset-[3px] decoration-primary/35",
                          "transition-colors hover:text-primary hover:underline hover:decoration-primary",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        )}
                        title={t("ai_models_name_link_title")}
                        aria-label={t("ai_models_name_link_aria", { name: m.name })}
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="min-w-0 max-w-0 truncate px-1.5 py-2 align-middle text-xs text-muted-foreground md:px-2 md:py-2.5">
                      {providerLabel(m.provider)}
                    </td>
                    <td className="px-0.5 py-2 align-middle text-center md:px-1 md:py-2.5">
                      <ModelScoreBadge
                        value={m.quality_score}
                        kind="quality"
                        compact
                        icon={
                          highQuality ? (
                            <Star
                              className="h-3 w-3 shrink-0 fill-emerald-500/35 text-emerald-700 dark:fill-emerald-400/40 dark:text-emerald-200"
                              aria-hidden
                            />
                          ) : undefined
                        }
                      />
                    </td>
                    <td className="px-0.5 py-2 align-middle text-center md:px-1 md:py-2.5">
                      <ModelScoreBadge
                        value={m.speed_score}
                        kind="speed"
                        compact
                        icon={<Zap className="h-3 w-3 opacity-90" aria-hidden />}
                      />
                    </td>
                    <td className="px-0.5 py-2 align-middle text-center md:px-1 md:py-2.5">
                      <ModelScoreBadge
                        value={m.tpm_resilience_score}
                        kind="tpm_resilience"
                        compact
                        icon={<Shield className="h-3 w-3 opacity-90" aria-hidden />}
                      />
                    </td>
                    <td className="px-0.5 py-2 align-middle text-center md:px-1 md:py-2.5">
                      <div className="flex flex-col items-center gap-1">
                        <ModelScoreBadge
                          value={m.balance_score}
                          kind="balance"
                          compact
                          icon={<Gauge className="h-3 w-3 opacity-90" aria-hidden />}
                        />
                        {profileLine ? (
                          <span className="w-full max-w-full text-center text-[9px] leading-snug text-muted-foreground md:text-[10px]">
                            {profileLine}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-0.5 py-2 align-middle text-center tabular-nums text-xs md:px-1 md:py-2.5">
                      {m.tpm_limit > 0 ? m.tpm_limit.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-0.5 py-2 align-middle text-center tabular-nums text-xs md:px-1 md:py-2.5">
                      {usageLoading ? "…" : consumed.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-1.5 py-2 align-middle text-center md:px-2 md:py-2.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={isActive ? "secondary" : "default"}
                        className="gap-1 shadow-none mx-auto h-7 w-auto min-w-0 max-w-[5rem] shrink-0 px-1 text-[9px] leading-tight md:h-8 md:max-w-[5.75rem] md:px-1.5 md:text-[10px]"
                        disabled={isActive || busy}
                        onClick={() => void handleActivate(m)}
                      >
                        {isActive ? (
                          t("ai_models_status_active")
                        ) : busy ? (
                          <span className="inline-flex items-center justify-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            <span className="sr-only">{t("ai_models_btn_saving")}</span>
                          </span>
                        ) : (
                          t("ai_models_btn_select")
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t("ai_models_footer_prefix")}{" "}
        <code className="rounded bg-muted px-1">{AI_APP_SETTINGS_KEYS.selectedModel}</code>,{" "}
        <code className="rounded bg-muted px-1">{AI_APP_SETTINGS_KEYS.modelsCache}</code>
        {t("ai_models_footer_mid")}{" "}
        <code className="rounded bg-muted px-1">ai_usage_logs</code>
      </p>
    </div>
  );
}
