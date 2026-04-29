/** Types d'art (liste imposée). */
export const ARTIST_TYPE_OPTIONS = [
  "Photographe",
  "Peintre",
  "Sculpteur",
  "Dessinateur",
  "Graveur / Estampiste",
  "Céramiste d'art",
  "Plasticien",
  "Artiste vidéo",
  "Artiste cinétique",
  "Graffeur",
  "Street-artiste",
  "Mosaïste",
  "Illustrateur",
  "Calligraphe / Enlumineur",
  "Typographe d'art",
  "Maître verrier / Vitrailliste",
] as const;

export type ArtistTypeOption = (typeof ARTIST_TYPE_OPTIONS)[number];

/** Plateformes pour la table social_links. */
export const SOCIAL_LINK_TYPES = [
  "web",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "TikTok",
  "YouTube",
  "WhatsApp",
  "Pinterest",
  "X",
  "Portfolio",
  "Threads",
  "Bluesky",
  "Mastodon",
] as const;

export type SocialLinkType = (typeof SOCIAL_LINK_TYPES)[number];

export function emptySocialRecord(): Record<SocialLinkType, string> {
  return SOCIAL_LINK_TYPES.reduce(
    (acc, key) => {
      acc[key] = "";
      return acc;
    },
    {} as Record<SocialLinkType, string>,
  );
}
