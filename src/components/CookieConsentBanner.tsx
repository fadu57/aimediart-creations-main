import { useCallback, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { applyCookieBannerChoice, getCookieBannerChoice, type CookieBannerChoice } from "@/lib/cookieConsent";
import { getLegalCgvHref, getLegalRgpdHref, isExternalLegalUrl } from "@/lib/legalUrls";

function subscribeToConsent(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  window.addEventListener("aimediart:cookie-consent", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("aimediart:cookie-consent", cb);
  };
}

function dispatchConsentChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("aimediart:cookie-consent"));
}

function getServerSnapshot(): CookieBannerChoice | null {
  return null;
}

/**
 * Bannière cookies / traceurs : accepter, refuser, liens CGV et RGPD (pas de case à cocher sur la page visiteur).
 */
const CookieConsentBanner = () => {
  const { t } = useTranslation("landing");

  const choice = useSyncExternalStore(
    subscribeToConsent,
    () => getCookieBannerChoice(),
    getServerSnapshot,
  );

  const handleChoose = useCallback((c: CookieBannerChoice) => {
    applyCookieBannerChoice(c);
    dispatchConsentChanged();
  }, []);

  if (choice !== null) return null;

  const cgv = getLegalCgvHref();
  const rgpd = getLegalRgpdHref();

  const CgvLink = isExternalLegalUrl(cgv) ? (
    <a href={cgv} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
      {t("cookie_banner.link_cgv")}
    </a>
  ) : (
    <Link to={cgv} className="font-medium text-primary underline underline-offset-2">
      {t("cookie_banner.link_cgv")}
    </Link>
  );

  const RgpdLink = isExternalLegalUrl(rgpd) ? (
    <a href={rgpd} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
      {t("cookie_banner.link_rgpd")}
    </a>
  ) : (
    <Link to={rgpd} className="font-medium text-primary underline underline-offset-2">
      {t("cookie_banner.link_rgpd")}
    </Link>
  );

  return (
    <div
      role="dialog"
      aria-label={t("cookie_banner.aria_label")}
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border/80 bg-[#1a1a1a]/98 px-4 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5 text-sm text-foreground">
          <p className="leading-snug">{t("cookie_banner.message")}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {CgvLink}
            <span className="px-1.5 text-muted-foreground">·</span>
            {RgpdLink}
          </p>
          <p className="text-[11px] text-muted-foreground">{t("cookie_banner.privacy_note")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-border sm:w-auto"
            onClick={() => handleChoose("refused")}
          >
            {t("cookie_banner.refuse")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground sm:w-auto"
            onClick={() => handleChoose("accepted")}
          >
            {t("cookie_banner.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
