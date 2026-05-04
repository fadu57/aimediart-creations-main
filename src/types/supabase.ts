export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Typage minimal des tables utilisées dans l'application.
 * Étendre ce fichier si vous ajoutez d'autres tables/colonnes requises.
 */
export interface Database {
  public: {
    Tables: {
      pricing: {
        Row: {
          /** Nom d’affichage du pack (lecture). */
          pricing_label: string | null;
          /** Clé de regroupement / plan (lecture). */
          pricing_plan: string | null;
          pricing_max_oeuvres: number | null;
          /** Nom réel en base (faute « princing » conservée). */
          princing_max_visitors: number | null;
          pricing_is_unlimited: boolean | null;
          pricing_monthly_ttc_eur: number | null;
          /**
           * Colonnes générées par la base (lecture seule) — ne jamais les envoyer en insert/update.
           */
          pricing_annuel: number | null;
          pricing_annual_remis: number | null;
          /** Économie annuelle (généré, lecture seule) — en base souvent `éco_annuel`. */
          eco_annuel: number | null;
        };
        Insert: {
          pricing_label?: string | null;
          pricing_plan?: string | null;
          pricing_max_oeuvres?: number | null;
          princing_max_visitors?: number | null;
          pricing_is_unlimited?: boolean | null;
          pricing_monthly_ttc_eur?: number | null;
        };
        Update: {
          pricing_label?: string | null;
          pricing_plan?: string | null;
          pricing_max_oeuvres?: number | null;
          princing_max_visitors?: number | null;
          pricing_is_unlimited?: boolean | null;
          pricing_monthly_ttc_eur?: number | null;
        };
        Relationships: [];
      };
      roles_user: {
        Row: {
          role_id: number;
          role_name: string | null;
          label: string | null;
          regles_accès: string | null;
          droits_acces: string | null;
        };
        Insert: {
          role_id: number;
          role_name?: string | null;
          label?: string | null;
          regles_accès?: string | null;
          droits_acces?: string | null;
        };
        Update: {
          role_id?: number;
          role_name?: string | null;
          label?: string | null;
          regles_accès?: string | null;
          droits_acces?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          role_id: number | null;
          agency_id: string | null;
          user_expo_id: string | null;
          email: string | null;
          user_nom: string | null;
          user_prenom: string | null;
          user_age: string | null;
          avatar: string | null;
          user_roles: string | null;
          user_control: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          role_id?: number | null;
          agency_id?: string | null;
          user_expo_id?: string | null;
          email?: string | null;
          user_nom?: string | null;
          user_prenom?: string | null;
          user_age?: string | null;
          avatar?: string | null;
          user_roles?: string | null;
          user_control?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          role_id?: number | null;
          agency_id?: string | null;
          user_expo_id?: string | null;
          email?: string | null;
          user_nom?: string | null;
          user_prenom?: string | null;
          user_age?: string | null;
          avatar?: string | null;
          user_roles?: string | null;
          user_control?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
