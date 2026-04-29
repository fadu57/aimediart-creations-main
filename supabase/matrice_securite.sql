-- =============================================================================
-- 1) Suppression de l’objet « fantôme » users_public_profile
-- =============================================================================
-- Chez toi c’est une VIEW (pas une vue matérialisée) : ne pas utiliser
-- DROP MATERIALIZED VIEW sur une vue classique (erreur 42809).
-- Ordre : VIEW puis TABLE (si l’objet était une table, seule la 2e ligne agit).

DROP VIEW IF EXISTS public.users_public_profile CASCADE;
DROP TABLE IF EXISTS public.users_public_profile CASCADE;

-- =============================================================================
-- 2) Table normalisée matrice_securite (évolutive : nouvelles ressources = nouvelles lignes)
-- =============================================================================
-- Une ligne = un rôle + une ressource sensible + droits lecture / écriture.
-- Pour ajouter une table sensible plus tard : étendre le CHECK sur `ressource`
--   (ou passer à une table de référence `ressources_sensibles`).

CREATE TABLE IF NOT EXISTS public.matrice_securite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id integer NOT NULL,
  ressource text NOT NULL,
  lecture boolean NOT NULL DEFAULT false,
  ecriture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matrice_securite_role_ressource_unique UNIQUE (role_id, ressource),
  CONSTRAINT matrice_securite_ressource_chk CHECK (
    ressource = ANY (
      ARRAY[
        'app_settings'::text,
        'prompt_style'::text,
        'menu_home'::text,
        'menu_agence'::text,
        'menu_expos'::text,
        'menu_artiste'::text,
        'menu_catalogue'::text,
        'menu_stats'::text,
        'page_œuvre'::text
      ]
    )
  )
);

COMMENT ON TABLE public.matrice_securite IS
  'Matrice de permissions par rôle : tables sensibles (app_settings, prompt_style) et accès menus/pages (menu_*, page_œuvre).';

COMMENT ON COLUMN public.matrice_securite.role_id IS
  'Identifiant de rôle métier (aligné sur users.role_id et roles_user.role_id).';

COMMENT ON COLUMN public.matrice_securite.ressource IS
  'Ressource : app_settings, prompt_style ; menus/pages menu_home … menu_stats, page_œuvre (pour ces lignes, lecture = accès UI, ecriture souvent false).';

COMMENT ON COLUMN public.matrice_securite.lecture IS
  'Pour app_settings/prompt_style : droit lecture. Pour menu_* / page_œuvre : case « accès » cochée en UI.';

COMMENT ON COLUMN public.matrice_securite.ecriture IS
  'Pour app_settings/prompt_style : droit écriture. Pour menu_* / page_œuvre : laisser false (non utilisé pour la barre de navigation).';

CREATE INDEX IF NOT EXISTS matrice_securite_role_id_idx ON public.matrice_securite (role_id);
CREATE INDEX IF NOT EXISTS matrice_securite_ressource_idx ON public.matrice_securite (ressource);

-- Bases déjà créées avec l’ancienne contrainte (2 ressources seulement) : élargir la liste.
ALTER TABLE public.matrice_securite DROP CONSTRAINT IF EXISTS matrice_securite_ressource_chk;
ALTER TABLE public.matrice_securite ADD CONSTRAINT matrice_securite_ressource_chk CHECK (
  ressource = ANY (
    ARRAY[
      'app_settings'::text,
      'prompt_style'::text,
      'menu_home'::text,
      'menu_agence'::text,
      'menu_expos'::text,
      'menu_artiste'::text,
      'menu_catalogue'::text,
      'menu_stats'::text,
      'page_œuvre'::text
    ]
  )
);

-- =============================================================================
-- 3) Données initiales (alignées sur SECURITY_ACCESS_MATRIX dans Settings.tsx)
--    Rôles 1–7 × 2 ressources = 14 lignes
-- =============================================================================
-- Légende : admin (1), super_admin (2), dev (3), admin_agency (4) = tout ouvert.
--          curator (5), equipe_expo (6) = lecture oui, écriture non sur les deux.
--          visiteur (7) = aucun accès.

INSERT INTO public.matrice_securite (role_id, ressource, lecture, ecriture) VALUES
  -- role 1 admin_general
  (1, 'app_settings', true, true),
  (1, 'prompt_style', true, true),
  -- role 2 super_admin
  (2, 'app_settings', true, true),
  (2, 'prompt_style', true, true),
  -- role 3 developpeur
  (3, 'app_settings', true, true),
  (3, 'prompt_style', true, true),
  -- role 4 admin_agency
  (4, 'app_settings', true, true),
  (4, 'prompt_style', true, true),
  -- role 5 curator_expo
  (5, 'app_settings', true, false),
  (5, 'prompt_style', true, false),
  -- role 6 equipe_expo
  (6, 'app_settings', true, false),
  (6, 'prompt_style', true, false),
  -- role 7 visiteur
  (7, 'app_settings', false, false),
  (7, 'prompt_style', false, false)
ON CONFLICT (role_id, ressource) DO UPDATE SET
  lecture = EXCLUDED.lecture,
  ecriture = EXCLUDED.ecriture,
  updated_at = now();

-- =============================================================================
-- 3b) Accès menus et pages (même table : ressource = menu_* | page_œuvre)
--     lecture = afficher le menu / autoriser la page ; ecriture = false.
-- =============================================================================

INSERT INTO public.matrice_securite (role_id, ressource, lecture, ecriture) VALUES
  (1, 'menu_home', true, false), (1, 'menu_agence', true, false), (1, 'menu_expos', true, false),
  (1, 'menu_artiste', true, false), (1, 'menu_catalogue', true, false), (1, 'menu_stats', true, false), (1, 'page_œuvre', true, false),
  (2, 'menu_home', true, false), (2, 'menu_agence', true, false), (2, 'menu_expos', true, false),
  (2, 'menu_artiste', true, false), (2, 'menu_catalogue', true, false), (2, 'menu_stats', true, false), (2, 'page_œuvre', true, false),
  (3, 'menu_home', true, false), (3, 'menu_agence', true, false), (3, 'menu_expos', true, false),
  (3, 'menu_artiste', true, false), (3, 'menu_catalogue', true, false), (3, 'menu_stats', true, false), (3, 'page_œuvre', true, false),
  (4, 'menu_home', true, false), (4, 'menu_agence', true, false), (4, 'menu_expos', true, false),
  (4, 'menu_artiste', true, false), (4, 'menu_catalogue', true, false), (4, 'menu_stats', true, false), (4, 'page_œuvre', true, false),
  (5, 'menu_home', true, false), (5, 'menu_agence', true, false), (5, 'menu_expos', true, false),
  (5, 'menu_artiste', true, false), (5, 'menu_catalogue', true, false), (5, 'menu_stats', true, false), (5, 'page_œuvre', true, false),
  (6, 'menu_home', true, false), (6, 'menu_agence', true, false), (6, 'menu_expos', true, false),
  (6, 'menu_artiste', true, false), (6, 'menu_catalogue', true, false), (6, 'menu_stats', true, false), (6, 'page_œuvre', true, false),
  (7, 'menu_home', false, false), (7, 'menu_agence', false, false), (7, 'menu_expos', false, false),
  (7, 'menu_artiste', false, false), (7, 'menu_catalogue', false, false), (7, 'menu_stats', false, false), (7, 'page_œuvre', true, false)
ON CONFLICT (role_id, ressource) DO UPDATE SET
  lecture = EXCLUDED.lecture,
  ecriture = EXCLUDED.ecriture,
  updated_at = now();

-- =============================================================================
-- 4) RLS (optionnel — à affiner selon qui doit lire/éditer cette table)
-- =============================================================================

ALTER TABLE public.matrice_securite ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur connecté peut lire la matrice (ex. pour affichage / contrôles UI).
DROP POLICY IF EXISTS "matrice_securite_select_authenticated" ON public.matrice_securite;
CREATE POLICY "matrice_securite_select_authenticated"
ON public.matrice_securite
FOR SELECT
TO authenticated
USING (true);

-- Écriture : réservée aux rôles staff (1–6). Fonction SECURITY DEFINER pour éviter
-- « permission denied for table users » si la RLS sur `users` bloque la sous-requête.

CREATE OR REPLACE FUNCTION public.matrice_securite_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IS NOT NULL
      AND u.role_id >= 1
      AND u.role_id <= 6
  );
$$;

GRANT EXECUTE ON FUNCTION public.matrice_securite_is_staff() TO authenticated;

DROP POLICY IF EXISTS "matrice_securite_insert_staff" ON public.matrice_securite;
DROP POLICY IF EXISTS "matrice_securite_update_staff" ON public.matrice_securite;
DROP POLICY IF EXISTS "matrice_securite_delete_staff" ON public.matrice_securite;

CREATE POLICY "matrice_securite_insert_staff"
ON public.matrice_securite
FOR INSERT
TO authenticated
WITH CHECK (public.matrice_securite_is_staff());

CREATE POLICY "matrice_securite_update_staff"
ON public.matrice_securite
FOR UPDATE
TO authenticated
USING (public.matrice_securite_is_staff())
WITH CHECK (public.matrice_securite_is_staff());

CREATE POLICY "matrice_securite_delete_staff"
ON public.matrice_securite
FOR DELETE
TO authenticated
USING (public.matrice_securite_is_staff());

-- =============================================================================
-- 5) FK optionnelle vers roles_user (décommente si ta table expose role_id en PK/UNIQUE)
-- =============================================================================
-- ALTER TABLE public.matrice_securite
--   ADD CONSTRAINT matrice_securite_role_fk
--   FOREIGN KEY (role_id) REFERENCES public.roles_user (role_id);
