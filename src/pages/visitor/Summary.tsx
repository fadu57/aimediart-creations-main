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
import { fetchVisitorTravelDiaryPackage } from "@/lib/visitorTravelDiary";
import type { TravelDiaryPackage } from "@/lib/visitorTravelDiary";
import { supabase } from "@/lib/supabase";

export default function Summary() {
  const { t, i18n } = useTranslation("visitor");
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || null;
  const visitorIdParam = searchParams.get("visitor_id")?.trim() || null;
  const isAdminPreview = searchParams.get("admin") === "1";
  const { session, first_name, role_id, loading: authLoading } = useAuthUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diary, setDiary] = useState<TravelDiaryPackage | null>(null);
  const [profileNames, setProfileNames] = useState<{ first: string; last: string }>({ first: "", last: "" });

  const isGlobalAdmin = typeof role_id === "number" && role_id >= 1 && role_id <= 3;
  const canAccessAsAdmin = isAdminPreview && isGlobalAdmin && Boolean(visitorIdParam);

  const visitorAllowed = useMemo(() => isDiaryUnlocked(expoId), [expoId]);

  const accessDenied = !canAccessAsAdmin && !visitorAllowed;

  const resolvedVisitorId = useMemo(() => {
    if (canAccessAsAdmin && visitorIdParam) return visitorIdParam;
    return resolveFeedbackVisitorId(session?.user?.id?.trim() || null);
  }, [canAccessAsAdmin, visitorIdParam, session?.user?.id]);

  useEffect(() => {
    if (authLoading) return;
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
        setLoading(false);
        return;
      }

      let firstName = first_name?.trim() || profileNames.first;
      let lastName = profileNames.last;

      if (canAccessAsAdmin && visitorIdParam) {
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

      const { diary: loaded, error: loadError } = await fetchVisitorTravelDiaryPackage(resolvedVisitorId, {
        expoId,
        lang: i18n.language,
        visitorFirstName: firstName,
        visitorLastName: lastName,
      });

      if (cancelled) return;
      if (loadError) {
        setError(loadError);
        setDiary(null);
      } else {
        setDiary(loaded);
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
    expoId,
    i18n.language,
    first_name,
    canAccessAsAdmin,
    visitorIdParam,
    session?.user?.id,
    profileNames.first,
    profileNames.last,
  ]);

  if (!authLoading && accessDenied) {
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
          secondaryAction={
            canAccessAsAdmin ? (
              <Button type="button" variant="outline" className="h-10 min-w-0 flex-1 px-2 text-xs sm:text-sm" asChild>
                <Link to="/expos" className="truncate">
                  {t("diary.back_to_expos")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {!canAccessAsAdmin ? (
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
