import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Info, Loader2, RefreshCw } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAILimits, type AILimitRow } from "@/hooks/useAILimits";
import { formatTokenCount } from "@/lib/aiTokenUsage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AILimitsMonitorProps = {
  provider?: string;
  /** Enregistre refetch() pour le bouton Actualiser parent (page suivi tokens). */
  onRefetchRegister?: (refetch: () => void) => void;
};

type AILimitAlertRow = {
  id: string;
  provider: string;
  model: string | null;
  limit_type: string;
  usage_pct: number;
  alert_level: string;
  sent_at: string;
  notified_email: boolean;
};

const NUMBER_FMT = new Intl.NumberFormat("fr-FR");
const ADVANCED_PANEL_ID = "overrides";

const TOKEN_LIMIT_TYPES = new Set(["TPM", "TPD"]);

function providerLabel(provider: string): string {
  if (provider === "groq") return "Groq";
  if (provider === "gemini") return "Gemini";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function providerHint(provider: string): string | null {
  if (provider === "groq") {
    return "Certaines limites peuvent être détectées automatiquement après un appel API.";
  }
  if (provider === "gemini") {
    return "Les limites automatiques ne sont pas encore récupérées dans l'application ; vous pouvez définir une valeur manuelle si nécessaire.";
  }
  return null;
}

function formatObservedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
}

function formatUsageValue(limitType: string, value: number): string {
  if (limitType === "RPM" || limitType === "RPD") {
    return NUMBER_FMT.format(Math.round(value));
  }
  if (limitType === "ASH" || limitType === "ASD") {
    return `${NUMBER_FMT.format(Math.round(value))} s`;
  }
  return formatTokenCount(value);
}

function formatUsageLine(row: AILimitRow): string {
  if (row.limit_value == null) {
    return "-- / --";
  }
  const usage = formatUsageValue(row.limit_type, row.current_usage);
  const limit = formatUsageValue(row.limit_type, row.limit_value);
  const unit = TOKEN_LIMIT_TYPES.has(row.limit_type) ? " tokens" : "";
  const pct =
    row.usage_pct != null ? ` (${row.usage_pct.toFixed(1).replace(".", ",")} %)` : "";
  return `${usage} / ${limit}${unit}${pct}`;
}

function progressClass(status: AILimitRow["status"]): string {
  if (status === "unknown") return "[&>div]:bg-muted";
  if (status === "blocked" || status === "critical") return "[&>div]:bg-destructive";
  if (status === "warning") return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

function progressValue(row: AILimitRow): number {
  if (row.status === "unknown" || row.usage_pct == null) return 0;
  return Math.min(100, Math.max(0, row.usage_pct));
}

function rowLabel(row: AILimitRow): string {
  const model = row.model ?? "tous modèles";
  return `${model} — ${row.limit_type}`;
}

function alertLevelLabel(level: string): string {
  if (level === "warning") return "Avertissement";
  if (level === "critical") return "Critique";
  if (level === "blocked") return "Bloqué";
  return level;
}

function thresholdPct(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function SourceBadge({ row }: { row: AILimitRow }) {
  if (row.limit_source === "auto") {
    const detail = row.observed_at
      ? `Détecté le ${formatObservedAt(row.observed_at)}.`
      : "";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="text-[10px] font-normal cursor-default">
            Auto
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Limite détectée automatiquement.</p>
          {detail && <p className="mt-1 text-muted-foreground">{detail}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }
  if (row.limit_source === "manual") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] font-normal cursor-default">
            Manuel
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Limite définie manuellement.</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground cursor-default">
          Inconnu
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Aucune limite connue.</TooltipContent>
    </Tooltip>
  );
}

function ProviderCardTitle({ provider }: { provider: string }) {
  const hint = providerHint(provider);
  const label = providerLabel(provider);

  if (!hint) {
    return <CardTitle className="text-sm font-medium">{label}</CardTitle>;
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <CardTitle className="text-sm font-medium">{label}</CardTitle>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Information ${label}`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function AILimitsMonitor({ provider, onRefetchRegister }: AILimitsMonitorProps) {
  const {
    limits,
    isLoading,
    error,
    hasWarning,
    hasCritical,
    hasUnknown,
    groupedByProvider,
    refetch,
    updateManualLimit,
  } = useAILimits({ provider });

  useEffect(() => {
    onRefetchRegister?.(refetch);
  }, [refetch, onRefetchRegister]);

  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState<string>("");
  const [focusLimitId, setFocusLimitId] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AILimitAlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of limits) {
      next[row.limit_id] =
        row.limit_value_manual != null ? String(row.limit_value_manual) : "";
    }
    setManualDrafts(next);
  }, [limits]);

  useEffect(() => {
    if (!focusLimitId || advancedOpen !== ADVANCED_PANEL_ID) return;

    const timer = window.setTimeout(() => {
      const el = document.getElementById(`manual-limit-${focusLimitId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement) {
        el.focus();
      }
      setFocusLimitId(null);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [focusLimitId, advancedOpen]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);

    let q = supabase
      .from("ai_limit_alerts")
      .select("id, provider, model, limit_type, usage_pct, alert_level, sent_at, notified_email")
      .order("sent_at", { ascending: false })
      .limit(20);

    if (provider) {
      q = q.eq("provider", provider);
    }

    const { data, error: err } = await q;
    setAlertsLoading(false);

    if (err) {
      setAlertsError(err.message);
      setAlerts([]);
      return;
    }

    setAlerts(
      (data ?? []).map((r) => ({
        id: String(r.id),
        provider: String(r.provider),
        model: r.model == null ? null : String(r.model),
        limit_type: String(r.limit_type),
        usage_pct: Number(r.usage_pct),
        alert_level: String(r.alert_level),
        sent_at: String(r.sent_at),
        notified_email: Boolean(r.notified_email),
      })),
    );
  }, [provider]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const handleRefresh = () => {
    refetch();
    void loadAlerts();
  };

  const openAdvancedForLimit = (limitId: string) => {
    setAdvancedOpen(ADVANCED_PANEL_ID);
    setFocusLimitId(limitId);
  };

  const handleSaveManual = async (limitId: string, raw: string) => {
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      setSaveError("Saisissez un entier strictement positif.");
      return;
    }

    setSavingId(limitId);
    setSaveError(null);
    try {
      await updateManualLimit(limitId, n);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
    } finally {
      setSavingId(null);
    }
  };

  const providerKeys = Object.keys(groupedByProvider).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 id="limites-ia-heading" className="text-lg font-serif font-semibold">
              Limites IA
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Les plafonds sont détectés automatiquement quand le provider les expose. Une limite
              manuelle peut être définie uniquement en secours lorsque aucune valeur automatique
              n&apos;est disponible.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            disabled={isLoading}
            onClick={handleRefresh}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Actualiser
          </Button>
        </div>

        {hasCritical && (
          <Alert variant="destructive">
            <AlertDescription>
              Limite critique atteinte — certains appels IA sont bloqués.
            </AlertDescription>
          </Alert>
        )}

        {!hasCritical && hasWarning && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertDescription className="text-amber-900 dark:text-amber-100">
              Consommation élevée détectée sur un ou plusieurs modèles.
            </AlertDescription>
          </Alert>
        )}

        {hasUnknown && (
          <Alert className="border-sky-500/40 bg-sky-500/10">
            <AlertDescription className="text-sky-900 dark:text-sky-100">
              Certaines limites n&apos;ont pas encore de plafond connu. Un appel Groq peut en
              détecter certaines automatiquement (RPM, TPM).
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {providerKeys.length === 0 && isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : providerKeys.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Aucune limite configurée. Exécutez la migration{" "}
              <code className="text-xs">migration_64_create_ai_provider_limits.sql</code>.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {providerKeys.map((prov) => {
              const rows = groupedByProvider[prov];
              return (
                <Card key={prov} className="glass-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <ProviderCardTitle provider={prov} />
                      <Badge variant="secondary" className="tabular-nums">
                        {rows.length} limite{rows.length > 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {rows.map((row) => (
                      <div key={row.limit_id} className="space-y-2">
                        <Progress
                          value={progressValue(row)}
                          className={cn("h-2", progressClass(row.status))}
                        />
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-medium truncate">{rowLabel(row)}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatUsageLine(row)}
                            </p>
                          </div>
                          <SourceBadge row={row} />
                        </div>
                        {row.limit_source === "unknown" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => openAdvancedForLimit(row.limit_id)}
                          >
                            Définir une limite
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          Groq peut détecter automatiquement certaines limites après un appel API. Pour les types
          non exposés automatiquement, une limite manuelle peut être définie dans les paramètres
          avancés.
        </p>

        <Accordion
          type="single"
          collapsible
          value={advancedOpen}
          onValueChange={setAdvancedOpen}
          className="w-full"
        >
          <AccordionItem value={ADVANCED_PANEL_ID} className="border-none">
            <Card className="glass-card">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline sm:px-6">
                Overrides administrateur
              </AccordionTrigger>
              <AccordionContent className="px-4 sm:px-6">
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Utilisez ce panneau uniquement pour définir une limite de secours lorsqu&apos;aucune
                  limite automatique n&apos;est disponible.
                </p>
                {limits.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Aucune limite à éditer.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Provider</th>
                          <th className="py-2 pr-3 font-medium">Modèle</th>
                          <th className="py-2 pr-3 font-medium">Type</th>
                          <th className="py-2 pr-3 font-medium">Observée</th>
                          <th className="py-2 pr-3 font-medium">Manuelle</th>
                          <th className="py-2 pr-3 font-medium">Source</th>
                          <th className="py-2 pr-3 font-medium">Seuil ⚠️ %</th>
                          <th className="py-2 font-medium">Seuil 🚨 %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {limits.map((row) => (
                          <tr
                            key={row.limit_id}
                            className={cn(
                              "border-b border-border/40 align-top",
                              focusLimitId === row.limit_id && "bg-muted/40",
                            )}
                          >
                            <td className="py-2 pr-3">{providerLabel(row.provider)}</td>
                            <td className="py-2 pr-3">{row.model ?? "—"}</td>
                            <td className="py-2 pr-3">{row.limit_type}</td>
                            <td className="py-2 pr-3">
                              {row.limit_value_observed != null ? (
                                <div>
                                  <span className="tabular-nums">
                                    {formatUsageValue(row.limit_type, row.limit_value_observed)}
                                  </span>
                                  {row.observed_at && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {formatObservedAt(row.observed_at)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <Input
                                    id={`manual-limit-${row.limit_id}`}
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="h-8 w-28 tabular-nums"
                                    placeholder="Secours"
                                    value={manualDrafts[row.limit_id] ?? ""}
                                    onChange={(e) =>
                                      setManualDrafts((prev) => ({
                                        ...prev,
                                        [row.limit_id]: e.target.value,
                                      }))
                                    }
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0"
                                    disabled={savingId === row.limit_id}
                                    title="Enregistrer"
                                    onClick={() =>
                                      void handleSaveManual(
                                        row.limit_id,
                                        manualDrafts[row.limit_id] ?? "",
                                      )
                                    }
                                  >
                                    {savingId === row.limit_id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <span aria-hidden>💾</span>
                                    )}
                                  </Button>
                                </div>
                                {row.limit_source === "auto" && (
                                  <p className="text-[10px] text-muted-foreground max-w-[12rem]">
                                    La valeur automatique reste prioritaire tant qu&apos;elle est
                                    disponible.
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <SourceBadge row={row} />
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {thresholdPct(row.alert_threshold_warning)}
                            </td>
                            <td className="py-2 tabular-nums">
                              {thresholdPct(row.alert_threshold_critical)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Historique des alertes</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {alertsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{alertsError}</AlertDescription>
              </Alert>
            )}
            {alertsLoading && alerts.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucune alerte enregistrée.
              </p>
            ) : (
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Provider</th>
                    <th className="py-2 pr-3 font-medium">Modèle</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium text-right">%</th>
                    <th className="py-2 pr-3 font-medium">Niveau</th>
                    <th className="py-2 font-medium">Email envoyé</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} className="border-b border-border/40">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {new Date(a.sent_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2 pr-3">{providerLabel(a.provider)}</td>
                      <td className="py-2 pr-3">{a.model ?? "—"}</td>
                      <td className="py-2 pr-3">{a.limit_type}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {a.usage_pct.toFixed(1).replace(".", ",")} %
                      </td>
                      <td className="py-2 pr-3">{alertLevelLabel(a.alert_level)}</td>
                      <td className="py-2 text-center">
                        {a.notified_email ? "✅" : "❌"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Alert className="border-border/60 bg-muted/30">
          <AlertDescription className="text-xs text-muted-foreground space-y-2">
            <p>Vérifiez vos limites actuelles sur :</p>
            <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-4">
              <li>
                <a
                  href="https://console.groq.com/settings/limits"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  console.groq.com/settings/limits
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
              <li>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  aistudio.google.com/app/apikey
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </TooltipProvider>
  );
}
