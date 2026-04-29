/**
 * Matrice d’accès aux menus et pages : stockée dans `matrice_securite`
 * (`ressource` = clés ci-dessous, `lecture` = case cochée, `ecriture` = false pour ces lignes).
 */

export const NAV_MATRIX_CIBLES = [
  "menu_home",
  "menu_agence",
  "menu_user",
  "menu_expos",
  "menu_artiste",
  "menu_catalogue",
  "menu_stats",
  "page_œuvre",
] as const;

export type NavMatrixCible = (typeof NAV_MATRIX_CIBLES)[number];

/** Pages hors menu (contrôle d’accès par chemin). */
export const NAV_MATRIX_PAGE_ROWS: { key: NavMatrixCible; label: string }[] = [{ key: "page_œuvre", label: "Œuvre" }];

/** Barre principale : une seule définition (ordre = header = tableau Paramètres « Menus »). */
export type HeaderNavEntry = {
  key: NavMatrixCible;
  to: string;
  label: string;
  /** Icône maison pour l’accueil ; les autres entrées sont en texte. */
  icon?: "house";
};

/** Menus affichés dans le header (inclut Accueil, Organisation, Expos, etc.). */
export const HEADER_NAV_ITEMS: HeaderNavEntry[] = [
  { key: "menu_home", to: "/dashboard", label: "Accueil", icon: "house" },
  { key: "menu_agence", to: "/agencies", label: "Organisation" },
  { key: "menu_user", to: "/user", label: "User" },
  { key: "menu_expos", to: "/expos", label: "Expos" },
  { key: "menu_artiste", to: "/artistes", label: "Artistes" },
  { key: "menu_catalogue", to: "/catalogue", label: "Catalogue" },
  { key: "menu_stats", to: "/statistiques", label: "Statistiques" },
];

/** Lignes « Menus » du tableau Paramètres : mêmes libellés et ordre que `HEADER_NAV_ITEMS`. */
export const NAV_MATRIX_MENU_ROWS: { key: NavMatrixCible; label: string; to: string }[] = HEADER_NAV_ITEMS.map(
  ({ key, to, label }) => ({ key, to, label }),
);

export type NavAccessMap = Record<NavMatrixCible, boolean>;

/** Entrées de menu principal (header) — utilisé pour détecter une matrice « tout à faux » par erreur. */
const HEADER_MENU_MATRIX_KEYS: NavMatrixCible[] = [
  "menu_home",
  "menu_agence",
  "menu_user",
  "menu_expos",
  "menu_artiste",
  "menu_catalogue",
  "menu_stats",
];

function allTrue(): NavAccessMap {
  return {
    menu_home: true,
    menu_agence: true,
    menu_user: true,
    menu_expos: true,
    menu_artiste: true,
    menu_catalogue: true,
    menu_stats: true,
    page_œuvre: true,
  };
}

function allFalse(): NavAccessMap {
  return {
    menu_home: false,
    menu_agence: false,
    menu_user: false,
    menu_expos: false,
    menu_artiste: false,
    menu_catalogue: false,
    menu_stats: false,
    page_œuvre: false,
  };
}

/** Valeurs par défaut strictes : rôle 1 tout ouvert, sinon fermé (sauf visiteur -> page Œuvre). */
export function defaultNavAccessForRole(roleId: number | null | undefined): NavAccessMap {
  if (roleId === 1) return allTrue();
  if (roleId === 7) {
    return {
      menu_home: false,
      menu_agence: false,
      menu_user: false,
      menu_expos: false,
      menu_artiste: false,
      menu_catalogue: false,
      menu_stats: false,
      page_œuvre: true,
    };
  }
  if (roleId != null && roleId >= 2 && roleId <= 6) return allFalse();
  return allFalse();
}

/** Fusionne les lignes `matrice_securite` (menus/pages) avec les défauts pour un rôle. */
export function mergeNavAccessFromMatriceSecurite(
  roleId: number,
  rows: { ressource: string; lecture: boolean }[] | null | undefined,
): NavAccessMap {
  const base = defaultNavAccessForRole(roleId);
  if (!rows?.length) return base;
  const out = { ...base };
  for (const r of rows) {
    const k = r.ressource as NavMatrixCible;
    if (NAV_MATRIX_CIBLES.includes(k)) out[k] = Boolean(r.lecture);
  }
  return out;
}

/**
 * Associe un chemin courant à une clé de matrice, ou `null` si la route n’est pas pilotée par la matrice.
 */
export function pathnameToNavCible(pathname: string): NavMatrixCible | null {
  const p = pathname.toLowerCase();
  if (p === "/home" || p === "/dashboard") return "menu_home";
  // Configuration : hors matrice navigation — sinon décocher « Organisation » bloque /settings
  // et empêche de corriger la matrice (effet « serpent qui se mord la queue »).
  if (p.startsWith("/settings") || p.startsWith("/setting")) return null;
  if (p.startsWith("/agencies")) return "menu_agence";
  if (p.startsWith("/user")) return "menu_user";
  if (p.startsWith("/expos") || p.startsWith("/prompts")) return "menu_expos";
  if (p.startsWith("/artistes")) return "menu_artiste";
  if (p.startsWith("/catalogue")) return "menu_catalogue";
  if (p.startsWith("/statistiques")) return "menu_stats";
  if (p === "/œuvre" || p.startsWith("/œuvre/") || p === "/visitor" || p.startsWith("/visitor/")) return "page_œuvre";
  return null;
}
