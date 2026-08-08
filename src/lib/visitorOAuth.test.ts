import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearVisitorRegisterOAuthFlag,
  hasVisitorRegisterOAuthFlag,
  VISITOR_REGISTER_OAUTH_FLAG,
} from "@/lib/visitorOAuth";

describe("hasVisitorRegisterOAuthFlag", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("retourne false si le flag est absent", () => {
    expect(hasVisitorRegisterOAuthFlag()).toBe(false);
  });

  it("retourne true si le flag vaut \"1\"", () => {
    sessionStorage.setItem(VISITOR_REGISTER_OAUTH_FLAG, "1");
    expect(hasVisitorRegisterOAuthFlag()).toBe(true);
  });

  it("retourne false pour toute autre valeur (flag corrompu)", () => {
    sessionStorage.setItem(VISITOR_REGISTER_OAUTH_FLAG, "true");
    expect(hasVisitorRegisterOAuthFlag()).toBe(false);
  });

  it("retourne false (sans lever) si la lecture sessionStorage lève (Safari privé / iframe sandboxée)", () => {
    sessionStorage.setItem(VISITOR_REGISTER_OAUTH_FLAG, "1");

    // Sous jsdom, `Storage.prototype` global ne correspond pas toujours au prototype réel de
    // l'instance sessionStorage : on spy sur le prototype effectif pour être sûr d'intercepter
    // (même piège que dans postAuthRedirect.test.ts).
    const storageProto = Object.getPrototypeOf(sessionStorage) as Storage;
    const getItemSpy = vi.spyOn(storageProto, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    let result: boolean;
    let getItemCallCount: number;
    try {
      result = hasVisitorRegisterOAuthFlag();
      getItemCallCount = getItemSpy.mock.calls.length;
    } finally {
      getItemSpy.mockRestore();
    }

    // Preuve que le mock a bien intercepté l'appel (sinon ce test passerait pour la mauvaise
    // raison, en lisant simplement la valeur pré-remplie normalement).
    expect(getItemCallCount).toBeGreaterThan(0);
    expect(result).toBe(false);
  });
});

describe("clearVisitorRegisterOAuthFlag", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("ne lève pas si le flag est absent", () => {
    expect(() => clearVisitorRegisterOAuthFlag()).not.toThrow();
  });

  it("purge réellement le flag quand il est présent", () => {
    sessionStorage.setItem(VISITOR_REGISTER_OAUTH_FLAG, "1");
    clearVisitorRegisterOAuthFlag();
    expect(sessionStorage.getItem(VISITOR_REGISTER_OAUTH_FLAG)).toBeNull();
  });

  it("ne lève pas et n'écrase rien d'autre si la purge sessionStorage lève", () => {
    sessionStorage.setItem(VISITOR_REGISTER_OAUTH_FLAG, "1");

    const storageProto = Object.getPrototypeOf(sessionStorage) as Storage;
    const removeItemSpy = vi.spyOn(storageProto, "removeItem").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });

    let removeItemCallCount: number;
    try {
      expect(() => clearVisitorRegisterOAuthFlag()).not.toThrow();
      removeItemCallCount = removeItemSpy.mock.calls.length;
    } finally {
      removeItemSpy.mockRestore();
    }

    // Preuve que le mock a bien intercepté l'appel.
    expect(removeItemCallCount).toBeGreaterThan(0);
  });
});
