-- 20260625180000_matrice_securite_groupes.sql
-- Introduit les ressources « groupe » à accès commun dans matrice_securite :
--   page_group_suivis, page_group_erreurs, page_group_corbeilles,
--   page_group_expos_sousvues, page_group_ged
-- Un seul contrôle pilote l'accès à tous les membres du groupe.
-- Les vues « v2 » n'ont plus de clé : leur accès est hérité du menu parent.
-- On conserve les anciennes clés unitaires dans la contrainte pour ne pas
-- invalider d'éventuelles lignes historiques (elles ne sont plus lues côté code).
-- Clés alignées avec NAV_MATRIX_PAGE_DEFS (navigationMatrix.ts).

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
      -- Pages (les deux orthographes coexistent en base)
      'page_œuvre'::text,
      'page_oeuvre'::text,
      -- Pages unitaires
      'page_settings_couts'::text,
      'page_qui_en_ligne'::text,
      'page_presence_seuils'::text,
      'page_prompts'::text,
      'page_controle_ia'::text,
      -- Groupes à accès commun
      'page_group_suivis'::text,
      'page_group_erreurs'::text,
      'page_group_corbeilles'::text,
      'page_group_expos_sousvues'::text,
      'page_group_ged'::text,
      -- Anciennes clés unitaires (conservées pour compatibilité, non lues désormais)
      'page_suivi_temps'::text,
      'page_suivi_supabase'::text,
      'page_suivi_tokens'::text,
      'page_suivi_erreurs_visiteurs'::text,
      'page_suivi_erreurs_organisateurs'::text,
      'page_artistes_corbeille'::text,
      'page_catalogue_corbeille'::text,
      'page_agencies_corbeille'::text,
      'page_users_corbeille'::text,
      'page_expos_corbeille'::text,
      'page_visiteurs_corbeille'::text,
      'page_expos_visitors'::text,
      'page_expos_visitor_audio'::text,
      'page_expos_sponsors'::text,
      'page_artistes2'::text,
      'page_catalogue2'::text,
      'page_agencies2'::text,
      'page_expos2'::text,
      'page_aimediart_legal'::text,
      'page_aimediart_bp'::text,
      'page_aimediart_marketing'::text
    ]
  )
);

COMMIT;
