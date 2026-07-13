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

/** Hauteur affichée de la miniature dans le formulaire d'inscription. */
const MINIATURE_MAX_HEIGHT = 150;
/** Hauteur naturelle du carnet avant scale. */
const MINIATURE_REF_HEIGHT = 490;
/** Largeur de référence du carnet avant scale. */
const MINIATURE_REF_WIDTH = 312;
/** Décalage vertical pour cadrer la couverture dans la fenêtre miniature. */
const MINIATURE_OFFSET_TOP = 0;
/** Décalage horizontal pour cadrer la couverture dans la fenêtre miniature. */
const MINIATURE_OFFSET_LEFT = 0;
const MINIATURE_SCALE = MINIATURE_MAX_HEIGHT / MINIATURE_REF_HEIGHT;
const MINIATURE_DISPLAY_WIDTH = Math.round(MINIATURE_REF_WIDTH * MINIATURE_SCALE);

type Props = {
  expoId?: string | null;
  visitorFirstName?: string;
  visitorLastName?: string;
  className?: string;
  /** Masque le texte d’aide au feuilletage (aperçu miniature dans le formulaire). */
  showHint?: boolean;
  variant?: "full" | "miniature";
};

export function TravelDiaryPreviewFlipbook({
  expoId,
  visitorFirstName = "",
  visitorLastName = "",
  className = "",
  showHint = true,
  variant = "full",
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
      <div
        className={cn(
          "flex items-center justify-center",
          variant === "miniature" ? "h-[150px]" : "min-h-[320px]",
          className,
        )}
      >
        <Loader2
          className={cn("animate-spin text-[#E63946]", variant === "miniature" ? "h-5 w-5" : "h-8 w-8")}
          aria-label={t("diary.loading")}
        />
      </div>
    );
  }

  if (!diary) return null;

  const isMiniature = variant === "miniature";
  const notebook = (
    <TravelDiaryNotebook
      diary={diary}
      showToolbar={false}
      syncUrl={false}
      className={isMiniature ? "travel-diary-root--miniature-ref" : "travel-diary-root--preview"}
    />
  );

  if (isMiniature) {
    return (
      <div
        className={cn("pointer-events-none relative mx-auto shrink-0 overflow-hidden", className)}
        style={{ width: MINIATURE_DISPLAY_WIDTH, height: MINIATURE_MAX_HEIGHT }}
        aria-hidden
      >
        <div
          className="absolute top-0"
          style={{
            left: MINIATURE_OFFSET_LEFT,
            width: MINIATURE_REF_WIDTH,
            height: MINIATURE_REF_HEIGHT,
            marginTop: MINIATURE_OFFSET_TOP,
            transform: `scale(${MINIATURE_SCALE})`,
            transformOrigin: "top left",
          }}
        >
          {notebook}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0", className)}>
      {showHint ? (
        <p className="mb-3 text-center text-xs leading-relaxed text-[#F0F0F0]/75">
          {t("diary.registration_preview_swipe_hint")}
        </p>
      ) : null}
      {notebook}
    </div>
  );
}
