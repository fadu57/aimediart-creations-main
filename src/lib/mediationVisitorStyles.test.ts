import { describe, it, expect } from "vitest";
import { canonicalMediationStyleCode, MEDIATION_VISITOR_STYLE_CODES, resolveVisitorMediationText } from "@/lib/mediationVisitorStyles";
import { mediationTextForStyleCodeAndLang } from "@/lib/artworkDescriptionI18n";

const glacierLike = {
  fr: {
    simple: "txt-simple",
    poetique: "txt-poetique",
    expert: "txt-expert",
    senior: "txt-senior",
    pote: "txt-pote",
    conteur: "txt-conteur",
    "hip-hopeur": "txt-hip",
    enfant: "txt-enfant",
  },
} as const;

describe("mediationVisitorStyles / Glacier-like JSON", () => {
  it("canonicalise les codes connus (variantes tiret / underscore)", () => {
    expect(canonicalMediationStyleCode(" Hip-Hopeur ")).toBe("hip-hopeur");
    expect(canonicalMediationStyleCode("hip_hopeur")).toBe("hip-hopeur");
    expect(canonicalMediationStyleCode("SENIOR")).toBe("senior");
    expect(canonicalMediationStyleCode("inconnu")).toBeNull();
  });

  it("lit exactement fr[styleCode] pour les 8 styles (langue UI fr)", () => {
    for (const code of MEDIATION_VISITOR_STYLE_CODES) {
      expect(mediationTextForStyleCodeAndLang(glacierLike, code, "fr")).toBe(glacierLike.fr[code]);
    }
  });

  it("ne prend pas le texte d’un autre style si la clé manque", () => {
    const partial = { fr: { simple: "seulement-simple" } };
    expect(mediationTextForStyleCodeAndLang(partial, "poetique", "fr")).toBe("");
  });

  it("tolère clé langue en casse variable et clés de style avec casse / tiret unicode", () => {
    const messy = {
      FR: {
        Senior: "s1",
        POTE: "p1",
        "hip\u2011hopeur": "h1",
      },
    };
    expect(mediationTextForStyleCodeAndLang(messy, "senior", "fr")).toBe("s1");
    expect(mediationTextForStyleCodeAndLang(messy, "pote", "fr")).toBe("p1");
    expect(mediationTextForStyleCodeAndLang(messy, "hip-hopeur", "fr")).toBe("h1");
  });

  it("aplatit mediations_par_style et unwrap { text }", () => {
    const nested = {
      fr: {
        mediations_par_style: {
          senior: "S",
          pote: "P",
          "hip-hopeur": "H",
        },
      },
    };
    expect(mediationTextForStyleCodeAndLang(nested, "senior", "fr")).toBe("S");
    expect(mediationTextForStyleCodeAndLang(nested, "pote", "fr")).toBe("P");
    expect(mediationTextForStyleCodeAndLang(nested, "hip-hopeur", "fr")).toBe("H");

    const wrapped = {
      fr: {
        senior: { text: "S2" },
        pote: { content: "P2" },
      },
    };
    expect(mediationTextForStyleCodeAndLang(wrapped, "senior", "fr")).toBe("S2");
    expect(mediationTextForStyleCodeAndLang(wrapped, "pote", "fr")).toBe("P2");
  });

  it("n’utilise pas de clés préfixées non canoniques (persona-*)", () => {
    const prefixed = { fr: { "persona-pote": "P9", "slot-senior": "S9" } };
    expect(mediationTextForStyleCodeAndLang(prefixed, "pote", "fr")).toBe("");
    expect(mediationTextForStyleCodeAndLang(prefixed, "senior", "fr")).toBe("");
  });

  it("resolveVisitorMediationText n’utilise que la clé canonique", () => {
    const byId = { fr: { "42": "via-id", pote: "texte-pote" } };
    expect(resolveVisitorMediationText(byId, "pote", "fr", { id: 42, code: "pote" })).toBe("texte-pote");
    expect(resolveVisitorMediationText(byId, "senior", "fr", { id: 42, code: "pote" })).toBe("");
  });

  it("normalise les clés de style avec accents côté JSON", () => {
    const accents = { fr: { sénior: "S3", pôte: "P3" } };
    expect(mediationTextForStyleCodeAndLang(accents, "senior", "fr")).toBe("S3");
    expect(mediationTextForStyleCodeAndLang(accents, "pote", "fr")).toBe("P3");
  });

  it("accepte artwork_description_i18n sérialisé en une seule chaîne JSON", () => {
    expect(mediationTextForStyleCodeAndLang(JSON.stringify(glacierLike), "senior", "fr")).toBe("txt-senior");
    expect(mediationTextForStyleCodeAndLang(JSON.stringify(glacierLike), "pote", "fr")).toBe("txt-pote");
    expect(mediationTextForStyleCodeAndLang(JSON.stringify(glacierLike), "hip-hopeur", "fr")).toBe("txt-hip");
  });
});