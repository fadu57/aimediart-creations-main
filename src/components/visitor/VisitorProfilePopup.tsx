import { X, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type VisitorProfilePopupData = {
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  selfieUrl?: string | null;
  isAuthenticated: boolean;
};

type Props = {
  open: boolean;
  profile: VisitorProfilePopupData | null;
  onClose: () => void;
  onLogout?: () => void;
  onSignup?: () => void;
  onOpenDiary?: () => void;
};

export function VisitorProfilePopup({
  open,
  profile,
  onClose,
  onLogout,
  onSignup,
  onOpenDiary,
}: Props) {
  const { t } = useTranslation("visitor");

  const avatarUrl = profile?.avatarUrl?.trim() || null;
  const selfieUrl = profile?.selfieUrl?.trim() || null;
  const email = profile?.email?.trim() || null;

  return (
    <Dialog open={open && Boolean(profile)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        hideCloseButton
        overlayClassName="z-[125] bg-black/60"
        className={cn(
          "z-[125] w-full max-w-[320px] gap-0 rounded-lg border border-white/15 bg-[#1E1E1E] p-4 pt-10 text-left shadow-xl sm:rounded-lg",
        )}
      >
        {profile ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-[#F0F0F0]/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t("btn_close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>

            <DialogTitle className="pr-6 text-base font-semibold text-[#F0F0F0]">
              {t("profile_popup.title")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-[#F0F0F0]/70">
              {profile.isAuthenticated
                ? t("profile_popup.type_authenticated")
                : t("profile_popup.type_anonymous")}
            </DialogDescription>

            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="flex flex-row items-center justify-center gap-3">
                {avatarUrl ? (
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#E63946]/75 bg-[#121212] shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                    <img
                      src={avatarUrl}
                      alt={t("header_avatar_alt", { name: profile.displayName })}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                {selfieUrl ? (
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-[#121212] shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                    <img
                      src={selfieUrl}
                      alt={t("profile_popup.selfie_alt", { name: profile.displayName })}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
              </div>

              <div className="w-full space-y-2 rounded-lg border border-white/10 bg-[#121212]/60 px-3 py-2.5 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#F0F0F0]/55">
                    {profile.isAuthenticated
                      ? t("profile_popup.label_name")
                      : t("profile_popup.label_pseudo")}
                  </p>
                  <p className="font-semibold text-[#F0F0F0]">{profile.displayName}</p>
                </div>
                {email ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#F0F0F0]/55">
                      {t("profile_popup.label_email")}
                    </p>
                    <p className="break-all text-[#F0F0F0]/90">{email}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {onOpenDiary ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-[#E63946]/50 bg-transparent text-[#F0F0F0] hover:bg-[#E63946]/15"
                  onClick={() => {
                    onClose();
                    onOpenDiary();
                  }}
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  {t("diary.btn_open_diary")}
                </Button>
              ) : null}
              {!profile.isAuthenticated && onSignup ? (
                <Button
                  type="button"
                  className="w-full rounded-full bg-[#E63946] text-white hover:bg-red-700"
                  onClick={onSignup}
                >
                  {t("profile_popup.btn_register")}
                </Button>
              ) : null}
              {profile.isAuthenticated && onLogout ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/35 bg-transparent text-[#F0F0F0] hover:border-[#E63946] hover:bg-[#2A2A2A] hover:text-white"
                  onClick={onLogout}
                >
                  {t("profile_popup.btn_logout")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="w-full text-[#F0F0F0]/80 hover:bg-white/10 hover:text-white"
                onClick={onClose}
              >
                {t("btn_close")}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
