import { createContext } from "react";

import type { NavAccessMap, NavMatrixCible } from "@/lib/navigationMatrix";

export type NavigationMatrixContextValue = {
  /** Carte d’accès pour le rôle courant (défauts + lignes `matrice_securite` pour les ressources menu/page). */
  access: NavAccessMap;
  loading: boolean;
  /** Recharge depuis Supabase (ex. après sauvegarde en Paramètres). */
  refresh: () => Promise<void>;
  can: (cible: NavMatrixCible) => boolean;
  /** `true` si la route est autorisée ou non couverte par la matrice. */
  canAccessPath: (pathname: string) => boolean;
};

export const NavigationMatrixContext = createContext<NavigationMatrixContextValue | null>(null);
