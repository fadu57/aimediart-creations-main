import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { VisitorDiaryRegistrationDialog } from "@/components/visitor/VisitorDiaryRegistrationDialog";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { endVisitorExpoVisit, resolveVisitorExpoIdForDiary } from "@/lib/visitorExpoVisit";
import { isDiaryProfileComplete, markDiaryUnlocked } from "@/lib/visitorDiaryAccess";
import { supabase } from "@/lib/supabase";
import { resolveFeedbackVisitorId } from "@/lib/registerAnonymousVisitorSession";

type UseVisitorExitDiaryFlowOptions = {
  expoId?: string | null;
  agencyThanksName?: string | null;
};

export function useVisitorExitDiaryFlow({
  expoId,
  agencyThanksName,
}: UseVisitorExitDiaryFlowOptions) {
  const { t } = useTranslation("visitor");
  const navigate = useNavigate();
  const { session } = useAuthUser();

  const [isExitPopupOpen, setIsExitPopupOpen] = useState(false);
  const [isDiaryRegistrationOpen, setIsDiaryRegistrationOpen] = useState(false);
  const [diaryProfileZip, setDiaryProfileZip] = useState("");
  const [diaryProfileCity, setDiaryProfileCity] = useState("");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [flowExpoId, setFlowExpoId] = useState("");

  const urlExpoId = expoId?.trim() || "";
  const effectiveExpoId = flowExpoId || urlExpoId;
  const hasAgencyThanksName = Boolean(agencyThanksName?.trim());

  const navigateToTravelDiary = useCallback(() => {
    setIsExitPopupOpen(false);
    setIsDiaryRegistrationOpen(false);
    const query = effectiveExpoId ? `?expo_id=${encodeURIComponent(effectiveExpoId)}` : "";
    navigate(`/summary${query}`);
  }, [navigate, effectiveExpoId]);

  const handleDiaryOfferYes = useCallback(async () => {
    const authUserId = session?.user?.id?.trim() || null;
    const email = session?.user?.email?.trim() || "";

    if (authUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, zip_code, city")
        .eq("id", authUserId)
        .maybeSingle();
      const row = profile as {
        first_name?: string | null;
        last_name?: string | null;
        zip_code?: string | null;
        city?: string | null;
      } | null;
      setProfileFirstName(row?.first_name?.trim() || "");
      setProfileLastName(row?.last_name?.trim() || "");
      setDiaryProfileZip(row?.zip_code?.trim() || "");
      setDiaryProfileCity(row?.city?.trim() || "");
      if (isDiaryProfileComplete(row, email)) {
        markDiaryUnlocked(effectiveExpoId);
        navigateToTravelDiary();
        return;
      }
      setIsExitPopupOpen(false);
      setIsDiaryRegistrationOpen(true);
      return;
    }

    setIsExitPopupOpen(false);
    setIsDiaryRegistrationOpen(true);
  }, [navigateToTravelDiary, effectiveExpoId, session?.user?.email, session?.user?.id]);

  const handleDiaryRegistrationSuccess = useCallback(() => {
    markDiaryUnlocked(effectiveExpoId);
    navigateToTravelDiary();
  }, [navigateToTravelDiary, effectiveExpoId]);

  const requestExitVisit = useCallback(() => {
    void (async () => {
      const visitorId = resolveFeedbackVisitorId(session?.user?.id?.trim() || null);
      const resolved = await resolveVisitorExpoIdForDiary({ hint: urlExpoId, visitorId });
      setFlowExpoId(resolved);
      if (resolved) void endVisitorExpoVisit({ expoId: resolved });
      setIsExitPopupOpen(true);
    })();
  }, [session?.user?.id, urlExpoId]);

  const exitDiaryDialogs: ReactNode = (
    <>
      {isExitPopupOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setIsExitPopupOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-[320px] rounded-lg bg-white p-4 text-center"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("aria_exit_dialog")}
          >
            <p className="text-sm font-semibold leading-relaxed text-black">
              {hasAgencyThanksName
                ? t("exit_thanks_with_agency", { agency: agencyThanksName })
                : t("exit_thanks_solo")}
              <br />
              {t("exit_message")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700">{t("diary.exit_offer")}</p>
            <Button
              type="button"
              className="mt-4 w-full gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => void handleDiaryOfferYes()}
            >
              <BookOpen className="h-4 w-4" aria-hidden />
              {t("diary.exit_offer_yes")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full border-gray-300 text-gray-900"
              onClick={() => {
                setIsExitPopupOpen(false);
                window.location.assign("https://www.aimediart.com");
              }}
            >
              {t("diary.exit_offer_no")}
            </Button>
          </div>
        </div>
      ) : null}

      <VisitorDiaryRegistrationDialog
        open={isDiaryRegistrationOpen}
        expoId={effectiveExpoId}
        initialEmail={session?.user?.email?.trim() || ""}
        initialFirstName={profileFirstName}
        initialLastName={profileLastName}
        initialZipCode={diaryProfileZip}
        initialCity={diaryProfileCity}
        isAuthenticated={Boolean(session?.user?.id)}
        onClose={() => setIsDiaryRegistrationOpen(false)}
        onSuccess={handleDiaryRegistrationSuccess}
      />
    </>
  );

  return {
    requestExitVisit,
    exitDiaryDialogs,
  };
}
