-- Lecture publique des labels pseudo_pool (review avatars, génération de pseudos côté client).
-- À exécuter dans Supabase SQL Editor si review-avatars.html renvoie 0 ligne avec la clé anon.

BEGIN;

ALTER TABLE public.pseudo_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pseudo_pool_public_select" ON public.pseudo_pool;
CREATE POLICY "pseudo_pool_public_select"
ON public.pseudo_pool
FOR SELECT
TO anon, authenticated
USING (true);

COMMIT;
