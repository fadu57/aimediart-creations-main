-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- À exécuter dans Supabase → SQL Editor (projet cible).
-- Ouvre la lecture publique sur prompt_style pour les rôles passant par PostgREST (anon / authenticated).

ALTER TABLE public.prompt_style ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Select" ON public.prompt_style;

CREATE POLICY "Public Select"
ON public.prompt_style
FOR SELECT
USING (true);
