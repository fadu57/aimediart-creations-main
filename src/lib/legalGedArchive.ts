/**
 * Archivage GED d’une page légale validée (PDF) :
 * AIMEDIArt-Légal → Divers juridique (à faire valider)
 * Nom fichier : « Version validée — {titre de la page}.pdf »
 */

import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

import {
  createFolder,
  listFolders,
  uploadDocument,
} from "@/lib/aimediartDocuments";
import { stripLegalAnnotationMarks } from "@/lib/legalDocuments";

/** Section GED = slug `legal` (libellé UI : AIMEDIArt-Légal). */
export const LEGAL_GED_CATEGORY = "legal";

/** Sous-dossier cible pour les versions définitives à valider / archivées. */
export const LEGAL_GED_VALIDATION_FOLDER = "Divers juridique (à faire valider)";

const PDF_PREFIX = "Version validée";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizePdfFileName(title: string): string {
  const base = `${PDF_PREFIX} — ${title.trim()}`
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return `${base || PDF_PREFIX}.pdf`;
}

async function nextPaint(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return canvas.toDataURL("image/png");
  }
}

/**
 * Génère un PDF A4 depuis le HTML publié (sans annotations de relecture).
 */
export async function buildValidatedLegalPdfFile(opts: {
  title: string;
  bodyHtml: string;
}): Promise<File> {
  const title = opts.title.trim() || "Document légal";
  const body = stripLegalAnnotationMarks(opts.bodyHtml).trim();
  if (!body) throw new Error("Contenu PDF vide.");

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:794px",
    "padding:48px 40px",
    "box-sizing:border-box",
    "background:#ffffff",
    "color:#1f1f1f",
    "font-family:Georgia,'Times New Roman',serif",
    "font-size:12px",
    "line-height:1.55",
  ].join(";");

  host.innerHTML = `
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0b5fff;">
      ${escapeHtml(PDF_PREFIX)}
    </p>
    <h1 style="margin:0 0 20px;font-size:20px;line-height:1.25;font-weight:700;">
      ${escapeHtml(title)}
    </h1>
    <div class="legal-pdf-body">${body}</div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    .legal-pdf-body h1 { font-size: 18px; margin: 1.25rem 0 0.5rem; }
    .legal-pdf-body h2 { font-size: 13px; font-weight: 800; margin: 1.25rem 0 0.4rem; }
    .legal-pdf-body p { margin: 0.45rem 0; }
    .legal-pdf-body ul { margin: 0.4rem 0; padding-left: 1.25rem; }
    .legal-pdf-body li { margin: 0.25rem 0; }
  `;
  host.appendChild(style);
  document.body.appendChild(host);

  try {
    await nextPaint();
    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(host, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
    } catch {
      canvas = await toCanvas(host, {
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        cacheBust: true,
        skipFonts: true,
      });
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginMm = 12;
    const contentWidthMm = pageWidth - marginMm * 2;
    const contentHeightMm = pageHeight - marginMm * 2;
    const fullImgHeightMm = (canvas.height * contentWidthMm) / Math.max(1, canvas.width);
    const pageCanvasHeightPx = Math.max(
      1,
      Math.floor((contentHeightMm / Math.max(fullImgHeightMm, 1)) * canvas.height),
    );

    let renderedPx = 0;
    let pageIndex = 0;
    while (renderedPx < canvas.height) {
      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      const slicePx = Math.min(pageCanvasHeightPx, canvas.height - renderedPx);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = slicePx;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) throw new Error("canvas-2d indisponible");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);

      const dataUrl = canvasToJpegDataUrl(pageCanvas);
      const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      const sliceHeightMm = (slicePx * contentWidthMm) / canvas.width;
      pdf.addImage(dataUrl, format, marginMm, marginMm, contentWidthMm, sliceHeightMm);

      renderedPx += slicePx;
      pageIndex += 1;
    }

    const blob = pdf.output("blob");
    return new File([blob], sanitizePdfFileName(title), { type: "application/pdf" });
  } finally {
    host.remove();
  }
}

/** Résout ou crée le sous-dossier GED de validation juridique. */
export async function resolveLegalValidationFolder(): Promise<{
  folderId: string;
  folderName: string;
  error: string | null;
}> {
  const listed = await listFolders(LEGAL_GED_CATEGORY);
  if (listed.error) {
    return { folderId: "", folderName: LEGAL_GED_VALIDATION_FOLDER, error: listed.error };
  }

  const existing = listed.data.find(
    (f) => f.name.trim().toLowerCase() === LEGAL_GED_VALIDATION_FOLDER.toLowerCase(),
  );
  if (existing) {
    return { folderId: existing.id, folderName: existing.name, error: null };
  }

  const created = await createFolder(LEGAL_GED_CATEGORY, LEGAL_GED_VALIDATION_FOLDER);
  if (created.error || !created.data) {
    return {
      folderId: "",
      folderName: LEGAL_GED_VALIDATION_FOLDER,
      error: created.error || "Création du dossier GED impossible.",
    };
  }
  return { folderId: created.data.id, folderName: created.data.name, error: null };
}

/**
 * Génère le PDF « Version validée — {titre} » et l’enregistre dans
 * /ged/AIMEDIArt-Légal/Divers juridique (à faire valider).
 */
export async function archiveValidatedLegalPdfToGed(opts: {
  title: string;
  bodyHtml: string;
}): Promise<{ documentId: string | null; fileName: string | null; error: string | null }> {
  try {
    const file = await buildValidatedLegalPdfFile(opts);
    const folder = await resolveLegalValidationFolder();
    if (folder.error) {
      return { documentId: null, fileName: file.name, error: folder.error };
    }

    const uploaded = await uploadDocument(
      LEGAL_GED_CATEGORY,
      file,
      folder.folderId,
      folder.folderName,
    );
    if (uploaded.error || !uploaded.data) {
      return {
        documentId: null,
        fileName: file.name,
        error: uploaded.error || "Upload GED impossible.",
      };
    }
    return { documentId: uploaded.data.id, fileName: uploaded.data.name, error: null };
  } catch (e) {
    return {
      documentId: null,
      fileName: null,
      error: e instanceof Error ? e.message : "Archivage PDF GED impossible.",
    };
  }
}
