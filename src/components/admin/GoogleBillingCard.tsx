import { Cloud, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useGoogleBillingCache } from "@/hooks/useGoogleBillingCache";
import { cn } from "@/lib/utils";

const MONEY_FMT = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${MONEY_FMT.format(amount)} ${currency}`;
  }
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return "Période courante";
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

function progressTone(pct: number | null): string {
  if (pct == null) return "[&>div]:bg-muted";
  if (pct >= 95) return "[&>div]:bg-destructive";
  if (pct >= 80) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

export function GoogleBillingCard() {
  const { budgets, isLoading, isSyncing, lastFetchedAt, error, refetch } = useGoogleBillingCache();

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cloud className="h-4 w-4 text-primary" aria-hidden />
              Coûts Google Cloud
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Budgets et dépenses du compte de facturation GCP (Cloud Billing Budget API).
              Les montants consolidés peuvent avoir ~24 h de délai.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            disabled={isSyncing}
            onClick={() => void refetch()}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Synchroniser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastFetchedAt && (
          <p className="text-[11px] text-muted-foreground">
            Dernière synchronisation :{" "}
            {new Date(lastFetchedAt).toLocaleString("fr-FR")}
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && budgets.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : budgets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucun budget en cache. Cliquez sur « Synchroniser » pour récupérer les budgets
            configurés dans Google Cloud.
          </p>
        ) : (
          <div className="space-y-4">
            {budgets.map((b) => {
              const pct = b.usage_pct != null ? Math.min(100, Math.max(0, b.usage_pct)) : 0;
              return (
                <div key={b.id} className="space-y-2 rounded-lg border border-border/50 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{b.budget_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatPeriod(b.period_start, b.period_end)}
                      </p>
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
                      {formatMoney(b.cost_amount, b.budget_currency)}
                      {" / "}
                      {formatMoney(b.budget_amount, b.budget_currency)}
                      {b.usage_pct != null && (
                        <span className="ml-1">
                          ({b.usage_pct.toFixed(1).replace(".", ",")} %)
                        </span>
                      )}
                    </p>
                  </div>
                  <Progress
                    value={b.usage_pct != null ? pct : 0}
                    className={cn("h-2", progressTone(b.usage_pct))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
