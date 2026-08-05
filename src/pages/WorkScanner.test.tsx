import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkScanner from "@/pages/WorkScanner";

/**
 * AIM-31 (VIS-SCA-02/M2, VIS-SCA-07) — après un refus de permission caméra :
 * AC1 : le message affiché reflète l'état réel (refus, pas "indisponible").
 * AC2 : une issue de secours (import photo QR) reste accessible, jamais
 *       seulement "Quitter la visite".
 *
 * `t` est mocké en identité pour vérifier les clés i18n effectivement
 * sélectionnées, indépendamment du texte traduit final.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/useVisitorExitDiaryFlow", () => ({
  useVisitorExitDiaryFlow: () => ({ requestExitVisit: vi.fn(), exitDiaryDialogs: null }),
}));

vi.mock("@/lib/reportVisitorScanError", () => ({
  reportQrCameraError: vi.fn(),
  reportQrInvalid: vi.fn(),
  reportQrScannerUnavailable: vi.fn(),
  reportQrTorchError: vi.fn(),
  reportQrUnreadableImage: vi.fn(),
}));

vi.mock("@/lib/qrCodeScanFriendly", () => ({
  buildQrScannerCameraConfig: vi.fn(),
  createHtml5QrcodeReader: vi.fn(),
  safeStopQrScanner: vi.fn(),
  scanQrFromImageFile: vi.fn(),
  QrScannerAbortedError: class MockQrScannerAbortedError extends Error {},
  // Désactive l'auto-start pour piloter le clic de façon déterministe dans le test.
  requiresCameraUserGesture: () => true,
  startQrWebcamScanner: vi.fn(),
}));

const { startNativeCameraQrScanner } = vi.hoisted(() => ({
  startNativeCameraQrScanner: vi.fn(),
}));
vi.mock("@/lib/qrNativeCameraScanner", () => ({
  isNativeQrScanSupported: () => true,
  startNativeCameraQrScanner,
}));

describe("WorkScanner — refus de permission caméra (AIM-31)", () => {
  beforeEach(() => {
    startNativeCameraQrScanner.mockReset();
    // jsdom rapporte isSecureContext=false par défaut ; on simule un contexte
    // sécurisé pour isoler le cas testé (refus de permission) du cas HTTPS.
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  it("affiche le message de refus (pas 'indisponible') et garde une issue de secours accessible", async () => {
    startNativeCameraQrScanner.mockRejectedValue(new DOMException("", "NotAllowedError"));

    render(
      <MemoryRouter initialEntries={["/scan-work1?expo_id=expo-test"]}>
        <WorkScanner />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "scanner.start_camera" }));

    // AC1 : message correspondant à l'état réel, jamais le message générique trompeur.
    await waitFor(() => {
      expect(screen.getByText("scanner.camera_denied")).toBeInTheDocument();
    });
    expect(screen.queryByText("scanner.camera_unavailable")).not.toBeInTheDocument();

    // AC2 : le fallback "importer une photo" reste accessible — jamais un
    // cul-de-sac ne laissant que "Quitter la visite" comme seule issue.
    expect(screen.getByRole("button", { name: "scanner.import_qr_photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "scanner.quit_visit" })).toBeInTheDocument();
  });
});
