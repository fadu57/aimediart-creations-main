/** Scan QR via l’API native BarcodeDetector (Chrome/Edge) — souvent plus fiable que ZXing seul. */

type BarcodeDetectorResult = {
  rawValue?: string;
  boundingBox?: DOMRectReadOnly;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
};

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const g = globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorCtor };
  return g.BarcodeDetector ?? null;
}

/** iPhone / iPad (y compris iPadOS « MacIntel »). */
export function isAppleMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** BarcodeDetector natif — Chrome/Edge/Android ; pas iOS (flux html5-qrcode plus fiable). */
export function isNativeQrScanSupported(): boolean {
  if (isAppleMobileDevice()) return false;
  return getBarcodeDetectorCtor() !== null;
}

export function findQrScannerVideoElement(elementId: string): HTMLVideoElement | null {
  const root = document.getElementById(elementId);
  return root?.querySelector("video") ?? null;
}

/** Attributs requis pour que Safari iOS n’ouvre pas la vidéo en plein écran / bloquée. */
export function configureQrVideoForInlinePlayback(video: HTMLVideoElement): void {
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.playsInline = true;
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.setAttribute("muted", "true");
  video.setAttribute("autoplay", "true");
}

/**
 * Après html5-qrcode.start(), iOS crée souvent un &lt;video&gt; sans lecture réelle (écran noir).
 * Force play() + attend des frames (videoWidth &gt; 0).
 */
export async function ensureHtml5QrVideoPlaying(
  elementId: string,
  timeoutMs = 6000,
): Promise<HTMLVideoElement> {
  const deadline = Date.now() + timeoutMs;
  let video: HTMLVideoElement | null = null;

  while (Date.now() < deadline) {
    video = findQrScannerVideoElement(elementId);
    if (video) break;
    await delay(60);
  }
  if (!video) {
    throw new Error("Élément vidéo introuvable.");
  }

  configureQrVideoForInlinePlayback(video);

  const tryPlay = async () => {
    try {
      await video!.play();
    } catch {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          video!.removeEventListener("loadedmetadata", onReady);
          void video!
            .play()
            .then(() => resolve())
            .catch(reject);
        };
        if (video!.readyState >= HTMLMediaElement.HAVE_METADATA) {
          void video!
            .play()
            .then(() => resolve())
            .catch(reject);
        } else {
          video!.addEventListener("loadedmetadata", onReady, { once: true });
          window.setTimeout(() => {
            video!.removeEventListener("loadedmetadata", onReady);
            reject(new Error("Lecture vidéo impossible."));
          }, 2500);
        }
      });
    }
  };

  await tryPlay();

  while (Date.now() < deadline) {
    const hasFrames =
      !video.paused &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0;
    if (hasFrames) return video;

    if (video.paused) {
      try {
        await video.play();
      } catch {
        /* retenter au tour suivant */
      }
    }
    await delay(100);
  }

  throw new Error("Flux caméra sans image.");
}

/**
 * Boucle de détection sur l’élément &lt;video&gt; (complète html5-qrcode).
 * Retourne une fonction stop.
 */
export function startNativeQrVideoScanLoop(
  video: HTMLVideoElement,
  onDecoded: (text: string) => void,
): () => void {
  const Ctor = getBarcodeDetectorCtor();
  if (!Ctor) return () => undefined;

  const detector = new Ctor({ formats: ["qr_code"] });
  let active = true;
  let busy = false;
  let lastText = "";
  let lastAt = 0;

  const tick = () => {
    if (!active) return;
    requestAnimationFrame(tick);
    if (busy || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

    busy = true;
    void detector
      .detect(video)
      .then((codes) => {
        const withText = codes.filter((c) => (c.rawValue ?? "").trim().length > 0);
        if (withText.length === 0) return;
        const best = withText.reduce((a, b) => {
          const areaA = (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0);
          const areaB = (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0);
          return areaB > areaA ? b : a;
        });
        const text = best.rawValue?.trim() ?? "";
        if (!text) return;
        const now = Date.now();
        if (text === lastText && now - lastAt < 1200) return;
        lastText = text;
        lastAt = now;
        if (import.meta.env.DEV) {
          console.debug("[scanner] BarcodeDetector", text);
        }
        onDecoded(text);
      })
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  };

  requestAnimationFrame(tick);
  return () => {
    active = false;
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Attache le scan natif dès que la vidéo html5-qrcode est prête. */
export async function attachNativeQrScanWhenReady(
  elementId: string,
  onDecoded: (text: string) => void,
  maxWaitMs = 4000,
): Promise<() => void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const video = findQrScannerVideoElement(elementId);
    if (video && video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      return startNativeQrVideoScanLoop(video, onDecoded);
    }
    await delay(120);
  }
  if (import.meta.env.DEV) {
    console.warn("[scanner] BarcodeDetector: élément video introuvable");
  }
  return () => undefined;
}
