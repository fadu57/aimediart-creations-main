-- Migration 42 : ajoute menu_user à la contrainte matrice_securite_ressource_chk
-- Corrige : « new row violates check constraint matrice_securite_ressource_chk »
-- lors du cochage « User » dans Paramètres > Sécurité.

BEGIN;

ALTER TABLE public.matrice_securite DROP CONSTRAINT IF EXISTS matrice_securite_ressource_chk;

ALTER TABLE public.matrice_securite ADD CONSTRAINT matrice_securite_ressource_chk CHECK (
  ressource = ANY (
    ARRAY[
      'app_settings'::text,
      'prompt_style'::text,
      'menu_home'::text,
      'menu_agence'::text,
      'menu_user'::text,
      'menu_expos'::text,
      'menu_artiste'::text,
      'menu_catalogue'::text,
      'menu_stats'::text,
      'page_œuvre'::text
    ]
  )
);

-- Valeurs par défaut menu_user (alignées navigationMatrix.ts / Settings.tsx)
INSERT INTO public.matrice_securite (role_id, ressource, lecture, ecriture) VALUES
  (1, 'menu_user', true, false),
  (2, 'menu_user', true, false),
  (3, 'menu_user', true, false),
  (4, 'menu_user', true, false),
  (5, 'menu_user', true, false),
  (6, 'menu_user', true, false),
  (7, 'menu_user', false, false)
ON CONFLICT (role_id, ressource) DO NOTHING;

COMMIT;
