/**
 * Rapport statistiques dédié à l’impression / export PDF (layout A4, pas le tableau de bord interactif).
 */
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Heart } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { normalizeEmotionKey, emotionEmojiForPreview } from "@/lib/statisticsEmotions";

export type StatisticsMiniKpi = {
  label: string;
  icon: LucideIcon;
  value: string;
  hint: string;
};

export type StatisticsEmotionSeriesRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  percentage: number;
  count: number;
};

export type StatisticsTemporalPoint = {
  day: string;
  date: string;
  weekday: string;
  dateLabel: string;
  visites: number;
};

export type StatisticsHourlyPoint = {
  hour: string;
  visites: number;
};

export type StatisticsCrossEmotionCol = {
  id: string;
  name: string;
  icon: string;
};

export type StatisticsCrossRow = {
  artworkId: string;
  name: string;
  counts: Record<string, number>;
};

export type StatisticsTopArtworkRow = {
  artworkId: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  visits: number;
  avgHearts: number | null;
};

export type StatisticsReportViewProps = {
  orgLabel: string;
  previewExpoLabel: string;
  /** Logo organisation : bandeau haut, à droite du bloc AIMEDIArt. */
  previewAgencyLogoMeta: { logoUrl: string | null; name: string | null };
  /** Logo de l’exposition filtrée : bloc filtres, à droite. */
  previewExpoLogoMeta: { logoUrl: string | null; name: string | null };
  miniKpis: StatisticsMiniKpi[];
  emotionSeries: StatisticsEmotionSeriesRow[];
  feedbackTotal: number;
  temporalSeriesForPdf: StatisticsTemporalPoint[];
  hourlySeries: StatisticsHourlyPoint[];
  timelineTickIntervalPdf: number;
  crossEmotionColumns: StatisticsCrossEmotionCol[];
  sortedCrossRows: StatisticsCrossRow[];
  crossError: string | null;
  sortedTopArtworks: StatisticsTopArtworkRow[];
  topArtworksError: string | null;
  formatFrNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
};

const sectionShell =
  "rounded-2xl border border-neutral-200/90 bg-gradient-to-b from-neutral-50 to-white p-5 shadow-sm";
const headingClass = "font-serif text-lg font-bold tracking-tight text-neutral-900";
const subheadingClass = "text-xs text-neutral-600";

const chartBoxClass =
  "statistics-report-chart-host h-[280px] w-full max-w-full text-neutral-700 [&_.recharts-cartesian-grid_line]:stroke-neutral-200 [&_.recharts-surface]:overflow-visible";

export function StatisticsReportView({
  orgLabel,
  previewExpoLabel,
  previewAgencyLogoMeta,
  previewExpoLogoMeta,
  miniKpis,
  emotionSeries,
  feedbackTotal,
  temporalSeriesForPdf,
  hourlySeries,
  timelineTickIntervalPdf,
  crossEmotionColumns,
  sortedCrossRows,
  crossError,
  sortedTopArtworks,
  topArtworksError,
  formatFrNumber,
}: StatisticsReportViewProps) {
  const { t, i18n } = useTranslation("statistiques");

  return (
    <div className="statistics-report-root text-neutral-900">
      {/* Page 1 — synthèse KPI + contexte */}
      <section className="statistics-report-page">
        <div className="statistics-report-brand mb-5 flex w-full min-w-0 items-center justify-between gap-4 rounded-xl border border-neutral-200/90 bg-gradient-to-b from-neutral-50 to-white px-4 py-3 shadow-sm print:border-neutral-200">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15%] shadow-sm"
              style={{ backgroundColor: "hsl(0 65% 48%)" }}
              aria-hidden
            >
              <Heart className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <div className="font-semibold tracking-tight text-[#E63946]">AIMEDIArt.com</div>
              <div className="text-xs font-bold italic text-[#E63946]">Art-mediation with AI</div>
            </div>
          </div>
          {previewAgencyLogoMeta.logoUrl ? (
            <img
              src={previewAgencyLogoMeta.logoUrl}
              alt={
                previewAgencyLogoMeta.name
                  ? `${t("filter.organisation")} — ${previewAgencyLogoMeta.name}`
                  : t("filter.organisation")
              }
              referrerPolicy="no-referrer"
              className="statistics-print-org-logo h-14 max-h-16 max-w-[180px] shrink-0 rounded-lg border border-neutral-200 bg-white object-contain object-right p-1"
            />
          ) : null}
        </div>

        <p className="mb-5 text-xs text-neutral-500">
          {t("preview.generatedAt", { date: new Date().toLocaleString(i18n.language) })}
        </p>

        <div className={`${sectionShell} mb-6`}>
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className={headingClass}>{t("preview.filtersTitle")}</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-neutral-800">
                <li className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-neutral-900">{t("filter.organisation")}</span>
                  <span>{orgLabel}</span>
                </li>
                <li className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-neutral-900">{t("filter.exposition")}</span>
                  <span>{previewExpoLabel}</span>
                </li>
              </ul>
            </div>
            {previewExpoLogoMeta.logoUrl ? (
              <img
                src={previewExpoLogoMeta.logoUrl}
                alt={
                  previewExpoLogoMeta.name
                    ? `${t("filter.exposition")} — ${previewExpoLogoMeta.name}`
                    : t("filter.exposition")
                }
                referrerPolicy="no-referrer"
                className="statistics-print-expo-logo h-14 max-h-16 max-w-[180px] shrink-0 rounded-lg border border-neutral-200 bg-white object-contain object-right p-1"
              />
            ) : null}
          </div>
        </div>

        <div className={`${sectionShell} mb-6`}>
          <h3 className={`${headingClass} mb-3`}>{t("page.title")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {miniKpis.map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-3 text-center shadow-sm"
              >
                <k.icon className="mx-auto mb-2 h-5 w-5 text-[#E63946]" aria-hidden />
                <p className="text-[11px] font-medium text-neutral-600">{k.label}</p>
                <p className="mt-1 font-serif text-lg font-bold tabular-nums text-neutral-900">
                  {k.label === "Émotion dominante" && k.value !== "—"
                    ? t(`emotions.names.${normalizeEmotionKey(String(k.value))}`, { defaultValue: String(k.value) })
                    : k.value}
                </p>
                <p className="mt-0.5 text-[10px] text-neutral-500">{k.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Page 2 — répartition des émotions */}
      <section className="statistics-report-page">
        <div className={sectionShell}>
          <h3 className={headingClass}>{t("emotions.title")}</h3>
          <p className={`mb-3 ${subheadingClass}`}>{t("emotions.subtitle")}</p>
          {feedbackTotal === 0 || emotionSeries.length === 0 ? (
            <p className="text-sm text-neutral-600">{t("emotions.empty")}</p>
          ) : (
            <div className="space-y-3">
              {emotionSeries.map((emo) => (
                <div key={emo.id} className="flex items-center gap-3">
                  <span className="w-8 shrink-0 text-center text-lg leading-none" aria-hidden>
                    {emotionEmojiForPreview(emo.name, emo.icon)}
                  </span>
                  <span className="w-[min(7rem,28vw)] shrink-0 text-sm text-neutral-800">
                    {t(`emotions.names.${normalizeEmotionKey(emo.name)}`, { defaultValue: emo.name })}
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full rounded-full" style={{ width: `${emo.percentage}%`, backgroundColor: emo.color }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-neutral-900">
                    {emo.percentage}%
                  </span>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-neutral-600">{t("preview.totalFeedbacks", { count: feedbackTotal })}</p>
            </div>
          )}
        </div>
      </section>

      {/* Page 3 — série temporelle */}
      <section className="statistics-report-page">
        <div className={sectionShell}>
          <h3 className={`${headingClass} mb-3`}>{t("timeline.title")}</h3>
          {temporalSeriesForPdf.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-600">{t("common.chartNoData")}</p>
          ) : (
            <div className={chartBoxClass} data-statistics-chart-slot="timeline">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={temporalSeriesForPdf} margin={{ top: 10, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis
                    dataKey="day"
                    interval={timelineTickIntervalPdf}
                    tick={({ x, y, payload }) => {
                      const raw = String(payload?.value ?? "");
                      const [weekday, dayMonth] = raw.split("|");
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} textAnchor="middle" fill="currentColor" fontSize={10}>
                            <tspan x={0} dy="0.71em">
                              {weekday || ""}
                            </tspan>
                            <tspan x={0} dy="1.1em">
                              {dayMonth || ""}
                            </tspan>
                          </text>
                        </g>
                      );
                    }}
                    height={44}
                  />
                  <YAxis tick={{ fill: "currentColor", fontSize: 11 }} width={36} />
                  <Tooltip
                    wrapperClassName="statistics-report-chart-tooltip"
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#374151" }}
                  />
                  <Bar dataKey="visites" name="Visites" fill="#3399CC" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Page 4 — affluence horaire */}
      <section className="statistics-report-page">
        <div className={sectionShell}>
          <h3 className={`${headingClass} mb-3`}>{t("hourly.title")}</h3>
          {hourlySeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-600">{t("common.chartNoData")}</p>
          ) : (
            <div className={chartBoxClass} data-statistics-chart-slot="hourly">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlySeries} margin={{ top: 10, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis dataKey="hour" tick={{ fill: "currentColor", fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fill: "currentColor", fontSize: 11 }} width={36} />
                  <Tooltip
                    wrapperClassName="statistics-report-chart-tooltip"
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#374151" }}
                  />
                  <Bar
                    dataKey="visites"
                    name="Visites"
                    fill="hsl(38, 70%, 50%)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Page 5 — tableau croisé */}
      <section className="statistics-report-page statistics-report-page--tables">
        <div className={`${sectionShell} min-h-0`}>
          <h3 className={headingClass}>{t("cross.title")}</h3>
          <p className={`mb-3 ${subheadingClass}`}>{t("cross.subtitle")}</p>
          {crossError ? (
            <p className="text-sm text-red-700">{crossError}</p>
          ) : sortedCrossRows.length === 0 ? (
            <p className="text-sm text-neutral-600">{t("cross.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[480px] text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-100">
                    <th className="px-2 py-2 text-left font-semibold text-neutral-900">{t("cross.colArtwork")}</th>
                    {crossEmotionColumns.map((emotion) => (
                      <th key={emotion.id} className="px-1 py-2 text-center font-semibold text-neutral-900">
                        <span className="mr-0.5" aria-hidden>
                          {emotionEmojiForPreview(emotion.name, emotion.icon)}
                        </span>
                        <span className="inline-block max-w-[4.5rem] align-middle leading-tight">
                          {t(`emotions.names.${normalizeEmotionKey(emotion.name)}`, { defaultValue: emotion.name })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCrossRows.map((row) => (
                    <tr key={row.artworkId} className="border-b border-neutral-100">
                      <td className="px-2 py-2 font-medium text-neutral-900">{row.name}</td>
                      {crossEmotionColumns.map((emotion) => (
                        <td key={`${row.artworkId}-${emotion.id}`} className="px-1 py-2 text-center tabular-nums text-neutral-800">
                          {(row.counts[emotion.id] ?? 0) > 0 ? row.counts[emotion.id] ?? 0 : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Page 6 — œuvres les plus consultées */}
      <section className="statistics-report-page statistics-report-page--last statistics-report-page--tables">
        <div className={`${sectionShell} min-h-0`}>
          <h3 className={`${headingClass} mb-1`}>{t("top.title")}</h3>
          <p className={`mb-3 ${subheadingClass}`}>{t("top.subtitle")}</p>
          {topArtworksError ? (
            <p className="text-sm text-red-700">{topArtworksError}</p>
          ) : sortedTopArtworks.length === 0 ? (
            <p className="text-sm text-neutral-600">{t("top.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-100">
                    <th className="px-2 py-2 text-left font-semibold text-neutral-900">{t("top.colRank")}</th>
                    <th className="px-2 py-2 text-left font-semibold text-neutral-900">{t("top.colArtwork")}</th>
                    <th className="px-2 py-2 text-right font-semibold text-neutral-900">{t("top.colVisits")}</th>
                    <th className="px-2 py-2 text-right font-semibold text-neutral-900">{t("top.colAvgHearts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTopArtworks.slice(0, 40).map((row, index) => (
                    <tr key={row.artworkId} className="border-b border-neutral-100">
                      <td className="px-2 py-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E63946]/15 text-sm font-bold text-neutral-900">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-neutral-200">
                            {row.imageUrl ? (
                              <img
                                src={row.imageUrl}
                                alt={row.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="h-full w-full bg-neutral-200" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-neutral-900">{row.title}</div>
                            <div className="truncate text-xs text-neutral-600">{row.artist}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-800">
                        {formatFrNumber(row.visits)} visite(s)
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-800">
                        {row.avgHearts == null
                          ? "—"
                          : formatFrNumber(row.avgHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
