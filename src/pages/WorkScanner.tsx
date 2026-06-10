import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lightbulb, QrCode, Zap } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

import { Button } from "@/components/ui/button";
import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { resolveScanTargetFromQr } from "@/lib/oeuvrePublicUrl";
import {
  buildQrScannerCameraConfig,
  createHtml5QrcodeReader,
  safeStopQrScanner,
  scanQrFromImageFile,
  startQrWebcamScanner,
} from "@/lib/qrCodeScanFriendly";
import {
  isNativeQrScanSupported,
  startNativeCameraQrScanner,
  type NativeCameraQrSession,
} from "@/lib/qrNativeCameraScanner";
import { supabase } from "@/lib/supabase";
import {
  reportQrCameraError,
  reportQrInvalid,
  reportQrScannerUnavailable,
  reportQrTorchError,
  reportQrUnreadableImage,
} from "@/lib/reportVisitorScanError";
import { toast } from "sonner";

const SCAN_ACCENT = "#d9a441";
const QR_READER_ELEMENT_ID = "qr-reader";
const QR_FILE_READER_ID = "qr-file-reader";
const CAMERA_AUTOSTART_KEY = "aimediart-camera-autostart";

const WorkScanner = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || "";
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameraAutoStartEnabled, setCameraAutoStartEnabled] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showAssistHint, setShowAssistHint] = useState(false);
  const hasScannedRef = useRef(false);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const assistTimeoutRef = useRef<number | null>(null);
  const startingCameraRef = useRef(false);
  const autostartAttemptedRef = useRef(false);
  const lastInvalidScanToastRef = useRef(0);
  const cameraSessionRef = useRef<NativeCameraQrSession | null>(null);
  const qrImageInputRef = useRef<HTMLInputElement>(null);

  const exitTarget = useMemo(
    () => (expoId ? `/scan?expo_id=${encodeURIComponent(expoId)}` : "/scan"),
    [expoId],
  );

  const handleQuit = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/organisation");
  };

  const handleQrDecoded = useCallback(
    (decodedText: string) => {
      if (hasScannedRef.current) return;
      hasScannedRef.current = true;
      if (assistTimeoutRef.current !== null) {
        window.clearTimeout(assistTimeoutRef.current);
        assistTimeoutRef.current = null;
      }

      const scanTarget = resolveScanTargetFromQr(decodedText);
      if (import.meta.env.DEV) {
        console.debug("[scanner] code détecté", { decodedText, scanTarget });
      }

      if (!scanTarget) {
        hasScannedRef.current = false;
        const now = Date.now();
        if (now - lastInvalidScanToastRef.current > 2800) {
          lastInvalidScanToastRef.current = now;
          reportQrInvalid(decodedText);
          toast.message("QR non reconnu", {
            description: "Utilisez le QR d’une œuvre (cartel ou catalogue), bien centré et éclairé.",
          });
        }
        return;
      }

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(35);
      }

      cameraSessionRef.current?.stop();
      cameraSessionRef.current = null;

      if (scanTarget.kind === "expo") {
        navigate(`/scan?expo_id=${encodeURIComponent(scanTarget.expoId)}`);
        return;
      }

      const target = expoId
        ? `/artwork/${encodeURIComponent(scanTarget.artworkId)}?expo_id=${encodeURIComponent(expoId)}`
        : `/artwork/${encodeURIComponent(scanTarget.artworkId)}`;
      navigate(target);
    },
    [expoId, navigate],
  );

  const getOrCreateFileQrReader = useCallback(() => {
    if (!document.getElementById(QR_FILE_READER_ID)) {
      throw new Error("Zone scanner fichier introuvable.");
    }
    if (!qrRef.current) {
      qrRef.current = createHtml5QrcodeReader(QR_FILE_READER_ID);
    }
    return qrRef.current;
  }, []);

  const startCamera = useCallback(async () => {
    if (cameraReady || startingCameraRef.current) return;
    startingCameraRef.current = true;
    setStartingCamera(true);
    try {
      hasScannedRef.current = false;
      cameraSessionRef.current?.stop();
      cameraSessionRef.current = null;

      if (isNativeQrScanSupported()) {
        const session = await startNativeCameraQrScanner(QR_READER_ELEMENT_ID, handleQrDecoded);
        cameraSessionRef.current = session;
        setTorchSupported(session.torchSupported);
      } else {
        const qr = getOrCreateFileQrReader();
        await safeStopQrScanner(qr);
        await startQrWebcamScanner(qr, QR_READER_ELEMENT_ID, buildQrScannerCameraConfig(), handleQrDecoded);
        try {
          const capabilities = qr.getRunningTrackCapabilities();
          setTorchSupported(Boolean(capabilities?.torch));
        } catch {
          setTorchSupported(false);
        }
      }

      setCameraReady(true);
      setCameraError(null);
      setShowAssistHint(false);
      try {
        localStorage.setItem(CAMERA_AUTOSTART_KEY, "1");
      } catch {
        // ignore
      }
      setCameraAutoStartEnabled(true);

      assistTimeoutRef.current = window.setTimeout(() => {
        if (!hasScannedRef.current) {
          setShowAssistHint(true);
        }
      }, 7000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Accès caméra impossible.";
      const isInsecureContext = typeof window !== "undefined" && !window.isSecureContext;
      if (import.meta.env.DEV) {
        console.error("[scanner] démarrage caméra", e);
      }
      setCameraError(
        isInsecureContext
          ? "Caméra bloquée: ouvrez cette page en HTTPS (ex: URL ngrok) puis réessayez."
          : /permission|denied|notallowed|not allowed/i.test(msg)
            ? "Accès caméra refusé. Autorisez la caméra pour scanner les œuvres."
            : /notfound|no camera|device not found|requested device not found/i.test(msg)
              ? "Aucune caméra détectée sur cet appareil."
              : /notreadable|in use|busy|track start/i.test(msg)
                ? "La webcam est utilisée par une autre application. Fermez-la puis réessayez."
                : import.meta.env.DEV && msg.trim()
                  ? msg
                  : "Caméra indisponible pour le moment. Réessayez dans un instant.",
      );
      reportQrCameraError(
        isInsecureContext
          ? "Caméra bloquée: contexte non sécurisé (HTTPS requis)."
          : msg,
        e,
      );
      setCameraReady(false);
      setTorchSupported(false);
      setTorchOn(false);
      setShowAssistHint(false);
      setCameraAutoStartEnabled(false);
    } finally {
      startingCameraRef.current = false;
      setStartingCamera(false);
    }
  }, [cameraReady, getOrCreateFileQrReader, handleQrDecoded]);

  const handleQrImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      let qr: Html5Qrcode;
      try {
        qr = getOrCreateFileQrReader();
      } catch {
        reportQrScannerUnavailable();
        toast.error("Scanner fichier indisponible.");
        return;
      }
      try {
        const text = await scanQrFromImageFile(qr, file);
        handleQrDecoded(text);
      } catch {
        reportQrUnreadableImage();
        toast.error("QR illisible sur cette image. Essayez une photo plus nette ou plus proche.");
      }
    },
    [getOrCreateFileQrReader, handleQrDecoded],
  );

  useEffect(() => {
    return () => {
      cameraSessionRef.current?.stop();
      cameraSessionRef.current = null;
      if (assistTimeoutRef.current !== null) {
        window.clearTimeout(assistTimeoutRef.current);
        assistTimeoutRef.current = null;
      }
      const qr = qrRef.current;
      qrRef.current = null;
      if (qr) void safeStopQrScanner(qr);
    };
  }, []);

  useEffect(() => {
    if (!cameraAutoStartEnabled) return;
    if (cameraReady || startingCameraRef.current) return;
    if (autostartAttemptedRef.current) return;
    autostartAttemptedRef.current = true;
    const frameId = requestAnimationFrame(() => {
      void startCamera();
    });
    return () => cancelAnimationFrame(frameId);
  }, [cameraAutoStartEnabled, cameraReady, startCamera]);

  const toggleTorch = async () => {
    if (!torchSupported) return;
    const nextTorchValue = !torchOn;
    if (cameraSessionRef.current) {
      const ok = await cameraSessionRef.current.setTorch(nextTorchValue);
      if (ok) setTorchOn(nextTorchValue);
      else {
        reportQrTorchError();
        setCameraError("La lampe n'a pas pu être activée sur cet appareil.");
      }
      return;
    }
    if (!qrRef.current) return;
    try {
      await qrRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorchValue } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorchValue);
    } catch {
      reportQrTorchError();
      setCameraError("La lampe n'a pas pu être activée sur cet appareil.");
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-6 pt-3">
      <div className="w-full max-w-[320px]">
        <div className="mb-3 flex w-full items-start justify-start">
          <AimediartBrandLogoBlock size="sm" animateHeart backdrop />
        </div>
        <div className="mx-auto mt-3 flex min-h-[calc(100vh-7.5rem)] flex-col items-center justify-start gap-5 pt-0 text-center">
          <div
            className={`relative mx-auto h-[300px] w-[300px] overflow-hidden rounded-2xl border border-border shadow-xl ${
              cameraReady ? "bg-transparent" : "bg-[#1A1A1A]"
            }`}
          >
            {!cameraReady && (
              <div className="pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-[#1A1A1A]" aria-hidden />
            )}

            <div className="absolute left-3 top-3 z-[3] h-8 w-8 border-l-2 border-t-2" style={{ borderColor: SCAN_ACCENT }} />
            <div className="absolute right-3 top-3 z-[3] h-8 w-8 border-r-2 border-t-2" style={{ borderColor: SCAN_ACCENT }} />
            <div
              className="absolute bottom-3 left-3 z-[3] h-8 w-8 border-b-2 border-l-2"
              style={{ borderColor: SCAN_ACCENT }}
            />
            <div
              className="absolute bottom-3 right-3 z-[3] h-8 w-8 border-b-2 border-r-2"
              style={{ borderColor: SCAN_ACCENT }}
            />

            <div id={QR_READER_ELEMENT_ID} className="absolute inset-0 z-[2]" />
            <div id={QR_FILE_READER_ID} className="sr-only" aria-hidden />

            {cameraReady && torchSupported && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                className={`absolute right-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 backdrop-blur-sm transition ${
                  torchOn ? "bg-amber-400/85 text-black" : "bg-black/45 text-white"
                }`}
                aria-label={torchOn ? "Désactiver l'éclairage" : "Activer l'éclairage"}
                title={torchOn ? "Éteindre l'éclair" : "Activer l'éclair"}
              >
                <Zap className="h-4 w-4" />
              </button>
            )}

            {cameraError && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-4">
                <p className="text-center text-xs leading-relaxed text-white/90">{cameraError}</p>
              </div>
            )}

            {!cameraError && !cameraReady && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <QrCode className="h-14 w-14 text-amber-200/90" aria-hidden />
              </div>
            )}

            {!cameraError && (
              <div className="pointer-events-none absolute left-4 right-4 top-1/2 z-10 h-[2px] -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.95),0_0_28px_rgba(245,158,11,0.55)] scanner-line" />
            )}
          </div>

          {!cameraReady && (
            <Button
              type="button"
              className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => {
                setCameraError(null);
                void startCamera();
              }}
              disabled={startingCamera}
            >
              {startingCamera ? "Démarrage de la caméra..." : "Démarrer la caméra"}
            </Button>
          )}

          <input
            ref={qrImageInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleQrImageFile(file);
            }}
          />

          {cameraReady && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-border bg-white text-sm"
              onClick={() => qrImageInputRef.current?.click()}
            >
              Importer une photo du QR
            </Button>
          )}

          {cameraReady && isNativeQrScanSupported() && (
            <p className="text-[10px] text-muted-foreground">Lecture QR native (comme l’app Caméra Windows)</p>
          )}

          <p className="max-w-[280px] text-sm leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">Bravo ! Maintenant la visite démarre.</strong>
            <br />
            Il suffit de scanner les QR-Code disposés à côté des œuvres exposées.
          </p>

          <Button type="button" variant="outline" className="w-full border-border bg-white text-sm" onClick={() => void handleQuit()}>
            Quitter la visite
          </Button>

          {showAssistHint && !cameraError && (
            <div className="text-center text-xs text-muted-foreground leading-relaxed">
              <p className="inline-flex items-center justify-center gap-1 font-semibold">
                <Lightbulb className="h-3.5 w-3.5" />
                ASTUCE
              </p>
              <p>Appprochez-vous du QR-Code</p>
              <p>et/ou activez la lampe sur votre smartphone</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        #${QR_READER_ELEMENT_ID}, #${QR_READER_ELEMENT_ID} > div {
          width: 100% !important;
          height: 100% !important;
        }
        #${QR_READER_ELEMENT_ID} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #${QR_READER_ELEMENT_ID} img {
          display: none !important;
        }
        .scanner-line {
          animation: scanline-move 2.3s ease-in-out infinite alternate;
        }
        @keyframes scanline-move {
          from { transform: translateY(-92px); opacity: 0.75; }
          to { transform: translateY(92px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default WorkScanner;

