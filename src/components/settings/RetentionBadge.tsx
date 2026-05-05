import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RetentionBadgeProps {
  deleted_at: string | null | undefined;
  retention_days: number | null | undefined;
  auto_purge: boolean | null | undefined;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function addDays(iso: string, days: number): string {
  try {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function daysSince(iso: string): number {
  try {
    const deleted = new Date(iso).getTime();
    const now = Date.now();
    return Math.floor((now - deleted) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Affiche un badge coloré indiquant le délai restant avant purge définitive.
 * - Vert  : > 14 jours restants
 * - Orange : 1-14 jours restants
 * - Rouge  : purge imminente (0 ou dépassé)
 * - Gris   : purge auto désactivée
 * - Rien   : données manquantes
 */
export default function RetentionBadge({ deleted_at, retention_days, auto_purge }: RetentionBadgeProps) {
  if (!deleted_at || retention_days == null) return null;

  const elapsed = daysSince(deleted_at);
  const remaining = retention_days - elapsed;

  const deletedFormatted = formatDate(deleted_at);
  const purgeFormatted = addDays(deleted_at, retention_days);

  const tooltip = `Archivé le ${deletedFormatted}\nPurge définitive le ${purgeFormatted}`;

  let badgeClass: string;
  let label: string;

  if (!auto_purge) {
    badgeClass = "bg-muted text-muted-foreground border-border";
    label = "Purge auto désactivée";
  } else if (remaining > 14) {
    badgeClass = "bg-green-100 text-green-800 border-green-300";
    label = `${remaining}j restants`;
  } else if (remaining >= 1) {
    badgeClass = "bg-orange-100 text-orange-800 border-orange-300";
    label = `${remaining}j restants`;
  } else {
    badgeClass = "bg-red-100 text-red-800 border-red-300";
    label = "Purge imminente";
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium cursor-default whitespace-nowrap ${badgeClass}`}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="whitespace-pre-line text-xs max-w-[220px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
