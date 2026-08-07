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
    // Piège userinfo : la chaîne COMMENCE par la vraie origine (déjouerait un contrôle naïf en
    // startsWith), mais structurellement l'hôte est evil.com — `new URL(...).origin` doit le voir.
    [`${window.location.origin}@evil.com/x`, "userinfo trompeur (hôte réel = evil.com)"],
  ])("rejette une valeur stockée dangereuse (%s : %s)", (malicious) => {
    sessionStorage.setItem("redirectAfterAuth", malicious);
    expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
  });

  it("accepte un userinfo légitime sur la vraie origine (le userinfo ne fait pas partie de l'origin)", () => {
    const scheme = window.location.origin.match(/^https?:\/\//)?.[0] ?? "http://";
    const withUserinfo = window.location.origin.replace(scheme, `${scheme}visiteur@`);
    sessionStorage.setItem("redirectAfterAuth", `${withUserinfo}/oeuvres/1`);
    expect(consumePostRegistrationTarget(FALLBACK)).toBe("/oeuvres/1");
  });

  it.each([
    "/register",
    "/register?expo_id=1",
    "/register/",
    "/Register",
    "/register_visitor",
    "/register_visitor?expo_id=1",
    "/REGISTER_VISITOR",
    "/login",
    "/LOGIN",
    "/signup",
    "/SIGNUP",
  ])("rejette un rebond vers une page d'auth quelle que soit la casse (%s)", (authPath) => {
    sessionStorage.setItem("redirectAfterAuth", `${window.location.origin}${authPath}`);
    expect(consumePostRegistrationTarget(FALLBACK)).toBe(FALLBACK);
  });

  it("retombe sur le fallback et purge réellement les deux clés même si la lecture sessionStorage lève (Safari privé / iframe sandboxée)", () => {
    sessionStorage.setItem("redirectAfterAuth", `${window.location.origin}/oeuvres/1`);
    sessionStorage.setItem("redirectAfterLogin", `${window.location.origin}/oeuvres/2`);

    // Sous jsdom, `Storage.prototype` global ne correspond pas toujours au prototype réel de
    // l'instance sessionStorage : on spy sur le prototype effectif pour être sûr d'intercepter.
    const storageProto = Object.getPrototypeOf(sessionStorage) as Storage;
    const getItemSpy = vi.spyOn(storageProto, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    let result: string;
    let getItemCallCount: number;
    try {
      result = consumePostRegistrationTarget(FALLBACK);
      getItemCallCount = getItemSpy.mock.calls.length;
    } finally {
      getItemSpy.mockRestore();
    }

    // Preuve que le mock a bien intercepté l'appel : un spy qui n'intercepte rien (le piège
    // Storage.prototype vs prototype réel constaté sous ce jsdom) laisserait ce test passer pour
    // la mauvaise raison, en lisant simplement les valeurs pré-remplies normalement.
    expect(getItemCallCount).toBeGreaterThan(0);
    expect(result).toBe(FALLBACK);
    // Preuve de purge réelle (pas seulement "removeItem a été appelé sur un mock") : lecture avec
    // le vrai sessionStorage, une fois le spy restauré.
    expect(sessionStorage.getItem("redirectAfterAuth")).toBeNull();
    expect(sessionStorage.getItem("redirectAfterLogin")).toBeNull();
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
