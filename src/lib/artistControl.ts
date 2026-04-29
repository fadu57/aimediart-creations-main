import type { ArtistTypeOption } from "./artistFormConstants";

/**
 * Nettoie une chaîne : sans espaces, sans majuscules, sans signes ni accents
 * (lettres et chiffres uniquement, en minuscules).
 */
export function normalizeForArtistControl(input: string): string {
  const deaccent = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return deaccent.replace(/[^a-z0-9]/gu, "");
}

/**
 * Calcule artist_control à partir du prénom, du nom et des types d'art sélectionnés
 * (types triés pour un résultat stable).
 */
export function computeArtistControl(
  prenom: string,
  name: string,
  artistTypes: readonly ArtistTypeOption[] | string[],
): string {
  const sortedTypes = [...artistTypes].sort((a, b) => a.localeCompare(b, "fr"));
  const raw = `${prenom}${name}${sortedTypes.join("")}`;
  return normalizeForArtistControl(raw);
}

/**
 * Initiales pour `initiale_artist` : première lettre (en majuscules) de chaque mot
 * du prénom, puis de chaque mot du nom. Les mots sont séparés par des espaces.
 */
export function computeInitialeArtist(prenom: string, name: string): string {
  const initialsFrom = (s: string) =>
    s
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const m = word.match(/\p{L}/u);
        return m ? m[0].toLocaleUpperCase("fr-FR") : "";
      })
      .join("");

  return `${initialsFrom(prenom)}${initialsFrom(name)}`;
}
