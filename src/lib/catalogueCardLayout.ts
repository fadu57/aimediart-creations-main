/** Hauteur fixe des cartes œuvre en layout horizontal (sm+). */
export const CATALOGUE_CARD_HEIGHT_PX = 296;

/**
 * Mobile : hauteur auto (stack vertical).
 * sm+ : hauteur fixe pour le layout horizontal image | contenu.
 */
export const CATALOGUE_CARD_HEIGHT_CLASS = "h-auto sm:h-[296px]";

/** Espace entre les cartes dans le défilement vertical d’un regroupement. */
export const CATALOGUE_DECK_SLIDE_GAP_PX = 20;

/** Aperçu de la carte suivante dans la zone de scroll du regroupement. */
export const CATALOGUE_DECK_PEEK_PX = 64;

/** Hauteur visible de la zone de scroll (carte active + aperçu) — sm+ uniquement. */
export const CATALOGUE_DECK_VIEWPORT_PX =
  CATALOGUE_CARD_HEIGHT_PX + CATALOGUE_DECK_PEEK_PX;

/** Pas de scroll vertical (carte + gap) — sm+ uniquement. */
export const CATALOGUE_DECK_SLIDE_STRIDE_PX =
  CATALOGUE_CARD_HEIGHT_PX + CATALOGUE_DECK_SLIDE_GAP_PX;

/** Une ligne de la grille catalogue (md+) = une carte. */
export const CATALOGUE_GRID_ROW_CLASS = "md:auto-rows-[296px]";

/** Un bloc regroupement = 2 lignes de grille (2 cartes + gap). */
export const CATALOGUE_GROUP_DECK_GRID_CLASS = "md:row-span-2";
