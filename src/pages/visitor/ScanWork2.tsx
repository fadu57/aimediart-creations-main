import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
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
  QrScannerAbortedError,
  startQrWebcamScanner,
} from "@/lib/qrCodeScanFriendly";
import {
  isNativeQrScanSupported,
  startNativeCameraQrScanner,
  type NativeCameraQrSession,
} from "@/lib/qrNativeCameraScanner";
import { AGENCY_NAME_MISSING, resolveAgencyName } from "@/lib/resolveAgencyName";
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
const QR_READER_ELEMENT_ID = "qr-reader-2";
const QR_FILE_READER_ID = "qr-file-reader-2";
const DEFAULT_AGENCY_ID = (import.meta.env.VITE_DEFAULT_AGENCY_ID as string | undefined)?.trim() || "";
const CAMERA_AUTOSTART_KEY = "aimediart-camera-autostart";

export default function ScanWork2() {
  const navigate = useNavigate();
  const { t } = useTranslation("visitor");
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() || "";
  const artworkId = searchParams.get("artwork_id")?.trim() || "";
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  /** Tente le démarrage au montage (après autorisation une fois, localStorage accélère les visites suivantes). */
  const [cameraAutoStartEnabled, setCameraAutoStartEnabled] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showAssistHint, setShowAssistHint] = useState(false);
  const [isExitPopupOpen, setIsExitPopupOpen] = useState(false);
  const [agencyName, setAgencyName] = useState(AGENCY_NAME_MISSING);
  const hasAgencyName =
    agencyName.trim().length > 0 && agencyName.trim().toUpperCase() !== AGENCY_NAME_MISSING;
  const hasScannedRef = useRef(false);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const assistTimeoutRef = useRef<number | null>(null);
  const startingCameraRef = useRef(false);
  const autostartAttemptedRef = useRef(false);
  const lastInvalidScanToastRef = useRef(0);
  const cameraSessionRef = useRef<NativeCameraQrSession | null>(null);
  const qrImageInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const exitTarget = expoId ? `/scan?expo_id=${encodeURIComponent(expoId)}` : "/scan";

  const handleQuit = () => {
    void (async () => {
      await supabase.auth.signOut({ scope: "local" });
      navigate("/organisation");
    })();
  };

  useEffect(() => {
    let cancelled = false;

    const fetchAgencyNameById = async (agencyId: string) => {
      const { data: agencyData } = await supabase
        .from("agencies")
        .select("name_agency")
        .eq("id", agencyId)
        .limit(1);
      if (cancelled) return;

      const firstAgency = ((agencyData as Array<{ name_agency?: string | null }> | null) ?? [])[0] ?? null;
      const value = firstAgency?.name_agency?.trim() || AGENCY_NAME_MISSING;
      setAgencyName(value);
    };

    const loadAgencyName = async () => {
      if (artworkId) {
        const { data: artworkData } = await supabase
          .from("artworks")
          .select("*, agencies(name_agency)")
          .eq("artwork_id", artworkId)
          .limit(1);
        if (cancelled) return;

        const firstArtwork =
          ((artworkData as Array<{
            artwork_agency_id?: string | null;
            agencies?: { name_agency?: string | null } | { name_agency?: string | null }[] | null;
          }> | null) ?? [])[0];
        const fromJoin = resolveAgencyName(firstArtwork?.agencies);
        if (fromJoin !== AGENCY_NAME_MISSING) {
          setAgencyName(fromJoin);
          return;
        }
        const artworkAgencyId = firstArtwork?.artwork_agency_id?.trim() || "";
        if (artworkAgencyId) {
          await fetchAgencyNameById(artworkAgencyId);
          return;
        }
      }

      if (!expoId) {
        if (DEFAULT_AGENCY_ID) {
          await fetchAgencyNameById(DEFAULT_AGENCY_ID);
        } else {
          setAgencyName(AGENCY_NAME_MISSING);
        }
        return;
      }

      const { data: expoData } = await supabase
        .from("expos")
        .select("agency_id")
        .eq("id", expoId)
        .limit(1);
      if (cancelled) return;

      const firstExpo = ((expoData as Array<{ agency_id?: string | null }> | null) ?? [])[0];
      const agencyId = firstExpo?.agency_id?.trim() || "";
      if (!agencyId) {
        if (DEFAULT_AGENCY_ID) {
          await fetchAgencyNameById(DEFAULT_AGENCY_ID);
        } else {
          setAgencyName(AGENCY_NAME_MISSING);
        }
        return;
      }

      await fetchAgencyNameById(agencyId);
    };

    void loadAgencyName();
    return () => {
      cancelled = true;
    };
  }, [artworkId, expoId]);

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
          toast.message(t("scanner.qr_not_recognized_title"), {
            description: t("scanner.qr_not_recognized_desc"),
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
    [expoId, navigate, t],
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
        await startQrWebcamScanner(
          qr,
          QR_READER_ELEMENT_ID,
          buildQrScannerCameraConfig(),
          handleQrDecoded,
          undefined,
          { shouldContinue: () => mountedRef.current },
        );
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
      if (e instanceof QrScannerAbortedError || !mountedRef.current) return;

      const msg = e instanceof Error ? e.message : "Accès caméra impossible.";
      const isInsecureContext = typeof window !== "undefined" && !window.isSecureContext;
      if (import.meta.env.DEV) {
        console.error("[scanner] démarrage caméra", e);
      }
      setCameraError(
        isInsecureContext
          ? t("scanner.camera_blocked_https")
          : /permission|denied|notallowed|not allowed/i.test(msg)
            ? t("scanner.camera_denied")
            : /notfound|no camera|device not found|requested device not found/i.test(msg)
              ? t("scanner.camera_not_found")
              : /notreadable|in use|busy|track start/i.test(msg)
                ? t("scanner.camera_in_use")
                : import.meta.env.DEV && msg.trim()
                  ? msg
                  : t("scanner.camera_unavailable"),
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
  }, [cameraReady, getOrCreateFileQrReader, handleQrDecoded, t]);

  const handleQrImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      let qr: Html5Qrcode;
      try {
        qr = getOrCreateFileQrReader();
      } catch {
        reportQrScannerUnavailable();
        toast.error(t("scanner.file_unavailable"));
        return;
      }
      try {
        const text = await scanQrFromImageFile(qr, file);
        handleQrDecoded(text);
      } catch {
        reportQrUnreadableImage();
        toast.error(t("scanner.qr_unreadable_image"));
      }
    },
    [getOrCreateFileQrReader, handleQrDecoded, t],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    let innerFrameId = 0;
    const frameId = requestAnimationFrame(() => {
      innerFrameId = requestAnimationFrame(() => {
        void startCamera();
      });
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (innerFrameId) cancelAnimationFrame(innerFrameId);
    };
  }, [cameraAutoStartEnabled, cameraReady, startCamera]);

  const toggleTorch = async () => {
    if (!torchSupported) return;
    const nextTorchValue = !torchOn;
    if (cameraSessionRef.current) {
      const ok = await cameraSessionRef.current.setTorch(nextTorchValue);
      if (ok) setTorchOn(nextTorchValue);
      else {
        reportQrTorchError();
        setCameraError(t("scanner.torch_failed"));
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
      setCameraError(t("scanner.torch_failed"));
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-6 pt-3">
      <div className="relative w-full max-w-[320px]">
        <div className="mb-3 flex items-start">
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
                aria-label={torchOn ? t("scanner.torch_off_aria") : t("scanner.torch_on_aria")}
                title={torchOn ? t("scanner.torch_off_title") : t("scanner.torch_on_title")}
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
              {startingCamera ? t("scanner.start_camera_loading") : t("scanner.start_camera")}
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
              {t("scanner.import_qr_photo")}
            </Button>
          )}

          <div className="text-center text-xs text-muted-foreground leading-relaxed">
            <p className="inline-flex items-center justify-center gap-1 font-semibold">
              <Lightbulb className="h-3.5 w-3.5" />
              {t("scanner.tip")}
            </p>
            <p>{t("scanner.tip_line1")}</p>
            <p>{t("scanner.tip_line2")}</p>
          </div>

          <Button type="button" variant="outline" className="w-full border-border bg-white text-sm" onClick={handleQuit}>
            {t("scanner.quit_visit")}
          </Button>
        </div>
      </div>

      {isExitPopupOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setIsExitPopupOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-[320px] rounded-lg bg-white p-4 text-center"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("scanner.exit_dialog_aria")}
          >
            <div className="mb-3 flex items-start">
              <AimediartBrandLogoBlock size="sm" animateHeart />
            </div>
            <p className="text-sm font-semibold leading-relaxed">
              {t("scanner.exit_thanks_intro")}
              <br />
              {hasAgencyName ? (
                <Trans
                  t={t}
                  i18nKey="scanner.exit_thanks_with_agency"
                  values={{ agency: agencyName }}
                  components={{ brand: <span className="text-accent" /> }}
                />
              ) : (
                <Trans
                  t={t}
                  i18nKey="scanner.exit_thanks_no_agency"
                  components={{ brand: <span className="text-accent" /> }}
                />
              )}
              <br />
              {t("scanner.exit_see_you")}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button type="button" className="w-full" onClick={() => navigate(exitTarget)}>
                {t("scanner.exit_quit")}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setIsExitPopupOpen(false)}>
                {t("scanner.exit_back")}
              </Button>
            </div>
          </div>
        </div>
      )}

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
}
