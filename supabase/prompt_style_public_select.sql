-- À exécuter dans Supabase → SQL Editor (projet cible).
-- Ouvre la lecture publique sur prompt_style pour les rôles passant par PostgREST (anon / authenticated).

ALTER TABLE public.prompt_style ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Select" ON public.prompt_style;

CREATE POLICY "Public Select"
ON public.prompt_style
FOR SELECT
USING (true);
