import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { VisitorDiaryRegistrationDialog } from "@/components/visitor/VisitorDiaryRegistrationDialog";
import { TravelDiaryPreviewFlipbook } from "@/components/visitor/TravelDiaryPreviewFlipbook";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { endVisitorExpoVisit, resolveStoredVisitorExpoIdsFromSession, resolveVisitorExpoIdForDiary, resolveVisitorHasScannedArtwork } from "@/lib/visitorExpoVisit";
import { isDiaryProfileComplete, markDiaryUnlocked } from "@/lib/visitorDiaryAccess";
import { fetchExpoRowForVisitor, mapExpoRowToInfo } from "@/lib/visitorExpoFetch";
import { AGENCY_NAME_MISSING } from "@/lib/resolveAgencyName";
import { supabase } from "@/lib/supabase";
import { resolveFeedbackVisitorId } from "@/lib/registerAnonymousVisitorSession";
import { readOAuthNameParts, VISITOR_DIARY_OAUTH_FLAG } from "@/lib/visitorOAuth";

type UseVisitorExitDiaryFlowOptions = {
  expoId?: string | null;
  agencyThanksName?: string | null;
};

const DEFAULT_AGENCY_ID = (import.meta.env.VITE_DEFAULT_AGENCY_ID as string | undefined)?.trim() || "";

async function fetchAgencyNameById(agencyId: string): Promise<string | null> {
  const { data } = await supabase.from("agencies").select("name_agency").eq("id", agencyId).maybeSingle();
  const name = (data as { name_agency?: string | null } | null)?.name_agency?.trim() ?? "";
  if (name && name.toUpperCase() !== AGENCY_NAME_MISSING) return name;
  return null;
}

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
  const [diaryProfileCountryCode, setDiaryProfileCountryCode] = useState("FR");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [flowExpoId, setFlowExpoId] = useState("");
  const [exitExpoLogo, setExitExpoLogo] = useState<string | null>(null);
  const [exitExpoName, setExitExpoName] = useState("");
  const [resolvedAgencyThanksName, setResolvedAgencyThanksName] = useState<string | null>(null);

  const urlExpoId = expoId?.trim() || "";
  const effectiveExpoId = flowExpoId || urlExpoId;
  const effectiveAgencyThanksName = agencyThanksName?.trim() || resolvedAgencyThanksName?.trim() || "";
  const hasAgencyThanksName =
    effectiveAgencyThanksName.length > 0 && effectiveAgencyThanksName.toUpperCase() !== AGENCY_NAME_MISSING;

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
        .select("first_name, last_name, zip_code, city, country_code")
        .eq("id", authUserId)
        .maybeSingle();
      const row = profile as {
        first_name?: string | null;
        last_name?: string | null;
        zip_code?: string | null;
        city?: string | null;
        country_code?: string | null;
      } | null;
      setProfileFirstName(row?.first_name?.trim() || "");
      setProfileLastName(row?.last_name?.trim() || "");
      setDiaryProfileZip(row?.zip_code?.trim() || "");
      setDiaryProfileCity(row?.city?.trim() || "");
      setDiaryProfileCountryCode(row?.country_code?.trim() || "FR");
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

  const loadExitPopupContext = useCallback(
    async (resolved: string) => {
      const expoIdForFetch =
        resolved || urlExpoId || resolveStoredVisitorExpoIdsFromSession().at(-1) || "";

      let logo: string | null = null;
      let expoName = "";
      let agency: string | null = null;

      if (expoIdForFetch) {
        const row = await fetchExpoRowForVisitor(expoIdForFetch);
        if (row) {
          const info = mapExpoRowToInfo(row);
          logo = info.logo_expo;
          expoName = info.expo_name;
          const agencyId = typeof row.agency_id === "string" ? row.agency_id.trim() : "";
          if (agencyId) agency = await fetchAgencyNameById(agencyId);
        }
      }

      if (!agency && DEFAULT_AGENCY_ID) {
        agency = await fetchAgencyNameById(DEFAULT_AGENCY_ID);
      }

      setExitExpoLogo(logo);
      setExitExpoName(expoName);
      if (!agencyThanksName?.trim()) setResolvedAgencyThanksName(agency);

      const authUserId = session?.user?.id?.trim() || null;
      if (authUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", authUserId)
          .maybeSingle();
        const row = profile as { first_name?: string | null; last_name?: string | null } | null;
        setProfileFirstName(row?.first_name?.trim() || "");
        setProfileLastName(row?.last_name?.trim() || "");
      } else {
        setProfileFirstName("");
        setProfileLastName("");
      }
    },
    [agencyThanksName, session?.user?.id, urlExpoId],
  );

  const requestExitVisit = useCallback(() => {
    void (async () => {
      const visitorId = resolveFeedbackVisitorId(session?.user?.id?.trim() || null);
      const resolved = await resolveVisitorExpoIdForDiary({ hint: urlExpoId, visitorId });
      setFlowExpoId(resolved);

      const hasScannedArtwork = resolved
        ? await resolveVisitorHasScannedArtwork({ expoId: resolved, visitorId })
        : false;

      if (resolved) void endVisitorExpoVisit({ expoId: resolved });

      if (!hasScannedArtwork) {
        navigate("/");
        return;
      }

      await loadExitPopupContext(resolved);
      setIsExitPopupOpen(true);
    })();
  }, [loadExitPopupContext, navigate, session?.user?.id, urlExpoId]);

  useEffect(() => {
    const diaryOAuthPending =
      typeof window !== "undefined" &&
      (sessionStorage.getItem(VISITOR_DIARY_OAUTH_FLAG) === "1" ||
        new URLSearchParams(window.location.search).get("diary_oauth") === "1");
    const authUser = session?.user;
    const authUserId = authUser?.id?.trim();
    if (!diaryOAuthPending || !authUserId) return;

    sessionStorage.removeItem(VISITOR_DIARY_OAUTH_FLAG);
    const url = new URL(window.location.href);
    if (url.searchParams.has("diary_oauth")) {
      url.searchParams.delete("diary_oauth");
      window.history.replaceState({}, "", url.toString());
    }

    void (async () => {
      const visitorId = resolveFeedbackVisitorId(authUserId);
      const resolved = await resolveVisitorExpoIdForDiary({ hint: urlExpoId, visitorId });
      setFlowExpoId(resolved);

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, zip_code, city, country_code")
        .eq("id", authUserId)
        .maybeSingle();
      const row = profile as {
        first_name?: string | null;
        last_name?: string | null;
        zip_code?: string | null;
        city?: string | null;
        country_code?: string | null;
      } | null;
      const oauthNames = readOAuthNameParts(authUser);
      setProfileFirstName(row?.first_name?.trim() || oauthNames.prenom);
      setProfileLastName(row?.last_name?.trim() || oauthNames.nom);
      setDiaryProfileZip(row?.zip_code?.trim() || "");
      setDiaryProfileCity(row?.city?.trim() || "");
      setDiaryProfileCountryCode(row?.country_code?.trim() || "FR");

      const email = authUser.email?.trim() || "";
      if (isDiaryProfileComplete(row, email)) {
        markDiaryUnlocked(resolved);
        navigateToTravelDiary();
        return;
      }
      setIsExitPopupOpen(false);
      setIsDiaryRegistrationOpen(true);
    })();
  }, [navigateToTravelDiary, session?.user, urlExpoId]);

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
            {exitExpoLogo ? (
              <div className="mx-auto mb-3 flex max-w-[200px] justify-center">
                <img
                  src={exitExpoLogo}
                  alt={exitExpoName || t("diary.no_expo_logo")}
                  className="max-h-16 max-w-full object-contain"
                />
              </div>
            ) : null}
            <div className="mx-auto w-[200px] text-left text-sm font-semibold leading-[23px] text-black">
              <p>
                <Trans
                  i18nKey={hasAgencyThanksName ? "exit_thanks_with_agency" : "exit_thanks_solo"}
                  ns="visitor"
                  values={{ agency: effectiveAgencyThanksName }}
                  components={{ brand: <span className="font-bold text-[#E63946]" /> }}
                />
              </p>
              <p className="mt-2">{t("exit_presented_expo")}</p>
              <p className="mt-2">{t("exit_see_you_soon")}</p>
              <p className="mt-2">{t("exit_goodbye")}</p>
            </div>
            <div className="relative mt-4">
              <span className="visitor-exit-gift-burst" aria-hidden>
                <span className="visitor-exit-gift-burst-label">{t("diary.exit_gift_badge")}</span>
              </span>
              <div className="flex items-start gap-3 text-left">
                <TravelDiaryPreviewFlipbook
                  variant="miniature"
                  showHint={false}
                  expoId={effectiveExpoId}
                  visitorFirstName={profileFirstName}
                  visitorLastName={profileLastName}
                  className="shrink-0"
                />
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-neutral-700">
                  <Trans
                    i18nKey="diary.exit_offer_gift"
                    ns="visitor"
                    components={{
                    emphasis: <span className="font-bold uppercase" />,
                    underline: <span className="underline" />,
                  }}
                  />
                </p>
              </div>
            </div>
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
        initialCountryCode={diaryProfileCountryCode}
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
