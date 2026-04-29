/**
 * Rendu du bloc marque (Header : carré rouge + cœur + libellés), pour inclusion dans un PDF.
 * Aligné visuellement sur `src/components/Header.tsx` (Logo).
 */

const LOGO_RED = "hsl(0 65% 48%)";

/** Carré rouge (cœur) : légèrement plus petit que le header web pour le PDF */
const BOX_PX = 30;
const BOX_RADIUS_PX = 5;
const GAP_PX = 8;
const CANVAS_W = 300;
const CANVAS_H = 52;

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

/** Cœur plein (repère 24×24 type Material), centré dans la boîte rouge */
function drawHeartInBox(ctx: CanvasRenderingContext2D, boxX: number, boxY: number, boxSize: number) {
  const cx = boxX + boxSize / 2;
  const cy = boxY + boxSize / 2;
  const scale = (boxSize * 0.45) / 24;
  const heart = new Path2D(
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  );
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-12, -12);
  ctx.fillStyle = "#ffffff";
  ctx.fill(heart);
  ctx.restore();
}

export type PdfHeaderLogoBlock = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
};

/**
 * PNG (data URL) du bandeau logo, fond transparent hors du dessin.
 */
export function createAimediaHeaderLogoBlockPng(): PdfHeaderLogoBlock {
  if (typeof document === "undefined") {
    throw new Error("Génération du logo PDF impossible hors navigateur.");
  }

  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(CANVAS_W * dpr);
  canvas.height = Math.round(CANVAS_H * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D indisponible.");
  }

  ctx.scale(dpr, dpr);
  const boxY = (CANVAS_H - BOX_PX) / 2;

  ctx.fillStyle = LOGO_RED;
  fillRoundedRect(ctx, 0, boxY, BOX_PX, BOX_PX, BOX_RADIUS_PX);

  drawHeartInBox(ctx, 0, boxY, BOX_PX);

  const textX = BOX_PX + GAP_PX;
  ctx.fillStyle = LOGO_RED;
  ctx.textBaseline = "top";
  ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText("AIMEDIArt.com", textX, boxY + 4);
  ctx.font = 'italic 600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText("Art-mediation with AI", textX, boxY + 22);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthPx: CANVAS_W,
    heightPx: CANVAS_H,
  };
}
