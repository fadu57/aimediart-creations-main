-- 20260625150000_matrice_securite_controle_ia.sql
-- Étend la contrainte CHECK matrice_securite_ressource_chk pour autoriser
-- la sous-page « Contrôle IA » (/settings/controle-ia) dans la matrice des droits.
-- Les clés doivent rester alignées avec NAV_MATRIX_SUBPAGE_DEFS (navigationMatrix.ts).

BEGIN;

ALTER TABLE public.matrice_securite DROP CONSTRAINT IF EXISTS matrice_securite_ressource_chk;

ALTER TABLE public.matrice_securite ADD CONSTRAINT matrice_securite_ressource_chk CHECK (
  ressource = ANY (
    ARRAY[
      -- Ressources sensibles existantes
      'app_settings'::text,
      'prompt_style'::text,
      -- Menus principaux
      'menu_home'::text,
      'menu_agence'::text,
      'menu_user'::text,
      'menu_expos'::text,
      'menu_artiste'::text,
      'menu_catalogue'::text,
      'menu_stats'::text,
      -- Pages (les deux orthographes coexistent en base : ligature « œ » côté code,
      -- ASCII « oe » dans les lignes historiques)
      'page_œuvre'::text,
      'page_oeuvre'::text,
      -- Sous-pages : Configuration
      'page_settings_couts'::text,
      'page_suivi_temps'::text,
      'page_suivi_supabase'::text,
      'page_suivi_tokens'::text,
      'page_suivi_erreurs_visiteurs'::text,
      'page_suivi_erreurs_organisateurs'::text,
      'page_qui_en_ligne'::text,
      'page_presence_seuils'::text,
      -- Sous-pages : Corbeilles
      'page_artistes_corbeille'::text,
      'page_catalogue_corbeille'::text,
      'page_agencies_corbeille'::text,
      'page_users_corbeille'::text,
      'page_expos_corbeille'::text,
      'page_visiteurs_corbeille'::text,
      -- Sous-pages : Sous-vues Expos
      'page_expos_visitors'::text,
      'page_expos_visitor_audio'::text,
      'page_expos_sponsors'::text,
      -- Sous-pages : Vues alternatives « v2 »
      'page_artistes2'::text,
      'page_catalogue2'::text,
      'page_agencies2'::text,
      'page_expos2'::text,
      -- Sous-pages : Prompts IA
      'page_prompts'::text,
      -- Sous-pages : Contrôle IA
      'page_controle_ia'::text
    ]
  )
);

COMMIT;
