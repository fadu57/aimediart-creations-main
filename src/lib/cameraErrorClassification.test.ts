import { describe, expect, it } from "vitest";
import { classifyCameraError } from "@/lib/cameraErrorClassification";

/**
 * AIM-31 (VIS-SCA-02/M2) : après un refus de permission caméra, la nouvelle
 * tentative doit être classée "denied", jamais retomber sur "unknown" (qui
 * produit le message trompeur "Caméra indisponible pour le moment").
 *
 * Cas couvert en priorité : DOMException.name est toujours renseigné par le
 * navigateur, mais DOMException.message peut être une chaîne vide selon les
 * user agents — la classification doit donc s'appuyer sur `.name` en premier,
 * avant tout pattern-matching sur `.message`.
 */
describe("classifyCameraError", () => {
  it("classe un refus de permission natif même si le message est vide (AIM-31)", () => {
    const error = new DOMException("", "NotAllowedError");
    expect(classifyCameraError(error)).toBe("denied");
  });

  it("classe un refus de permission natif avec message explicite", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    expect(classifyCameraError(error)).toBe("denied");
  });

  it("classe l'ancien nom legacy PermissionDeniedError", () => {
    const error = new DOMException("", "PermissionDeniedError");
    expect(classifyCameraError(error)).toBe("denied");
  });

  it("classe une erreur wrappée (html5-qrcode) via le message quand le name est perdu", () => {
    const error = new Error("Error getting userMedia, error = NotAllowedError: Permission denied");
    expect(classifyCameraError(error)).toBe("denied");
  });

  it("classe une caméra introuvable", () => {
    const error = new DOMException("", "NotFoundError");
    expect(classifyCameraError(error)).toBe("not_found");
  });

  it("classe une caméra introuvable via message wrappé", () => {
    const error = new Error("Requested device not found");
    expect(classifyCameraError(error)).toBe("not_found");
  });

  it("classe une caméra occupée par une autre application", () => {
    const error = new DOMException("", "NotReadableError");
    expect(classifyCameraError(error)).toBe("in_use");
  });

  it("classe une caméra occupée via message wrappé", () => {
    const error = new Error("Could not start video source, track start error");
    expect(classifyCameraError(error)).toBe("in_use");
  });

  it("retombe sur unknown pour une erreur générique non reconnue", () => {
    const error = new Error("Something exploded");
    expect(classifyCameraError(error)).toBe("unknown");
  });

  it("retombe sur unknown pour une valeur qui n'est pas une Error", () => {
    expect(classifyCameraError("boom")).toBe("unknown");
    expect(classifyCameraError(undefined)).toBe("unknown");
  });
});
