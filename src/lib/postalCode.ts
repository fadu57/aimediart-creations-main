import { getCountryOption } from "@/lib/countries";

/** Régimes de validation utilisés dans le formulaire (pas de regex « universelle »). */
export type PostalRegion =
  | "FR"
  | "US"
  | "CA"
  | "GB"
  | "DE"
  | "BE"
  | "ES"
  | "IT"
  | "NL"
  | "AU"
  | "JP"
  | "OTHER";

const ISO_UPPER_TO_REGION: Record<string, PostalRegion> = {
  FR: "FR",
  US: "US",
  CA: "CA",
  GB: "GB",
  DE: "DE",
  BE: "BE",
  ES: "ES",
  IT: "IT",
  NL: "NL",
  AU: "AU",
  JP: "JP",
};

/**
 * Coupe les espaces, met en majuscules (pour comparaisons / stockage postal international).
 */
export function normalizePostalCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Associe le libellé pays du formulaire (`COUNTRY_OPTIONS.label`) au régime de validation.
 */
export function postalRegionFromCountryLabel(countryLabel: string): PostalRegion {
  const iso = getCountryOption(countryLabel)?.iso?.toUpperCase();
  if (iso && ISO_UPPER_TO_REGION[iso]) return ISO_UPPER_TO_REGION[iso];
  return "OTHER";
}

function compactPostalForTest(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

function validateForRegion(normalized: string, region: PostalRegion): boolean {
  const compact = compactPostalForTest(normalized);
  switch (region) {
    case "FR":
      return /^\d{5}$/.test(compact);
    case "US": {
      const digits = compact.replace(/-/g, "");
      return /^\d{5}$/.test(digits) || /^\d{9}$/.test(digits);
    }
    case "CA":
      return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact);
    case "GB":
      return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
    case "DE":
    case "ES":
    case "IT":
      return /^\d{5}$/.test(compact);
    case "BE":
      return /^\d{4}$/.test(compact);
    case "NL":
      return /^\d{4}[A-Z]{2}$/.test(compact);
    case "AU":
      return /^\d{4}$/.test(compact);
    case "JP":
      return /^\d{7}$/.test(compact.replace(/-/g, ""));
    case "OTHER":
      return /^[\dA-Z\- ]{3,16}$/.test(normalized.trim()) && /\d|[A-Z]/.test(normalized);
    default:
      return /^[\dA-Z\- ]{3,16}$/.test(normalized.trim());
  }
}

const REGION_ERROR_FR: Record<PostalRegion, string> = {
  FR: "Code postal français : attendu 5 chiffres (ex. 75001).",
  US: "Code ZIP américain : 5 chiffres ou 5+4 chiffres (ex. 94107 ou 941071234).",
  CA: "Code postal canadien : format A1A1A1 (ex. K1A0A9).",
  GB: "Code postal britannique : format type SW1A1AA.",
  DE: "Code postal allemand : 5 chiffres.",
  BE: "Code postal belge : 4 chiffres.",
  ES: "Code postal espagnol : 5 chiffres.",
  IT: "Code postal italien : 5 chiffres.",
  NL: "Code postal néerlandais : 4 chiffres + 2 lettres (ex. 1012 AB).",
  AU: "Code postal australien : 4 chiffres.",
  JP: "Code postal japonais : 7 chiffres (avec ou sans tiret).",
  OTHER: "Code postal invalide pour ce pays (3 à 16 caractères : lettres, chiffres, espaces ou tirets).",
};

export function validatePostalCodeForCountryLabel(
  normalized: string,
  countryLabel: string,
): { ok: true } | { ok: false; message: string } {
  if (!normalized) return { ok: true };
  const region = postalRegionFromCountryLabel(countryLabel);
  if (!validateForRegion(normalized, region)) {
    return { ok: false, message: REGION_ERROR_FR[region] };
  }
  return { ok: true };
}

/** Libellés d’exemple pour le champ code postal selon le pays sélectionné. */
export function postalPlaceholderForCountryLabel(countryLabel: string): string {
  const region = postalRegionFromCountryLabel(countryLabel);
  switch (region) {
    case "FR":
      return "ex. 75001";
    case "US":
      return "ex. 94107";
    case "CA":
      return "ex. K1A 0A9";
    case "GB":
      return "ex. SW1A 1AA";
    case "DE":
      return "ex. 10115";
    case "BE":
      return "ex. 1000";
    case "ES":
      return "ex. 28001";
    case "IT":
      return "ex. 00118";
    case "NL":
      return "ex. 1012 AB";
    case "AU":
      return "ex. 2000";
    case "JP":
      return "ex. 100-0001";
    default:
      return "Code postal";
  }
}
