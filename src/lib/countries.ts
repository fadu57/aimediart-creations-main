/** Pays pour le champ `pays` (table `artists`), indicatif et code ISO pour flag-icons (lipis). */

export type CountryOption = {
  label: string;
  /** Indicatif E.164 (ex. "+33"). Vide pour « Autres » : saisie libre du numéro complet. */
  dial: string;
  /** Code ISO 3166-1 alpha-2 pour les classes CSS `fi fi-xx` (paquet flag-icons). */
  iso?: string;
};

/** Ordre d’affichage imposé pour le menu Pays. */
export const COUNTRY_OPTIONS: readonly CountryOption[] = [
  { label: "France", dial: "+33", iso: "fr" },
  { label: "Allemagne", dial: "+49", iso: "de" },
  { label: "Luxembourg", dial: "+352", iso: "lu" },
  { label: "Belgique", dial: "+32", iso: "be" },
  { label: "Pays-Bas", dial: "+31", iso: "nl" },
  { label: "Italie", dial: "+39", iso: "it" },
  { label: "Espagne", dial: "+34", iso: "es" },
  { label: "Portugal", dial: "+351", iso: "pt" },
  { label: "Etats-Unis", dial: "+1", iso: "us" },
  { label: "Autriche", dial: "+43", iso: "at" },
  { label: "Bulgarie", dial: "+359", iso: "bg" },
  { label: "Chypre", dial: "+357", iso: "cy" },
  { label: "Croatie", dial: "+385", iso: "hr" },
  { label: "Danemark", dial: "+45", iso: "dk" },
  { label: "Estonie", dial: "+372", iso: "ee" },
  { label: "Finlande", dial: "+358", iso: "fi" },
  { label: "Grèce", dial: "+30", iso: "gr" },
  { label: "Hongrie", dial: "+36", iso: "hu" },
  { label: "Irlande", dial: "+353", iso: "ie" },
  { label: "Lettonie", dial: "+371", iso: "lv" },
  { label: "Lituanie", dial: "+370", iso: "lt" },
  { label: "Malte", dial: "+356", iso: "mt" },
  { label: "Pologne", dial: "+48", iso: "pl" },
  { label: "Roumanie", dial: "+40", iso: "ro" },
  { label: "Slovaquie", dial: "+421", iso: "sk" },
  { label: "Slovénie", dial: "+386", iso: "si" },
  { label: "Suède", dial: "+46", iso: "se" },
  { label: "Tchéquie", dial: "+420", iso: "cz" },
  { label: "Autres", dial: "" },
] as const;

export function getCountryOption(label: string | undefined | null): CountryOption | undefined {
  if (!label) return undefined;
  return COUNTRY_OPTIONS.find((c) => c.label === label);
}

/**
 * Numéro complet pour la base : indicatif + national (chiffres), ou saisie libre si « Autres ».
 */
export function formatPhoneForStorage(pays: string, phoneInput: string): string | null {
  const trimmed = phoneInput.trim();
  if (!trimmed) return null;

  if (pays === "Autres") {
    return trimmed;
  }

  const opt = getCountryOption(pays);
  if (!opt?.dial) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let national = digits;
  /** Retire le (ou les) 0 initiaux du format national (ex. France 06… → 6…). */
  while (national.startsWith("0")) {
    national = national.slice(1);
  }
  if (!national) return null;

  const dialDigits = opt.dial.replace(/\D/g, "");
  return `+${dialDigits}${national}`;
}

/**
 * Saisie du numéro national : chiffres uniquement, sans 0 initial (ex. France 060708… → 60708…).
 * « Autres » : conserve la saisie (souvent numéro déjà international).
 * « Etats-Unis » : chiffres sans retirer de 0 en tête (codes régionaux).
 */
export function normalizeNationalPhoneInput(pays: string, raw: string): string {
  if (pays === "Autres") {
    return raw.trim();
  }
  if (pays === "Etats-Unis") {
    return raw.replace(/\D/g, "");
  }
  const opt = getCountryOption(pays);
  if (!opt?.dial) {
    return raw.replace(/\D/g, "");
  }
  let digits = raw.replace(/\D/g, "");
  while (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Pour réafficher un numéro stocké dans le champ local (sans indicatif affiché à part).
 */
export function splitStoredPhoneForForm(
  stored: string | null | undefined,
  pays: string,
): string {
  if (!stored?.trim()) return "";

  if (pays === "Autres") {
    return stored.trim();
  }

  const opt = getCountryOption(pays);
  if (!opt?.dial) return stored.trim();

  const dialDigits = opt.dial.replace(/\D/g, "");
  const compact = stored.replace(/\s/g, "").replace(/^\+/, "");

  if (compact.startsWith(dialDigits)) {
    let rest = compact.slice(dialDigits.length);
    while (rest.startsWith("0") && rest.length > 1) {
      rest = rest.slice(1);
    }
    return rest;
  }

  return stored.trim();
}
