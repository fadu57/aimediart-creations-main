/** Liens corbeille — sous-menu Configuration (rôles 1–3). */
export type TrashMenuLink = {
  id: string;
  to: string;
  labelKey: string;
};

export const SETTINGS_TRASH_MENU_LINKS: TrashMenuLink[] = [
  { id: "users", to: "/utilisateurs-corbeille", labelKey: "settings_submenu_trash_users" },
  { id: "agencies", to: "/agencies-corbeille", labelKey: "settings_submenu_trash_agencies" },
  { id: "artists", to: "/artistes-corbeille", labelKey: "settings_submenu_trash_artists" },
  { id: "catalogue", to: "/catalogue-corbeille", labelKey: "settings_submenu_trash_catalogue" },
  { id: "expos", to: "/expos-corbeille", labelKey: "settings_submenu_trash_expos" },
  { id: "visitors", to: "/visiteurs-corbeille", labelKey: "settings_submenu_trash_visitors" },
];
