/**
 * Matrice d’accès aux menus et pages : stockée dans `matrice_securite`
 * (`ressource` = clés ci-dessous, `lecture` = case cochée, `ecriture` = false pour ces lignes).
 */

/** Menus principaux (barre header). */
export const NAV_MATRIX_MENU_KEYS = [
  "menu_home",
  "menu_agence",
  "menu_user",
  "menu_expos",
  "menu_artiste",
  "menu_catalogue",
  "menu_stats",
] as const;

/**
 * Pages contrôlables (groupe « Pages »).
 *
 * - Pages **unitaires** : un contrôle = une page (un seul chemin).
 * - **Groupes** (`page_group_*`) : un contrôle unique pilote l'accès à TOUS les
 *   chemins listés (logique d'accès commune). Une seule ligne dans la matrice.
 *
 * Les vues alternatives « v2 » (artistes2, catalogue2, …) ne sont volontairement
 * PAS listées : leur accès est hérité de leur menu parent (voir `pathnameToNavCible`).
 *
 * `paths` = chemins (et alias) qui résolvent vers cette cible. Vide = cible sans
 * route dédiée, pilotée uniquement côté composant (ex. accordéons GED sur /settings).
 */
export const NAV_MATRIX_PAGE_DEFS = [
  // Pages unitaires
  { key: "page_settings_couts", label: "Coûts", paths: ["/settings/couts"] },
  { key: "page_qui_en_ligne", label: "Qui est en ligne", paths: ["/settings/qui-est-en-ligne"] },
  { key: "page_presence_seuils", label: "Seuils de présence", paths: ["/settings/presence-seuils"] },
  { key: "page_prompts", label: "Prompts IA", paths: ["/prompts"] },
  { key: "page_controle_ia", label: "Contrôle IA", paths: ["/settings/controle-ia"] },
  // Groupes (accès commun à tous les membres)
  {
    key: "page_group_suivis",
    label: "Suivis",
    paths: ["/suivi_temps", "/suivi_supabase", "/suivi_tokens"],
  },
  {
    key: "page_group_erreurs",
    label: "Erreurs",
    paths: ["/suivi_erreurs_visiteurs", "/suivi_erreurs_organisateurs"],
  },
  {
    key: "page_group_corbeilles",
    label: "Corbeilles",
    paths: [
      "/artistes-corbeille",
      "/catalogue-corbeille",
      "/agencies-corbeille",
      "/utilisateurs-corbeille",
      "/user/users-corbeille",
      "/user/utilisateurs-corbeille",
      "/expos-corbeille",
      "/visiteurs-corbeille",
    ],
  },
  {
    key: "page_group_expos_sousvues",
    label: "Expos",
    paths: ["/expos/visitors", "/expos/visitor-audio", "/expos/sponsors"],
  },
  // GED : accordéons sur /settings (pas de route dédiée) — gate via le panneau.
  { key: "page_group_ged", label: "GED", paths: [] as string[] },
] as const;

/** Clés des pages hors menu (Œuvre + pages/groupes). */
export const NAV_MATRIX_PAGE_KEYS = [
  "page_œuvre",
  ...NAV_MATRIX_PAGE_DEFS.map((d) => d.key),
] as const;

export const NAV_MATRIX_CIBLES = [
  ...NAV_MATRIX_MENU_KEYS,
  ...NAV_MATRIX_PAGE_KEYS,
] as const;

export type NavMatrixCible = (typeof NAV_MATRIX_CIBLES)[number];

const MENU_KEY_SET = new Set<string>(NAV_MATRIX_MENU_KEYS);
const SUBPAGE_KEY_SET = new Set<string>(NAV_MATRIX_PAGE_DEFS.map((d) => d.key));

/** Pages hors menu (contrôle d’accès) — lignes du groupe « Pages ». */
export const NAV_MATRIX_PAGE_ROWS: { key: NavMatrixCible; label: string }[] = [
  { key: "page_œuvre", label: "Œuvre" },
  ...NAV_MATRIX_PAGE_DEFS.map((d) => ({ key: d.key as NavMatrixCible, label: d.label })),
];

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
  { key: "menu_home", to: "/dashboard", label: "Votre profil", icon: "house" },
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

/** Construit une carte d’accès avec une valeur par défaut par famille de clé. */
function buildAccess(opts: { menus: boolean; oeuvre: boolean; subpages: boolean }): NavAccessMap {
  const out = {} as NavAccessMap;
  for (const k of NAV_MATRIX_CIBLES) {
    if (k === "page_œuvre") out[k] = opts.oeuvre;
    else if (SUBPAGE_KEY_SET.has(k)) out[k] = opts.subpages;
    else out[k] = opts.menus;
  }
  return out;
}

/**
 * Première entrée de menu autorisée pour la matrice courante, sinon `/dashboard` (profil).
 * `/dashboard` reste toujours accessible (voir `pathnameToNavCible`) pour éviter les boucles.
 */
export function getBackofficeFallbackPath(access: NavAccessMap): string {
  for (const item of HEADER_NAV_ITEMS) {
    if (access[item.key]) return item.to;
  }
  return "/dashboard";
}

function allTrue(): NavAccessMap {
  return buildAccess({ menus: true, oeuvre: true, subpages: true });
}

function allFalse(): NavAccessMap {
  return buildAccess({ menus: false, oeuvre: false, subpages: false });
}

/**
 * Valeurs par défaut strictes : rôle 1 tout ouvert, visiteur -> page Œuvre.
 * Les sous-pages restent accessibles par défaut pour les rôles 2–6 (pas de régression :
 * elles n’étaient pas filtrées auparavant) ; un admin peut ensuite les restreindre.
 */
export function defaultNavAccessForRole(roleId: number | null | undefined): NavAccessMap {
  if (roleId === 1) return allTrue();
  if (roleId === 7) return buildAccess({ menus: false, oeuvre: true, subpages: false });
  if (roleId != null && roleId >= 2 && roleId <= 6) {
    return buildAccess({ menus: false, oeuvre: false, subpages: true });
  }
  return allFalse();
}

/**
 * Rôles métier agence/expo (4–6) : sans lignes dans `matrice_securite`, tous les menus header
 * (et sous-pages) sont ouverts. Sinon le défaut laisserait le header vide.
 */
export function navAccessWhenMatriceSecuriteEmptyForAgencyRole(roleId: number): NavAccessMap | null {
  if (roleId >= 4 && roleId <= 6) {
    return buildAccess({ menus: true, oeuvre: false, subpages: true });
  }
  return null;
}

/** Fusionne les lignes `matrice_securite` (menus/pages) avec les défauts pour un rôle. */
export function mergeNavAccessFromMatriceSecurite(
  roleId: number,
  rows: { ressource: string; lecture: boolean }[] | null | undefined,
): NavAccessMap {
  const base = defaultNavAccessForRole(roleId);
  if (!rows?.length) {
    return navAccessWhenMatriceSecuriteEmptyForAgencyRole(roleId) ?? base;
  }
  const out = { ...base };
  for (const r of rows) {
    const k = r.ressource as NavMatrixCible;
    if (NAV_MATRIX_CIBLES.includes(k)) out[k] = Boolean(r.lecture);
  }
  // Admin agence (4) et commissaire (5) : accès Organisation toujours actif (fiche unique).
  if (roleId === 4 || roleId === 5) {
    out.menu_agence = true;
  }
  return out;
}

/** Vrai si `pathname` correspond au chemin `to` (ou un de ses sous-chemins). */
function pathMatches(p: string, to: string): boolean {
  return p === to || p.startsWith(`${to}/`);
}

/**
 * Associe un chemin courant à une clé de matrice, ou `null` si la route n’est pas pilotée par la matrice.
 * Les sous-pages (plus spécifiques) sont testées AVANT les menus génériques.
 */
export function pathnameToNavCible(pathname: string): NavMatrixCible | null {
  const p = pathname.toLowerCase();

  // Profil : toujours accessible (page d'accueil backoffice), indépendamment de menu_home.
  if (p === "/dashboard") return null;

  // Pages/groupes (chemins spécifiques) : prioritaires sur les menus et sur la règle /settings.
  // Les vues « v2 » ne sont pas listées ici : elles retombent sur leur menu parent ci-dessous.
  for (const def of NAV_MATRIX_PAGE_DEFS) {
    for (const pth of def.paths) {
      if (pathMatches(p, pth)) return def.key;
    }
  }

  if (p === "/organisation") return "menu_home";

  // Configuration (racine) : hors matrice navigation — sinon décocher « Organisation » bloque /settings
  // et empêche de corriger la matrice (effet « serpent qui se mord la queue »).
  if (p.startsWith("/settings") || p.startsWith("/setting")) return null;

  if (p.startsWith("/agencies")) return "menu_agence";
  if (p.startsWith("/user")) return "menu_user";
  if (p.startsWith("/expos")) return "menu_expos";
  if (p.startsWith("/artistes")) return "menu_artiste";
  if (p.startsWith("/catalogue")) return "menu_catalogue";
  if (p.startsWith("/statistiques")) return "menu_stats";
  if (
    p === "/artwork" ||
    p.startsWith("/artwork/") ||
    p === "/artworks" ||
    p.startsWith("/artworks/") ||
    p === "/œuvre" ||
    p.startsWith("/œuvre/") ||
    p === "/visitor" ||
    p.startsWith("/visitor/")
  )
    return "page_œuvre";
  return null;
}
