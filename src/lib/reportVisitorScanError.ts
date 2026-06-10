import { reportVisitorError } from "@/lib/visitorErrorLogging";

export function reportQrInvalid(decodedText: string): void {
  void reportVisitorError({
    message: "QR non reconnu",
    source: "qr.invalid",
    metadata: { decodedText: decodedText.slice(0, 500) },
  });
}

export function reportQrCameraError(userMessage: string, cause?: unknown): void {
  void reportVisitorError({
    message: userMessage,
    stack: cause instanceof Error ? cause.stack ?? null : null,
    source: "qr.camera",
    metadata: {
      causeMessage:
        cause instanceof Error ? cause.message : typeof cause === "string" ? cause : null,
    },
  });
}

export function reportQrScannerUnavailable(): void {
  void reportVisitorError({
    message: "Scanner fichier indisponible.",
    source: "qr.scanner_unavailable",
  });
}

export function reportQrUnreadableImage(): void {
  void reportVisitorError({
    message: "QR illisible sur cette image.",
    source: "qr.unreadable",
  });
}

export function reportQrTorchError(): void {
  void reportVisitorError({
    message: "La lampe n'a pas pu être activée sur cet appareil.",
    source: "qr.torch",
  });
}
