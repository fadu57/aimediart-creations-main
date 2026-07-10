import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { TravelDiaryNotebook } from "@/components/visitor/TravelDiaryNotebook";
import { useAuthUser } from "@/hooks/useAuthUser";
import { resolveFeedbackVisitorId } from "@/lib/registerAnonymousVisitorSession";
import {
  buildGenericDiaryPreviewShell,
  loadTravelDiaryPreviewPackage,
  type TravelDiaryPackage,
} from "@/lib/visitorTravelDiary";
import { cn } from "@/lib/utils";

type Props = {
  expoId?: string | null;
  visitorFirstName?: string;
  visitorLastName?: string;
  className?: string;
};

export function TravelDiaryPreviewFlipbook({
  expoId,
  visitorFirstName = "",
  visitorLastName = "",
  className = "",
}: Props) {
  const { t, i18n } = useTranslation("visitor");
  const { session } = useAuthUser();
  const [diary, setDiary] = useState<TravelDiaryPackage | null>(null);
  const [loading, setLoading] = useState(true);

  const firstName = visitorFirstName.trim();
  const lastName = visitorLastName.trim();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const visitorId = resolveFeedbackVisitorId(session?.user?.id?.trim() || null);
        const loaded = await loadTravelDiaryPreviewPackage({
          expoId,
          visitorId,
          lang: i18n.language,
          visitorFirstName: firstName,
          visitorLastName: lastName,
          maxArtworks: 3,
        });
        if (!cancelled) setDiary(loaded);
      } catch {
        if (!cancelled) {
          setDiary(
            buildGenericDiaryPreviewShell({
              lang: i18n.language,
              visitorFirstName: firstName,
              visitorLastName: lastName,
            }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expoId, firstName, i18n.language, lastName, session?.user?.id]);

  if (loading) {
    return (
      <div className={cn("flex min-h-[320px] items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-[#E63946]" aria-label={t("diary.loading")} />
      </div>
    );
  }

  if (!diary) return null;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <p className="mb-3 text-center text-xs leading-relaxed text-[#F0F0F0]/75">
        {t("diary.registration_preview_swipe_hint")}
      </p>
      <TravelDiaryNotebook
        diary={diary}
        showToolbar={false}
        syncUrl={false}
        className="travel-diary-root--preview"
      />
    </div>
  );
}
