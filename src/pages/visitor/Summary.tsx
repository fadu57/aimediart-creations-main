import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { TravelDiaryNotebook } from "@/components/visitor/TravelDiaryNotebook";
import { VisitorPageShell } from "@/components/visitor/VisitorPageShell";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { resolveFeedbackVisitorId } from "@/lib/registerAnonymousVisitorSession";
import { isDiaryUnlocked } from "@/lib/visitorDiaryAccess";
import { resolveTravelDiaryShareToken, type TravelDiaryShareAccess } from "@/lib/travelDiaryShare";
import { fetchVisitorTravelDiaryPackage } from "@/lib/visitorTravelDiary";
import type { TravelDiaryPackage } from "@/lib/visitorTravelDiary";
import { supabase } from "@/lib/supabase";

export default function Summary() {
  const { t, i18n } = useTranslation("visitor");
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || null;
  const visitorIdParam = searchParams.get("visitor_id")?.trim() || null;
  const shareToken = searchParams.get("share")?.trim() || null;
  const isAdminPreview = searchParams.get("admin") === "1";
  const { session, first_name, role_id, loading: authLoading } = useAuthUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diary, setDiary] = useState<TravelDiaryPackage | null>(null);
  const [diaryOwnerVisitorId, setDiaryOwnerVisitorId] = useState<string | null>(null);
  const [profileNames, setProfileNames] = useState<{ first: string; last: string }>({ first: "", last: "" });
  const [shareAccess, setShareAccess] = useState<TravelDiaryShareAccess | null>(null);
  const [shareResolving, setShareResolving] = useState(Boolean(shareToken));

  const isBackofficeDiaryViewer = typeof role_id === "number" && role_id >= 1 && role_id <= 6;
  const canAccessAsAdmin = isAdminPreview && isBackofficeDiaryViewer && Boolean(visitorIdParam);
  const isSharedView = Boolean(shareToken && shareAccess?.valid);

  const visitorAllowed = useMemo(() => isDiaryUnlocked(expoId), [expoId]);

  const accessDenied = !canAccessAsAdmin && !visitorAllowed && !isSharedView;

  const resolvedExpoId = isSharedView ? shareAccess?.expoId ?? null : expoId;

  const resolvedVisitorId = useMemo(() => {
    if (isSharedView && shareAccess?.visitorId) return shareAccess.visitorId;
    if (canAccessAsAdmin && visitorIdParam) return visitorIdParam;
    return resolveFeedbackVisitorId(session?.user?.id?.trim() || null);
  }, [canAccessAsAdmin, isSharedView, shareAccess?.visitorId, session?.user?.id, visitorIdParam]);

  useEffect(() => {
    if (!shareToken) {
      setShareAccess(null);
      setShareResolving(false);
      return;
    }

    let cancelled = false;
    setShareResolving(true);
    void (async () => {
      const access = await resolveTravelDiaryShareToken(shareToken);
      if (!cancelled) {
        setShareAccess(access);
        setShareResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  useEffect(() => {
    if (authLoading || shareResolving) return;
    if (accessDenied) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      if (!resolvedVisitorId) {
        setDiary(null);
        setDiaryOwnerVisitorId(null);
        setLoading(false);
        return;
      }

      let firstName = first_name?.trim() || profileNames.first;
      let lastName = profileNames.last;

      if (isSharedView) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", resolvedVisitorId)
          .maybeSingle();
        if (profile) {
          firstName = profile.first_name?.trim() || firstName;
          lastName = profile.last_name?.trim() || lastName;
        }
        if (!firstName && !lastName) {
          const { data: anon } = await supabase
            .from("visitors")
            .select("visitor_pseudo")
            .eq("visitor_client_id", resolvedVisitorId)
            .maybeSingle();
          const pseudo = anon?.visitor_pseudo?.trim();
          if (pseudo) firstName = pseudo;
        }
      } else if (canAccessAsAdmin && visitorIdParam) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", visitorIdParam)
          .maybeSingle();
        if (profile) {
          firstName = profile.first_name?.trim() || firstName;
          lastName = profile.last_name?.trim() || lastName;
        }
        if (!firstName && !lastName) {
          const { data: anon } = await supabase
            .from("visitors")
            .select("visitor_pseudo")
            .eq("visitor_client_id", visitorIdParam)
            .maybeSingle();
          const pseudo = anon?.visitor_pseudo?.trim();
          if (pseudo) firstName = pseudo;
        }
      } else if (session?.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile) {
          firstName = profile.first_name?.trim() || firstName;
          lastName = profile.last_name?.trim() || lastName;
          setProfileNames({
            first: firstName,
            last: lastName,
          });
        }
      }

      const { diary: loaded, error: loadError, ownerVisitorId } = await fetchVisitorTravelDiaryPackage(resolvedVisitorId, {
        expoId: resolvedExpoId,
        lang: i18n.language,
        visitorFirstName: firstName,
        visitorLastName: lastName,
        shareToken: isSharedView ? shareToken : null,
      });

      if (cancelled) return;
      if (loadError) {
        setError(loadError);
        setDiary(null);
        setDiaryOwnerVisitorId(null);
      } else {
        setDiary(loaded);
        setDiaryOwnerVisitorId(ownerVisitorId);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    accessDenied,
    resolvedVisitorId,
    resolvedExpoId,
    i18n.language,
    first_name,
    canAccessAsAdmin,
    visitorIdParam,
    session?.user?.id,
    profileNames.first,
    profileNames.last,
    isSharedView,
    shareToken,
    shareResolving,
  ]);

  if (!authLoading && !shareResolving && shareToken && shareAccess && !shareAccess.valid) {
    return (
      <VisitorPageShell contentClassName="px-4">
        <div className="rounded-2xl border border-white/10 bg-[#1e1e1e] p-6 text-center">
          <p className="font-serif text-lg text-[#F0F0F0]">{t("diary.share_expired_title")}</p>
          <p className="mt-2 text-sm text-[#F0F0F0]/70">{t("diary.share_expired_desc")}</p>
        </div>
      </VisitorPageShell>
    );
  }

  if (!authLoading && !shareResolving && accessDenied) {
    return <Navigate to="/visitor" replace />;
  }

  return (
    <VisitorPageShell contentClassName="px-4">
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-[#F0F0F0]/80">
          <Loader2 className="h-8 w-8 animate-spin text-[#E63946]" aria-hidden />
          <p className="text-sm">{t("diary.loading")}</p>
        </div>
      ) : error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-center text-sm text-red-200">
          {t("diary.error_load")}
        </p>
      ) : !diary || diary.artworkPages.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#1e1e1e] p-6 text-center">
          <p className="font-serif text-lg text-[#F0F0F0]">{t("diary.empty_title")}</p>
          <p className="mt-2 text-sm text-[#F0F0F0]/70">{t("diary.empty_desc")}</p>
        </div>
      ) : (
        <TravelDiaryNotebook
          diary={diary}
          visitorId={diaryOwnerVisitorId ?? resolvedVisitorId}
          expoId={resolvedExpoId}
          shareToken={isSharedView ? shareToken : null}
          secondaryAction={
            canAccessAsAdmin ? (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 min-w-0 flex-1 flex-col gap-0.5 px-1 py-1.5 text-[10px] whitespace-normal sm:text-xs"
                asChild
              >
                <Link
                  to="/expos"
                  className="w-full text-center leading-[1.2] whitespace-pre-line line-clamp-2"
                >
                  {t("diary.back_to_expos")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {!canAccessAsAdmin && !isSharedView ? (
        <div className="mt-8 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full border-white/25 bg-transparent text-[#F0F0F0] hover:bg-white/10"
            asChild
          >
            <Link to={expoId ? `/scan-work2?expo_id=${encodeURIComponent(expoId)}` : "/scan-work2"}>
              {t("btn_scan_another")}
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full text-[#F0F0F0]/70" asChild>
            <Link to="/visitor">{t("btn_back_home")}</Link>
          </Button>
        </div>
      ) : null}
    </VisitorPageShell>
  );
}
