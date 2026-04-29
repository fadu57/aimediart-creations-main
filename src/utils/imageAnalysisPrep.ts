export type PreparedImageForAnalysis =
  | { kind: "inline"; mimeType: string; base64Data: string; approxBytes: number }
  | { kind: "url"; imageUrl: string };

function blobToBase64Data(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture image impossible."));
    reader.onload = () => {
      const result = String(reader.result || "");
      // data:<mime>;base64,<DATA>
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToBitmap(imageUrl: string): Promise<ImageBitmap> {
  const resp = await fetch(imageUrl, { cache: "no-store" });
  if (!resp.ok) {
    throw new Error("Impossible de télécharger l'image pour compression.");
  }
  const blob = await resp.blob();
  return await createImageBitmap(blob);
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Conversion JPEG impossible."));
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Prépare une image pour l'analyse vision (Gemini).
 * - Si image > 1200px (largeur) ou > 2MB: redimensionne + compresse en JPEG.
 * - Retourne du base64 inline quand on a compressé, sinon on garde l'URL.
 */
export async function prepareArtworkImageForAnalysis(params: {
  imageUrl: string;
  maxWidthPx?: number;
  maxBytes?: number;
}): Promise<PreparedImageForAnalysis> {
  const maxWidthPx = params.maxWidthPx ?? 1200;
  const maxBytes = params.maxBytes ?? 2_000_000;
  const imageUrl = params.imageUrl.trim();
  if (!imageUrl) {
    throw new Error("imageUrl manquant.");
  }

  // On tente de récupérer la taille sans télécharger toute l'image (pas toujours disponible).
  // Si pas possible, on passe directement par bitmap + encodage.
  const bitmap = await imageUrlToBitmap(imageUrl);
  const width = bitmap.width;
  const height = bitmap.height;

  const scale = width > maxWidthPx ? maxWidthPx / width : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  // Si déjà <= maxWidth, on n'est pas certain de la taille en bytes, mais on laisse l'URL
  // sauf si on doit réduire en pixels.
  if (scale === 1) {
    return { kind: "url", imageUrl };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { kind: "url", imageUrl };
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  // Compression JPEG progressive jusqu'à passer sous la limite maxBytes.
  let quality = 0.86;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > maxBytes && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  const base64Data = await blobToBase64Data(blob);
  return { kind: "inline", mimeType: "image/jpeg", base64Data, approxBytes: blob.size };
}

