/**
 * Export PDF statistiques côté navigateur (html-to-image + jsPDF).
 * Sections graphiques en capture ; tableaux en rendu vectoriel (autoTable).
 */
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";
import { PDF_FORMAT_CSS_PAGE, type PdfPaperFormat } from "@/lib/statisticsPrintExport";
import {
  appendVectorTablesToPdf,
  type StatisticsPdfExportTables,
  type PdfTableLayout,
} from "@/lib/statisticsBrowserPdfTables";

const READY_ATTR = "data-statistics-export-ready";
const READY_TIMEOUT_MS = 35_000;
const EXPORT_ATTR = "data-statistics-pdf-export";
const IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const FOOTER_FONT_SIZE_PT = 8;
const FOOTER_TEXT_RGB: [number, number, number] = [115, 115, 115];

export type StatisticsPdfExportPhase =
  | "waiting"
  | "prepare"
  | "capture_header"
  | "capture_sections"
  | "capture_tables"
  | "build_pdf"
  | "finish";

export type StatisticsPdfExportProgress = {
  percent: number;
  phase: StatisticsPdfExportPhase;
  current?: number;
  total?: number;
};

export type StatisticsPdfExportProgressHandler = (progress: StatisticsPdfExportProgress) => void;

export type { StatisticsPdfExportTables } from "@/lib/statisticsBrowserPdfTables";

export type StatisticsPdfFilenameInput = {
  /** Code i18n (ex. `fr`, `en-US`) → segment fichier `FR`, `EN`, etc. */
  language: string;
  expoName: string;
  artistFirstName?: string | null;
  artistLastName?: string | null;
  date?: Date;
};

/** Langue du rapport PDF : FR, EN, DE, ES, IT (2 lettres majuscules). */
export function statisticsPdfLangTag(language: string): string {
  const base = language.split("-")[0]?.trim().toLowerCase() ?? "fr";
  const known: Record<string, string> = {
    fr: "FR",
    en: "EN",
    de: "DE",
    es: "ES",
    it: "IT",
  };
  return known[base] ?? (base.slice(0, 2).toUpperCase() || "FR");
}

function slugifyPdfNameSegment(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Nom suggéré : YYYYMMDD-stat-[LANG]-[expo] ou …-prenom-nom si filtre artiste. */
export function buildStatisticsPdfFilename(input: StatisticsPdfFilenameInput): string {
  const d = input.date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const lang = statisticsPdfLangTag(input.language);
  const expoSlug = slugifyPdfNameSegment(input.expoName) || "expo";
  const first = slugifyPdfNameSegment(input.artistFirstName ?? "");
  const last = slugifyPdfNameSegment(input.artistLastName ?? "");
  const artistPart =
    first || last ? `-${[first, last].filter(Boolean).join("-")}` : "";
  return `${y}${m}${day}-stat-${lang}-${expoSlug}${artistPart}.pdf`;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

/** Enregistre le PDF : boîte « Enregistrer sous » (File System Access API) ou téléchargement classique. */
async function savePdfDocument(pdf: jsPDF, suggestedFilename: string): Promise<void> {
  const name = suggestedFilename.endsWith(".pdf")
    ? suggestedFilename
    : `${suggestedFilename}.pdf`;
  const blob = pdf.output("blob") as Blob;
  const win = window as SaveFilePickerWindow;

  if (typeof win.showSaveFilePicker === "function") {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "PDF",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("save-aborted");
      }
    }
  }

  pdf.save(name);
}

function waitForStatisticsReportReady(root: HTMLElement, timeoutMs = READY_TIMEOUT_MS): Promise<void> {
  if (root.getAttribute(READY_ATTR) === "true") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (root.getAttribute(READY_ATTR) === "true") {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("timeout-ready"));
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

function shouldCaptureNode(node: HTMLElement): boolean {
  if (node.classList?.contains("recharts-tooltip-wrapper")) return false;
  if (node.getAttribute("role") === "tooltip") return false;
  if (node.classList.contains("statistics-report-brand")) return false;
  if (node.classList.contains("statistics-report-generated-at")) return false;
  if (node.classList.contains("statistics-report-page--tables")) return false;
  return true;
}

function canvasHeightMm(canvas: HTMLCanvasElement, widthMm: number): number {
  return (canvas.height * widthMm) / canvas.width;
}

async function nextPaint(delayMs = 0): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  if (delayMs > 0) {
    await new Promise<void>((r) => window.setTimeout(r, delayMs));
  }
}

async function captureElement(element: HTMLElement, pixelRatio = 1.5): Promise<HTMLCanvasElement> {
  const options = {
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
    imagePlaceholder: IMAGE_PLACEHOLDER,
    filter: (node: Node) => {
      if (!(node instanceof HTMLElement)) return true;
      return shouldCaptureNode(node);
    },
  };

  try {
    return await toCanvas(element, options);
  } catch (firstError) {
    try {
      return await toCanvas(element, { ...options, pixelRatio: 1, skipFonts: true });
    } catch {
      if (firstError instanceof Error) throw firstError;
      throw new Error("capture-failed");
    }
  }
}

function drawStatisticsPdfFooter(
  pdf: jsPDF,
  pageWidth: number,
  marginMm: number,
  footerY: number,
  generatedText: string,
  pageNumber: number,
  totalPages: number,
): void {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(FOOTER_FONT_SIZE_PT);
  pdf.setTextColor(...FOOTER_TEXT_RGB);

  if (generatedText) {
    pdf.text(generatedText, marginMm, footerY);
  }

  const pageLabel = `${pageNumber} / ${totalPages}`;
  pdf.text(pageLabel, pageWidth - marginMm, footerY, { align: "right" });
}

function canvasToDataUrl(canvas: HTMLCanvasElement): { dataUrl: string; format: "JPEG" | "PNG" } {
  try {
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), format: "JPEG" };
  } catch {
    return { dataUrl: canvas.toDataURL("image/png"), format: "PNG" };
  }
}

function unlockScrollAncestors(element: HTMLElement): () => void {
  const restored: Array<{ node: HTMLElement; overflow: string; maxHeight: string; height: string }> =
    [];
  let node: HTMLElement | null = element.parentElement;
  while (node && node !== document.body) {
    restored.push({
      node,
      overflow: node.style.overflow,
      maxHeight: node.style.maxHeight,
      height: node.style.height,
    });
    node.style.overflow = "visible";
    node.style.maxHeight = "none";
    node.style.height = "auto";
    node = node.parentElement;
  }
  return () => {
    restored.forEach(({ node: n, overflow, maxHeight, height }) => {
      n.style.overflow = overflow;
      n.style.maxHeight = maxHeight;
      n.style.height = height;
    });
  };
}

function stampFootersOnAllPages(
  pdf: jsPDF,
  pageWidth: number,
  marginMm: number,
  footerY: number,
  generatedText: string,
): void {
  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawStatisticsPdfFooter(pdf, pageWidth, marginMm, footerY, generatedText, page, totalPages);
  }
}

/**
 * Capture le bloc rapport et enregistre un PDF multipage (jsPDF) via la boîte système.
 */
export async function generateStatisticsBrowserPdf(
  root: HTMLElement,
  paperFormat: PdfPaperFormat,
  suggestedFilename: string,
  onProgress?: StatisticsPdfExportProgressHandler,
  tables?: StatisticsPdfExportTables,
): Promise<void> {
  const report = (progress: StatisticsPdfExportProgress) => {
    onProgress?.(progress);
  };

  report({ percent: 2, phase: "waiting" });
  await waitForStatisticsReportReady(root);

  const prevMaxHeight = root.style.maxHeight;
  const prevOverflow = root.style.overflow;
  const prevWidth = root.style.width;
  const hadExportAttr = root.hasAttribute(EXPORT_ATTR);

  const brandEl = root.querySelector<HTMLElement>(".statistics-report-brand");
  const generatedText =
    root.querySelector<HTMLElement>(".statistics-report-generated-at")?.textContent?.trim() ?? "";

  report({ percent: 8, phase: "capture_header" });
  const brandCanvas = brandEl ? await captureElement(brandEl, 2) : null;

  root.style.maxHeight = "none";
  root.style.overflow = "visible";
  root.style.width = `${root.scrollWidth}px`;
  root.setAttribute(EXPORT_ATTR, "true");

  const brandEls = Array.from(root.querySelectorAll<HTMLElement>(".statistics-report-brand"));
  const generatedEls = Array.from(root.querySelectorAll<HTMLElement>(".statistics-report-generated-at"));
  const tableSections = Array.from(root.querySelectorAll<HTMLElement>(".statistics-report-page--tables"));
  const prevBrandDisplay = brandEls.map((el) => el.style.display);
  const prevGeneratedDisplay = generatedEls.map((el) => el.style.display);
  const prevTableDisplay = tableSections.map((el) => el.style.display);

  brandEls.forEach((el) => {
    el.style.display = "none";
  });
  generatedEls.forEach((el) => {
    el.style.display = "none";
  });
  tableSections.forEach((el) => {
    el.style.display = "none";
  });

  const restoreAncestors = unlockScrollAncestors(root);

  try {
    report({ percent: 15, phase: "prepare" });
    root.scrollTop = 0;
    await nextPaint(150);

    const reportRoot =
      root.querySelector<HTMLElement>(".statistics-report-root") ?? root;

    report({ percent: 25, phase: "capture_sections" });
    await nextPaint(50);
    const canvas = await captureElement(reportRoot, 1.5);

    report({ percent: 45, phase: "build_pdf" });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: paperFormat });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginMm = 10;
    const contentWidthMm = pageWidth - marginMm * 2;
    const brandHeightMm = brandCanvas ? canvasHeightMm(brandCanvas, contentWidthMm) : 0;
    const headerGapMm = brandCanvas ? 2 : 0;
    const headerBlockMm = brandHeightMm + headerGapMm;
    const footerBlockMm = 8;
    const contentHeightMm = pageHeight - marginMm * 2 - headerBlockMm - footerBlockMm;
    const brandImage = brandCanvas ? canvasToDataUrl(brandCanvas) : null;
    const footerY = pageHeight - marginMm;

    if (canvas.height > 4) {
      const fullImgHeightMm = (canvas.height * contentWidthMm) / canvas.width;
      const pageCanvasHeightPx = Math.max(
        1,
        Math.floor((contentHeightMm / fullImgHeightMm) * canvas.height),
      );

      let renderedPx = 0;
      let pageIndex = 0;

      while (renderedPx < canvas.height) {
        if (pageIndex > 0) pdf.addPage(paperFormat, "portrait");

        const slicePx = Math.min(pageCanvasHeightPx, canvas.height - renderedPx);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = slicePx;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) throw new Error("canvas-2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);

        const { dataUrl, format } = canvasToDataUrl(pageCanvas);
        const sliceHeightMm = (slicePx * contentWidthMm) / canvas.width;
        const contentY = marginMm + headerBlockMm;

        if (brandImage) {
          pdf.addImage(
            brandImage.dataUrl,
            brandImage.format,
            marginMm,
            marginMm,
            contentWidthMm,
            brandHeightMm,
          );
        }

        pdf.addImage(dataUrl, format, marginMm, contentY, contentWidthMm, sliceHeightMm);

        renderedPx += slicePx;
        pageIndex += 1;

        report({
          percent: 45 + Math.round((renderedPx / canvas.height) * 25),
          phase: "build_pdf",
          current: pageIndex,
          total: pageIndex,
        });
        await nextPaint(0);
      }
    }

    if (tables) {
      report({ percent: 72, phase: "capture_tables" });
      const tableLayout: PdfTableLayout = {
        paperFormat,
        pageWidth,
        pageHeight,
        marginMm,
        contentWidthMm,
        headerBlockMm,
        footerBlockMm,
        brandDataUrl: brandImage?.dataUrl ?? null,
        brandFormat: brandImage?.format ?? "JPEG",
        brandHeightMm,
      };
      await appendVectorTablesToPdf(pdf, tableLayout, tables);
      report({ percent: 88, phase: "capture_tables" });
    }

    stampFootersOnAllPages(pdf, pageWidth, marginMm, footerY, generatedText);

    report({ percent: 97, phase: "finish" });
    await savePdfDocument(pdf, suggestedFilename);
    report({ percent: 100, phase: "finish" });
  } finally {
    restoreAncestors();
    brandEls.forEach((el, index) => {
      el.style.display = prevBrandDisplay[index] ?? "";
    });
    generatedEls.forEach((el, index) => {
      el.style.display = prevGeneratedDisplay[index] ?? "";
    });
    tableSections.forEach((el, index) => {
      el.style.display = prevTableDisplay[index] ?? "";
    });
    root.style.maxHeight = prevMaxHeight;
    root.style.overflow = prevOverflow;
    root.style.width = prevWidth;
    if (hadExportAttr) {
      root.setAttribute(EXPORT_ATTR, "");
    } else {
      root.removeAttribute(EXPORT_ATTR);
    }
  }
}

const PRINT_STYLE_ID = "statistics-print-page-size";

/** Impression navigateur avec format papier (@page), comme repli léger sans jsPDF. */
export function printStatisticsInBrowser(paperFormat: PdfPaperFormat): void {
  let el = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PRINT_STYLE_ID;
    document.head.appendChild(el);
  }
  const size = PDF_FORMAT_CSS_PAGE[paperFormat];
  el.textContent = `@media print { @page { size: ${size} portrait; margin: 12mm; } }`;

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
