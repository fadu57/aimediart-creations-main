import {
  Html5Qrcode,
  Html5QrcodeScannerState,
  type Html5QrcodeCameraScanConfig,
  type Html5QrcodeFullConfig,
} from "html5-qrcode";
import { attachNativeQrScanWhenReady } from "@/lib/qrNativeVideoScan";
import type { QRCodeToDataURLOptions } from "qrcode";

/** QR PNG stockés (catalogue, fiche œuvre) : correction élevée + zone calme pour scan webcam / mobile. */
export const QR_CODE_STORAGE_OPTIONS: QRCodeToDataURLOptions = {
  width: 1024,
  margin: 4,
  errorCorrectionLevel: "H",
  color: { dark: "#000000", light: "#ffffff" },
};

/** QR intégrés aux PDF cartel / panneau expo (marges réduites, le blanc du layout complète). */
export const QR_CODE_PRINT_OPTIONS: QRCodeToDataURLOptions = {
  width: 1024,
  margin: 2,
  errorCorrectionLevel: "H",
  color: { dark: "#000000", light: "#ffffff" },
};

export function qrCodePrintOptions(width: number): QRCodeToDataURLOptions {
  return { ...QR_CODE_PRINT_OPTIONS, width };
}

export function createHtml5QrcodeReader(elementId: string): Html5Qrcode {
  const config: Html5QrcodeFullConfig = {
    verbose: false,
    useBarCodeDetectorIfSupported: true,
  };
  return new Html5Qrcode(elementId, config);
}

/** Lit un QR depuis une image (test bureau ou photo floue). */
export async function scanQrFromImageFile(qr: Html5Qrcode, file: File): Promise<string> {
  const result = await qr.scanFile(file, false);
  return result.trim();
}

function isLikelyMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i.test(navigator.userAgent);
}

function scanErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Accès caméra impossible.";
}

/** Config scan minimale (évite erreurs clientWidth / qrbox au démarrage). */
export function buildQrScannerCameraConfig(): Html5QrcodeCameraScanConfig {
  return {
    fps: 15,
    disableFlip: false,
  };
}

/** Taille minimale (px) de la zone vidéo avant html5-qrcode.start(). */
const QR_READER_MIN_PX = 80;

export class QrScannerAbortedError extends Error {
  constructor() {
    super("Scanner interrompu.");
    this.name = "QrScannerAbortedError";
  }
}

export type QrWebcamScannerStartOptions = {
  /** Retourne false si le composant est démonté ou l'utilisateur a quitté — pas d'erreur remontée. */
  shouldContinue?: () => boolean;
};

function getQrReaderElement(elementId: string): HTMLElement | null {
  return document.getElementById(elementId);
}

/** Même critère que waitForQrReaderLayout (getBoundingClientRect, pas clientWidth). */
export function isQrReaderLayoutReady(elementId: string, minPx = QR_READER_MIN_PX): boolean {
  const el = getQrReaderElement(elementId);
  if (!el) return false;
  const { width, height } = el.getBoundingClientRect();
  return width >= minPx && height >= minPx;
}

function assertQrReaderElementReady(elementId: string): void {
  if (!isQrReaderLayoutReady(elementId)) {
    throw new Error("Zone scanner non prête.");
  }
}

async function ensureQrReaderReady(
  elementId: string,
  shouldContinue?: () => boolean,
): Promise<void> {
  for (let i = 0; i < 8; i++) {
    if (shouldContinue && !shouldContinue()) throw new QrScannerAbortedError();
    if (isQrReaderLayoutReady(elementId)) return;
    await delay(80);
  }
  try {
    await waitForQrReaderLayout(elementId, 5000);
  } catch (e) {
    if (shouldContinue && !shouldContinue()) throw new QrScannerAbortedError();
    throw e;
  }
}

/** Arrêt sûr (ne lève pas si le scanner n’est pas actif). */
export async function safeStopQrScanner(qr: Html5Qrcode): Promise<void> {
  try {
    const state = qr.getState();
    if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
      await qr.stop();
      await delay(200);
    }
  } catch {
    /* ignore — ex. « scanner is not running » */
  }
}

/** Pause synchrone (pause() ne renvoie pas de Promise). */
export function safePauseQrScanner(qr: Html5Qrcode | null | undefined): void {
  if (!qr) return;
  try {
    if (qr.getState() === Html5QrcodeScannerState.SCANNING) {
      qr.pause(true);
    }
  } catch {
    /* ignore */
  }
}

type CameraStartConfig = string | MediaTrackConstraints;

const startChainByReader = new WeakMap<Html5Qrcode, Promise<void>>();

/** Attend que la zone vidéo ait une taille mesurable avant html5-qrcode.start(). */
export function waitForQrReaderLayout(elementId: string, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.getElementById(elementId);
    if (!el) {
      reject(new Error("Zone scanner introuvable."));
      return;
    }

    let settled = false;
    let observer: ResizeObserver | null = null;
    let timer: ReturnType<typeof window.setTimeout> | undefined;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      if (ok) resolve();
      else reject(new Error("Zone scanner non prête."));
    };

    const isReady = () => isQrReaderLayoutReady(elementId);

    if (isReady()) {
      finish(true);
      return;
    }

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (isReady()) finish(true);
      });
      observer.observe(el);
    }

    timer = window.setTimeout(() => finish(isReady()), timeoutMs);
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Remet html5-qrcode en état NOT_STARTED avant un nouvel essai. */
async function waitForQrScannerIdle(qr: Html5Qrcode, maxWaitMs = 2500): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const state = qr.getState();
    if (state === Html5QrcodeScannerState.NOT_STARTED) return;
    await safeStopQrScanner(qr);
    await delay(180);
  }
}

/** Arrête un flux en cours (cleanup explicite). */
export async function stopQrScannerIfRunning(qr: Html5Qrcode): Promise<void> {
  await waitForQrScannerIdle(qr);
}

/**
 * Au plus 3 essais : ID caméra (string), puis facingMode user, puis environment (mobile).
 * Pas de contraintes HD au démarrage (évite OverconstrainedError + transitions bloquées).
 */
export async function buildQrScannerCameraAttempts(): Promise<CameraStartConfig[]> {
  const mobile = isLikelyMobileDevice();
  const attempts: CameraStartConfig[] = [];

  try {
    const cameras = await Html5Qrcode.getCameras();
    const back = cameras.find((c) => /back|rear|environment|arrière/i.test(c.label));
    const front = cameras.find((c) =>
      /front|user|face|facetime|integrated|webcam|usb|built.?in|interne|camera/i.test(c.label),
    );
    const pick = mobile ? back ?? front ?? cameras[0] : front ?? cameras[0];
    if (pick?.id) attempts.push(pick.id);
  } catch {
    /* getCameras sans permission */
  }

  attempts.push({ facingMode: "user" });
  if (mobile) attempts.push({ facingMode: "environment" });

  return attempts.slice(0, 3);
}

export type QrWebcamScannerSession = {
  stopNativeScan: () => void;
};

async function runQrWebcamScannerStart(
  qr: Html5Qrcode,
  elementId: string,
  scanConfig: Html5QrcodeCameraScanConfig,
  onSuccess: (decodedText: string) => void,
  onError?: (errorMessage: string) => void,
  options?: QrWebcamScannerStartOptions,
): Promise<QrWebcamScannerSession> {
  const shouldContinue = options?.shouldContinue;

  await ensureQrReaderReady(elementId, shouldContinue);
  await waitForQrScannerIdle(qr);
  if (shouldContinue && !shouldContinue()) throw new QrScannerAbortedError();

  const onScanError = onError ?? (() => undefined);
  const attempts = await buildQrScannerCameraAttempts();
  const noopStop = () => undefined;

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    if (shouldContinue && !shouldContinue()) throw new QrScannerAbortedError();

    if (i > 0) {
      await waitForQrScannerIdle(qr);
      await delay(300);
      await ensureQrReaderReady(elementId, shouldContinue);
    }

    const config = attempts[i];
    try {
      await ensureQrReaderReady(elementId, shouldContinue);
      await qr.start(config, scanConfig, onSuccess, onScanError);
      if (import.meta.env.DEV) {
        console.debug("[scanner] caméra démarrée", { config });
      }
      const stopNativeScan = (await attachNativeQrScanWhenReady(elementId, onSuccess)) ?? noopStop;
      return { stopNativeScan };
    } catch (e) {
      lastError = e;
      if (import.meta.env.DEV) {
        console.warn("[scanner] essai caméra échoué", config, scanErrorMessage(e));
      }
      await waitForQrScannerIdle(qr);
    }
  }

  throw new Error(scanErrorMessage(lastError));
}

/** Démarre le flux (sérialisé — évite « already under transition »). */
export function startQrWebcamScanner(
  qr: Html5Qrcode,
  elementId: string,
  scanConfig: Html5QrcodeCameraScanConfig,
  onSuccess: (decodedText: string) => void,
  onError?: (errorMessage: string) => void,
  options?: QrWebcamScannerStartOptions,
): Promise<QrWebcamScannerSession> {
  const previous = startChainByReader.get(qr) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() =>
    runQrWebcamScannerStart(qr, elementId, scanConfig, onSuccess, onError, options)
  );
  startChainByReader.set(qr, run.then(() => undefined));
  return run;
}

/** Résolution plus élevée après démarrage réussi (n’impacte pas le start). */
export async function applyQrScannerVideoBoost(qr: Html5Qrcode): Promise<void> {
  await qr
    .applyVideoConstraints({
      width: { ideal: 1280 },
      height: { ideal: 720 },
    })
    .catch(() => undefined);
}
