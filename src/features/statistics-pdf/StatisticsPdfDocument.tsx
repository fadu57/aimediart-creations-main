/**
 * Export PDF statistiques via @react-pdf/renderer (UTF-8 / Helvetica natives).
 */
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { Document, Font, Image, Line, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { StatisticsReportViewProps } from "@/components/statistics/StatisticsReportView";
import type { PdfPaperFormat } from "@/lib/statisticsPrintExport";
import { normalizeEmotionKey } from "@/lib/statisticsEmotions";

/** Même logique que `emotionEmojiForPreview` — fonction locale pour éviter une ReferenceError dans le rendu @react-pdf/renderer. */
function pdfEmotionEmoji(name: string, icon?: string | null): string {
  if (name.toLowerCase().includes("troublé")) return "😵‍💫";
  const t = (icon || "").trim();
  return t || "✨";
}

/**
 * Emojis dans le PDF : @react-pdf dessine les emojis via des images PNG (pas via une police texte).
 * Twemoji (CDN) — l’export nécessite un accès réseau pour télécharger les pictogrammes.
 * Pour du 100 % hors-ligne : héberger les PNG sous `public/twemoji/72x72/` et pointer `url` vers cette base.
 */
Font.registerEmojiSource({
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
  format: "png",
});

const REACT_PDF_PAGE_SIZE: Record<PdfPaperFormat, string> = {
  a4: "A4",
  a3: "A3",
  a5: "A5",
  letter: "LETTER",
  legal: "LEGAL",
  tabloid: "TABLOID",
};

const MARGIN = "15mm";
const HEADER_BELOW_TOP = 50;
const CONTENT_TOP_SPACE = HEADER_BELOW_TOP + 8;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111111",
    padding: MARGIN,
    paddingTop: CONTENT_TOP_SPACE + 12,
  },
  header: {
    position: "absolute",
    top: MARGIN,
    left: MARGIN,
    right: MARGIN,
    height: HEADER_BELOW_TOP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 6,
  },
  brandSquare: {
    width: 32,
    height: 32,
    backgroundColor: "#c42d3a",
    borderRadius: 6,
    marginRight: 8,
  },
  brandTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#E63946",
  },
  brandSub: {
    fontSize: 7,
    fontFamily: "Helvetica-Oblique",
    color: "#E63946",
    marginTop: 1,
  },
  logoImg: {
    maxHeight: 40,
    maxWidth: 160,
    objectFit: "contain",
  },
  headerOrgText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    textAlign: "right",
    maxWidth: 200,
  },
  pageNumber: {
    position: "absolute",
    bottom: "12mm",
    right: MARGIN,
    fontSize: 8,
    color: "#6b7280",
  },
  muted: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 6,
  },
  h1: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: "#111111",
  },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
    color: "#111111",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fafafa",
  },
  listItem: {
    fontSize: 8,
    marginTop: 3,
    paddingLeft: 8,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    justifyContent: "space-between",
  },
  kpiCell: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 8,
    minHeight: 52,
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 7,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  kpiHint: {
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 3,
  },
  emotionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  emotionBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    marginHorizontal: 6,
    overflow: "hidden",
  },
  chartTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  chartLabel: {
    fontSize: 5,
    color: "#4b5563",
    textAlign: "center",
    marginTop: 2,
    maxHeight: 22,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 4,
    paddingHorizontal: 3,
    backgroundColor: "#f3f4f6",
  },
  tableCell: {
    fontSize: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  tableRow: {
    flexDirection: "row",
  },
  emojiOnly: {
    fontSize: 9,
  },
});

export type StatisticsPdfDocumentProps = StatisticsReportViewProps & {
  t: TFunction<"statistiques">;
  /** `toLocaleString` déjà formatée côté appelant. */
  generatedAtLabel: string;
  paperFormat: PdfPaperFormat;
  /** Pour masquer le logo expo dans l’en-tête lorsque toutes les expos sont sélectionnées. */
  drillExpoId: string | "all";
};

function PdfHeader({
  previewAgencyLogoMeta,
  previewExpoLogoMeta,
  orgLabel,
  drillExpoId,
}: Pick<StatisticsReportViewProps, "previewAgencyLogoMeta" | "previewExpoLogoMeta"> & {
  orgLabel: string;
  drillExpoId: string | "all";
}) {
  const orgFallbackName = (previewAgencyLogoMeta.name ?? "").trim() || orgLabel;

  return (
    <View style={styles.header}>
      <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0, maxWidth: "48%" }}>
        <View style={styles.brandSquare} />
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.brandTitle}>AIMEDIArt.com</Text>
          <Text style={styles.brandSub}>Art-mediation with AI</Text>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          flex: 1,
          marginLeft: 10,
          minWidth: 0,
        }}
      >
        {previewAgencyLogoMeta.logoUrl ? (
          <Image style={styles.logoImg} src={previewAgencyLogoMeta.logoUrl} />
        ) : (
          <Text style={styles.headerOrgText}>{orgFallbackName}</Text>
        )}
        {drillExpoId !== "all" && previewExpoLogoMeta.logoUrl ? (
          <Image style={[styles.logoImg, { marginLeft: 10 }]} src={previewExpoLogoMeta.logoUrl} />
        ) : null}
      </View>
    </View>
  );
}

/** Largeur logique du tracé SVG (viewBox) — les barres en View/Yoga sont souvent invisibles dans les PDF. */
const PDF_CHART_W = 500;
const PDF_CHART_PLOT_H = 88;

function PdfBarChartTemporal({
  data,
  timelineTickIntervalPdf,
}: {
  data: StatisticsReportViewProps["temporalSeriesForPdf"];
  timelineTickIntervalPdf: number;
}) {
  const nums = data.map((d) => Number(d.visites) || 0);
  const maxY = Math.max(1, ...nums);
  const n = data.length;
  const slotW = n > 0 ? PDF_CHART_W / n : PDF_CHART_W;
  const barW = Math.max(1, Math.min(9, slotW * 0.72));
  const interval = timelineTickIntervalPdf <= 0 ? 1 : timelineTickIntervalPdf + 1;
  const innerH = PDF_CHART_PLOT_H - 4;

  return (
    <View style={{ marginTop: 4 }}>
      <Svg width="100%" height={PDF_CHART_PLOT_H} viewBox={`0 0 ${PDF_CHART_W} ${PDF_CHART_PLOT_H}`}>
        <Line x1={0} y1={PDF_CHART_PLOT_H} x2={PDF_CHART_W} y2={PDF_CHART_PLOT_H} stroke="#d1d5db" strokeWidth={1} />
        <Line x1={0} y1={0} x2={0} y2={PDF_CHART_PLOT_H} stroke="#d1d5db" strokeWidth={1} />
        {data.map((row, i) => {
          const v = Number(row.visites) || 0;
          const hRaw = (v / maxY) * innerH;
          const barH = v > 0 ? Math.max(hRaw, 2.5) : 0;
          const x = i * slotW + (slotW - barW) / 2;
          const y = PDF_CHART_PLOT_H - barH;
          return (
            <Rect
              key={`${row.date}-${i}`}
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill="#3399CC"
              rx={2}
              ry={2}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", width: "100%", marginTop: 2 }}>
        {data.map((row, i) => {
          const showTick = i % interval === 0 || i === data.length - 1;
          const parts = String(row.day).split("|");
          return (
            <View key={`tl-${row.date}-${i}`} style={{ width: `${100 / n}%`, alignItems: "center" }}>
              {showTick ? (
                <Text style={styles.chartLabel}>
                  {parts[0] || ""}
                  {"\n"}
                  {parts[1] || ""}
                </Text>
              ) : (
                <Text style={[styles.chartLabel, { opacity: 0 }]}>.</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PdfBarChartHourly({ data }: { data: StatisticsReportViewProps["hourlySeries"] }) {
  const nums = data.map((d) => Number(d.visites) || 0);
  const maxY = Math.max(1, ...nums);
  const n = Math.max(1, data.length);
  const slotW = PDF_CHART_W / n;
  const barW = Math.max(1, Math.min(7, slotW * 0.65));
  const innerH = PDF_CHART_PLOT_H - 4;

  return (
    <View style={{ marginTop: 4 }}>
      <Svg width="100%" height={PDF_CHART_PLOT_H} viewBox={`0 0 ${PDF_CHART_W} ${PDF_CHART_PLOT_H}`}>
        <Line x1={0} y1={PDF_CHART_PLOT_H} x2={PDF_CHART_W} y2={PDF_CHART_PLOT_H} stroke="#d1d5db" strokeWidth={1} />
        <Line x1={0} y1={0} x2={0} y2={PDF_CHART_PLOT_H} stroke="#d1d5db" strokeWidth={1} />
        {data.map((row, i) => {
          const v = Number(row.visites) || 0;
          const hRaw = (v / maxY) * innerH;
          const barH = v > 0 ? Math.max(hRaw, 2) : 0;
          const x = i * slotW + (slotW - barW) / 2;
          const y = PDF_CHART_PLOT_H - barH;
          return (
            <Rect
              key={`${row.hour}-${i}`}
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill="hsl(38, 70%, 50%)"
              rx={1}
              ry={1}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", width: "100%", marginTop: 2 }}>
        {data.map((row, i) => {
          const showTick = i % 3 === 0;
          return (
            <View key={`h-${row.hour}-${i}`} style={{ width: `${100 / n}%`, alignItems: "center" }}>
              {showTick ? <Text style={styles.chartLabel}>{row.hour}</Text> : <Text style={[styles.chartLabel, { opacity: 0 }]}>.</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function EmojiText({ children }: { children: ReactNode }) {
  return <Text style={styles.emojiOnly}>{children}</Text>;
}

type CrossCol = StatisticsReportViewProps["crossEmotionColumns"][number];

function CrossTableChunk({
  columns,
  rows,
  t,
}: {
  columns: CrossCol[];
  rows: StatisticsReportViewProps["sortedCrossRows"];
  t: TFunction<"statistiques">;
}) {
  const colWArt = "22%";
  const emotionColCount = Math.max(1, columns.length);
  const perEmo = `${(78 / emotionColCount).toFixed(2)}%` as `${number}%`;

  return (
    <View wrap>
      <View style={styles.tableRow}>
        <View style={[styles.tableHeaderCell, { width: colWArt }]}>
          <Text>{t("cross.colArtwork")}</Text>
        </View>
        {columns.map((emotion) => (
          <View key={emotion.id} style={[styles.tableHeaderCell, { width: perEmo }]}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
              <EmojiText>{pdfEmotionEmoji(emotion.name, emotion.icon)}</EmojiText>
              <Text style={{ fontSize: 7, marginLeft: 3 }}>
                {t(`emotions.names.${normalizeEmotionKey(emotion.name)}`, { defaultValue: emotion.name })}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.artworkId} style={styles.tableRow} wrap={false}>
          <View style={[styles.tableCell, { width: colWArt }]}>
            <Text>{row.name}</Text>
          </View>
          {columns.map((emotion) => (
            <View key={`${row.artworkId}-${emotion.id}`} style={[styles.tableCell, { width: perEmo, textAlign: "center" }]}>
              <Text style={{ textAlign: "center" }}>
                {(row.counts[emotion.id] ?? 0) > 0 ? String(row.counts[emotion.id] ?? 0) : "—"}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TopTableChunk({
  rows,
  t,
  formatFrNumber,
}: {
  rows: StatisticsReportViewProps["sortedTopArtworks"];
  t: TFunction<"statistiques">;
  formatFrNumber: StatisticsReportViewProps["formatFrNumber"];
}) {
  return (
    <View wrap>
      <View style={styles.tableRow}>
        <View style={[styles.tableHeaderCell, { width: "8%" }]}>
          <Text>{t("top.colRank")}</Text>
        </View>
        <View style={[styles.tableHeaderCell, { width: "42%" }]}>
          <Text>{t("top.colArtwork")}</Text>
        </View>
        <View style={[styles.tableHeaderCell, { width: "25%", textAlign: "right" }]}>
          <Text style={{ textAlign: "right" }}>{t("top.colVisits")}</Text>
        </View>
        <View style={[styles.tableHeaderCell, { width: "25%", textAlign: "right" }]}>
          <Text style={{ textAlign: "right" }}>{t("top.colAvgHearts")}</Text>
        </View>
      </View>
      {rows.map((row, index) => (
        <View key={row.artworkId} style={styles.tableRow} wrap={false}>
          <View style={[styles.tableCell, { width: "8%", justifyContent: "center" }]}>
            <Text style={{ textAlign: "center", fontFamily: "Helvetica-Bold" }}>{index + 1}</Text>
          </View>
          <View style={[styles.tableCell, { width: "42%", flexDirection: "row", alignItems: "center" }]}>
            {row.imageUrl ? <Image src={row.imageUrl} style={{ width: 28, height: 28, borderRadius: 4, marginRight: 6 }} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7 }}>{row.title}</Text>
              <Text style={{ fontSize: 6, color: "#6b7280" }}>{row.artist}</Text>
            </View>
          </View>
          <View style={[styles.tableCell, { width: "25%" }]}>
            <Text style={{ textAlign: "right" }}>
              {formatFrNumber(row.visits)} visite(s)
            </Text>
          </View>
          <View style={[styles.tableCell, { width: "25%" }]}>
            <Text style={{ textAlign: "right" }}>
              {row.avgHearts == null
                ? "—"
                : formatFrNumber(row.avgHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatisticsPdfDocument(props: StatisticsPdfDocumentProps) {
  const {
    t,
    generatedAtLabel,
    paperFormat,
    previewAgencyLogoMeta,
    previewExpoLogoMeta,
    orgLabel,
    previewExpoLabel,
    drillExpoId,
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
  } = props;

  const pageSize = REACT_PDF_PAGE_SIZE[paperFormat] ?? "A4";
  const topSlice = sortedTopArtworks.slice(0, 40);

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        <PdfHeader
          previewAgencyLogoMeta={previewAgencyLogoMeta}
          previewExpoLogoMeta={previewExpoLogoMeta}
          orgLabel={orgLabel}
          drillExpoId={drillExpoId}
        />

        <Text
          fixed
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />

        <Text style={styles.muted}>{t("preview.generatedAt", { date: generatedAtLabel })}</Text>

        <View style={styles.card}>
          <Text style={styles.h1}>{t("preview.filtersTitle")}</Text>
          <Text style={styles.listItem}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{t("filter.organisation")} </Text>
            {orgLabel}
          </Text>
          <Text style={styles.listItem}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{t("filter.exposition")} </Text>
            {previewExpoLabel}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>{t("page.title")}</Text>
          <View style={styles.kpiGrid}>
            {miniKpis.map((k) => {
              const displayValue =
                k.label === "Émotion dominante" && k.value !== "—"
                  ? t(`emotions.names.${normalizeEmotionKey(String(k.value))}`, { defaultValue: String(k.value) })
                  : k.value;
              return (
                <View key={k.label} style={styles.kpiCell}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <Text style={styles.kpiValue}>{displayValue}</Text>
                  <Text style={styles.kpiHint}>{k.hint}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>{t("emotions.title")}</Text>
          <Text style={[styles.muted, { marginBottom: 4 }]}>{t("emotions.subtitle")}</Text>
          {feedbackTotal === 0 || emotionSeries.length === 0 ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{t("emotions.empty")}</Text>
          ) : (
            <>
              {emotionSeries.map((emo) => (
                <View key={emo.id} style={styles.emotionRow} wrap={false}>
                  <View style={{ flexDirection: "row", alignItems: "center", width: 92, flexShrink: 0, paddingRight: 4 }}>
                    <EmojiText>{pdfEmotionEmoji(emo.name, emo.icon)}</EmojiText>
                    <Text style={{ fontSize: 7, marginLeft: 4, flex: 1 }}>
                      {t(`emotions.names.${normalizeEmotionKey(emo.name)}`, { defaultValue: emo.name })}
                    </Text>
                  </View>
                  <View style={styles.emotionBarWrap}>
                    <View
                      style={{
                        width: `${emo.percentage}%`,
                        height: "100%",
                        backgroundColor: emo.color,
                        borderRadius: 4,
                      }}
                    />
                  </View>
                  <Text style={{ width: 28, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 7 }}>
                    {emo.percentage}%
                  </Text>
                </View>
              ))}
              <Text style={[styles.muted, { marginTop: 6 }]}>{t("preview.totalFeedbacks", { count: feedbackTotal })}</Text>
            </>
          )}
        </View>

        <View break />

        <View style={styles.card}>
          <Text style={styles.h2}>{t("timeline.title")}</Text>
          {temporalSeriesForPdf.length === 0 ? (
            <Text style={{ fontSize: 8, color: "#6b7280", textAlign: "center", marginVertical: 12 }}>
              {t("common.chartNoData")}
            </Text>
          ) : (
            <PdfBarChartTemporal data={temporalSeriesForPdf} timelineTickIntervalPdf={timelineTickIntervalPdf} />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>{t("hourly.title")}</Text>
          <Text style={[styles.muted, { marginBottom: 4 }]}>{t("hourly.subtitle")}</Text>
          {hourlySeries.length === 0 ? (
            <Text style={{ fontSize: 8, color: "#6b7280", textAlign: "center", marginVertical: 12 }}>
              {t("common.chartNoData")}
            </Text>
          ) : (
            <PdfBarChartHourly data={hourlySeries} />
          )}
        </View>

        <View break />

        <View style={styles.card}>
          <Text style={styles.h2}>{t("cross.title")}</Text>
          <Text style={[styles.muted, { marginBottom: 4 }]}>{t("cross.subtitle")}</Text>
          {crossError ? (
            <Text style={{ fontSize: 8, color: "#b91c1c" }}>{crossError}</Text>
          ) : sortedCrossRows.length === 0 ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{t("cross.empty")}</Text>
          ) : (
            <CrossTableChunk columns={crossEmotionColumns} rows={sortedCrossRows} t={t} />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>{t("top.title")}</Text>
          <Text style={[styles.muted, { marginBottom: 4 }]}>{t("top.subtitle")}</Text>
          {topArtworksError ? (
            <Text style={{ fontSize: 8, color: "#b91c1c" }}>{topArtworksError}</Text>
          ) : topSlice.length === 0 ? (
            <Text style={{ fontSize: 8, color: "#6b7280" }}>{t("top.empty")}</Text>
          ) : (
            <TopTableChunk rows={topSlice} t={t} formatFrNumber={formatFrNumber} />
          )}
        </View>
      </Page>
    </Document>
  );
}
