/**
 * Template rapport PDF dédié — indépendant du dashboard écran.
 * Paginations logiques : p.1 périmètre+KPI+émotions, p.2 tendances+horaires, puis tableaux.
 */
import type { StatisticsReportViewProps } from "@/components/statistics/StatisticsReportView";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Heart, Image, Smile } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { normalizeEmotionKey, emotionEmojiForPreview } from "@/lib/statisticsEmotions";
import "./statistics-pdf-document.css";

type Props = StatisticsReportViewProps;

export function StatisticsPdfReport(props: Props) {
  const { t, i18n } = useTranslation("statistiques");
  const pdfExportDebug = props.pdfExportDebug === true;
  const {
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
  } = props;

  const [isReady, setIsReady] = useState(false);

  /** Après résolution des polices — ok même sans données (périmètre vide). */
  useEffect(() => {
    let cancelled = false;
    setIsReady(false);

    void document.fonts.ready
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        setIsReady(true);
        console.log("[PDF] export ready flag set to true");
      });

    return () => {
      cancelled = true;
    };
  }, [
    feedbackTotal,
    temporalSeriesForPdf.length,
    hourlySeries.length,
    sortedCrossRows.length,
    sortedTopArtworks.length,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      console.warn("[PDF] forced ready after timeout");
      setIsReady(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!pdfExportDebug) return;
    console.log("[PDF] step StatisticsPdfReport: montage du template");
  }, [pdfExportDebug]);

  useEffect(() => {
    if (!pdfExportDebug) return;
    console.log("[PDF] step StatisticsPdfReport: snapshot données / rendu", {
      feedbackTotal,
      temporalPoints: temporalSeriesForPdf.length,
      hourlyPoints: hourlySeries.length,
      emotionRows: emotionSeries.length,
      crossRows: sortedCrossRows.length,
      topArtworks: sortedTopArtworks.length,
      crossError: crossError ? "(erreur)" : null,
      topArtworksError: topArtworksError ? "(erreur)" : null,
    });
  }, [
    pdfExportDebug,
    feedbackTotal,
    temporalSeriesForPdf.length,
    hourlySeries.length,
    emotionSeries.length,
    sortedCrossRows.length,
    sortedTopArtworks.length,
    crossError,
    topArtworksError,
  ]);

  return (
    <div
      id="statistics-print-area"
      data-statistics-export-ready={isReady ? "true" : "false"}
      className="statistics-pdf-document statistics-pdf-sans"
    >
      {/* Images pour métadonnées / debug éventuel */}
      <div className="statistics-pdf-logo-probes" aria-hidden>
        {previewAgencyLogoMeta.logoUrl ? (
          <img data-pdf-logo="agency" src={previewAgencyLogoMeta.logoUrl} alt="" referrerPolicy="no-referrer" />
        ) : null}
        {previewExpoLogoMeta.logoUrl ? (
          <img data-pdf-logo="expo" src={previewExpoLogoMeta.logoUrl} alt="" referrerPolicy="no-referrer" />
        ) : null}
      </div>

      {/* Page 1 */}
      <section className="statistics-pdf-page statistics-pdf-page--after">
        <p className="statistics-pdf-muted" style={{ marginBottom: "0.75rem" }}>
          {t("preview.generatedAt", { date: new Date().toLocaleString(i18n.language) })}
        </p>

        <div className="statistics-pdf-card">
          <h2 className="statistics-pdf-h1">{t("preview.filtersTitle")}</h2>
          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem" }}>
            <li>
              <span style={{ fontWeight: 600 }}>{t("filter.organisation")}</span> {orgLabel}
            </li>
            <li>
              <span style={{ fontWeight: 600 }}>{t("filter.exposition")}</span> {previewExpoLabel}
            </li>
          </ul>
        </div>

        <div className="statistics-pdf-card">
          <h2 className="statistics-pdf-h2">{t("page.title")}</h2>
          <div className="statistics-pdf-kpi-grid" style={{ marginTop: "0.65rem" }}>
            {miniKpis.map((k) => (
              <div key={k.label} className="statistics-pdf-kpi-cell">
                <k.icon style={{ width: 18, height: 18, color: "#E63946", margin: "0 auto 4px" }} aria-hidden />
                <div className="statistics-pdf-kpi-label">{k.label}</div>
                <div className="statistics-pdf-kpi-value">
                  {k.label === "Émotion dominante" && k.value !== "—"
                    ? t(`emotions.names.${normalizeEmotionKey(String(k.value))}`, { defaultValue: String(k.value) })
                    : k.value}
                </div>
                <div className="statistics-pdf-muted" style={{ marginTop: 4 }}>
                  {k.hint}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="statistics-pdf-card">
          <h2 className="statistics-pdf-h2">{t("emotions.title")}</h2>
          <p className="statistics-pdf-muted" style={{ marginBottom: "0.5rem" }}>
            {t("emotions.subtitle")}
          </p>
          {feedbackTotal === 0 || emotionSeries.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>{t("emotions.empty")}</p>
          ) : (
            <>
              <div style={{ marginTop: "0.35rem" }}>
                {emotionSeries.map((emo) => (
                  <div key={emo.id} className="statistics-pdf-emotion-row">
                    <span style={{ width: "1.5rem", textAlign: "center" }} aria-hidden>
                      {emotionEmojiForPreview(emo.name, emo.icon)}
                    </span>
                    <span style={{ width: "6rem", flexShrink: 0, fontSize: "0.72rem" }}>
                      {t(`emotions.names.${normalizeEmotionKey(emo.name)}`, { defaultValue: emo.name })}
                    </span>
                    <div className="statistics-pdf-emotion-bar">
                      <div style={{ height: "100%", width: `${emo.percentage}%`, backgroundColor: emo.color, borderRadius: 999 }} />
                    </div>
                    <span style={{ width: "2.25rem", textAlign: "right", fontWeight: 700, fontSize: "0.72rem" }}>{emo.percentage}%</span>
                  </div>
                ))}
              </div>
              <p className="statistics-pdf-muted" style={{ marginTop: "0.45rem" }}>
                {t("preview.totalFeedbacks", { count: feedbackTotal })}
              </p>
            </>
          )}
        </div>
      </section>

      {/* Page 2 — graphiques */}
      <section className="statistics-pdf-page statistics-pdf-page--before statistics-pdf-page--after">
        <div className="statistics-pdf-chart-grid">
          <div className="statistics-pdf-card">
            <h2 className="statistics-pdf-h2">{t("timeline.title")}</h2>
            {temporalSeriesForPdf.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#6b7280", textAlign: "center", padding: "1.5rem 0" }}>
                {t("common.chartNoData")}
              </p>
            ) : (
              <div className="statistics-pdf-chart-host" data-statistics-chart-slot="timeline">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={temporalSeriesForPdf} margin={{ top: 8, right: 8, left: 4, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                    <XAxis
                      dataKey="day"
                      interval={timelineTickIntervalPdf}
                      tick={({ x, y, payload }) => {
                        const raw = String(payload?.value ?? "");
                        const [weekday, dayMonth] = raw.split("|");
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={0} y={0} textAnchor="middle" fill="currentColor" fontSize={9}>
                              <tspan x={0} dy="0.71em">
                                {weekday || ""}
                              </tspan>
                              <tspan x={0} dy="1.05em">
                                {dayMonth || ""}
                              </tspan>
                            </text>
                          </g>
                        );
                      }}
                      height={40}
                    />
                    <YAxis tick={{ fill: "currentColor", fontSize: 10 }} width={32} />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="visites" name="Visites" fill="#3399CC" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="statistics-pdf-card">
            <h2 className="statistics-pdf-h2">{t("hourly.title")}</h2>
            <p className="statistics-pdf-muted" style={{ marginBottom: "0.35rem" }}>
              {t("hourly.subtitle")}
            </p>
            {hourlySeries.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#6b7280", textAlign: "center", padding: "1.5rem 0" }}>
                {t("common.chartNoData")}
              </p>
            ) : (
              <div className="statistics-pdf-chart-host" data-statistics-chart-slot="hourly">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlySeries} margin={{ top: 8, right: 8, left: 4, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                    <XAxis dataKey="hour" tick={{ fill: "currentColor", fontSize: 9 }} interval={2} />
                    <YAxis tick={{ fill: "currentColor", fontSize: 10 }} width={32} />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="visites" name="Visites" fill="hsl(38, 70%, 50%)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tableaux — peuvent occuper plusieurs pages ; thead répété */}
      <section className="statistics-pdf-page statistics-pdf-page--before">
        <div className="statistics-pdf-card">
          <h2 className="statistics-pdf-h2">{t("cross.title")}</h2>
          <p className="statistics-pdf-muted" style={{ marginBottom: "0.5rem" }}>
            {t("cross.subtitle")}
          </p>
          {crossError ? (
            <p style={{ fontSize: "0.8rem", color: "#b91c1c" }}>{crossError}</p>
          ) : sortedCrossRows.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>{t("cross.empty")}</p>
          ) : (
            <div className="statistics-pdf-table-wrap">
              <table className="statistics-pdf-table">
                <thead>
                  <tr>
                    <th>{t("cross.colArtwork")}</th>
                    {crossEmotionColumns.map((emotion) => (
                      <th key={emotion.id} className="text-center">
                        <span style={{ marginRight: 2 }} aria-hidden>
                          {emotionEmojiForPreview(emotion.name, emotion.icon)}
                        </span>
                        <span style={{ display: "inline-block", maxWidth: "4rem", lineHeight: 1.15, verticalAlign: "middle" }}>
                          {t(`emotions.names.${normalizeEmotionKey(emotion.name)}`, { defaultValue: emotion.name })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCrossRows.map((row) => (
                    <tr key={row.artworkId}>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      {crossEmotionColumns.map((emotion) => (
                        <td key={`${row.artworkId}-${emotion.id}`} className="text-center tabular-nums">
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

        <div className="statistics-pdf-card">
          <h2 className="statistics-pdf-h2">{t("top.title")}</h2>
          <p className="statistics-pdf-muted" style={{ marginBottom: "0.5rem" }}>
            {t("top.subtitle")}
          </p>
          {topArtworksError ? (
            <p style={{ fontSize: "0.8rem", color: "#b91c1c" }}>{topArtworksError}</p>
          ) : sortedTopArtworks.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>{t("top.empty")}</p>
          ) : (
            <div className="statistics-pdf-table-wrap">
              <table className="statistics-pdf-table">
                <thead>
                  <tr>
                    <th>{t("top.colRank")}</th>
                    <th>{t("top.colArtwork")}</th>
                    <th className="text-right">{t("top.colVisits")}</th>
                    <th className="text-right">{t("top.colAvgHearts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTopArtworks.slice(0, 40).map((row, index) => (
                    <tr key={row.artworkId}>
                      <td>
                        <div
                          style={{
                            display: "inline-flex",
                            width: 28,
                            height: 28,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 999,
                            background: "rgba(230,57,70,0.15)",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                          }}
                        >
                          {index + 1}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              flexShrink: 0,
                              borderRadius: 8,
                              overflow: "hidden",
                              border: "1px solid #e5e7eb",
                              background: "#f3f4f6",
                            }}
                          >
                            {row.imageUrl ? (
                              <img src={row.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
                            ) : null}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
                            <div className="statistics-pdf-muted" style={{ fontSize: "0.65rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row.artist}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{formatFrNumber(row.visits)} visite(s)</td>
                      <td className="text-right tabular-nums">
                        {row.avgHearts == null ? "—" : formatFrNumber(row.avgHearts, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
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
