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
      agency_subscriptions: {
        Row: {
          id: string;
          agency_id: string;
          pricing_plan: string | null;
          billing_cycle: string | null;
          started_at: string | null;
          expires_at: string | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          agency_id: string;
          pricing_plan?: string | null;
          billing_cycle?: string | null;
          started_at?: string | null;
          expires_at?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          agency_id?: string;
          pricing_plan?: string | null;
          billing_cycle?: string | null;
          started_at?: string | null;
          expires_at?: string | null;
          is_active?: boolean | null;
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
      artists: {
        Row: {
          artist_id: string;
          artist_firstname?: string | null;
          artist_lastname?: string | null;
          artist_nickname?: string | null;
          artist_typ?: string | null;
          artist_control?: string | null;
          artist_email?: string | null;
          artist_phone?: string | null;
          artist_birth_date?: string | null;
          artist_death_date?: string | null;
          artist_vivant?: boolean;
          artist_photo_url?: string | null;
          artist_image?: string | null;
        };
        Insert: {
          artist_id?: string;
          artist_firstname?: string | null;
          artist_lastname?: string | null;
          artist_nickname?: string | null;
          artist_typ?: string | null;
          artist_control?: string | null;
          artist_email?: string | null;
          artist_phone?: string | null;
          artist_birth_date?: string | null;
          artist_death_date?: string | null;
          artist_vivant?: boolean;
          artist_photo_url?: string | null;
          artist_image?: string | null;
        };
        Update: {
          artist_firstname?: string | null;
          artist_lastname?: string | null;
          artist_nickname?: string | null;
          artist_typ?: string | null;
          artist_control?: string | null;
          artist_email?: string | null;
          artist_phone?: string | null;
          artist_birth_date?: string | null;
          artist_death_date?: string | null;
          artist_vivant?: boolean;
          artist_photo_url?: string | null;
          artist_image?: string | null;
        };
        Relationships: [];
      };
      artworks: {
        Row: {
          artwork_id: string;
          artwork_artist_id: string | null;
          artwork_expo_id: string | null;
          artwork_agency_id: string | null;
          artwork_title: string | null;
          artwork_description_i18n: Json;
          artwork_source_material: string | null;
          artwork_source_material_i18n?: Json;
          artwork_photo_url?: string | null;
          artwork_image_url: string | null;
          artwork_qr_code_url: string | null;
          artwork_qrcode_image: string | null;
          artwork_room_name?: string | null;
          artwork_status?: string | null;
          artwork_prompt_style_id?: string | null;
          artwork_fingerprint: string | null;
          artwork_moyenne_coeurs?: number | null;
          artwork_total_visites?: number | null;
          artwork_created_at?: string | null;
          artwork_deleted_at?: string | null;
          deleted_at: string | null;
        };
        Insert: {
          artwork_id?: string;
          artwork_artist_id?: string | null;
          artwork_expo_id?: string | null;
          artwork_agency_id?: string | null;
          artwork_title?: string | null;
          artwork_description_i18n?: Json;
          artwork_source_material?: string | null;
          artwork_source_material_i18n?: Json;
          artwork_photo_url?: string | null;
          artwork_image_url?: string | null;
          artwork_qr_code_url?: string | null;
          artwork_qrcode_image?: string | null;
          artwork_room_name?: string | null;
          artwork_status?: string | null;
          artwork_prompt_style_id?: string | null;
          artwork_fingerprint?: string | null;
          artwork_moyenne_coeurs?: number | null;
          artwork_total_visites?: number | null;
          artwork_created_at?: string | null;
          artwork_deleted_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          artwork_artist_id?: string | null;
          artwork_expo_id?: string | null;
          artwork_agency_id?: string | null;
          artwork_title?: string | null;
          artwork_description_i18n?: Json;
          artwork_source_material?: string | null;
          artwork_source_material_i18n?: Json;
          artwork_photo_url?: string | null;
          artwork_image_url?: string | null;
          artwork_qr_code_url?: string | null;
          artwork_qrcode_image?: string | null;
          artwork_room_name?: string | null;
          artwork_status?: string | null;
          artwork_prompt_style_id?: string | null;
          artwork_fingerprint?: string | null;
          artwork_moyenne_coeurs?: number | null;
          artwork_total_visites?: number | null;
          artwork_deleted_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      artist_agency_details: {
        Row: {
          artist_id: string;
          agency_id: string;
        };
        Insert: {
          artist_id: string;
          agency_id: string;
        };
        Update: {
          artist_id?: string;
          agency_id?: string;
        };
        Relationships: [];
      };
      social_links: {
        Row: {
          id?: string;
          artist_id: string;
          type_link: string;
          url: string;
          created_at?: string | null;
        };
        Insert: {
          id?: string;
          artist_id: string;
          type_link: string;
          url: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          artist_id?: string;
          type_link?: string;
          url?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      artist_bios: {
        Row: {
          id?: string;
          artist_id: string;
          language: string;
          bio_text?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Insert: {
          id?: string;
          artist_id: string;
          language: string;
          bio_text?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          language?: string;
          bio_text?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      ai_usage_logs: {
        Row: {
          id: string;
          model_id: string;
          provider: string;
          prompt_tokens: number | null;
          completion_tokens: number | null;
          total_tokens: number | null;
          artwork_id: string | null;
          created_at: string | null;
          metadata: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          model_id: string;
          provider: string;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          total_tokens?: number | null;
          artwork_id?: string | null;
          created_at?: string | null;
          metadata?: Record<string, unknown> | null;
        };
        Update: {
          model_id?: string;
          provider?: string;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          total_tokens?: number | null;
          artwork_id?: string | null;
          created_at?: string | null;
          metadata?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
      ai_provider_limits: {
        Row: {
          id: string;
          provider: string;
          model: string | null;
          limit_type: string;
          limit_value_observed: number | null;
          limit_value_manual: number | null;
          alert_threshold_warning: number;
          alert_threshold_critical: number;
          is_active: boolean;
          observed_at: string | null;
          observed_source: string | null;
          manual_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          model?: string | null;
          limit_type: string;
          limit_value_observed?: number | null;
          limit_value_manual?: number | null;
          alert_threshold_warning?: number;
          alert_threshold_critical?: number;
          is_active?: boolean;
          observed_at?: string | null;
          observed_source?: string | null;
          manual_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          provider?: string;
          model?: string | null;
          limit_type?: string;
          limit_value_observed?: number | null;
          limit_value_manual?: number | null;
          alert_threshold_warning?: number;
          alert_threshold_critical?: number;
          is_active?: boolean;
          observed_at?: string | null;
          observed_source?: string | null;
          manual_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_limit_alerts: {
        Row: {
          id: string;
          provider: string;
          model: string | null;
          limit_type: string;
          usage_pct: number;
          alert_level: string;
          sent_at: string;
          notified_email: boolean;
        };
        Insert: {
          id?: string;
          provider: string;
          model?: string | null;
          limit_type: string;
          usage_pct: number;
          alert_level: string;
          sent_at?: string;
          notified_email?: boolean;
        };
        Update: {
          provider?: string;
          model?: string | null;
          limit_type?: string;
          usage_pct?: number;
          alert_level?: string;
          notified_email?: boolean;
        };
        Relationships: [];
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
    Views: {
      ai_usage_vs_limits: {
        Row: {
          limit_id: string;
          provider: string;
          model: string | null;
          limit_type: string;
          limit_value: number | null;
          limit_value_observed: number | null;
          limit_value_manual: number | null;
          limit_source: string;
          alert_threshold_warning: number;
          alert_threshold_critical: number;
          is_active: boolean;
          current_usage: number;
          usage_pct: number | null;
          status: string;
          observed_at: string | null;
          observed_source: string | null;
          manual_updated_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      /** SECURITY DEFINER — visiteurs anonymes (fingerprints + liaison client_uuid). */
      register_anonymous_visitor: {
        Args: {
          p_visitor_client_id?: string | null;
          p_fingerprint?: string | null;
          p_fingerprint_source?: string | null;
          p_user_agent?: string | null;
          p_client_locale?: string | null;
          p_client_timezone?: string | null;
          p_screen_resolution?: string | null;
          p_ip_address?: string | null;
          p_browser_name?: string | null;
          p_device_type?: string | null;
          p_country?: string | null;
          p_city?: string | null;
          p_device_fingerprint?: string | null;
        };
        Returns: string;
      };
      /** SECURITY DEFINER — pseudo noun + adj + digits depuis `pseudo_pool`. */
      generate_visitor_pseudo: {
        Args: { locale?: string | null };
        Returns: string;
      };
      /** SECURITY DEFINER — profil visiteur de retour (pseudo + avatar). */
      get_anonymous_visitor_profile: {
        Args: {
          p_visitor_client_id?: string | null;
          p_fingerprint?: string | null;
        };
        Returns: Json;
      };
      generate_visitor_recovery_code: {
        Args: {
          p_visitor_client_id: string;
          p_regenerate?: boolean | null;
        };
        Returns: Json;
      };
      link_visitor_profile_by_recovery_code: {
        Args: {
          p_recovery_code: string;
          p_visitor_client_id: string;
        };
        Returns: Json;
      };
      link_visitor_to_auth_user: {
        Args: {
          p_visitor_client_id: string;
          p_auth_user_id: string;
        };
        Returns: boolean;
      };
      /** SECURITY DEFINER — `visitor_client_id` = UUID navigateur persisté localement. */
      confirm_visitor_pseudo_from_client: {
        Args: {
          p_visitor_client_id: string;
          p_pseudo: string;
          p_avatar_url?: string | null;
          p_avatar_object_path?: string | null;
          p_selfie_url?: string | null;
          p_selfie_object_path?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
