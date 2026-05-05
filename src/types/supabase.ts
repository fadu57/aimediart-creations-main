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
          role_name_clair: string | null;
          label: string | null;
          regles_accès: string | null;
          droits_acces: string | null;
        };
        Insert: {
          role_id: number;
          role_name?: string | null;
          role_name_clair?: string | null;
          label?: string | null;
          regles_accès?: string | null;
          droits_acces?: string | null;
        };
        Update: {
          role_id?: number;
          role_name?: string | null;
          role_name_clair?: string | null;
          label?: string | null;
          regles_accès?: string | null;
          droits_acces?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          avatar_url: string | null;
          phone: string | null;
          zip_code: string | null;
          city: string | null;
          country_code: string | null;
          timezone: string | null;
          language: string | null;
          birth_year: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          zip_code?: string | null;
          city?: string | null;
          country_code?: string | null;
          timezone?: string | null;
          language?: string | null;
          birth_year?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          zip_code?: string | null;
          city?: string | null;
          country_code?: string | null;
          timezone?: string | null;
          language?: string | null;
          birth_year?: number | null;
          updated_at?: string | null;
        };
        Relationships: [{ foreignKeyName: "profiles_id_fkey"; columns: ["id"]; referencedRelation: "users"; referencedColumns: ["id"] }];
      };
      agency_users: {
        Row: {
          user_id: string;
          agency_id: string;
          role_id: number | null;
          created_at: string | null;
        };
        Insert: {
          user_id: string;
          agency_id: string;
          role_id?: number | null;
          created_at?: string | null;
        };
        Update: {
          user_id?: string;
          agency_id?: string;
          role_id?: number | null;
        };
        Relationships: [
          { foreignKeyName: "agency_users_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "agency_users_role_id_fkey"; columns: ["role_id"]; referencedRelation: "roles_user"; referencedColumns: ["role_id"] }
        ];
      };
      expo_user_role: {
        Row: {
          id: string;
          user_id: string;
          expo_id: string;
          notes: string | null;
          assigned_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_id: string;
          notes?: string | null;
          assigned_at?: string | null;
        };
        Update: {
          user_id?: string;
          expo_id?: string;
          notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: "expo_user_role_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
