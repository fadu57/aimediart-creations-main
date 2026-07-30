import { describe, expect, it } from "vitest";
import {
  parseArtworkGroupIdFromInput,
  parseArtworkIdFromInput,
  resolveScanTargetFromQr,
} from "@/lib/oeuvrePublicUrl";

const ARTWORK_ID = "cacfc463-1111-4a11-9a11-111111111111";
const EXPO_ID = "2664fa95-2222-4b22-9b22-222222222222";
const GROUP_ID = "9f3c2a10-3333-4c33-9c33-333333333333";

describe("parseArtworkGroupIdFromInput", () => {
  it("ne renvoie pas l'UUID d'une œuvre pour une URL /artwork/{id} sans indice de regroupement (AIM-14)", () => {
    const url = `https://www.aimediart.com/artwork/${ARTWORK_ID}?expo_id=${EXPO_ID}`;
    expect(parseArtworkGroupIdFromInput(url)).toBe("");
  });

  it("extrait bien le groupId d'une URL /artwork-group/{groupId}", () => {
    const url = `https://www.aimediart.com/artwork-group/${GROUP_ID}?expo_id=${EXPO_ID}`;
    expect(parseArtworkGroupIdFromInput(url)).toBe(GROUP_ID);
  });

  it("extrait bien le groupId via le paramètre group_id", () => {
    const url = `https://www.aimediart.com/scan-work1?group_id=${GROUP_ID}`;
    expect(parseArtworkGroupIdFromInput(url)).toBe(GROUP_ID);
  });

  it("garde le repli texte-libre pour un contenu non-URL (UUID seul scanné brut)", () => {
    expect(parseArtworkGroupIdFromInput(`préfixe ${GROUP_ID} suffixe`)).toBe(GROUP_ID);
  });
});

describe("resolveScanTargetFromQr", () => {
  it("route un QR œuvre in-app vers l'œuvre, pas vers un regroupement inexistant (AIM-14/AIM-144)", () => {
    const url = `https://www.aimediart.com/artwork/${ARTWORK_ID}?expo_id=${EXPO_ID}`;
    expect(resolveScanTargetFromQr(url)).toEqual({ kind: "artwork", artworkId: ARTWORK_ID });
  });

  it("route un QR œuvre relatif vers l'œuvre", () => {
    const url = `/artwork/${ARTWORK_ID}?expo_id=${EXPO_ID}`;
    expect(resolveScanTargetFromQr(url)).toEqual({ kind: "artwork", artworkId: ARTWORK_ID });
  });

  it("route un vrai QR regroupement vers le regroupement", () => {
    const url = `https://www.aimediart.com/artwork-group/${GROUP_ID}?expo_id=${EXPO_ID}`;
    expect(resolveScanTargetFromQr(url)).toEqual({ kind: "artwork_group", groupId: GROUP_ID });
  });
});

describe("parseArtworkIdFromInput", () => {
  it("reste inchangé pour une URL œuvre valide", () => {
    const url = `https://www.aimediart.com/artwork/${ARTWORK_ID}?expo_id=${EXPO_ID}`;
    expect(parseArtworkIdFromInput(url)).toBe(ARTWORK_ID);
  });
});
