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
 * Sous-pages contrôlables (groupe « Pages »). Le chemin `to` sert au mapping
 * d’accès (voir `pathnameToNavCible`). `aliases` = autres chemins menant à la même page.
 */
export const NAV_MATRIX_SUBPAGE_DEFS = [
  // Configuration
  { key: "page_settings_couts", label: "Coûts", to: "/settings/couts" },
  { key: "page_suivi_temps", label: "Suivi du temps", to: "/suivi_temps" },
  { key: "page_suivi_supabase", label: "Suivi Supabase", to: "/suivi_supabase" },
  { key: "page_suivi_tokens", label: "Suivi des tokens", to: "/suivi_tokens" },
  { key: "page_suivi_erreurs_visiteurs", label: "Erreurs visiteurs", to: "/suivi_erreurs_visiteurs" },
  { key: "page_suivi_erreurs_organisateurs", label: "Erreurs organisateurs", to: "/suivi_erreurs_organisateurs" },
  { key: "page_qui_en_ligne", label: "Qui est en ligne", to: "/settings/qui-est-en-ligne" },
  { key: "page_presence_seuils", label: "Seuils de présence", to: "/settings/presence-seuils" },
  // Corbeilles
  { key: "page_artistes_corbeille", label: "Corbeille artistes", to: "/artistes-corbeille" },
  { key: "page_catalogue_corbeille", label: "Corbeille catalogue", to: "/catalogue-corbeille" },
  { key: "page_agencies_corbeille", label: "Corbeille organisations", to: "/agencies-corbeille" },
  {
    key: "page_users_corbeille",
    label: "Corbeille utilisateurs",
    to: "/utilisateurs-corbeille",
    aliases: ["/user/users-corbeille", "/user/utilisateurs-corbeille"],
  },
  { key: "page_expos_corbeille", label: "Corbeille expos", to: "/expos-corbeille" },
  { key: "page_visiteurs_corbeille", label: "Corbeille visiteurs", to: "/visiteurs-corbeille" },
  // Sous-vues Expos
  { key: "page_expos_visitors", label: "Expos — Visiteurs", to: "/expos/visitors" },
  { key: "page_expos_visitor_audio", label: "Expos — Audio visiteurs", to: "/expos/visitor-audio" },
  { key: "page_expos_sponsors", label: "Expos — Sponsors", to: "/expos/sponsors" },
  // Vues alternatives « v2 »
  { key: "page_artistes2", label: "Artistes (v2)", to: "/artistes/artistes2" },
  { key: "page_catalogue2", label: "Catalogue (v2)", to: "/catalogue/catalogue2" },
  { key: "page_agencies2", label: "Organisations (v2)", to: "/agencies/agencies2" },
  { key: "page_expos2", label: "Expos (v2)", to: "/expos/expos2" },
  // Prompts IA
  { key: "page_prompts", label: "Prompts IA", to: "/prompts" },
  // Contrôle IA (sous-page /settings)
  { key: "page_controle_ia", label: "Contrôle IA", to: "/settings/controle-ia" },
] as const;

/** Clés des pages hors menu (Œuvre + sous-pages). */
export const NAV_MATRIX_PAGE_KEYS = [
  "page_œuvre",
  ...NAV_MATRIX_SUBPAGE_DEFS.map((d) => d.key),
] as const;

export const NAV_MATRIX_CIBLES = [
  ...NAV_MATRIX_MENU_KEYS,
  ...NAV_MATRIX_PAGE_KEYS,
] as const;

export type NavMatrixCible = (typeof NAV_MATRIX_CIBLES)[number];

const MENU_KEY_SET = new Set<string>(NAV_MATRIX_MENU_KEYS);
const SUBPAGE_KEY_SET = new Set<string>(NAV_MATRIX_SUBPAGE_DEFS.map((d) => d.key));

/** Pages hors menu (contrôle d’accès par chemin) — lignes du groupe « Pages ». */
export const NAV_MATRIX_PAGE_ROWS: { key: NavMatrixCible; label: string }[] = [
  { key: "page_œuvre", label: "Œuvre" },
  ...NAV_MATRIX_SUBPAGE_DEFS.map((d) => ({ key: d.key as NavMatrixCible, label: d.label })),
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
function navAccessWhenMatriceSecuriteEmptyForAgencyRole(roleId: number): NavAccessMap | null {
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

  // Sous-pages (chemins spécifiques) : prioritaires sur les menus et sur la règle /settings.
  for (const def of NAV_MATRIX_SUBPAGE_DEFS) {
    if (pathMatches(p, def.to)) return def.key;
    const aliases = (def as { aliases?: readonly string[] }).aliases;
    if (aliases) {
      for (const alias of aliases) {
        if (pathMatches(p, alias)) return def.key;
      }
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
