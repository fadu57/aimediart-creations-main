import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyCookieBannerChoice, getCookieBannerChoice, type CookieBannerChoice } from "@/lib/cookieConsent";
import { getLegalCgvHref, getLegalRgpdHref, isExternalLegalUrl } from "@/lib/legalUrls";
import { cn } from "@/lib/utils";

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
 * Bannière cookies / traceurs : accepter, refuser, liens CGV et RGPD.
 * Dialog Radix en barre basse (focus trap) — look inchangé.
 */
const CookieConsentBanner = () => {
  const { t } = useTranslation("landing");
  const [searchParams] = useSearchParams();

  /** En dev uniquement : `?preview_cookie_banner=1` */
  const previewInDev = useMemo(
    () => import.meta.env.DEV && searchParams.get("preview_cookie_banner") === "1",
    [searchParams],
  );

  const choice = useSyncExternalStore(
    subscribeToConsent,
    () => getCookieBannerChoice(),
    getServerSnapshot,
  );

  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false);
  const [bannerHiddenAfterChoice, setBannerHiddenAfterChoice] = useState(false);

  const handleChoose = useCallback((choice: CookieBannerChoice, opts?: { closeRefusePopup?: boolean }) => {
    applyCookieBannerChoice(choice);
    dispatchConsentChanged();
    setBannerHiddenAfterChoice(true);
    if (opts?.closeRefusePopup) {
      setRefuseConfirmOpen(false);
    }
  }, []);

  const bannerOpen = !bannerHiddenAfterChoice && (previewInDev || choice === null);

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
    <>
      <AlertDialog open={refuseConfirmOpen} onOpenChange={setRefuseConfirmOpen}>
        <AlertDialogContent className="max-w-[min(26rem,calc(100vw-2rem))]">
          <AlertDialogHeader className="border-0 pb-0 text-left">
            <AlertDialogTitle className="flex items-start gap-2 text-base font-semibold leading-snug sm:text-lg">
              <span className="shrink-0 text-[1.25em] leading-none" aria-hidden>
                😢
              </span>
              <span>{t("cookie_banner.refuse_dialog.title")}</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line text-left text-sm leading-relaxed">
              {t("cookie_banner.refuse_dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => handleChoose("accepted", { closeRefusePopup: true })}
            >
              {t("cookie_banner.refuse_dialog.accept_instead")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-border"
              onClick={() => handleChoose("refused", { closeRefusePopup: true })}
            >
              {t("cookie_banner.refuse_dialog.confirm_refuse")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bannerOpen} onOpenChange={() => { /* choix obligatoire */ }}>
        <DialogContent
          hideCloseButton
          overlayClassName="z-[100] bg-transparent pointer-events-none"
          className={cn(
            "fixed inset-x-0 bottom-0 top-auto z-[100] flex max-h-none w-full max-w-none translate-x-0 translate-y-0",
            "gap-0 rounded-none border-0 border-t border-border/80 bg-[#1a1a1a]/98 p-0 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md",
            "data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2",
            "left-0 right-0",
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5 text-sm text-foreground">
              <DialogTitle className="sr-only">{t("cookie_banner.aria_label")}</DialogTitle>
              <DialogDescription className="leading-snug text-foreground">
                {t("cookie_banner.message")}
              </DialogDescription>
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
                onClick={() => setRefuseConfirmOpen(true)}
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
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsentBanner;
