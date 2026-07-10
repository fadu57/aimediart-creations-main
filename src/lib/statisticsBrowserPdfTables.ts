import type { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CellHookData } from "jspdf-autotable";
import type { PdfPaperFormat } from "@/lib/statisticsPrintExport";

export type StatisticsPdfCrossTableData = {
  title: string;
  subtitle: string;
  errorText: string | null;
  emptyText: string;
  artworkHeader: string;
  columns: Array<{ id: string; emoji: string; label: string }>;
  rows: Array<{ name: string; counts: Record<string, number> }>;
};

export type StatisticsPdfTopTableData = {
  title: string;
  subtitle: string;
  errorText: string | null;
  emptyText: string;
  rankHeader: string;
  artworkHeader: string;
  visitsHeader: string;
  avgHeartsHeader: string;
  rows: Array<{
    rank: number;
    title: string;
    artist: string;
    visits: string;
    avgHearts: string;
    imageUrl: string | null;
  }>;
};

export type StatisticsPdfGeographyTableData = {
  title: string;
  disclaimer: string;
  mapHint: string;
  errorText: string | null;
  emptyText: string;
  visitorHeader: string;
  pseudoHeader: string;
  cityHeader: string;
  countryHeader: string;
  regionHeader: string;
  mapImage: { dataUrl: string; format: "JPEG" | "PNG"; widthPx: number; heightPx: number } | null;
  rows: Array<{
    label: string;
    pseudo: string;
    city: string;
    country: string;
    region: string;
  }>;
};

export type StatisticsPdfExportTables = {
  cross: StatisticsPdfCrossTableData;
  top: StatisticsPdfTopTableData;
  geography: StatisticsPdfGeographyTableData;
};

export type PdfTableLayout = {
  paperFormat: PdfPaperFormat;
  pageWidth: number;
  pageHeight: number;
  marginMm: number;
  contentWidthMm: number;
  headerBlockMm: number;
  footerBlockMm: number;
  brandDataUrl: string | null;
  brandFormat: "JPEG" | "PNG";
  brandHeightMm: number;
};

type ImageAsset = { dataUrl: string; format: "JPEG" | "PNG" };

const TABLE_STYLES = {
  font: "helvetica",
  fontSize: 8,
  cellPadding: 1.8,
  lineColor: [209, 213, 219] as [number, number, number],
  lineWidth: 0.15,
  textColor: [38, 38, 38] as [number, number, number],
};

const HEAD_STYLES = {
  fillColor: [245, 245, 245] as [number, number, number],
  textColor: [23, 23, 23] as [number, number, number],
  fontStyle: "bold" as const,
  halign: "center" as const,
};

const EMOJI_FONT =
  '48px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

const THUMB_MM = 10;
const THUMB_PAD_MM = 1.2;

async function renderEmojiDataUrl(emoji: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = EMOJI_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2 + 2);
  return canvas.toDataURL("image/png");
}

async function loadImageAsset(url: string | null | undefined): Promise<ImageAsset | null> {
  const src = url?.trim();
  if (!src) return null;

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = src;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    try {
      return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), format: "JPEG" };
    } catch {
      return { dataUrl: canvas.toDataURL("image/png"), format: "PNG" };
    }
  } catch {
    return null;
  }
}

async function buildEmojiCache(emojis: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(emojis.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (emoji) => [emoji, await renderEmojiDataUrl(emoji)] as const),
  );
  return new Map(entries.filter(([, dataUrl]) => dataUrl.length > 0));
}

async function buildArtworkImageCache(
  rows: StatisticsPdfTopTableData["rows"],
): Promise<Map<number, ImageAsset>> {
  const entries = await Promise.all(
    rows.map(async (row) => {
      const asset = await loadImageAsset(row.imageUrl);
      return asset ? ([row.rank, asset] as const) : null;
    }),
  );
  return new Map(entries.filter((entry): entry is [number, ImageAsset] => entry !== null));
}

function drawBrandHeader(pdf: jsPDF, layout: PdfTableLayout): void {
  if (!layout.brandDataUrl) return;
  pdf.addImage(
    layout.brandDataUrl,
    layout.brandFormat,
    layout.marginMm,
    layout.marginMm,
    layout.contentWidthMm,
    layout.brandHeightMm,
  );
}

function drawSectionIntro(
  pdf: jsPDF,
  layout: PdfTableLayout,
  title: string,
  subtitle: string,
): number {
  const x = layout.marginMm;
  let y = layout.marginMm + layout.headerBlockMm + 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(23, 23, 23);
  pdf.text(title, x, y);
  y += 5;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(82, 82, 82);
  const lines = pdf.splitTextToSize(subtitle, layout.contentWidthMm) as string[];
  pdf.text(lines, x, y);
  y += lines.length * 3.8 + 2;

  return y;
}

function drawPlainMessage(pdf: jsPDF, layout: PdfTableLayout, message: string, startY: number): void {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(82, 82, 82);
  pdf.text(message, layout.marginMm, startY);
}

function startTableSectionPage(pdf: jsPDF, layout: PdfTableLayout): void {
  pdf.addPage(layout.paperFormat, "portrait");
  drawBrandHeader(pdf, layout);
}

function drawCrossHeadEmoji(data: CellHookData, emojiCache: Map<string, string>, columns: StatisticsPdfCrossTableData["columns"]): void {
  if (data.section !== "head" || data.row.index !== 0 || data.column.index === 0) return;
  const column = columns[data.column.index - 1];
  if (!column) return;
  const emojiDataUrl = emojiCache.get(column.emoji);
  if (!emojiDataUrl) return;

  const size = 3.8;
  const x = data.cell.x + data.cell.width / 2 - size / 2;
  const y = data.cell.y + 1.2;
  data.doc.addImage(emojiDataUrl, "PNG", x, y, size, size);
}

function drawTopArtworkThumb(
  data: CellHookData,
  imageCache: Map<number, ImageAsset>,
  rows: StatisticsPdfTopTableData["rows"],
): void {
  if (data.section !== "body" || data.column.index !== 1) return;
  const row = rows[data.row.index];
  if (!row) return;
  const asset = imageCache.get(row.rank);
  if (!asset) return;

  const y = data.cell.y + (data.cell.height - THUMB_MM) / 2;
  data.doc.addImage(
    asset.dataUrl,
    asset.format,
    data.cell.x + THUMB_PAD_MM,
    y,
    THUMB_MM,
    THUMB_MM,
  );
}

function renderCrossTable(
  pdf: jsPDF,
  layout: PdfTableLayout,
  data: StatisticsPdfCrossTableData,
  emojiCache: Map<string, string>,
): void {
  startTableSectionPage(pdf, layout);
  const startY = drawSectionIntro(pdf, layout, data.title, data.subtitle);

  if (data.errorText) {
    drawPlainMessage(pdf, layout, data.errorText, startY);
    return;
  }
  if (data.rows.length === 0) {
    drawPlainMessage(pdf, layout, data.emptyText, startY);
    return;
  }

  const head = [
    ["", ...data.columns.map(() => "")],
    [data.artworkHeader, ...data.columns.map((col) => col.label)],
  ];
  const body = data.rows.map((row) => [
    row.name,
    ...data.columns.map((col) => {
      const value = row.counts[col.id] ?? 0;
      return value > 0 ? String(value) : "—";
    }),
  ]);

  const emotionColCount = data.columns.length;
  const artworkWidth = Math.min(52, layout.contentWidthMm * 0.28);
  const emotionWidth =
    emotionColCount > 0 ? (layout.contentWidthMm - artworkWidth) / emotionColCount : layout.contentWidthMm;

  autoTable(pdf, {
    head,
    body,
    startY,
    tableWidth: layout.contentWidthMm,
    margin: {
      top: layout.marginMm + layout.headerBlockMm,
      right: layout.marginMm,
      bottom: layout.marginMm + layout.footerBlockMm,
      left: layout.marginMm,
    },
    showHead: "everyPage",
    horizontalPageBreak: emotionColCount > 6,
    horizontalPageBreakRepeat: 2,
    styles: {
      ...TABLE_STYLES,
      overflow: "linebreak",
      cellWidth: "wrap",
    },
    headStyles: {
      ...HEAD_STYLES,
      minCellHeight: 8,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: artworkWidth, fontStyle: "bold" },
      ...Object.fromEntries(
        data.columns.map((_, index) => [
          index + 1,
          { halign: "center", cellWidth: emotionWidth },
        ]),
      ),
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    didDrawPage: () => {
      drawBrandHeader(pdf, layout);
    },
    didDrawCell: (cellData) => {
      drawCrossHeadEmoji(cellData, emojiCache, data.columns);
    },
  });
}

function renderTopTable(
  pdf: jsPDF,
  layout: PdfTableLayout,
  data: StatisticsPdfTopTableData,
  imageCache: Map<number, ImageAsset>,
): void {
  startTableSectionPage(pdf, layout);
  const startY = drawSectionIntro(pdf, layout, data.title, data.subtitle);

  if (data.errorText) {
    drawPlainMessage(pdf, layout, data.errorText, startY);
    return;
  }
  if (data.rows.length === 0) {
    drawPlainMessage(pdf, layout, data.emptyText, startY);
    return;
  }

  const head = [[data.rankHeader, data.artworkHeader, data.visitsHeader, data.avgHeartsHeader]];
  const body = data.rows.map((row) => [
    String(row.rank),
    `${row.title}\n${row.artist}`,
    row.visits,
    row.avgHearts,
  ]);

  const rankWidth = 14;
  const visitsWidth = 32;
  const avgWidth = 22;
  const artworkWidth = layout.contentWidthMm - rankWidth - visitsWidth - avgWidth;
  const artworkTextPad = THUMB_MM + THUMB_PAD_MM * 2;

  autoTable(pdf, {
    head,
    body,
    startY,
    tableWidth: layout.contentWidthMm,
    margin: {
      top: layout.marginMm + layout.headerBlockMm,
      right: layout.marginMm,
      bottom: layout.marginMm + layout.footerBlockMm,
      left: layout.marginMm,
    },
    showHead: "everyPage",
    styles: {
      ...TABLE_STYLES,
      overflow: "linebreak",
      cellWidth: "wrap",
      minCellHeight: THUMB_MM + 2,
    },
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { halign: "center", cellWidth: rankWidth },
      1: {
        halign: "left",
        cellWidth: artworkWidth,
        cellPadding: { top: 2, bottom: 2, left: artworkTextPad, right: 2 },
      },
      2: { halign: "right", cellWidth: visitsWidth },
      3: { halign: "right", cellWidth: avgWidth },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    didDrawPage: () => {
      drawBrandHeader(pdf, layout);
    },
    didDrawCell: (cellData) => {
      drawTopArtworkThumb(cellData, imageCache, data.rows);
    },
  });
}

function renderGeographyTable(
  pdf: jsPDF,
  layout: PdfTableLayout,
  data: StatisticsPdfGeographyTableData,
): void {
  startTableSectionPage(pdf, layout);
  let startY = drawSectionIntro(pdf, layout, data.title, "");

  if (data.disclaimer.trim()) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 100, 100);
    const disclaimerLines = pdf.splitTextToSize(data.disclaimer, layout.contentWidthMm) as string[];
    pdf.text(disclaimerLines, layout.marginMm, startY);
    startY += disclaimerLines.length * 3.2 + 2;
  }

  if (data.mapImage && data.mapImage.widthPx > 0 && data.mapImage.heightPx > 0) {
    const mapDrawHeightMm = Math.min(
      80,
      (data.mapImage.heightPx * layout.contentWidthMm) / data.mapImage.widthPx,
    );
    pdf.addImage(
      data.mapImage.dataUrl,
      data.mapImage.format,
      layout.marginMm,
      startY,
      layout.contentWidthMm,
      mapDrawHeightMm,
    );
    startY += mapDrawHeightMm + 4;
  }

  if (data.mapHint.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(82, 82, 82);
    pdf.text(data.mapHint, layout.marginMm, startY);
    startY += 5;
  }

  if (data.errorText) {
    drawPlainMessage(pdf, layout, data.errorText, startY);
    return;
  }
  if (data.rows.length === 0) {
    drawPlainMessage(pdf, layout, data.emptyText, startY);
    return;
  }

  const head = [[
    data.visitorHeader,
    data.pseudoHeader,
    data.cityHeader,
    data.countryHeader,
    data.regionHeader,
  ]];
  const body = data.rows.map((row) => [
    row.label,
    row.pseudo,
    row.city,
    row.country,
    row.region,
  ]);

  const visitorWidth = layout.contentWidthMm * 0.22;
  const pseudoWidth = layout.contentWidthMm * 0.18;
  const cityWidth = layout.contentWidthMm * 0.22;
  const countryWidth = layout.contentWidthMm * 0.18;
  const regionWidth = layout.contentWidthMm - visitorWidth - pseudoWidth - cityWidth - countryWidth;

  autoTable(pdf, {
    head,
    body,
    startY,
    tableWidth: layout.contentWidthMm,
    margin: {
      top: layout.marginMm + layout.headerBlockMm,
      right: layout.marginMm,
      bottom: layout.marginMm + layout.footerBlockMm,
      left: layout.marginMm,
    },
    showHead: "everyPage",
    styles: {
      ...TABLE_STYLES,
      overflow: "linebreak",
      cellWidth: "wrap",
    },
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { halign: "left", cellWidth: visitorWidth },
      1: { halign: "left", cellWidth: pseudoWidth },
      2: { halign: "left", cellWidth: cityWidth },
      3: { halign: "left", cellWidth: countryWidth },
      4: { halign: "left", cellWidth: regionWidth },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    didDrawPage: () => {
      drawBrandHeader(pdf, layout);
    },
  });
}

export async function appendVectorTablesToPdf(
  pdf: jsPDF,
  layout: PdfTableLayout,
  tables: StatisticsPdfExportTables,
): Promise<void> {
  const emojiCache = await buildEmojiCache(tables.cross.columns.map((col) => col.emoji));
  const imageCache = await buildArtworkImageCache(tables.top.rows);

  renderCrossTable(pdf, layout, tables.cross, emojiCache);
  renderTopTable(pdf, layout, tables.top, imageCache);
  renderGeographyTable(pdf, layout, tables.geography);
}
