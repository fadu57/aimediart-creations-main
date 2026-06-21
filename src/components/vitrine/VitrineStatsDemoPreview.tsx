import { useTranslation } from "react-i18next";

import { OptimizedImage } from "@/components/ui/OptimizedImage";

const STATS_DEMO_IMAGE = "/landing-dashboard-new.png";
const STATS_DEMO_WEBP = "/landing-dashboard-new.webp";

export function VitrineStatsDemoPreview() {
  const { t } = useTranslation("home");

  const kpis = [
    { value: t("parcours.stats_demo_kpi_scans"), label: t("parcours.stats_demo_kpi_scans_label") },
    { value: t("parcours.stats_demo_kpi_rating"), label: t("parcours.stats_demo_kpi_rating_label") },
    { value: t("parcours.stats_demo_kpi_emotion"), label: t("parcours.stats_demo_kpi_emotion_label") },
  ];

  return (
    <figure className="mt-4">
      <div className="overflow-hidden rounded-xl border border-neutral-300/80 bg-white shadow-[0_8px_18px_rgba(0,0,0,0.05)]">
        <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t("parcours.stats_demo_expo")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-neutral-200 bg-[#fdfdfc] px-2 py-2 text-center">
              <p className="text-base font-semibold leading-none text-[#E63946]">{kpi.value}</p>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{kpi.label}</p>
            </div>
          ))}
        </div>
        <OptimizedImage
          src={STATS_DEMO_IMAGE}
          webpSrc={STATS_DEMO_WEBP}
          alt={t("parcours.stats_demo_image_alt")}
          className="h-36 w-full border-t border-neutral-200 object-cover object-top"
          loading="lazy"
          width={800}
          height={144}
        />
      </div>
      <figcaption className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t("parcours.pdf_demo_caption")}
      </figcaption>
    </figure>
  );
}
