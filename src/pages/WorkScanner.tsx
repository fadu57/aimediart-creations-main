import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Heart, Lightbulb, QrCode, Zap } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

import { Button } from "@/components/ui/button";
import { parseArtworkIdFromInput } from "@/lib/oeuvrePublicUrl";
import { supabase } from "@/lib/supabase";

const SCAN_ACCENT = "#d9a441";
const QR_READER_ELEMENT_ID = "qr-reader";
const CAMERA_AUTOSTART_KEY = "aimediart-camera-autostart";

const WorkScanner = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || "";
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameraAutoStartEnabled, setCameraAutoStartEnabled] = useState(() => {
    try {
      return localStorage.getItem(CAMERA_AUTOSTART_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showAssistHint, setShowAssistHint] = useState(false);
  const hasScannedRef = useRef(false);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const assistTimeoutRef = useRef<number | null>(null);

  const exitTarget = useMemo(
    () => (expoId ? `/scan?expo_id=${encodeURIComponent(expoId)}` : "/scan"),
    [expoId],
  );

  const handleQuit = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/home");
  };

  const startCamera = useCallback(async () => {
    const qr = qrRef.current;
    if (!qr || cameraReady || startingCamera) return;
    setStartingCamera(true);
    try {
      hasScannedRef.current = false;
      const scannerConfig = {
        fps: 18,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1,
        disableFlip: false,
      } as const;

      const onSuccess = (decodedText: string) => {
        if (hasScannedRef.current) return;
        hasScannedRef.current = true;
        if (assistTimeoutRef.current !== null) {
          window.clearTimeout(assistTimeoutRef.current);
          assistTimeoutRef.current = null;
        }
        const artworkId = parseArtworkIdFromInput(decodedText);
        if (import.meta.env.DEV) {
          console.debug("[scanner] code détecté", { decodedText, artworkId });
        }
        if (!artworkId) {
          hasScannedRef.current = false;
          return;
        }
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(35);
        }
        const target = expoId
          ? `/œuvre/${encodeURIComponent(artworkId)}?expo_id=${encodeURIComponent(expoId)}`
          : `/œuvre/${encodeURIComponent(artworkId)}`;
        navigate(target);
      };

      const onError = () => {
        // erreurs de frame ignorées volontairement
      };

      try {
        await qr.start({ facingMode: "environment" }, scannerConfig, onSuccess, onError);
      } catch {
        await qr.start({ facingMode: "user" }, scannerConfig, onSuccess, onError);
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

      const capabilities = qr.getRunningTrackCapabilities();
      setTorchSupported(Boolean(capabilities?.torch));

      await qr
        .applyVideoConstraints({
          advanced: [
            { focusMode: "continuous" } as MediaTrackConstraintSet,
            { sharpness: 1 } as MediaTrackConstraintSet,
            { contrast: 1 } as MediaTrackConstraintSet,
          ],
        })
        .catch(() => undefined);

      assistTimeoutRef.current = window.setTimeout(() => {
        if (!hasScannedRef.current) {
          setShowAssistHint(true);
        }
      }, 7000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Accès caméra impossible.";
      const isInsecureContext = typeof window !== "undefined" && !window.isSecureContext;
      setCameraError(
        isInsecureContext
          ? "Caméra bloquée: ouvrez cette page en HTTPS (ex: URL ngrok) puis réessayez."
          : /permission|denied|notallowed|not allowed/i.test(msg)
            ? "Accès caméra refusé. Autorisez la caméra pour scanner les œuvres."
            : "Caméra indisponible pour le moment. Réessayez dans un instant.",
      );
      setCameraReady(false);
      setTorchSupported(false);
      setTorchOn(false);
      setShowAssistHint(false);
    } finally {
      setStartingCamera(false);
    }
  }, [cameraReady, expoId, navigate, startingCamera]);

  useEffect(() => {
    const qr = new Html5Qrcode(QR_READER_ELEMENT_ID, { verbose: false });
    qrRef.current = qr;
    return () => {
      if (assistTimeoutRef.current !== null) {
        window.clearTimeout(assistTimeoutRef.current);
        assistTimeoutRef.current = null;
      }
      void Promise.resolve(qr.stop())
        .catch(() => undefined)
        .then(() => qr.clear().catch(() => undefined));
      qrRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraAutoStartEnabled) return;
    if (cameraReady || startingCamera) return;
    void startCamera();
  }, [cameraAutoStartEnabled, cameraReady, startingCamera, startCamera]);

  const toggleTorch = async () => {
    if (!torchSupported || !qrRef.current) return;
    const nextTorchValue = !torchOn;
    try {
      await qrRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorchValue } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorchValue);
    } catch {
      setCameraError("La lampe n'a pas pu être activée sur cet appareil.");
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-6 pt-3">
      <div className="w-full max-w-[320px]">
        <div className="mb-3 flex w-full items-start justify-start">
          <div className="flex items-center gap-2 rounded bg-background/80 px-1 py-0.5 backdrop-blur-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[15%] bg-accent shadow-sm">
              <span className="inline-flex animate-logo-heart">
                <Heart className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.25} />
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-accent">AIMEDIArt.com</p>
              <p className="text-[10px] font-semibold italic text-accent">Médiation artistique par IA</p>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-3 flex min-h-[calc(100vh-7.5rem)] flex-col items-center justify-start gap-5 pt-0 text-center">
          <div
            className={`relative mx-auto h-[260px] w-[260px] overflow-hidden rounded-2xl border border-border shadow-xl ${
              cameraReady ? "bg-transparent" : "bg-[#1A1A1A]"
            }`}
          >
            <div className="pointer-events-none absolute inset-0 z-[1] rounded-2xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]" />

            <div className="absolute left-3 top-3 h-8 w-8 border-l-2 border-t-2" style={{ borderColor: SCAN_ACCENT }} />
            <div className="absolute right-3 top-3 h-8 w-8 border-r-2 border-t-2" style={{ borderColor: SCAN_ACCENT }} />
            <div
              className="absolute bottom-3 left-3 h-8 w-8 border-b-2 border-l-2"
              style={{ borderColor: SCAN_ACCENT }}
            />
            <div
              className="absolute bottom-3 right-3 h-8 w-8 border-b-2 border-r-2"
              style={{ borderColor: SCAN_ACCENT }}
            />

            <div id={QR_READER_ELEMENT_ID} className="absolute inset-0" />

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
              onClick={() => void startCamera()}
              disabled={startingCamera}
            >
              {startingCamera ? "Démarrage de la caméra..." : "Démarrer la caméra"}
            </Button>
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

