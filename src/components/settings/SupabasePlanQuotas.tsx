import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatBytes,
  type DbMonitoringSnapshot,
} from "@/lib/supabaseDbMonitoring";
import {
  SUPABASE_PLAN_LIMITS,
  usageRatio,
  usageStatus,
  type SupabasePlanId,
} from "@/lib/supabasePlanLimits";
import { cn } from "@/lib/utils";

type Props = {
  planId: SupabasePlanId;
  snapshot: DbMonitoringSnapshot | undefined;
};

type QuotaRow = {
  labelKey: string;
  used: number | null;
  limit: number;
  format: "bytes" | "count";
};

function progressClass(status: ReturnType<typeof usageStatus>): string {
  switch (status) {
    case "critical":
      return "[&>div]:bg-destructive";
    case "warn":
      return "[&>div]:bg-amber-500";
    default:
      return "[&>div]:bg-primary";
  }
}

function formatQuotaValue(format: "bytes" | "count", n: number): string {
  return format === "bytes" ? formatBytes(n) : n.toLocaleString("fr-FR");
}

export function SupabasePlanQuotas({ planId, snapshot }: Props) {
  const { t } = useTranslation("settings");
  const plan = SUPABASE_PLAN_LIMITS[planId];

  const rows: QuotaRow[] = [
    {
      labelKey: "supabase_monitoring.quota_database",
      used: snapshot?.database_size_bytes ?? null,
      limit: plan.database_bytes,
      format: "bytes",
    },
    {
      labelKey: "supabase_monitoring.quota_connections",
      used: snapshot?.active_connections ?? null,
      limit: plan.max_db_connections,
      format: "count",
    },
    {
      labelKey: "supabase_monitoring.quota_pooler",
      used: null,
      limit: plan.pooler_connections,
      format: "count",
    },
    {
      labelKey: "supabase_monitoring.quota_storage",
      used: null,
      limit: plan.storage_bytes,
      format: "bytes",
    },
    {
      labelKey: "supabase_monitoring.quota_egress",
      used: null,
      limit: plan.egress_bytes_month,
      format: "bytes",
    },
    {
      labelKey: "supabase_monitoring.quota_mau",
      used: null,
      limit: plan.mau,
      format: "count",
    },
  ];

  if (plan.ram_bytes) {
    rows.splice(2, 0, {
      labelKey: "supabase_monitoring.quota_ram",
      used: null,
      limit: plan.ram_bytes,
      format: "bytes",
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t("supabase_monitoring.quota_section_title", { plan: t(plan.labelKey) })}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("supabase_monitoring.quota_section_sub")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => {
          const ratio = row.used != null ? usageRatio(row.used, row.limit) : null;
          const status = ratio != null ? usageStatus(ratio) : "ok";
          const pct = ratio != null ? Math.round(ratio * 100) : null;

          return (
            <div key={row.labelKey} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{t(row.labelKey)}</span>
                <span className="text-muted-foreground">
                  {row.used != null
                    ? t("supabase_monitoring.quota_used_of", {
                      used: formatQuotaValue(row.format, row.used),
                      limit: formatQuotaValue(row.format, row.limit),
                    })
                    : t("supabase_monitoring.quota_limit_only", {
                      limit: formatQuotaValue(row.format, row.limit),
                    })}
                </span>
              </div>
              {ratio != null && (
                <>
                  <Progress
                    value={pct ?? 0}
                    className={cn("h-2", progressClass(status))}
                    aria-label={t(row.labelKey)}
                  />
                  <p className={cn(
                    "text-xs",
                    status === "critical" && "text-destructive font-medium",
                    status === "warn" && "text-amber-600 dark:text-amber-500",
                    status === "ok" && "text-muted-foreground",
                  )}
                  >
                    {pct} % {t("supabase_monitoring.quota_of_plan")}
                    {status === "critical" && ` — ${t("supabase_monitoring.quota_critical")}`}
                    {status === "warn" && ` — ${t("supabase_monitoring.quota_warn")}`}
                  </p>
                </>
              )}
              {row.used == null && (
                <p className="text-xs text-muted-foreground">{t("supabase_monitoring.quota_not_tracked")}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
