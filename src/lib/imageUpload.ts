import imageCompression, { type Options as ImageCompressionOptions } from "browser-image-compression";

/** Taille maximale du fichier envoyé vers le stockage (1 Mo). */
export const MAX_IMAGE_UPLOAD_BYTES = 1 * 1024 * 1024;

/** Largeur/hauteur max après redimensionnement (1920 px). */
export const MAX_IMAGE_UPLOAD_EDGE_PX = 1920;

/** Limite côté fichier source pour éviter les blocages navigateur (hors compression). */
const MAX_SOURCE_IMAGE_BYTES = 100 * 1024 * 1024;

/**
 * Contrôle basique du fichier image (type + taille source raisonnable).
 */
export function assertImageFileAllowed(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new Error("Veuillez sélectionner un fichier image.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(
      `Fichier trop volumineux (maximum ${Math.round(MAX_SOURCE_IMAGE_BYTES / (1024 * 1024))} Mo avant traitement).`,
    );
  }
}

function extFromMimeType(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function withExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return `${base || `img-${crypto.randomUUID()}`}.${extension}`;
}

async function compressImage(
  file: File,
  maxBytes: number,
  compressionOptions?: { fileType?: string; maxEdgePx?: number; initialQuality?: number },
): Promise<File> {
  const options: ImageCompressionOptions = {
    maxSizeMB: maxBytes / (1024 * 1024),
    maxWidthOrHeight: compressionOptions?.maxEdgePx ?? MAX_IMAGE_UPLOAD_EDGE_PX,
    useWebWorker: true,
    initialQuality: compressionOptions?.initialQuality ?? 0.85,
    ...(compressionOptions?.fileType ? { fileType: compressionOptions.fileType } : {}),
  };
  return imageCompression(file, options);
}

/**
 * Compresse l’image avant envoi:
 * - max 1 Mo (par défaut),
 * - max 1920 px,
 * - conserve le format d'origine quand possible,
 * - bascule en WebP si nécessaire pour alléger.
 */
export async function prepareImageForSupabaseUpload(
  file: File,
  options?: { maxBytes?: number; maxEdgePx?: number; forceFileType?: string; initialQuality?: number },
): Promise<File> {
  assertImageFileAllowed(file);
  const maxBytes = options?.maxBytes ?? MAX_IMAGE_UPLOAD_BYTES;

  let compressed: File;
  try {
    compressed = await compressImage(file, maxBytes, {
      maxEdgePx: options?.maxEdgePx,
      fileType: options?.forceFileType,
      initialQuality: options?.initialQuality,
    });
  } catch {
    throw new Error("Impossible de compresser cette image. Essayez JPG, PNG ou WebP.");
  }

  if (compressed.size > maxBytes) {
    try {
      compressed = await compressImage(compressed, maxBytes, {
        fileType: "image/webp",
        maxEdgePx: options?.maxEdgePx,
        initialQuality: 0.8,
      });
    } catch {
      throw new Error("Conversion WebP impossible. Essayez une image plus légère.");
    }
  }

  if (compressed.size > maxBytes) {
    throw new Error(
      `Impossible de ramener l’image sous ${(maxBytes / (1024 * 1024)).toFixed(1)} Mo. Essayez une image moins détaillée.`,
    );
  }

  const targetType = compressed.type || file.type || "image/jpeg";
  const targetExt = extFromMimeType(targetType);
  const targetName = withExtension(file.name, targetExt);

  return new File([compressed], targetName, {
    type: targetType,
    lastModified: Date.now(),
  });
}
