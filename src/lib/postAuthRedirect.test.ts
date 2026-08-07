import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearPostRegistrationTarget, consumePostRegistrationTarget } from "@/lib/postAuthRedirect";

const FALLBACK = "/scan-work1";

describe("consumePostRegistrationTarget", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("retombe sur le fallback si rien n'est stocké", () => {
    expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
  });

  it("retombe sur le fallback si la valeur stockée est vide ou blanche", () => {
    sessionStorage.setItem("redirectAfterAuth", "   ");
    expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
  });

  it("priorise redirectAfterAuth et purge les deux clés dans tous les cas", () => {
    sessionStorage.setItem("redirectAfterAuth", `${window.location.origin}/oeuvres/123?ref=qr#top`);
    sessionStorage.setItem("redirectAfterLogin", `${window.location.origin}/autre-page`);

    expect(consumePostRegistrationTarget(FALLBACK)).toBe("/oeuvres/123?ref=qr#top");
    expect(sessionStorage.getItem("redirectAfterAuth")).toBeNull();
    expect(sessionStorage.getItem("redirectAfterLogin")).toBeNull();
  });

  it("retombe sur redirectAfterLogin quand redirectAfterAuth est absent (parcours Se connecter → Créer un compte)", () => {
    sessionStorage.setItem("redirectAfterLogin", `${window.location.origin}/oeuvres/456`);
    expect(consumePostRegistrationTarget(FALLBACK)).toBe("/oeuvres/456");
  });

  it("accepte une URL relative même origine", () => {
    sessionStorage.setItem("redirectAfterAuth", "/oeuvres/789");
    expect(consumePostRegistrationTarget(FALLBACK)).toBe("/oeuvres/789");
  });

  it.each([
    ["//evil.com/x", "protocol-relative"],
    ["https://evil.com/x", "origine absolue étrangère"],
    ["javascript:alert(1)", "scheme javascript:"],
    ["data:text/html,<script>alert(1)</script>", "scheme data:"],
    [`https://evil.com@${typeof window !== "undefined" ? window.location.host : "localhost"}/x`, "userinfo trompeur"],
  ])("rejette une valeur stockée dangereuse (%s : %s)", (malicious) => {
    sessionStorage.setItem("redirectAfterAuth", malicious);
    expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
  });

  it.each(["/register", "/register?expo_id=1", "/register/", "/Register", "/login", "/LOGIN"])(
    "rejette un rebond vers une page d'auth quelle que soit la casse (%s)",
    (authPath) => {
      sessionStorage.setItem("redirectAfterAuth", `${window.location.origin}${authPath}`);
      expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
    },
  );

  it("retombe sur le fallback et purge quand même les clés si sessionStorage lève (Safari privé / iframe sandboxée)", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });
    try {
      expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
    } finally {
      getItemSpy.mockRestore();
    }
  });
});

describe("clearPostRegistrationTarget", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("purge les deux clés sans lever si elles sont absentes", () => {
    expect(() => clearPostRegistrationTarget()).not.toThrow();
  });

  it("purge les deux clés quand elles sont présentes", () => {
    sessionStorage.setItem("redirectAfterAuth", "/x");
    sessionStorage.setItem("redirectAfterLogin", "/y");
    clearPostRegistrationTarget();
    expect(sessionStorage.getItem("redirectAfterAuth")).toBeNull();
    expect(sessionStorage.getItem("redirectAfterLogin")).toBeNull();
  });
});
