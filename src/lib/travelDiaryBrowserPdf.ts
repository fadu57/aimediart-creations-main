/**
 * Export PDF du carnet de voyage visiteur (capture html-to-image + jsPDF).
 */
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

const PAGE_BG = "#faf8f3";
const IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const PDF_EXPORT_HIDE_CLASS = "travel-diary-export-hide";

export type TravelDiaryPdfProgressHandler = (current: number, total: number) => void;

export function travelDiaryPdfFilename(visitorLabel?: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = (visitorLabel ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `${date}-carnet-${slug}.pdf` : `${date}-carnet-aimediart.pdf`;
}

function shouldCaptureTravelDiaryNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return true;
  return !node.classList.contains(PDF_EXPORT_HIDE_CLASS);
}

async function nextPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function captureTravelDiaryPage(element: HTMLElement): Promise<HTMLCanvasElement> {
  const options = {
    pixelRatio: 2,
    backgroundColor: PAGE_BG,
    cacheBust: true,
    imagePlaceholder: IMAGE_PLACEHOLDER,
    fetchRequestInit: { mode: "cors" as RequestMode, cache: "no-cache" as RequestCache },
    filter: shouldCaptureTravelDiaryNode,
  };

  try {
    return await toCanvas(element, options);
  } catch (firstError) {
    try {
      return await toCanvas(element, { ...options, pixelRatio: 1, skipFonts: true });
    } catch {
      if (firstError instanceof Error) throw firstError;
      throw new Error("travel-diary-pdf-capture-failed");
    }
  }
}

function canvasToDataUrl(canvas: HTMLCanvasElement): { dataUrl: string; format: "JPEG" | "PNG" } {
  try {
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), format: "JPEG" };
  } catch {
    return { dataUrl: canvas.toDataURL("image/png"), format: "PNG" };
  }
}

export function createTravelDiaryExportHost(pageWidth: number, pageHeight: number): HTMLDivElement {
  const exportRoot = document.createElement("div");
  exportRoot.setAttribute("aria-hidden", "true");
  exportRoot.className = "travel-diary-root";
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "-10000px";
  exportRoot.style.top = "0";
  exportRoot.style.width = `${Math.max(1, Math.round(pageWidth))}px`;
  exportRoot.style.pointerEvents = "none";
  exportRoot.style.setProperty("--diary-h", `${Math.max(1, Math.round(pageHeight))}px`);
  return exportRoot;
}

const PAGE_FLIP_CLASSES = ["stf__item", "--left", "--right", "--soft", "--hard", "--simple"] as const;

function resetTravelDiaryPageCloneStyles(clone: HTMLElement, width: number, height: number): void {
  clone.classList.remove(...PAGE_FLIP_CLASSES);
  clone.style.cssText = [
    `display: block`,
    `position: relative`,
    `box-sizing: border-box`,
    `overflow: hidden`,
    `width: ${width}px`,
    `height: ${height}px`,
    `transform: none`,
    `clip-path: none`,
    `-webkit-clip-path: none`,
    `opacity: 1`,
    `visibility: visible`,
    `left: auto`,
    `top: auto`,
    `z-index: auto`,
  ].join(";");

  clone.querySelectorAll<HTMLElement>(".stf__item, .stf__outerShadow, .stf__innerShadow, .stf__hardShadow, .stf__hardInnerShadow").forEach((node) => {
    node.remove();
  });
}
export function cloneTravelDiaryPagesForExport(
  sourcePages: HTMLElement[],
  pageWidth: number,
  pageHeight: number,
): HTMLElement[] {
  const width = Math.max(1, Math.round(pageWidth));
  const height = Math.max(1, Math.round(pageHeight));

  return sourcePages.map((page) => {
    const clone = page.cloneNode(true) as HTMLElement;
    resetTravelDiaryPageCloneStyles(clone, width, height);

    clone.querySelectorAll("img").forEach((img) => {
      if (!img.getAttribute("crossorigin")) {
        img.crossOrigin = "anonymous";
      }
    });

    return clone;
  });
}

export async function waitForTravelDiaryExportImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }),
    ),
  );
}

export async function exportTravelDiaryPdf(
  pageElements: HTMLElement[],
  filename: string,
  onProgress?: TravelDiaryPdfProgressHandler,
): Promise<void> {
  if (pageElements.length === 0) return;

  const firstRect = pageElements[0].getBoundingClientRect();
  const pageWidth = Math.max(1, Math.round(firstRect.width));
  const pageHeight = Math.max(1, Math.round(firstRect.height));

  const pdf = new jsPDF({
    orientation: pageHeight >= pageWidth ? "portrait" : "landscape",
    unit: "px",
    format: [pageWidth, pageHeight],
    compress: true,
  });

  for (let i = 0; i < pageElements.length; i += 1) {
    onProgress?.(i + 1, pageElements.length);
    const canvas = await captureTravelDiaryPage(pageElements[i]);
    const { dataUrl, format } = canvasToDataUrl(canvas);
    if (i > 0) {
      pdf.addPage([pageWidth, pageHeight], pageHeight >= pageWidth ? "portrait" : "landscape");
    }
    pdf.addImage(dataUrl, format, 0, 0, pageWidth, pageHeight, undefined, "FAST");
  }

  pdf.save(filename);
}

export async function prepareTravelDiaryExportPages(
  sourcePages: HTMLElement[],
  pageWidth: number,
  pageHeight: number,
): Promise<{ exportRoot: HTMLDivElement; exportPages: HTMLElement[] }> {
  const exportRoot = createTravelDiaryExportHost(pageWidth, pageHeight);
  const exportPages = cloneTravelDiaryPagesForExport(sourcePages, pageWidth, pageHeight);
  exportPages.forEach((page) => exportRoot.appendChild(page));
  document.body.appendChild(exportRoot);
  await waitForTravelDiaryExportImages(exportRoot);
  await nextPaint();
  return { exportRoot, exportPages };
}
