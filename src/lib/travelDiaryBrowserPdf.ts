/**
 * Export PDF du carnet de voyage visiteur (capture html-to-image + jsPDF).
 */
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

const PAGE_BG = "#faf8f3";

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
    const canvas = await toCanvas(pageElements[i], {
      pixelRatio: 2,
      backgroundColor: PAGE_BG,
      cacheBust: true,
    });
    const dataUrl = canvas.toDataURL("image/png");
    if (i > 0) {
      pdf.addPage([pageWidth, pageHeight], pageHeight >= pageWidth ? "portrait" : "landscape");
    }
    pdf.addImage(dataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  }

  pdf.save(filename);
}
