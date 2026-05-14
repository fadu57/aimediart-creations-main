import { Loader2 } from "lucide-react";

import { AgencyScopeLogo } from "@/components/AgencyScopeLogo";
import { useAgencyScopeBranding } from "@/hooks/useAgencyScopeBranding";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";

/**
 * Logo « périmètre agence » pour la bande sticky locale sous le Header (pas dans le Header global).
 */
function BackofficeStickyAgencyLogo() {
  const { loading: authLoading } = useAuthUser();
  const { branding, loading, agencyScopeKey } = useAgencyScopeBranding();
  if (authLoading || !agencyScopeKey?.trim()) return null;
  if (loading) {
    return (
      <div className="flex min-h-[52px] w-full max-w-[180px] items-center justify-center md:mx-auto">
        <Loader2 className="h-7 w-7 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  return (
    <div className="flex min-h-[60px] w-full max-w-[180px] items-center justify-center md:mx-auto md:w-auto">
      <AgencyScopeLogo logoUrl={branding?.logoUrl} agencyName={branding?.name} />
    </div>
  );
}

/** Colonne centrale flexible (entre actions gauche et droite) pour aligner le logo agence. */
export function BackofficeStickyAgencyLogoSlot({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[60px] flex-1 flex-col items-center justify-center px-2 md:min-w-0", className)}>
      <BackofficeStickyAgencyLogo />
    </div>
  );
}
