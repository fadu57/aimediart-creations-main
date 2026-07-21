import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Logo agence (`logo_agency`) tel qu’affiché dans le Header et auparavant sur le catalogue. */
export function AgencyScopeLogo({
  logoUrl,
  agencyName,
}: {
  logoUrl: string | null | undefined;
  agencyName?: string | null;
}) {
  const { t } = useTranslation("agencies");
  const [failed, setFailed] = useState(false);
  const src = logoUrl?.trim() || "";
  const label = agencyName?.trim() || "";
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <div
      className="flex h-[60px] max-h-[60px] max-w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/30 px-1"
      title={label || undefined}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={label ? t("logo_alt_named", { name: label }) : t("logo_alt_fallback")}
          className="max-h-[52px] max-w-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Building2 className="h-9 w-9 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
