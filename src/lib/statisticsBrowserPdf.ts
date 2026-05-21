/**
 * Export PDF statistiques côté navigateur (html-to-image + jsPDF),
 * même principe que le panneau expo — sans serveur Playwright.
 */
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";
import { PDF_FORMAT_CSS_PAGE, type PdfPaperFormat } from "@/lib/statisticsPrintExport";

const READY_ATTR = "data-statistics-export-ready";
const READY_TIMEOUT_MS = 35_000;

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
  return true;
}

/**
 * Capture le bloc rapport et produit un PDF multipage (jsPDF), ouvert dans un nouvel onglet.
 */
export async function generateStatisticsBrowserPdf(
  root: HTMLElement,
  paperFormat: PdfPaperFormat,
): Promise<void> {
  await waitForStatisticsReportReady(root);

  const prevMaxHeight = root.style.maxHeight;
  const prevOverflow = root.style.overflow;
  const prevWidth = root.style.width;
  root.style.maxHeight = "none";
  root.style.overflow = "visible";
  root.style.width = `${root.scrollWidth}px`;

  try {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise<void>((r) => window.setTimeout(r, 300));

    const canvas = await toCanvas(root, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        return shouldCaptureNode(node);
      },
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: paperFormat });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginMm = 10;
    const contentWidthMm = pageWidth - marginMm * 2;
    const contentHeightMm = pageHeight - marginMm * 2;

    const fullImgHeightMm = (canvas.height * contentWidthMm) / canvas.width;
    const pageCanvasHeightPx = Math.floor((contentHeightMm / fullImgHeightMm) * canvas.height);
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

      const dataUrl = pageCanvas.toDataURL("image/jpeg", 0.92);
      const sliceHeightMm = (slicePx * contentWidthMm) / canvas.width;
      pdf.addImage(dataUrl, "JPEG", marginMm, marginMm, contentWidthMm, sliceHeightMm);

      renderedPx += slicePx;
      pageIndex += 1;
    }

    const blobUrl = pdf.output("bloburl");
    const tab = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!tab) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("popup-blocked");
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 600_000);
  } finally {
    root.style.maxHeight = prevMaxHeight;
    root.style.overflow = prevOverflow;
    root.style.width = prevWidth;
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
