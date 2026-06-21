import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LazyWhenVisible } from "@/components/ui/LazyWhenVisible";
import { VITRINE_GEO_DEMO_ROWS } from "@/lib/vitrineGeographyDemo";

const VisitorGeographyMap = lazy(() =>
  import("@/components/statistics/VisitorGeographyMap").then((module) => ({
    default: module.VisitorGeographyMap,
  })),
);

export function VitrineGeographyDemoMap() {
  const { t } = useTranslation("home");

  return (
    <figure className="mt-4">
      <LazyWhenVisible minHeight={220}>
        <div className="overflow-hidden rounded-xl border border-neutral-300/80 bg-white shadow-inner">
          <Suspense
            fallback={
              <div className="flex h-[220px] items-center justify-center bg-neutral-50">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            }
          >
            <VisitorGeographyMap rows={VITRINE_GEO_DEMO_ROWS} scopeKey="vitrine-public-demo" height={220} />
          </Suspense>
        </div>
      </LazyWhenVisible>
      <figcaption className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t("parcours.geography_demo_caption")}
      </figcaption>
      <p className="mt-1 text-[10px] italic text-muted-foreground/90">{t("parcours.geography_demo_legend")}</p>
    </figure>
  );
}
