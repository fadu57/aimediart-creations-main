import { Loader2 } from "lucide-react";

import { AgencyScopeLogo } from "@/components/AgencyScopeLogo";
import { useAgencyScopeBranding } from "@/hooks/useAgencyScopeBranding";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";

/**
 * Logo « périmètre agence » pour la bande sticky locale sous le Header (pas dans le Header global).
 */
function BackofficeStickyAgencyLogo({ align = "center" }: { align?: "center" | "start" }) {
  const { loading: authLoading } = useAuthUser();
  const { branding, loading, agencyScopeKey } = useAgencyScopeBranding();
  if (authLoading || !agencyScopeKey?.trim()) return null;
  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[52px] items-center",
          align === "start" ? "w-auto max-w-[180px] justify-start" : "w-full max-w-[180px] justify-center md:mx-auto",
        )}
      >
        <Loader2 className="h-7 w-7 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex min-h-[60px] max-w-[180px] items-center",
        align === "start" ? "w-auto justify-start" : "w-full justify-center md:mx-auto md:w-auto",
      )}
    >
      <AgencyScopeLogo logoUrl={branding?.logoUrl} agencyName={branding?.name} />
    </div>
  );
}

/** Colonne centrale flexible (entre actions gauche et droite) pour aligner le logo agence. */
export function BackofficeStickyAgencyLogoSlot({
  className,
  align = "center",
}: {
  className?: string;
  align?: "center" | "start";
}) {
  const { loading: authLoading } = useAuthUser();
  const { agencyScopeKey } = useAgencyScopeBranding();

  // Pas de périmètre agence/expo (ex. admin global) → pas de bloc réservé.
  if (!authLoading && !agencyScopeKey?.trim()) return null;

  return (
    <div
      className={cn(
        "flex md:min-w-0",
        align === "start"
          ? "min-h-0 w-auto max-w-[180px] shrink-0 flex-none items-center justify-start px-0"
          : "min-h-0 shrink-0 flex-col items-center justify-center px-2 sm:min-h-[60px] md:flex-1",
        className,
      )}
    >
      <BackofficeStickyAgencyLogo align={align} />
    </div>
  );
}
