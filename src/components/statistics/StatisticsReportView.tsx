/**
 * Rapport statistiques dédié à l’impression / export PDF (layout A4, pas le tableau de bord interactif).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Heart } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBarVisitLabel, sumChartVisits } from "@/lib/statisticsCharts";
import { normalizeEmotionKey, emotionEmojiForPreview } from "@/lib/statisticsEmotions";

export type StatisticsMiniKpi = {
  id: "uniqueVisitors" | "avgHearts" | "dominantEmotion" | "activeArtworks";
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

export type StatisticsArtistCoverLetter = {
  artistFirstName: string;
  artistLastName: string;
  agencyName: string;
  expoName: string;
  signatoryFirstName: string;
  signatoryLastName: string;
};

export type StatisticsReportViewProps = {
  orgLabel: string;
  previewExpoLabel: string;
  previewArtistLabel: string;
  /** Lettre d’accompagnement (filtre artiste actif uniquement). */
  previewArtistCoverLetter?: StatisticsArtistCoverLetter | null;
  /** Logo organisation : bandeau haut, à droite du bloc AIMEDIArt. */
  previewAgencyLogoMeta: { logoUrl: string | null; name: string | null };
  /** Logo de l’exposition filtrée : bloc filtres, à droite. */
  previewExpoLogoMeta: { logoUrl: string | null; name: string | null };
  /** Dates de l’exposition filtrée (affichage périmètre PDF / aperçu). */
  previewExpoDateRange?: { from: string; to: string } | null;
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

function StatisticsReportBrand({
  previewAgencyLogoMeta,
}: {
  previewAgencyLogoMeta: { logoUrl: string | null; name: string | null };
}) {
  const { t } = useTranslation("statistiques");

  return (
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
          className="statistics-print-org-logo ml-auto h-14 max-h-16 max-w-[180px] shrink-0 rounded-lg border border-neutral-200 bg-white object-contain object-right p-1"
        />
      ) : previewAgencyLogoMeta.name ? (
        <span className="ml-auto max-w-[180px] truncate text-right text-xs font-semibold text-neutral-700">
          {previewAgencyLogoMeta.name}
        </span>
      ) : null}
    </div>
  );
}

/** Carte lettre / périmètre (layout artiste : pas de bordure, ombre 15 %). */
const artistPageCardShell =
  "statistics-report-page1-card min-w-0 max-w-[48%] flex-[1_1_48%] rounded-2xl border-0 bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.15)] sm:p-5";

function StatisticsReportScopeBlock({
  orgLabel,
  previewExpoLabel,
  previewArtistLabel,
  previewExpoDateRange,
  previewExpoLogoMeta,
  className,
}: {
  orgLabel: string;
  previewExpoLabel: string;
  previewArtistLabel: string;
  previewExpoDateRange?: { from: string; to: string } | null;
  previewExpoLogoMeta: { logoUrl: string | null; name: string | null };
  className: string;
}) {
  const { t } = useTranslation("statistiques");

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
            <li className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-neutral-900">{t("filter.artist")}</span>
              <span>{previewArtistLabel}</span>
            </li>
            {previewExpoDateRange ? (
              <li className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-neutral-900">{t("filter.expoPeriod")}</span>
                <span>
                  {t("filter.expoDateRange", {
                    from: previewExpoDateRange.from,
                    to: previewExpoDateRange.to,
                  })}
                </span>
              </li>
            ) : null}
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
            className="statistics-print-expo-logo h-14 max-h-16 max-w-[140px] shrink-0 rounded-lg border border-neutral-200 bg-white object-contain object-right p-1"
          />
        ) : null}
      </div>
    </div>
  );
}

function StatisticsArtistCoverLetterBlock({
  letter,
  sideBySide = false,
}: {
  letter: StatisticsArtistCoverLetter;
  sideBySide?: boolean;
}) {
  const { t } = useTranslation("statistiques");
  const signatoryName = [letter.signatoryFirstName, letter.signatoryLastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={
        sideBySide
          ? `${artistPageCardShell} statistics-report-artist-letter space-y-4 text-[14px] leading-[1.6] text-neutral-800`
          : "statistics-report-artist-letter mb-8 space-y-8 text-[15px] leading-[1.65] text-neutral-800"
      }
    >
      <p>{t("artistCoverLetter.greeting", { firstName: letter.artistFirstName, lastName: letter.artistLastName })}</p>
      <p>
        {t("artistCoverLetter.introPrefix")}{" "}
        <strong className="font-semibold text-neutral-900">{letter.agencyName}</strong>{" "}
        {t("artistCoverLetter.introConnector")}{" "}
        <strong className="font-semibold text-[#E63946]">Aimediart.com</strong>{" "}
        {t("artistCoverLetter.introMain")}{" "}
        <strong className="font-semibold text-neutral-900">{letter.expoName}</strong>.
      </p>
      <p>{t("artistCoverLetter.congrats")}</p>
      <p>{t("artistCoverLetter.closingHope")}</p>
      <div className="space-y-1">
        <p>{t("artistCoverLetter.salutation")}</p>
        {signatoryName ? (
          <p className="font-semibold text-neutral-900">{signatoryName}</p>
        ) : null}
      </div>
    </div>
  );
}

export function StatisticsReportView({
  orgLabel,
  previewExpoLabel,
  previewArtistLabel,
  previewArtistCoverLetter = null,
  previewAgencyLogoMeta,
  previewExpoLogoMeta,
  previewExpoDateRange = null,
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
  const filteredVisitsTotal = useMemo(() => sumChartVisits(hourlySeries), [hourlySeries]);
  const artistReportLayout = previewArtistCoverLetter != null;

  return (
    <div
      className={
        artistReportLayout
          ? "statistics-report-root statistics-report-root--artist text-neutral-900"
          : "statistics-report-root text-neutral-900"
      }
    >
      {/* Page 1 — synthèse KPI + contexte */}
      <section
        className={
          artistReportLayout
            ? "statistics-report-page statistics-report-page--with-artist"
            : "statistics-report-page"
        }
      >
        <StatisticsReportBrand previewAgencyLogoMeta={previewAgencyLogoMeta} />

        <p className="statistics-report-generated-at mb-5 text-xs text-neutral-500">
          {t("preview.generatedAt", { date: new Date().toLocaleString(i18n.language) })}
        </p>

        {artistReportLayout ? (
          <div className="statistics-report-page1-columns mb-4 flex flex-row flex-wrap items-stretch justify-between gap-4">
            <StatisticsArtistCoverLetterBlock letter={previewArtistCoverLetter} sideBySide />
            <StatisticsReportScopeBlock
              orgLabel={orgLabel}
              previewExpoLabel={previewExpoLabel}
              previewArtistLabel={previewArtistLabel}
              previewExpoDateRange={previewExpoDateRange}
              previewExpoLogoMeta={previewExpoLogoMeta}
              className={`${artistPageCardShell} statistics-report-section statistics-report-section--scope`}
            />
          </div>
        ) : (
          <StatisticsReportScopeBlock
            orgLabel={orgLabel}
            previewExpoLabel={previewExpoLabel}
            previewArtistLabel={previewArtistLabel}
            previewExpoDateRange={previewExpoDateRange}
            previewExpoLogoMeta={previewExpoLogoMeta}
            className={`${sectionShell} statistics-report-section mb-6`}
          />
        )}

        <div
          className={`${sectionShell} statistics-report-section statistics-report-section--kpis ${artistReportLayout ? "mb-4" : "mb-6"}`}
        >
          <h3 className={`${headingClass} mb-3`}>{t("page.title")}</h3>
          <div className="statistics-report-kpi-grid grid grid-cols-2 gap-3 sm:grid-cols-4">
            {miniKpis.map((k) => (
              <div
                key={k.id}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-3 text-center shadow-sm"
              >
                <k.icon className="mx-auto mb-2 h-5 w-5 text-[#E63946]" aria-hidden />
                <p className="text-[11px] font-medium text-neutral-600">{k.label}</p>
                <p className="mt-1 font-serif text-lg font-bold tabular-nums text-neutral-900">
                  {k.id === "dominantEmotion" && k.value !== "—"
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
        <StatisticsReportBrand previewAgencyLogoMeta={previewAgencyLogoMeta} />
        <div className={`${sectionShell} statistics-report-section statistics-report-section--emotions`}>
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
        <StatisticsReportBrand previewAgencyLogoMeta={previewAgencyLogoMeta} />
        <div className={`${sectionShell} statistics-report-section statistics-report-section--chart`}>
          <h3 className={`${headingClass} mb-3`}>{t("timeline.title")}</h3>
          {temporalSeriesForPdf.length === 0 ? (
            <p className="statistics-report-empty-state py-4 text-center text-sm text-neutral-600">{t("common.chartNoData")}</p>
          ) : (
            <>
            <div className={chartBoxClass} data-statistics-chart-slot="timeline">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={temporalSeriesForPdf} margin={{ top: 18, right: 12, left: 4, bottom: 8 }}>
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
                  <Bar dataKey="visites" name="Visites" fill="#3399CC" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="visites"
                      position="top"
                      formatter={formatBarVisitLabel}
                      fill="#374151"
                      fontSize={9}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-center text-sm font-medium text-neutral-600">
              {previewExpoDateRange
                ? t("timeline.totalVisitsExpo", { count: formatFrNumber(filteredVisitsTotal) })
                : t("timeline.totalVisitsFiltered", { count: formatFrNumber(filteredVisitsTotal) })}
            </p>
            </>
          )}
        </div>
      </section>

      {/* Page 4 — affluence horaire */}
      <section className="statistics-report-page">
        <StatisticsReportBrand previewAgencyLogoMeta={previewAgencyLogoMeta} />
        <div className={`${sectionShell} statistics-report-section statistics-report-section--chart`}>
          <h3 className={`${headingClass} mb-3`}>{t("hourly.title")}</h3>
          {hourlySeries.length === 0 ? (
            <p className="statistics-report-empty-state py-4 text-center text-sm text-neutral-600">{t("common.chartNoData")}</p>
          ) : (
            <div className={chartBoxClass} data-statistics-chart-slot="hourly">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlySeries} margin={{ top: 18, right: 12, left: 4, bottom: 8 }}>
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
                  >
                    <LabelList
                      dataKey="visites"
                      position="top"
                      formatter={formatBarVisitLabel}
                      fill="#374151"
                      fontSize={9}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Page 5 — tableau croisé */}
      <section className="statistics-report-page statistics-report-page--tables">
        <StatisticsReportBrand previewAgencyLogoMeta={previewAgencyLogoMeta} />
        <div className={`${sectionShell} statistics-report-table-panel min-h-0`}>
          <div className="statistics-report-table-intro">
            <h3 className={headingClass}>{t("cross.title")}</h3>
            <p className={`mb-3 ${subheadingClass}`}>{t("cross.subtitle")}</p>
          </div>
          {crossError ? (
            <p className="text-sm text-red-700">{crossError}</p>
          ) : sortedCrossRows.length === 0 ? (
            <p className="text-sm text-neutral-600">{t("cross.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="statistics-report-data-table w-full min-w-[480px] text-xs sm:text-sm">
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
        <StatisticsReportBrand previewAgencyLogoMeta={previewAgencyLogoMeta} />
        <div className={`${sectionShell} statistics-report-table-panel min-h-0`}>
          <div className="statistics-report-table-intro">
            <h3 className={`${headingClass} mb-1`}>{t("top.title")}</h3>
            <p className={`mb-3 ${subheadingClass}`}>{t("top.subtitle")}</p>
          </div>
          {topArtworksError ? (
            <p className="text-sm text-red-700">{topArtworksError}</p>
          ) : sortedTopArtworks.length === 0 ? (
            <p className="text-sm text-neutral-600">{t("top.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="statistics-report-data-table w-full border-collapse text-sm">
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
