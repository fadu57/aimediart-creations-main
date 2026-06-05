-- Parcours visiteur anonyme (/scan etc.) : lire au moins le nom d'exposition depuis le client avec la clé anon.
-- À exécuter sur le projet Supabase (SQL Editor ou migration).
-- Prérequis : colonne `deleted_at` sur `public.expos`. Si elle n'existe pas, adaptez la clause USING / le filtre client.

GRANT SELECT ON TABLE public.expos TO anon;

DROP POLICY IF EXISTS "expos_public_anon_select_active" ON public.expos;

CREATE POLICY "expos_public_anon_select_active"
ON public.expos FOR SELECT TO anon
USING (
  deleted_at IS NULL
);
