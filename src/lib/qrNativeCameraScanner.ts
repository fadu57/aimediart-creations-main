/**
 * Scanner webcam natif (getUserMedia + BarcodeDetector) — même principe que l’app Caméra Windows.
 * Évite les bugs html5-qrcode (clientWidth, transitions, ZXing sur flux basse résolution).
 */

import { startNativeQrVideoScanLoop } from "@/lib/qrNativeVideoScan";

export { isNativeQrScanSupported } from "@/lib/qrNativeVideoScan";

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
};

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const g = globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorCtor };
  return g.BarcodeDetector ?? null;
}

export type NativeCameraQrSession = {
  stop: () => void;
  video: HTMLVideoElement;
  stream: MediaStream;
  setTorch: (on: boolean) => Promise<boolean>;
  torchSupported: boolean;
};

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function configureVideoForInlinePlayback(video: HTMLVideoElement): void {
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.playsInline = true;
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.setAttribute("muted", "true");
  video.setAttribute("autoplay", "true");
}

async function openCameraStream(): Promise<MediaStream> {
  const mobile = isMobile();
  const attempts: MediaStreamConstraints[] = [
    {
      video: mobile ? { facingMode: { ideal: "environment" } } : { facingMode: { ideal: "user" } },
      audio: false,
    },
    {
      video: {
        facingMode: mobile ? { ideal: "environment" } : { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Accès caméra impossible.");
}

/**
 * Affiche le flux dans containerId et scanne les QR via BarcodeDetector.
 */
export async function startNativeCameraQrScanner(
  containerId: string,
  onDecoded: (text: string) => void,
): Promise<NativeCameraQrSession> {
  if (!getBarcodeDetectorCtor()) {
    throw new Error("Scan QR natif indisponible — utilisez Chrome ou Edge.");
  }

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error("Zone scanner introuvable.");
  }

  container.replaceChildren();

  const video = document.createElement("video");
  configureVideoForInlinePlayback(video);
  video.className = "h-full w-full object-cover";
  container.appendChild(video);

  const stream = await openCameraStream();
  video.srcObject = stream;
  try {
    await video.play();
  } catch (playError) {
    // iOS : parfois play() échoue malgré playsinline — retenter après chargement.
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        video.removeEventListener("loadedmetadata", onReady);
        void video.play().then(resolve).catch(reject);
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        void video.play().then(resolve).catch(reject);
      } else {
        video.addEventListener("loadedmetadata", onReady, { once: true });
      }
    }).catch(() => {
      throw playError instanceof Error ? playError : new Error("Lecture vidéo impossible.");
    });
  }

  const stopScanLoop = startNativeQrVideoScanLoop(video, onDecoded);

  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as MediaTrackCapabilities | undefined;
  const torchSupported = Boolean(caps?.torch);

  const stop = () => {
    stopScanLoop();
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    video.srcObject = null;
    container.replaceChildren();
  };

  const setTorch = async (on: boolean): Promise<boolean> => {
    if (!track || !torchSupported) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  };

  if (import.meta.env.DEV) {
    console.debug("[scanner] flux natif BarcodeDetector actif");
  }

  return { stop, video, stream, setTorch, torchSupported };
}
